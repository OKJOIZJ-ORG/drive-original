import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {probePinnedGeneralTracks,validateGeneralAudioSelection} from '../media/general-tracks.mjs';
import {inspectGeneralMoov,GENERAL_LIMITS} from '../media/general-admission.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {streamGeneralQ2} from '../media/audio-general-pipeline.mjs';
import {startGeneralWorker} from '../media/general-owner.mjs';

const bytesFor=name=>new Uint8Array(readFileSync(new URL(`../qa/${name}`,import.meta.url)));
const multi=bytesFor('fm05-controlled-diagnostic/multiaudio.mp4');
const subtitle=bytesFor('fm05-controlled-diagnostic/subtitle.mp4');
function source(bytes=multi,identity={}) {let closed=false,aborts=0;const reads=[];return {identity:{size:bytes.length,headRevisionId:'fixture-A',...identity},reads,
 async read({start,end}) {assert.equal(closed,false);reads.push([start,end]);return bytes.slice(start,end+1);},
 async abort(){closed=true;aborts++;return {settled:true};},stats:()=>({closed,aborts})};}
const box=(name,...parts)=>{const b=Buffer.concat([Buffer.alloc(8),...parts]);b.writeUInt32BE(b.length);b.write(name,4);return b;};
function allocationTrack(id,samples=65536,entries=1) {
 const tkhd=Buffer.alloc(16);tkhd.writeUInt32BE(id,12);const handler=Buffer.alloc(12);handler.write('soun',8);
 const entry=Buffer.alloc(36);entry.writeUInt32BE(36);entry.write('mp4a',4);entry[15]=1;const stsd=Buffer.alloc(8);stsd.writeUInt32BE(1,4);
 const stts=Buffer.alloc(16);stts.writeUInt32BE(1,4);stts.writeUInt32BE(samples,8);stts.writeUInt32BE(1,12);
 const stsz=Buffer.alloc(12);stsz.writeUInt32BE(1,4);stsz.writeUInt32BE(samples,8);const stco=Buffer.alloc(8+4*entries);stco.writeUInt32BE(entries,4);
 return box('trak',box('tkhd',tkhd),box('mdia',box('hdlr',handler),box('minf',box('dinf',box('dref',Buffer.from('00000000000000010000000c75726c2000000001','hex'))),box('stbl',box('stsd',stsd,entry),box('stts',stts),box('stsz',stsz),box('stco',stco)))));
}
const scope=(native='')=>({document:{createElement:()=>({canPlayType:()=>native})},AudioDecoder:{isConfigSupported:async()=>({supported:false})},AudioEncoder:{isConfigSupported:async()=>({supported:true})},MediaSource:{isTypeSupported:()=>true}});

test('same-pinned metadata inventory reports exact ISO IDs and qualified AAC without decoding or body download',async()=>{
 const s=source(),api={document:{createElement(){assert.fail('AAC does not need native or decoder capability');}}};
 const inventory=await probePinnedGeneralTracks(s,{scope:api});
 assert.deepEqual(inventory.audioTracks.map(t=>[t.trackId,t.language,t.codec,t.route]),[[2,'eng','aac','q1'],[3,'kor','aac','q1']]);
 assert.equal(inventory.defaultAudioTrackId,2);assert.equal(inventory.identity.headRevisionId,'fixture-A');
 assert.equal(inventory.cleanup.settled,true);assert.equal(s.stats().aborts,1);
 assert.deepEqual(s.reads,[[0,65535]]);assert.equal(inventory.reads.inFlight,0);
 assert.equal((await probePinnedGeneralTracks(source(subtitle))).audioTracks[0].route,'q1');
});
test('AC3 and EAC3 inventories only qualify Q2 when required and supported; no audio codec instance',async()=>{
 for(const path of ['q2-audio-compatibility/synthetic-avc-ac3.mp4','q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4']) {
  const bytes=bytesFor(path),s=source(bytes),inventory=await probePinnedGeneralTracks(s,{scope:scope()});
  assert.equal(inventory.audioTracks[0].route,'q2');assert.equal(s.stats().aborts,1);assert.ok(inventory.reads.bytes<bytes.length);
  assert.equal((await probePinnedGeneralTracks(source(bytes),{scope:scope('probably')})).audioTracks[0].route,'unqualified');
  const absent=scope();delete absent.AudioEncoder;assert.equal((await probePinnedGeneralTracks(source(bytes),{scope:absent})).audioTracks[0].reason,'q2-capability-unavailable');
 }
});
test('additional tracks retain the original aggregate allocation ceiling and reject unknown codec/external references',()=>{
 assert.equal(inspectGeneralMoov(box('moov',allocationTrack(1),allocationTrack(2))).samples.reduce((a,b)=>a+b),GENERAL_LIMITS.totalSamples);
 assert.throws(()=>inspectGeneralMoov(box('moov',allocationTrack(1),allocationTrack(2),allocationTrack(3))),/GENERAL_AGGREGATE_SAMPLES_LIMIT/);
 assert.throws(()=>inspectGeneralMoov(box('moov',allocationTrack(1,0,50000),allocationTrack(2,0,50000),allocationTrack(3,0,50000))),/GENERAL_AGGREGATE_ENTRIES_LIMIT/);
 assert.throws(()=>inspectGeneralMoov(box('moov',...Array.from({length:9},(_,i)=>allocationTrack(i+1,0)))),/GENERAL_TRACK_LIMIT/);
 assert.throws(()=>inspectGeneralMoov(box('moov',allocationTrack(1,0),allocationTrack(1,0))),/GENERAL_TRACK_ID/);
 const unknown=Buffer.from(subtitle);unknown.write('zzzz',unknown.indexOf('tx3g'));assert.throws(()=>inspectGeneralMoov(moov(unknown)),/GENERAL_CODEC_UNQUALIFIED/);
 const external=Buffer.from(subtitle),url=external.indexOf('url ');external[url+7]=0;assert.throws(()=>inspectGeneralMoov(moov(external)),/GENERAL_EXTERNAL_REFERENCE_UNQUALIFIED/);
});
function moov(bytes){for(let p=0;p<bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+p).getUint32(0);if(Buffer.from(bytes.subarray(p+4,p+8)).toString()==='moov')return bytes.subarray(p,p+n);p+=n;}throw Error('missing moov');}
const probe=bytes=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json','-i','pipe:0'],{input:Buffer.from(bytes),maxBuffer:8*1024*1024}));
function comparePackets(input,output,type,inputIndex){
 const a=input.packets.filter(p=>p.stream_index===inputIndex),b=output.packets.filter(p=>p.codec_type===type),start=a.findIndex(p=>p.data_hash===b[0]?.data_hash);
 assert.ok(start>=0);assert.deepEqual(b.map(p=>p.data_hash),a.slice(start,start+b.length).map(p=>p.data_hash));
 const ins=input.streams.find(s=>s.index===inputIndex),outs=output.streams.find(s=>s.codec_type===type);
 const [an,ad]=ins.time_base.split('/').map(BigInt),[bn,bd]=outs.time_base.split('/').map(BigInt),shifts=new Set(),dtsShifts=new Set();
 for(let i=0;i<b.length;i++){assert.equal(BigInt(a[start+i].duration)*an*bd,BigInt(b[i].duration)*bn*ad);shifts.add(String(BigInt(b[i].pts)*bn*ad-BigInt(a[start+i].pts)*an*bd));dtsShifts.add(String(BigInt(b[i].dts)*bn*ad-BigInt(a[start+i].dts)*an*bd));}
 assert.equal(shifts.size,1);assert.deepEqual(shifts,dtsShifts);return [...shifts][0]+'/'+String(ad*bd);
}
test('exact selected AAC copies independent packet hashes and rational source clocks at start and seek, default remains track2',async()=>{
 const input=probe(multi);
 for(const [selected,targetTime] of [[undefined,0],[2,0],[3,0],[3,3.4]]) {
  const chunks=[],s=source();let window;const result=await streamGeneralQ1({source:s,selectedAudioTrackId:selected,targetTime,onWindow:w=>window=w,onChunk:c=>chunks.push(c.bytes)});
  const output=probe(Buffer.concat(chunks)),id=selected??2;
  assert.equal(result.selectedAudioTrackId,id);assert.equal(window.selectedAudioTrackId,id);assert.equal(result.encodersCreated,0);
  const vshift=comparePackets(input,output,'video',0),ashift=comparePackets(input,output,'audio',id-1);
  const [vn,vd]=vshift.split('/').map(BigInt),[an,ad]=ashift.split('/').map(BigInt);assert.equal(vn*ad,an*vd);
  assert.equal(output.streams.filter(s=>s.codec_type==='audio').length,1);assert.equal(s.stats().aborts,1);assert.equal(result.cleanup.settled,true);
 }
});
test('valid tx3g inventory does not enter the A/V packet mux; selected AAC stays original',async()=>{
 const chunks=[],result=await streamGeneralQ1({source:source(subtitle),selectedAudioTrackId:2,onChunk:c=>chunks.push(c.bytes)}),output=probe(Buffer.concat(chunks)),input=probe(subtitle);
 assert.deepEqual(output.streams.map(s=>s.codec_type),['video','audio']);comparePackets(input,output,'video',0);comparePackets(input,output,'audio',1);assert.equal(result.encodersCreated,0);
});
test('missing or invalid selection never substitutes language/default and always drains the opened source',async()=>{
 for(const selected of [1,4,99])for(const pipeline of [streamGeneralQ1,streamGeneralQ2]) {
  const s=source();await assert.rejects(pipeline({source:s,selectedAudioTrackId:selected,onWindow(){assert.fail('no selected stream');},onChunk(){assert.fail('no output');}}),/GENERAL_AUDIO_SELECTION_MISSING/);assert.equal(s.stats().aborts,1);
 }
 for(const id of [null,'3',0,-1,NaN,Infinity,3.5,2**32]){assert.throws(()=>validateGeneralAudioSelection(id),/GENERAL_AUDIO_SELECTION_INVALID/);const s=source();await assert.rejects(streamGeneralQ1({source:s,selectedAudioTrackId:id,onChunk(){assert.fail('invalid choice');}}),/GENERAL_AUDIO_SELECTION_INVALID/);assert.deepEqual(s.reads,[]);assert.equal(s.stats().aborts,1);}
 const s=source();await assert.rejects(streamGeneralQ2({source:s,selectedAudioTrackId:3,onChunk(){assert.fail('AAC must not transcode');}}),/GENERAL_CODEC_UNQUALIFIED/);assert.equal(s.stats().aborts,1);
 const changed=Buffer.from(multi),at=changed.indexOf('tkhd',changed.indexOf('tkhd',changed.indexOf('tkhd')+4)+4);changed.writeUInt32BE(4,at+16);
 await assert.rejects(streamGeneralQ1({source:source(new Uint8Array(changed),{headRevisionId:'fixture-B'}),selectedAudioTrackId:3,onChunk(){assert.fail('stale choice');}}),/GENERAL_AUDIO_SELECTION_MISSING/);
});
test('worker option reaches exact track choice, missing choice and cancellation settle one owner',async()=>{
 const s=source();let window;const job=startGeneralWorker({source:s,generation:11,selectedAudioTrackId:3,workerFactory:url=>new Worker(url),onWindow:w=>window=w,onChunk(){}}),terminal=await job.done;
 assert.equal(terminal.error,undefined);assert.equal(terminal.result.selectedAudioTrackId,3);assert.equal(window.selectedAudioTrackId,3);assert.equal(terminal.transportCleanup.settled,true);
 const missing=await startGeneralWorker({source:source(),generation:12,selectedAudioTrackId:99,workerFactory:url=>new Worker(url),onChunk(){assert.fail('missing choice output');}}).done;
 assert.equal(missing.error.message,'GENERAL_AUDIO_SELECTION_MISSING');assert.equal(missing.transportCleanup.settled,true);
 let entered;const gate=new Promise(r=>entered=r),cancelled=startGeneralWorker({source:source(),generation:13,selectedAudioTrackId:3,workerFactory:url=>new Worker(url),onChunk:({signal})=>new Promise(r=>{entered();signal.addEventListener('abort',r,{once:true});})});await gate;assert.equal((await cancelled.cancel()).transportCleanup.settled,true);
});
test('cancelled inventory drains pending capability without late choice publication',async()=>{
 const controller=new AbortController(),api=scope(),s=source(bytesFor('q2-audio-compatibility/synthetic-avc-ac3.mp4'));let entered,finish;const gate=new Promise(r=>entered=r);
 api.AudioEncoder.isConfigSupported=()=>{entered();return new Promise(r=>finish=r);};const pending=probePinnedGeneralTracks(s,{signal:controller.signal,scope:api}),rejected=assert.rejects(pending,/GENERAL_CANCELLED/);
 await gate;controller.abort();await rejected;finish({supported:true});assert.equal(s.stats().aborts,1);
 const aborted=new AbortController();aborted.abort();const noRead=source();await assert.rejects(probePinnedGeneralTracks(noRead,{signal:aborted.signal}),/GENERAL_CANCELLED/);assert.deepEqual(noRead.reads,[]);assert.equal(noRead.stats().aborts,1);
});
test('explicit selected AC3/EAC3 reaches qualified Q2 profile without allocating codec heap when native output is unavailable',async()=>{
 for(const path of ['q2-audio-compatibility/synthetic-avc-ac3.mp4','q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4']) {
  const bytes=bytesFor(path),inventory=await probePinnedGeneralTracks(source(bytes),{scope:scope()}),id=inventory.audioTracks[0].trackId;
  const s=source(bytes);let failure;await assert.rejects(streamGeneralQ2({source:s,selectedAudioTrackId:id,onWindow(){assert.fail('no native output');},onChunk(){assert.fail('no native output');}}),error=>{failure=error;return error.message==='AUDIO_NATIVE_GATE_UNAVAILABLE';});
  assert.equal(failure.diagnostic.phase,'native-capability');assert.equal(failure.audioMetrics.heapBytes,0);assert.equal(failure.audioMetrics.opened,0);assert.equal(s.stats().aborts,1);
 }
 const terminal=await startGeneralWorker({source:source(),generation:14,selectedAudioTrackId:3,
  workerFactory:()=>new Worker(new URL('../media/audio-general-worker.mjs',import.meta.url)),onChunk(){assert.fail('AAC choice must not reach Q2 encoder');}}).done;
 assert.equal(terminal.error.message,'GENERAL_CODEC_UNQUALIFIED');assert.equal(terminal.error.audioMetrics.opened,0);assert.equal(terminal.transportCleanup.settled,true);
});
