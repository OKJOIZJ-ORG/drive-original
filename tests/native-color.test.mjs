import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {fixture} from './general-q1-fixture.mjs';
import {observeNativeFrameColor, qualifyNativeColorObservation, resolveObservedNativeOutputColor} from '../media/native-color.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {startGeneralWorker} from '../media/general-owner.mjs';
import {Input,BufferSource,MP4,EncodedPacketSink,EncodedVideoPacketSource,EncodedAudioPacketSource,Output,Mp4OutputFormat,BufferTarget} from '../media/mediabunny-q1.mjs';

const color = {primaries:'smpte170m', transfer:'smpte170m', matrix:'smpte170m', fullRange:false};
const identity = (size=fixture.length) => ({accountKey:'synthetic',accountGeneration:1,fileId:'fixture',headRevisionId:'revision-1',
  size:String(size),mimeType:'video/mp4',modifiedTime:'2026-10-02T00:00:00.000Z',sha256Checksum:'a'.repeat(64)});
const observation = (binding=identity()) => ({basis:'observed-native-frame',format:'NV12',identity:{...binding},codedWidth:64,codedHeight:64,
  visibleRect:{x:0,y:0,width:64,height:64},colorSpace:{...color}});
const config = () => ({codec:'avc1.64000a',codedWidth:64,codedHeight:64,description:Uint8Array.of(1,2,3),
  colorSpace:{primaries:undefined,transfer:undefined,matrix:undefined,fullRange:undefined}});
function source(bytes=fixture,binding=identity(bytes.length),onRead=()=>{}) {
  let closed=false;
  return {identity:binding,async read({start,end}){assert.equal(closed,false);onRead(this);return bytes.slice(start,end+1);},
    async abort(){closed=true;return {settled:true};}};
}

test('current native capture returns only immutable serializable color evidence and closes synchronously',()=>{
  const video={readyState:2,error:null,videoWidth:64,videoHeight:64},binding=identity();let closes=0,created=0;
  const scope={VideoFrame:class {constructor(input){assert.equal(input,video);created++;this.format='NV12';this.codedWidth=64;this.codedHeight=64;this.visibleRect={x:0,y:0,width:64,height:64};this.colorSpace={...color};}
    close(){closes++;}copyTo(){assert.fail('pixel reads are not observation');}}};
  const value=observeNativeFrameColor({video,identity:binding,isCurrent:()=>true,scope});
  assert.equal(created,1);assert.equal(closes,1);assert.deepEqual(value,observation());
  for(const object of [value,value.identity,value.visibleRect,value.colorSpace])assert.equal(Object.isFrozen(object),true);
  assert.deepEqual(JSON.parse(JSON.stringify(value)),value);binding.fileId='mutated';assert.equal(value.identity.fileId,'fixture');
});

test('unavailable, stale, unready and failing frames return no observation and close every created frame',()=>{
  const video={readyState:2,error:null,videoWidth:64,videoHeight:64};let closes=0,created=0,currentChecks=0;
  const scope={VideoFrame:class {constructor(){created++;this.codedWidth=64;this.codedHeight=64;}
    get colorSpace(){throw Error('unsupported');}close(){closes++;}}};
  for(const patch of [{readyState:1},{readyState:undefined},{error:{}},{videoWidth:0},{videoHeight:0}])
    assert.equal(observeNativeFrameColor({video:{...video,...patch},identity:identity(),isCurrent:()=>true,scope}),null);
  assert.equal(created,0);
  assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>true,scope:{}}),null);
  assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>false,scope}),null);
  assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>++currentChecks===1,scope}),null);
  assert.equal(created,1);assert.equal(closes,1);
  assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>true,scope}),null);
  assert.equal(created,2);assert.equal(closes,2);
  assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>true,scope:{VideoFrame:class {constructor(){throw Error('unavailable');}}}}),null);
});

test('every exact identity field and optional checksum appearance/disappearance rejects drift',()=>{
  const base=identity();assert.ok(qualifyNativeColorObservation(observation(),base));
  for(const key of Object.keys(base)) {
    const drift={...base,[key]:key==='accountGeneration'?2:key==='sha256Checksum'?'b'.repeat(64):`${base[key]}-other`};
    assert.equal(qualifyNativeColorObservation(observation(),drift),null,key);
    const incomplete={...base};delete incomplete[key];
    assert.equal(qualifyNativeColorObservation(observation(incomplete),base),null,`missing ${key}`);
  }
  const noHash={...base};delete noHash.sha256Checksum;
  assert.ok(qualifyNativeColorObservation(observation(noHash),noHash));
  assert.equal(qualifyNativeColorObservation(observation(),noHash),null);
  assert.equal(qualifyNativeColorObservation(observation(noHash),base),null);
  assert.equal(qualifyNativeColorObservation(observation(),{...base,size:fixture.length}),null,'size representation is exact');
  for(const bad of [{accountGeneration:-1},{size:'01'},{size:'9007199254740992'},{fileId:''},{modifiedTime:null},{sha256Checksum:'abc'}])
    assert.equal(qualifyNativeColorObservation(observation({...base,...bad}),{...base,...bad}),null);
});

test('only a complete known SDR tuple and coded dimensions qualify, without inferred fallback',()=>{
  for(const patch of [{basis:'source-declaration'},{codedWidth:0},{codedHeight:Infinity},{codedWidth:64.5},{codedHeight:65536},
    {colorSpace:{...color,transfer:'pq'}},{colorSpace:{...color,transfer:'hlg'}},{colorSpace:{...color,matrix:'unknown'}},
    {colorSpace:{...color,primaries:null}},{colorSpace:{...color,fullRange:null}},{colorSpace:{...color,fullRange:0}}])
    assert.equal(qualifyNativeColorObservation({...observation(),...patch},identity()),null);
  for(const key of Object.keys(color)){const partial={...color};delete partial[key];assert.equal(qualifyNativeColorObservation({...observation(),colorSpace:partial},identity()),null);}
  assert.equal(qualifyNativeColorObservation(undefined,identity()),null);
});

test('converted RGB, high-bit and unknown formats cannot annotate copied YUV; capture always closes',()=>{
  const video={readyState:2,error:null,videoWidth:64,videoHeight:64};let closes=0;
  for(const format of ['RGBA','RGBX','BGRA','BGRX','I420P10','I420P12','I420A','unknown',null,undefined]) {
    assert.equal(qualifyNativeColorObservation({...observation(),format},identity()),null);
    const scope={VideoFrame:class {constructor(){this.format=format;this.codedWidth=64;this.codedHeight=64;
      this.colorSpace=format==='RGBA'?{primaries:'bt709',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}:{...color};}close(){closes++;}}};
    assert.equal(observeNativeFrameColor({video,identity:identity(),isCurrent:()=>true,scope}),null);
  }
  assert.equal(closes,10);
  assert.equal(qualifyNativeColorObservation({...observation(),colorSpace:{...color,matrix:'rgb',fullRange:true}},identity()),null);
  assert.ok(qualifyNativeColorObservation({...observation(),format:'I420'},identity()));
});

test('padded native surface qualifies by its exact visible rectangle, preserving source dimensions',()=>{
  const original={...config(),codedWidth:320,codedHeight:180},before=structuredClone(original);
  const padded={...observation(),codedWidth:320,codedHeight:192,visibleRect:{x:0,y:0,width:320,height:180}};
  const resolved=resolveObservedNativeOutputColor(original,padded,identity());
  assert.deepEqual(resolved.outputVideoConfig,{...original,colorSpace:color});assert.deepEqual(original,before);
  assert.equal(resolved.outputColorObservation.codedHeight,192);assert.deepEqual(resolved.outputColorObservation.visibleRect,padded.visibleRect);
  assert.equal(Object.isFrozen(resolved.outputColorObservation.visibleRect),true);
  const offset={...padded,codedWidth:324,visibleRect:{x:4,y:12,width:320,height:180}};
  assert.ok(resolveObservedNativeOutputColor(original,offset,identity()).outputColorObservation);
  for(const visibleRect of [null,undefined,{},
    {x:-1,y:0,width:320,height:180},{x:0,y:-1,width:320,height:180},{x:0.5,y:0,width:320,height:180},
    {x:0,y:0.5,width:320,height:180},{x:0,y:0,width:0,height:180},{x:0,y:0,width:320,height:0},
    {x:0,y:0,width:320.5,height:180},{x:0,y:0,width:320,height:180.5},{x:0,y:0,width:Infinity,height:180},
    {x:1,y:0,width:320,height:180},{x:0,y:13,width:320,height:180}]) {
    assert.equal(qualifyNativeColorObservation({...padded,visibleRect},identity()),null);
  }
  for(const visibleRect of [{x:0,y:0,width:319,height:180},{x:0,y:0,width:320,height:179}])
    assert.equal(resolveObservedNativeOutputColor(original,{...padded,visibleRect},identity()).outputColorObservation,null);
  // Presentation scaling and non-square SAR cannot replace actual visible dimensions.
  const sar={...padded,displayWidth:640,displayHeight:180};
  assert.ok(resolveObservedNativeOutputColor(original,sar,identity()).outputColorObservation);
  assert.equal(resolveObservedNativeOutputColor({...original,codedWidth:640},sar,identity()).outputColorObservation,null);
});

test('native capture stores surface and visible geometry, without video/display/SAR inference or retained DOMRect',()=>{
  const video={readyState:2,error:null,videoWidth:640,videoHeight:180},rect={x:0,y:0,width:320,height:180};let closes=0;
  const scope={VideoFrame:class {constructor(){this.format='NV12';this.codedWidth=320;this.codedHeight=192;
    this.visibleRect=rect;this.displayWidth=640;this.displayHeight=180;this.colorSpace={...color};}close(){closes++;}}};
  const captured=observeNativeFrameColor({video,identity:identity(),isCurrent:()=>true,scope});
  assert.equal(closes,1);assert.equal(captured.codedHeight,192);assert.equal(captured.visibleRect.width,320);
  assert.equal('displayWidth' in captured,false);rect.width=1;assert.equal(captured.visibleRect.width,320);
  assert.equal(resolveObservedNativeOutputColor({...config(),codedWidth:320,codedHeight:180},captured,identity()).outputVideoConfig.codedHeight,180);
});

test('output color is a separate clone; partial/declared metadata, bytes and dimensions remain authoritative',()=>{
  const original=config(),before=structuredClone(original),resolved=resolveObservedNativeOutputColor(original,observation(),identity());
  assert.notEqual(resolved.outputVideoConfig,original);assert.notEqual(resolved.outputVideoConfig.colorSpace,original.colorSpace);
  assert.equal(resolved.outputVideoConfig.description,original.description);assert.deepEqual(original,before);
  assert.deepEqual(resolved.outputVideoConfig.colorSpace,color);assert.equal(resolved.outputColorObservation.basis,'observed-native-frame');
  assert.equal('identity' in resolved.outputColorObservation,false,'reported provenance contains no account/file identity');
  for(const [key,value] of Object.entries({...color,fullRange:false})){
    const declared={...config(),colorSpace:{[key]:value}},result=resolveObservedNativeOutputColor(declared,observation(),identity());
    assert.equal(result.outputVideoConfig,declared);assert.equal(result.outputColorObservation,null);
  }
  for(const candidate of [null,{...observation(),codedWidth:128,visibleRect:{x:0,y:0,width:128,height:64}},
    {...observation(),codedHeight:32},observation({...identity(),headRevisionId:'other'})]){
    const result=resolveObservedNativeOutputColor(original,candidate,identity());assert.equal(result.outputVideoConfig,original);assert.equal(result.outputColorObservation,null);
  }
});

const probe=bytes=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json','-i','pipe:0'],
  {input:Buffer.from(bytes),maxBuffer:1024*1024}));
function exactPackets(input,output) {
  const a=input.packets,b=output.packets,start=a.findIndex(packet=>packet.data_hash===b[0].data_hash);
  assert.ok(start>=0);assert.deepEqual(b.map(packet=>packet.data_hash),a.slice(start,start+b.length).map(packet=>packet.data_hash));
  const [an,ad]=input.streams[0].time_base.split('/').map(BigInt),[bn,bd]=output.streams[0].time_base.split('/').map(BigInt);
  const pts=new Set(),dts=new Set();
  for(let i=0;i<b.length;i++){
    assert.equal(BigInt(a[start+i].duration)*an*bd,BigInt(b[i].duration)*bn*ad);
    pts.add(String(BigInt(b[i].pts)*bn*ad-BigInt(a[start+i].pts)*an*bd));
    dts.add(String(BigInt(b[i].dts)*bn*ad-BigInt(a[start+i].dts)*an*bd));
  }
  assert.equal(pts.size,1);assert.deepEqual(pts,dts);
}
async function run(bytes,nativeColorObservation,targetTime=0) {
  const chunks=[];let window;
  const result=await streamGeneralQ1({source:source(bytes),nativeColorObservation,targetTime,onWindow:value=>window=value,onChunk:chunk=>chunks.push(chunk.bytes)});
  return {bytes:Buffer.concat(chunks),window,result};
}
test('generated AVC start/seek packets and rational clocks stay exact; observed colr exists only in output',async()=>{
  const input=probe(fixture);assert.equal(Buffer.from(fixture).includes(Buffer.from('colr')),false);
  for(const targetTime of [0,1.35]) {
    const {bytes,window,result}=await run(fixture,observation(),targetTime),output=probe(bytes);
    exactPackets(input,output);assert.ok(bytes.includes(Buffer.from('colr')));
    assert.deepEqual(window.videoConfig.colorSpace,config().colorSpace);assert.deepEqual(window.outputVideoConfig.colorSpace,color);
    assert.deepEqual(window.videoConfig.description,window.outputVideoConfig.description);
    assert.deepEqual(result.videoConfig,window.videoConfig);assert.deepEqual(result.outputColorObservation,window.outputColorObservation);
    assert.equal(output.streams[0].color_space,'smpte170m');assert.equal(output.streams[0].color_range,'tv');
    assert.equal(output.streams[0].color_primaries,'smpte170m');assert.equal(output.streams[0].color_transfer,'smpte170m');
    assert.equal(result.encodersCreated,0);assert.equal(result.cleanup.settled,true);
  }
});
test('missing/stale observation is byte-equivalent to existing mux; existing colr overrides competing observation',async()=>{
  const control=await run(fixture),stale=await run(fixture,observation({...identity(),headRevisionId:'other'}));
  assert.deepEqual(stale.bytes,control.bytes);assert.equal(stale.result.outputColorObservation,null);
  // Produce an admitted finite source with explicit colr. A fragmented Q1
  // output is not an admissible original input and must not bypass that gate.
  const input=new Input({source:new BufferSource(fixture),formats:[MP4]}),track=await input.getPrimaryVideoTrack(),decoderConfig=await track.getDecoderConfig();
  const target=new BufferTarget(),output=new Output({target,format:new Mp4OutputFormat()}),video=new EncodedVideoPacketSource('avc');
  output.addVideoTrack(video);await output.start();let first=true;
  for await(const packet of new EncodedPacketSink(track).packets()) {
    await video.add(packet,first?{decoderConfig:{...decoderConfig,colorSpace:{...color}}}:undefined);first=false;
  }
  await output.finalize();input.dispose();const declared=new Uint8Array(target.buffer),competing=observation(identity(declared.length));
  competing.colorSpace={primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:true};
  const preserved=await run(declared,competing);
  assert.deepEqual(preserved.window.videoConfig.colorSpace,color);assert.equal(preserved.window.outputVideoConfig,preserved.window.videoConfig);
  assert.equal(preserved.result.outputColorObservation,null);assert.equal(probe(preserved.bytes).streams[0].color_space,'smpte170m');
});
test('real worker propagates observation; newest read identity prevents late-checksum or revision substitution',async()=>{
  for(const mode of ['current','padded-current','checksum-appears','revision-changes']) {
    const binding=identity();if(mode==='checksum-appears')delete binding.sha256Checksum;
    const observed=observation(binding);if(mode==='padded-current')observed.codedHeight=80;
    const s=source(fixture,binding,reader=>{
      if(mode==='checksum-appears')reader.identity={...reader.identity,sha256Checksum:'a'.repeat(64)};
      if(mode==='revision-changes')reader.identity={...reader.identity,headRevisionId:'revision-2'};
    });
    const chunks=[];let window;
    const job=startGeneralWorker({source:s,generation:1,nativeColorObservation:observed,workerFactory:url=>new Worker(url),
      onWindow:value=>window=value,onChunk:chunk=>chunks.push(chunk.bytes)});
    const terminal=await job.done;assert.equal(terminal.error,undefined);assert.equal(terminal.transportCleanup.settled,true);
    const applies=['current','padded-current'].includes(mode);
    assert.equal(terminal.result.outputColorObservation?.basis??null,applies?'observed-native-frame':null);
    assert.equal(window.outputColorObservation?.basis??null,applies?'observed-native-frame':null);
    assert.equal(Buffer.concat(chunks).includes(Buffer.from('colr')),applies);
    if(mode==='padded-current') {
      assert.equal(window.videoConfig.codedHeight,64);assert.equal(window.outputVideoConfig.codedHeight,64);
      assert.equal(window.outputColorObservation.codedHeight,80);assert.equal(window.outputColorObservation.visibleRect.height,64);
      exactPackets(probe(fixture),probe(Buffer.concat(chunks)));
    }
  }
});

test('Q2 worker retains the original color-admission gate even with a complete native observation',async()=>{
  const audioFixture=readFileSync(new URL('../qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',import.meta.url));
  const videoInput=new Input({source:new BufferSource(fixture),formats:[MP4]}),audioInput=new Input({source:new BufferSource(audioFixture),formats:[MP4]});
  const videoTrack=await videoInput.getPrimaryVideoTrack(),audioTrack=await audioInput.getPrimaryAudioTrack();
  const videoConfig=await videoTrack.getDecoderConfig(),audioConfig=await audioTrack.getDecoderConfig();
  const target=new BufferTarget(),output=new Output({target,format:new Mp4OutputFormat()}),video=new EncodedVideoPacketSource('avc'),audio=new EncodedAudioPacketSource('ac3');
  output.addVideoTrack(video);output.addAudioTrack(audio);await output.start();let first=true;
  for await(const packet of new EncodedPacketSink(videoTrack).packets()) {
    await video.add(packet,first?{decoderConfig:videoConfig}:undefined);first=false;
  }
  first=true;let count=0;
  for await(const packet of new EncodedPacketSink(audioTrack).packets()) {
    await audio.add(packet,first?{decoderConfig:audioConfig}:undefined);first=false;if(++count===8)break;
  }
  await output.finalize();videoInput.dispose();audioInput.dispose();const bytes=new Uint8Array(target.buffer);
  const url=new URL('../media/audio-general-worker.mjs',import.meta.url),bootstrap=`globalThis.AudioEncoder={isConfigSupported:async()=>({supported:true})};globalThis.MediaSource={isTypeSupported:()=>true};import(${JSON.stringify(url.href)});`;
  let window=false,chunks=0;
  const job=startGeneralWorker({source:source(bytes),generation:1,nativeColorObservation:observation(identity(bytes.length)),
    workerFactory:()=>new Worker(bootstrap,{eval:true}),onWindow:()=>window=true,onChunk:()=>chunks++});
  const terminal=await job.done;assert.equal(terminal.error?.message,'AUDIO_VIDEO_COLOR_UNQUALIFIED');
  assert.equal(terminal.error?.diagnostic.phase,'native-capability');assert.equal(window,false);assert.equal(chunks,0);
  assert.equal(terminal.transportCleanup.settled,true);
});

test('Q3 worker accepts shared identity replies and retains its unsupported-capability cleanup gate',async()=>{
  const bytes=readFileSync(new URL('../qa/q3-browser-execution/synthetic-mpeg4.mp4',import.meta.url));
  const binding=identity(bytes.length);let windows=0,chunks=0;
  const job=startGeneralWorker({source:source(bytes,binding),generation:1,nativeColorObservation:observation(binding),
    workerFactory:()=>new Worker(new URL('../media/video-q3-worker.mjs',import.meta.url)),
    onWindow:()=>windows++,onChunk:()=>chunks++});
  try {
    const terminal=await job.done;
    assert.equal(terminal.error?.message,'Q3_CAPABILITY_UNAVAILABLE');
    assert.ok(terminal.metrics.reads>0);assert.equal(terminal.metrics.invalidMessages,0);
    assert.equal(windows,0);assert.equal(chunks,0);
    assert.equal(terminal.transportCleanup.settled,true);assert.equal(terminal.metrics.terminated,true);
  } finally {await job.cancel();}
});
