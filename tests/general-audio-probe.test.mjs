import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {probePinnedGeneralAudio} from '../media/audio-general-pipeline.mjs';
import {GENERAL_LIMITS} from '../media/general-admission.mjs';
import {observeAudioCompatibility,observeNativeFileSupport} from '../media/audio-runtime.mjs';

const fixture = path => readFileSync(fileURLToPath(new URL(`../${path}`,import.meta.url)));
function sourceFor(bytes) {
  const reads=[]; let closed=false;
  return {identity:{size:String(bytes.length)}, reads,
    async read({start,end}) { assert.equal(closed,false); reads.push([start,end]); return new Uint8Array(bytes.subarray(start,end+1)); },
    async abort() { closed=true; return {settled:true}; },
    get closed() {return closed;}};
}

test('bounded pinned-track admission identifies AC3 and EAC3 without whole-object input',async()=>{
  const previous={document:globalThis.document,AudioDecoder:globalThis.AudioDecoder,AudioEncoder:globalThis.AudioEncoder,MediaSource:globalThis.MediaSource};
  globalThis.document={createElement:()=>({canPlayType:()=>''})};
  globalThis.AudioDecoder={isConfigSupported:async()=>({supported:false})};
  globalThis.AudioEncoder={isConfigSupported:async()=>({supported:true})};
  globalThis.MediaSource={isTypeSupported:()=>true};
  try {
    for(const path of ['qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',
      'qa/q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4']) {
      const bytes=fixture(path),source=sourceFor(bytes);
      const result=await probePinnedGeneralAudio(source);
      assert.equal(result.route,'q2');
      assert.equal(source.closed,true);
      assert.ok(source.reads.length>0);
      assert.ok(source.reads.every(([start,end])=>end-start+1<=65536));
      assert.ok(source.reads.reduce((n,[start,end])=>n+end-start+1,0)<bytes.length);
    }
  } finally {Object.assign(globalThis,previous);}
});

test('AAC stays original-native and unavailable Q2 output fails closed',async()=>{
  const previous={document:globalThis.document,AudioDecoder:globalThis.AudioDecoder,AudioEncoder:globalThis.AudioEncoder,MediaSource:globalThis.MediaSource};
  globalThis.document={createElement:()=>({canPlayType:()=>''})};
  globalThis.AudioDecoder={isConfigSupported:async()=>({supported:false})};
  globalThis.AudioEncoder={isConfigSupported:async()=>({supported:false})};
  globalThis.MediaSource={isTypeSupported:()=>true};
  try {
    const aac=sourceFor(fixture('qa/faststart-h264-aac.mp4'));
    assert.equal((await probePinnedGeneralAudio(aac)).route,'native');
    assert.equal(aac.closed,true);
    const ac3=sourceFor(fixture('qa/q2-audio-compatibility/synthetic-avc-ac3.mp4'));
    assert.equal((await probePinnedGeneralAudio(ac3)).route,'unsupported');
    assert.equal(ac3.closed,true);
  } finally {Object.assign(globalThis,previous);}
});

test('AAC sample-count budget yields a clean optional-probe limit rather than source failure',async()=>{
 const bytes=Buffer.from(fixture('qa/faststart-h264-aac.mp4'));
 const sizeBox=bytes.indexOf(Buffer.from('stsz'));
 assert.ok(sizeBox>0);
 // Allocation discriminator only: this counter-mutated fixture is not claimed
 // to be a complete valid long film or native playback proof.
 bytes.writeUInt32BE(1,sizeBox+8);
 bytes.writeUInt32BE(GENERAL_LIMITS.tableSamplesPerTrack+1,sizeBox+12);
 const source=sourceFor(bytes);
 await assert.rejects(probePinnedGeneralAudio(source),{message:'GENERAL_EXPANDED_INDEX_LIMIT'});
 assert.equal(source.closed,true);
});

test('HTML native file support preserves Q0 despite WebCodecs input absence',async()=>{
 const previous={document:globalThis.document,AudioDecoder:globalThis.AudioDecoder,AudioEncoder:globalThis.AudioEncoder,MediaSource:globalThis.MediaSource};
 const queries=[];globalThis.document={createElement:()=>({canPlayType:type=>{queries.push(type);return 'probably';}})};
 globalThis.AudioDecoder={isConfigSupported:async()=>({supported:false})};globalThis.AudioEncoder={isConfigSupported:async()=>({supported:true})};globalThis.MediaSource={isTypeSupported:()=>true};
 try {const result=await probePinnedGeneralAudio(sourceFor(fixture('qa/q2-audio-compatibility/synthetic-avc-ac3.mp4')));
  assert.equal(result.route,'native');assert.equal(queries.length,1);assert.match(queries[0],/^video\/mp4; codecs="avc[13]\.[A-Fa-f0-9]+,ac-3"$/);
 }finally{Object.assign(globalThis,previous);}
});

test('WebCodecs input support does not refuse otherwise qualified Q2 output',async()=>{
 const scope={AudioDecoder:{isConfigSupported:async()=>({supported:true})},AudioEncoder:{isConfigSupported:async()=>({supported:true})},MediaSource:{isTypeSupported:()=>true}};
 const capability=await observeAudioCompatibility({codec:'ac-3',numberOfChannels:2,sampleRate:48000},scope);
 assert.equal(capability.nativeInputSupported,true);assert.equal(capability.eligible,true);
});

const ac3Fixture=()=>sourceFor(fixture('qa/q2-audio-compatibility/synthetic-avc-ac3.mp4'));
const q2Scope=(answer,decoderSupported=false)=>({document:{createElement:()=>({canPlayType:()=>answer})},
 AudioDecoder:{isConfigSupported:async()=>({supported:decoderSupported})},
 AudioEncoder:{isConfigSupported:async()=>({supported:true})},MediaSource:{isTypeSupported:()=>true}});

for(const output of ['missing','rejecting','unsupported'])test('native file positive preserves Q0 without '+output+' Opus output',async()=>{
 const scope=q2Scope('probably');let outputCalls=0;
 scope.AudioEncoder=output==='missing'?undefined:{isConfigSupported:async()=>{outputCalls++;if(output==='rejecting')throw Error('synthetic encoder reject');return{supported:false};}};
 const source=ac3Fixture(),result=await probePinnedGeneralAudio(source,{scope});
 assert.equal(result.route,'native');assert.equal(result.nativeFile.supported,true);assert.equal(outputCalls,0);assert.equal(source.closed,true);
});

test('HTML file unsupported plus WebCodecs input supported still selects qualified Q2',async()=>{
 const result=await probePinnedGeneralAudio(ac3Fixture(),{scope:q2Scope('',true)});
 assert.equal(result.route,'q2');assert.equal(result.nativeFile.supported,false);assert.equal(result.capability.nativeInputSupported,true);
});

for(const variant of ['maybe','unexpected','missing-document','missing-method','element-rejection','query-rejection'])
test('unknown native file capability preserves Q0: '+variant,async()=>{
 const scope=q2Scope(variant==='maybe'?'maybe':null);let outputCalls=0;
 scope.AudioEncoder={isConfigSupported:async()=>{outputCalls++;throw Error('must not query output');}};
 if(variant==='missing-document')delete scope.document;
 if(variant==='missing-method')scope.document.createElement=()=>({});
 if(variant==='element-rejection')scope.document.createElement=()=>{throw Error('synthetic element reject');};
 if(variant==='query-rejection')scope.document.createElement=()=>({canPlayType(){throw Error('synthetic query reject');}});
 const source=ac3Fixture(),result=await probePinnedGeneralAudio(source,{scope});
 assert.equal(result.route,'native');assert.equal(result.nativeFile.supported,null);assert.equal(outputCalls,0);assert.equal(source.closed,true);
});

for(const missing of ['AudioDecoder','AudioEncoder','MediaSource'])test('missing codec API yields diagnostic or qualified-output refusal without TypeError: '+missing,async()=>{
 const scope=q2Scope('');delete scope[missing];const result=await probePinnedGeneralAudio(ac3Fixture(),{scope});
 assert.equal(result.route,missing==='AudioDecoder'?'q2':'unsupported');
 if(missing==='AudioDecoder')assert.equal(result.capability.nativeInputSupported,null);
});

test('rejecting WebCodecs input is diagnostic only; rejecting output is ineligible',async()=>{
 const scope=q2Scope('');scope.AudioDecoder.isConfigSupported=async()=>{throw Error('synthetic decoder reject');};
 let result=await probePinnedGeneralAudio(ac3Fixture(),{scope});assert.equal(result.route,'q2');assert.equal(result.capability.nativeInputSupported,null);
 scope.AudioEncoder.isConfigSupported=async()=>{throw Error('synthetic encoder reject');};
 result=await probePinnedGeneralAudio(ac3Fixture(),{scope});assert.equal(result.route,'unsupported');assert.equal(result.capability.opusEncoderSupported,null);
});

test('exact combined HTML query uses actual QTFF container and treats malformed config as unknown',()=>{
 let query;const scope={document:{createElement:()=>({canPlayType:type=>{query=type;return 'probably';}})}};
 assert.equal(observeNativeFileSupport({codec:'avc1.64000A'},{codec:'ec-3'},{scope,container:'video/quicktime'}).supported,true);
 assert.equal(query,'video/quicktime; codecs="avc1.64000A,ec-3"');
 assert.equal(observeNativeFileSupport({codec:'avc1.invalid'},{codec:'ec-3'},{scope}).supported,null);
});

test('ManagedMediaSource alone does not qualify the current MediaSource-only general player',async()=>{
 const scope=q2Scope('');delete scope.MediaSource;scope.ManagedMediaSource={isTypeSupported:()=>true};
 assert.equal((await probePinnedGeneralAudio(ac3Fixture(),{scope})).route,'unsupported');
});

for(const pendingApi of ['AudioDecoder','AudioEncoder'])test('aborting a pending '+pendingApi+' query settles real probe and source without later output queries',async()=>{
 const controller=new AbortController(),scope=q2Scope(''),source=ac3Fixture();
 let started,rejectLate,outputCalls=0;const querying=new Promise(r=>{started=r;});
 const late=new Promise((_,reject)=>{rejectLate=reject;});
 scope.AudioEncoder={isConfigSupported:async()=>{outputCalls++;return {supported:true};}};
 scope[pendingApi]={isConfigSupported:()=>{started();return late;}};
 const job=probePinnedGeneralAudio(source,{scope,signal:controller.signal});
 const rejected=assert.rejects(job,{message:'GENERAL_CANCELLED'});
 await querying;controller.abort();await rejected;
 assert.equal(source.closed,true);assert.equal(outputCalls,0);
 rejectLate(Error('synthetic late query rejection'));await new Promise(r=>setImmediate(r));
});

test('pre-aborted probe never reads source or queries codec APIs and still drains',async()=>{
 const controller=new AbortController(),scope=q2Scope(''),source=ac3Fixture();let queries=0;
 scope.AudioDecoder.isConfigSupported=scope.AudioEncoder.isConfigSupported=()=>{queries++;throw Error('unexpected query');};
 controller.abort();await assert.rejects(probePinnedGeneralAudio(source,{scope,signal:controller.signal}),{message:'GENERAL_CANCELLED'});
 assert.equal(source.closed,true);assert.equal(source.reads.length,0);assert.equal(queries,0);
 await assert.rejects(observeAudioCompatibility({codec:'ac-3',numberOfChannels:2,sampleRate:48000},scope,{signal:controller.signal}),{message:'GENERAL_CANCELLED'});
 assert.equal(queries,0);
});

for(const cancellation of [false,true])test('capability query removes its abort listener after '+(cancellation?'cancel':'success'),async()=>{
 const controller=new AbortController(),signal=controller.signal;let listeners=0,started;
 const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
 signal.addEventListener=(name,fn,options)=>{if(name==='abort')listeners++;return add(name,fn,options);};
 signal.removeEventListener=(name,fn)=>{if(name==='abort')listeners--;return remove(name,fn);};
 const querying=new Promise(r=>{started=r;}),scope=q2Scope('');
 if(cancellation)scope.AudioDecoder.isConfigSupported=()=>{started();return new Promise(()=>{});};
 const job=observeAudioCompatibility({codec:'ac-3',numberOfChannels:2,sampleRate:48000},scope,{signal});
 if(cancellation){const rejected=assert.rejects(job,{message:'GENERAL_CANCELLED'});await querying;controller.abort();await rejected;}
 else assert.equal((await job).eligible,true);
 assert.equal(listeners,0);
});
