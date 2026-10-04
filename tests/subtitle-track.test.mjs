import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPinnedSubtitleTrack,decodeTx3gSample,SUBTITLE_LIMITS} from '../media/subtitle-track.mjs';
import {probePinnedGeneralTracks} from '../media/general-tracks.mjs';

const fixture=readFileSync(new URL('../qa/fm05-controlled-diagnostic/subtitle.mp4',import.meta.url));
const oracle=JSON.parse(readFileSync(new URL('../qa/fm05-controlled-diagnostic/subtitle-input-probe.json',import.meta.url)));
function sourceFor(bytes,options={}) {
  let closed=false,aborts=0,gate=null; const reads=[];
  return {identity:{size:String(bytes.length)},reads,
    async read({start,end}) { assert.equal(closed,false); reads.push([start,end]); if(gate) await gate.promise; if(options.reject)throw Error('synthetic read'); return new Uint8Array(bytes.subarray(start,end+1)); },
    async abort() { closed=true; aborts++; if(gate)gate.release(); return {settled:true}; },
    hold() { let release; const promise=new Promise(resolve=>release=resolve); gate={promise,release}; return release; },
    get closed(){return closed;},get aborts(){return aborts;}};
}
const uint=(...values)=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32BE(v>>>0,i*4));return b;};
const box=(name,...contents)=>{const body=Buffer.concat(contents),h=Buffer.alloc(8);h.writeUInt32BE(body.length+8);h.write(name,4);return Buffer.concat([h,body]);};
const sample=text=>{const b=Buffer.from(text),h=Buffer.alloc(2);h.writeUInt16BE(b.length);return Buffer.concat([h,b]);};
function synthetic({codec='tx3g',edit=null,ctts=null,co64=false,subtitles=1,count=3,delta=2000,padding=0}={}) {
  const makeSample=i=>Buffer.concat([sample(['FIRST','SECOND','THIRD'][i%3]),padding?box('free',Buffer.alloc(padding)):Buffer.alloc(0)]);
  const payload=Buffer.concat(Array.from({length:count},(_,i)=>makeSample(i)));
  function track(id,offset) {
    const tkhd=box('tkhd',uint(3,0,0,id,0,6000),Buffer.alloc(60));
    const mdhd=box('mdhd',uint(0,0,0,1000,count*delta),Buffer.from([0x55,0xc4,0,0]));
    const hdlr=box('hdlr',uint(0,0),Buffer.from('sbtl'),Buffer.alloc(12));
    const entry=Buffer.alloc(38);entry.writeUInt16BE(1,6);
    const stsd=box('stsd',uint(0,1),box(codec,entry));
    const stsz=box('stsz',uint(0,0,count),uint(...Array.from({length:count},(_,i)=>makeSample(i).length)));
    const stts=box('stts',uint(0,1,count,delta)),stsc=box('stsc',uint(0,1,1,count,1));
    const offsetBytes=co64?Buffer.concat([uint(0),uint(offset)]):uint(offset);
    const stco=box(co64?'co64':'stco',uint(0,1),offsetBytes);
    const composition=ctts===null?Buffer.alloc(0):box('ctts',uint(0x01000000,1,count,ctts));
    const dinf=box('dinf',box('dref',uint(0,1),box('url ',uint(1))));
    const minf=box('minf',dinf,box('stbl',stsd,stsz,stts,stsc,stco,composition));
    const edts=edit===null?Buffer.alloc(0):box('edts',box('elst',uint(0,edit.length),...edit.map(([duration,origin,rate=65536])=>uint(duration,origin,rate))));
    return box('trak',tkhd,edts,box('mdia',mdhd,hdlr,minf));
  }
  const mvhd=box('mvhd',uint(0,0,0,1000,6000));
  const ftyp=box('ftyp',Buffer.from('isom'),uint(0),Buffer.from('isom'));
  const free=box('free',Buffer.alloc(140000));
  let moov=box('moov',mvhd,...Array.from({length:subtitles},(_,i)=>track(i+3,0)));
  moov=box('moov',mvhd,...Array.from({length:subtitles},(_,i)=>track(i+3,ftyp.length+moov.length+free.length+8+90000+i*payload.length)));
  // Place cues beyond the metadata/header cache block so race tests exercise
  // an actual outstanding source read rather than a synchronously cached hit.
  return Buffer.concat([ftyp,moov,free,box('mdat',Buffer.alloc(90000),...Array.from({length:subtitles},()=>payload))]);
}
function mutate(bytes,type,callback,last=false) { const b=Buffer.from(bytes),p=last?b.lastIndexOf(type):b.indexOf(type);assert.ok(p>0);callback(b,p);return b; }

test('controlled FFmpeg mov_text oracle: exact inventory, original clock, bounded reads and cleanup',async()=>{
  const original=Buffer.from(fixture),source=sourceFor(fixture),owner=await createPinnedSubtitleTrack(source);
  const stream=oracle.streams.find(s=>s.codec_type==='subtitle'),packet=oracle.packets.find(p=>p.codec_type==='subtitle');
  assert.deepEqual(owner.tracks.map(t=>({trackId:t.trackId,codec:t.codec,language:t.language})),[{trackId:parseInt(stream.id),codec:stream.codec_tag_string,language:stream.tags.language}]);
  assert.equal(owner.selectedTrackId,null);assert.deepEqual(await owner.cuesAt(1),[]);
  owner.select(3); for(const time of [0,4.9,1,4,0])assert.deepEqual(await owner.cuesAt(time,{after:0}),[{trackId:3,startTime:Number(packet.pts_time),endTime:Number(packet.pts_time)+Number(packet.duration_time),text:'SYNTHETIC SUBTITLE'}]);
  assert.deepEqual(await owner.cuesAt(5,{after:0}),[]);owner.select(null);assert.deepEqual(await owner.cuesAt(2),[]);
  assert.throws(()=>owner.select('3'),/SUBTITLE_TRACK_UNKNOWN/);assert.throws(()=>owner.select(4),/SUBTITLE_TRACK_UNKNOWN/);
  assert.ok(source.reads.every(([a,b])=>b-a+1<=65536));assert.ok(source.reads.reduce((n,[a,b])=>n+b-a+1,0)<fixture.length);
  assert.ok(owner.metrics.peakCache<=262144);assert.equal(owner.metrics.peakInFlight,1);assert.deepEqual(fixture,original);
  assert.equal((await owner.dispose()).settled,true);await owner.cleanup();assert.equal(source.aborts,1);await assert.rejects(owner.cuesAt(0),/GENERAL_CANCELLED/);
});

test('exact multiple-track selection and backwards seeks never pick another language',async()=>{
  const source=sourceFor(synthetic({subtitles:2})),owner=await createPinnedSubtitleTrack(source);
  assert.deepEqual(owner.tracks.map(t=>t.trackId),[3,4]);owner.select(4);
  for(const [time,text] of [[4.1,'THIRD'],[0,'FIRST'],[2.1,'SECOND'],[0.1,'FIRST']]) {
    const cues=await owner.cuesAt(time,{after:0});assert.equal(cues.length,1);assert.equal(cues[0].text,text);assert.equal(cues[0].trackId,4);
  }
  owner.select(3);assert.equal((await owner.cuesAt(2,{after:0}))[0].trackId,3);await owner.dispose();
});

test('co64 and signed composition clock plus supported single edit align cues to source time',async()=>{
  const source=sourceFor(synthetic({co64:true,ctts:-500,edit:[[5000,1000]]})),owner=await createPinnedSubtitleTrack(source);owner.select(3);
  const cues=await owner.cuesAt(0,{after:0});assert.deepEqual(cues.map(c=>[c.startTime,c.endTime]),[[0,0.5]]);
  assert.equal((await owner.cuesAt(1,{after:0}))[0].text,'SECOND');await owner.dispose();
});

test('initial empty edit delays subtitle presentation without rebasing original clock',async()=>{
  const owner=await createPinnedSubtitleTrack(sourceFor(synthetic({edit:[[1000,-1],[6000,0]]})));owner.select(3);
  assert.deepEqual(await owner.cuesAt(0,{after:0}),[]);assert.deepEqual((await owner.cuesAt(1,{after:0})).map(c=>[c.startTime,c.endTime]),[[1,3]]);await owner.dispose();
});

test('unsupported subtitle codec remains explicit and cannot be selected',async()=>{
  const owner=await createPinnedSubtitleTrack(sourceFor(synthetic({codec:'wvtt'})));assert.equal(owner.tracks[0].supported,false);assert.equal(owner.tracks[0].reason,'CODEC_UNSUPPORTED');assert.throws(()=>owner.select(3),/SUBTITLE_CODEC_UNSUPPORTED/);await owner.dispose();
});

test('length-prefixed UTF8 and UTF16 BOM decode as literal text; modifiers are only bounded metadata',()=>{
  assert.equal(decodeTx3gSample(sample('<script>\n한글 & subtitle</script>')),'<script>\n한글 & subtitle</script>');
  for(const [bom,payload] of [[Buffer.from([0xff,0xfe]),Buffer.from('한글','utf16le')],[Buffer.from([0xfe,0xff]),Buffer.from([0xd5,0x5c,0xae,0x00])]]) {
    const b=Buffer.concat([bom,payload]),h=Buffer.alloc(2);h.writeUInt16BE(b.length);assert.equal(decodeTx3gSample(Buffer.concat([h,b])),'한글');
  }
  assert.equal(decodeTx3gSample(Buffer.concat([sample('plain'),box('styl',Buffer.from([0,0]))])),'plain');
  assert.throws(()=>decodeTx3gSample(Buffer.from([0,5,65])),/TEXT_LENGTH/);
  assert.throws(()=>decodeTx3gSample(Buffer.from([0,2,0xc0,0xaf])),/TEXT_ENCODING/);
  assert.throws(()=>decodeTx3gSample(Buffer.from([0,3,0xff,0xfe,0])),/TEXT_ENCODING/);
  assert.throws(()=>decodeTx3gSample(Buffer.concat([sample('x'),box('styl',Buffer.from([255,255]))])),/STYLE_COUNT/);
  assert.throws(()=>decodeTx3gSample(Buffer.concat([sample('x'),Buffer.from([0])])),/MODIFIER_HEADER/);
});

for(const [name,type,write,message] of [
  ['stsz allocation','stsz',(b,p)=>b.writeUInt32BE(0xffffffff,p+12),'SAMPLE_LIMIT'],
  ['stts run expansion','stts',(b,p)=>b.writeUInt32BE(0xffffffff,p+12),'SAMPLE_LIMIT'],
  ['stsc run expansion','stsc',(b,p)=>b.writeUInt32BE(0xffffffff,p+16),'CHUNK_MAPPING'],
  ['table entry count','stco',(b,p)=>b.writeUInt32BE(0xffffffff,p+8),'TABLE_ENTRY_LIMIT'],
  ['count mismatch','stts',(b,p)=>b.writeUInt32BE(2,p+12),'TABLE_COUNT_MISMATCH'],
  ['chunk starts zero','stsc',(b,p)=>b.writeUInt32BE(0,p+12),'CHUNK_MAPPING'],
  ['sample outside mdat','stco',(b,p)=>b.writeUInt32BE(1,p+12),'SAMPLE_BOUNDS'],
  ['external reference','url ',(b,p)=>b.writeUInt32BE(0,p+4),'EXTERNAL_REFERENCE_UNSUPPORTED'],
  ['encrypted subtitle','tx3g',(b,p)=>b.write('enct',p),'ENCRYPTION_UNSUPPORTED'],
  ['invalid clock','mdhd',(b,p)=>b.writeUInt32BE(0,p+16),'CLOCK_SCALE'],
  ['duration mismatch','mdhd',(b,p)=>b.writeUInt32BE(10,p+20),'DURATION_MISMATCH'],
  ['unsafe co64','co64',(b,p)=>b.writeBigUInt64BE(0xffffffffffffffffn,p+12),'INTEGER_OVERFLOW']
])test(`rejects malicious ${name} and aborts source`,async()=>{
  const source=sourceFor(mutate(synthetic({co64:type==='co64'}),type,write));await assert.rejects(createPinnedSubtitleTrack(source),new RegExp(`SUBTITLE_${message}`));assert.equal(source.aborts,1);
});

for(const edit of [[[6000,0,0]],[[1000,-1]],[[2000,0],[4000,2000]],[[1000,-2],[5000,0]]])test('unsupported edit pattern is refused explicitly: '+JSON.stringify(edit),async()=>{
  const source=sourceFor(synthetic({edit}));await assert.rejects(createPinnedSubtitleTrack(source),/SUBTITLE_EDIT_UNSUPPORTED/);assert.equal(source.aborts,1);
});

test('selection race retires pending cue result; no queue or language fallback',async()=>{
  const source=sourceFor(synthetic({subtitles:2})),owner=await createPinnedSubtitleTrack(source);owner.select(3);const release=source.hold();const pending=owner.cuesAt(0,{after:0});
  await new Promise(resolve=>setImmediate(resolve));await assert.rejects(owner.cuesAt(0),/SUBTITLE_READ_BUSY/);owner.select(4);release();await assert.rejects(pending,/SUBTITLE_STALE_SELECTION/);assert.equal((await owner.cuesAt(0,{after:0}))[0].trackId,4);await owner.dispose();
});

test('abort settles an active read and explicit disposal stays idempotent',async()=>{
  const signal=new AbortController(),source=sourceFor(synthetic()),owner=await createPinnedSubtitleTrack(source,{signal:signal.signal});owner.select(3);source.hold();const pending=owner.cuesAt(0);await new Promise(resolve=>setImmediate(resolve));signal.abort();await assert.rejects(pending,/GENERAL_CANCELLED/);assert.equal((await owner.dispose()).settled,true);await owner.dispose();assert.equal(source.aborts,1);
});

test('owner fence and finite window limits reject stale or unbounded cue reads',async()=>{
  let current=true;const source=sourceFor(synthetic()),owner=await createPinnedSubtitleTrack(source,{isCurrent:()=>current});owner.select(3);
  for(const [time,window] of [[NaN,{}],[Infinity,{}],[-1,{}],[0,{after:31}],[0,{before:-1}],[0,{after:Infinity}]])await assert.rejects(owner.cuesAt(time,window),/SUBTITLE_WINDOW_LIMIT/);
  current=false;await assert.rejects(owner.cuesAt(0),/GENERAL_CANCELLED/);await owner.dispose();assert.equal(source.aborts,1);
});

test('metadata and track caps refuse before a whole-file allocation',async()=>{
  const large=Buffer.alloc(SUBTITLE_LIMITS.metadataBytes+100000);synthetic().copy(large);const p=large.indexOf('moov');large.writeUInt32BE(SUBTITLE_LIMITS.metadataBytes+1,p-4);const source=sourceFor(large);await assert.rejects(createPinnedSubtitleTrack(source),/SUBTITLE_METADATA_LIMIT/);assert.equal(source.aborts,1);assert.ok(source.reads.reduce((n,[a,b])=>n+b-a+1,0)<=65536);
  const many=sourceFor(synthetic({subtitles:9}));await assert.rejects(createPinnedSubtitleTrack(many),/SUBTITLE_TRACK_LIMIT/);assert.equal(many.aborts,1);
});

test('aggregate samples, including unsupported tracks, refuse before index expansion',async()=>{
  const bytes=synthetic({subtitles:3,count:65536,codec:'wvtt'}),source=sourceFor(bytes);
  await assert.rejects(createPinnedSubtitleTrack(source),/SUBTITLE_AGGREGATE_SAMPLE_LIMIT/);assert.equal(source.aborts,1);
});

test('a source failure during discovery always closes the pinned subtitle owner',async()=>{
  const source=sourceFor(fixture,{reject:true});await assert.rejects(createPinnedSubtitleTrack(source),/synthetic read/);assert.equal(source.aborts,1);
});

test('same-revision subtitle discovery reuses fenced moov without repeating range reads',async()=>{
 const first=sourceFor(fixture),inventory=await probePinnedGeneralTracks(first);
 const second=sourceFor(fixture),owner=await createPinnedSubtitleTrack(second,{metadata:inventory.subtitleMetadata});
 assert.equal(owner.tracks.length,1);assert.deepEqual(second.reads,[]);
 owner.select(owner.tracks[0].trackId);assert.ok((await owner.cuesAt(0,{after:2})).length);
 assert.ok(second.reads.length>0,'selected cues still read their original samples');await owner.dispose();
 const stale=sourceFor(fixture);stale.identity.headRevisionId='changed';
 await assert.rejects(createPinnedSubtitleTrack(stale,{metadata:inventory.subtitleMetadata}),/SUBTITLE_METADATA_IDENTITY/);
 assert.equal(stale.reads.length,0);assert.equal(stale.aborts,1);
});

for(const [options,message] of [[{count:129,delta:1},'WINDOW_SAMPLE_LIMIT'],[{count:5,padding:60000},'WINDOW_BYTE_LIMIT']])test('finite cue window refuses excess '+message+' before payload reads',async()=>{
  const source=sourceFor(synthetic(options)),owner=await createPinnedSubtitleTrack(source);owner.select(3);const before=source.reads.length;
  await assert.rejects(owner.cuesAt(0,{after:30}),new RegExp('SUBTITLE_'+message));assert.equal(source.reads.length,before);await owner.dispose();
});
