import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { adaptInitSar } from './init-sar.mjs';
import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';
import { makeHigh720pBt709Sps } from '../v2-07a-container-probe/synthetic-mpeg-ts-fixtures.mjs';

const require = createRequire(import.meta.url);
const bundle = require.resolve('mux.js/dist/mux-mp4.min.js');
assert.equal(createHash('sha256').update(readFileSync(bundle)).digest('hex'), '4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
const { Transmuxer, generator } = require(bundle);
const input = readFileSync(new URL('./synthetic-bframes-audiolead.ts', import.meta.url));
let actualInit;
const mux = new Transmuxer({ remux: true, keepOriginalTimestamps: true });
mux.on('data', segment => { actualInit = Buffer.from(segment.initSegment); });
mux.push(input); mux.flush();

// Test-only structural index, used to mutate an identified box, never a byte
// string search that could confuse payload contents with box ownership.
function index(bytes) {
  const nodes = [];
  const skips = { moov:8,trak:8,mdia:8,minf:8,dinf:8,dref:16,stbl:8,stsd:16,avc1:86,mp4a:36,mvex:8 };
  function walk(start, end, ancestors) {
    for (let offset = start; offset < end;) {
      const size = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
      const node = { offset, size, type, ancestors }; nodes.push(node);
      if (skips[type]) walk(offset + skips[type], offset + size, [...ancestors, node]);
      offset += size;
    }
  }
  walk(0,bytes.length,[]); return nodes;
}
const node = (bytes, type) => index(bytes).find(item => item.type === type);
function parameters(bytes) {
  let cursor = node(bytes, 'avcC').offset + 14;
  const spsLength = bytes.readUInt16BE(cursor); cursor += 2;
  const sps = Uint8Array.from(bytes.subarray(cursor, cursor + spsLength)); cursor += spsLength;
  assert.equal(bytes[cursor++],1);
  const ppsLength = bytes.readUInt16BE(cursor); cursor += 2;
  return { videoTrackId:256, sps, pps:Uint8Array.from(bytes.subarray(cursor,cursor+ppsLength)) };
}
const actualSource = parameters(actualInit);

function generated(options = {}) {
  const sps = makeHigh720pBt709Sps(options); const parsed = parseH264Sps(sps);
  const aspect = parsed.aspectRatio;
  const sarRatio = aspect.present && aspect.idc === 255 ? [aspect.width,aspect.height]
    : aspect.status === 'explicit' ? [aspect.width,aspect.height] : [1,1];
  const source = { videoTrackId:256,sps,pps:actualSource.pps.slice() };
  const bytes = Buffer.from(generator.initSegment([
    { id:256,type:'video',width:parsed.width,height:parsed.height,profileIdc:sps[1],profileCompatibility:sps[2],levelIdc:sps[3],
      sps:[sps],pps:[source.pps],sarRatio },
    { id:257,type:'audio',samplerate:48000,channelcount:2,samplesize:16,audioobjecttype:2,samplingfrequencyindex:3 },
  ]));
  return { bytes,source };
}
function change(bytes, type, mutate) {
  const result = Buffer.from(bytes); mutate(result, node(result,type)); return result;
}
function duplicate(bytes, type) {
  const target = node(bytes,type);
  const copy = bytes.subarray(target.offset,target.offset+target.size);
  const result = Buffer.concat([bytes.subarray(0,target.offset),copy,bytes.subarray(target.offset)]);
  for (const parent of target.ancestors) result.writeUInt32BE(parent.size+copy.length,parent.offset);
  return result;
}

test('actual pinned transmuxer square init remains byte-identical with matching extracted parameters', () => {
  const before = Buffer.from(actualInit); const result = adaptInitSar(actualInit,actualSource);
  assert.equal(result.action,'unchanged'); assert.deepEqual(Buffer.from(result.initSegment),actualInit);
  assert.equal(result.width,360);assert.equal(result.height,640);
  assert.deepEqual(actualInit,before);assert.notEqual(result.initSegment.buffer,actualInit.buffer);
});

test('absent VUI, absent SAR and IDC0 remove only the introduced pasp type bytes', () => {
  for (const options of [{vuiPresent:false},{},{aspectRatioIdc:0}]) {
    const {bytes,source}=generated(options);const original=Buffer.from(bytes),sps=source.sps.slice(),pps=source.pps.slice();
    const result=adaptInitSar(bytes,source); const pasp=node(bytes,'pasp');
    const expected=Buffer.from(bytes);expected.write('free',pasp.offset+4,'ascii');
    assert.equal(result.action,'removed-introduced-square');assert.deepEqual(Buffer.from(result.initSegment),expected);
    assert.deepEqual(bytes,original);assert.deepEqual(source.sps,sps);assert.deepEqual(source.pps,pps);
    result.initSegment.fill(0);assert.deepEqual(bytes,original);
  }
});

test('all defined explicit SAR values remain exact; reserved and zero SAR cannot be guessed', () => {
  for (const options of [...Array.from({length:16},(_,index)=>({aspectRatioIdc:index+1})),
    {aspectRatioIdc:255,sarWidth:2,sarHeight:2},{aspectRatioIdc:255,sarWidth:65535,sarHeight:65535},
    {aspectRatioIdc:255,sarWidth:2600,sarHeight:2601},
    {aspectRatioIdc:255,sarWidth:3,sarHeight:4},{aspectRatioIdc:255,sarWidth:65535,sarHeight:1}]) {
    const {bytes,source}=generated(options);assert.deepEqual(Buffer.from(adaptInitSar(bytes,source).initSegment),bytes);
  }
  for (const options of [{aspectRatioIdc:17},{aspectRatioIdc:254},
    {aspectRatioIdc:255,sarWidth:0,sarHeight:1},{aspectRatioIdc:255,sarWidth:1,sarHeight:0}]) {
    const {bytes,source}=generated(options);assert.throws(()=>adaptInitSar(bytes,source),/SAR_ASPECT_UNPROVEN/);
  }
});

test('explicit non-square SAR never repairs mismatching pasp, raster geometry or source parameters', () => {
  const {bytes,source}=generated({aspectRatioIdc:14});
  assert.equal(parseH264Sps(source.sps).aspectRatio.width,4);
  for(const [type,mutate] of [
    ['pasp',(b,n)=>b.writeUInt32BE(1,n.offset+8)],
    ['pasp',(b,n)=>b.writeUInt32BE(1,n.offset+12)],
    ['avc1',(b,n)=>b.writeUInt16BE(1,n.offset+32)],
    ['tkhd',(b,n)=>b.writeUInt32BE(1,n.offset+84)],
  ])assert.throws(()=>adaptInitSar(change(bytes,type,mutate),source),/^Error: SAR_(PASP_MISMATCH|GEOMETRY_MISMATCH)$/);
  const wrongPps=source.pps.slice();wrongPps[wrongPps.length-1]^=1;
  assert.throws(()=>adaptInitSar(bytes,{...source,pps:wrongPps}),/SAR_PARAMETER_MISMATCH/);
});

test('source parameter bytes, counts and avcC header cannot be substituted', () => {
  const {bytes,source}=generated();
  const wrongPps=source.pps.slice();wrongPps[wrongPps.length-1]^=1;
  assert.throws(()=>adaptInitSar(bytes,{...source,pps:wrongPps}),/SAR_PARAMETER_MISMATCH/);
  assert.throws(()=>adaptInitSar(bytes,{...source,sps:makeHigh720pBt709Sps({aspectRatioIdc:0})}));
  for (const mutate of [
    (b,n)=>b[n.offset+9]^=1, // profile
    (b,n)=>b[n.offset+12]=0xfe, // sample length width
    (b,n)=>b[n.offset+13]=2, // SPS count
    (b,n)=>b.writeUInt16BE(65535,n.offset+14),
  ]) assert.throws(()=>adaptInitSar(change(bytes,'avcC',mutate),source),/^Error: SAR_/);
});

test('track identities, movie/track matrices and both geometry fields are fenced', () => {
  const {bytes,source}=generated();
  assert.throws(()=>adaptInitSar(bytes,{...source,videoTrackId:257}),/SAR_TRACK_IDENTITY/);
  for (const [type,mutate] of [
    ['mvhd',(b,n)=>b.writeUInt32BE(0,n.offset+44)],
    ['tkhd',(b,n)=>b.writeUInt32BE(0,n.offset+48)],
    ['tkhd',(b,n)=>b.writeUInt32BE(1,n.offset+84)],
    ['avc1',(b,n)=>b.writeUInt16BE(0,n.offset+32)],
    ['avc1',(b,n)=>b.writeUInt16BE(719,n.offset+34)],
    ['hdlr',(b,n)=>b.write('soun',n.offset+16,'ascii')],
    ['trex',(b,n)=>b.writeUInt32BE(999,n.offset+12)],
    ['pasp',(b,n)=>b.writeUInt32BE(2,n.offset+8)],
  ]) assert.throws(()=>adaptInitSar(change(bytes,type,mutate),source));
});

test('duplicate, misplaced, truncated and unsupported geometry boxes fail closed', () => {
  const {bytes,source}=generated();
  for(const type of ['pasp','avcC','avc1','trak','tkhd','moov','ftyp','trex'])assert.throws(()=>adaptInitSar(duplicate(bytes,type),source));
  for(const [type,replacement] of [['btrt','clap'],['mvhd','pasp'],['esds','pasp'],['avc1','avc3']]) {
    assert.throws(()=>adaptInitSar(change(bytes,type,(b,n)=>b.write(replacement,n.offset+4,'ascii')),source));
  }
  for(const size of [0,1,7,0xffffffff])assert.throws(()=>adaptInitSar(change(bytes,'pasp',(b,n)=>b.writeUInt32BE(size,n.offset)),source));
  for(const cut of [1,7,bytes.length-1])assert.throws(()=>adaptInitSar(bytes.subarray(0,cut),source));
  assert.throws(()=>adaptInitSar(change(bytes,'stsd',(b,n)=>b.writeUInt32BE(2,n.offset+12)),source));
  assert.throws(()=>adaptInitSar(change(bytes,'stts',(b,n)=>b.writeUInt32BE(1,n.offset+12)),source));
});

test('NAL payload bytes resembling pasp are opaque, not another box target', () => {
  const sps=makeHigh720pBt709Sps(); const pps=Uint8Array.from([...actualSource.pps,0,0,0,16,112,97,115,112,0,0,0,1,0,0,0,1]);
  const source={videoTrackId:256,sps,pps};
  const {bytes}=generated();const avcc=node(bytes,'avcC');
  const header=Buffer.from(bytes.subarray(avcc.offset,avcc.offset+avcc.size-actualSource.pps.length));
  header.writeUInt16BE(pps.length,header.length-2);
  const newAvcc=Buffer.concat([header,pps]);newAvcc.writeUInt32BE(newAvcc.length,0);
  const replacement=Buffer.concat([bytes.subarray(0,avcc.offset),newAvcc,bytes.subarray(avcc.offset+avcc.size)]);
  for(const parent of avcc.ancestors)replacement.writeUInt32BE(parent.size+pps.length-actualSource.pps.length,parent.offset);
  const result=adaptInitSar(replacement,source);
  assert.equal(result.action,'removed-introduced-square');
  assert.deepEqual(parameters(Buffer.from(result.initSegment)).pps,pps);
  // Deliberately altered PPS: proves structural binding only, not decoding.
});

test('input bounds, subarray offsets and forbidden NAL headers are explicit', () => {
  const {bytes,source}=generated();
  for(const invalid of [null,[],new Uint8Array(0),new Uint8Array(2*1024*1024+1)])assert.throws(()=>adaptInitSar(invalid,source),/SAR_INIT_INPUT/);
  for(const videoTrackId of [0,-1,1.5,0x100000000])assert.throws(()=>adaptInitSar(bytes,{...source,videoTrackId}),/SAR_TRACK_ID/);
  for(const key of ['sps','pps'])for(const invalid of [null,new Uint8Array(65536),Uint8Array.of(0xe7,1)])assert.throws(()=>adaptInitSar(bytes,{...source,[key]:invalid}),/SAR_PARAMETER_INPUT/);
  const padded=Buffer.concat([Buffer.alloc(3),bytes,Buffer.alloc(5)]);
  assert.deepEqual(adaptInitSar(padded.subarray(3,3+bytes.length),source).initSegment,adaptInitSar(bytes,source).initSegment);
});

test('SPS dimensions beyond the generator 16-bit fields cannot wrap into an accepted init', () => {
  const bits=[];
  const put=(value,width)=>{for(let i=width-1;i>=0;i--)bits.push((value>>>i)&1);};
  const ue=value=>{const code=value+1,width=Math.floor(Math.log2(code));for(let i=0;i<width;i++)bits.push(0);put(code,width+1);};
  put(66,8);put(0,8);put(30,8);ue(0);ue(0);ue(0);ue(0);ue(1);put(0,1);
  ue(4095);ue(44);put(1,1);put(1,1);put(0,1);put(0,1);put(1,1);
  while(bits.length%8)bits.push(0);
  const rbsp=[];for(let i=0;i<bits.length;i+=8)rbsp.push(bits.slice(i,i+8).reduce((n,bit)=>n*2+bit,0));
  const escaped=[0x67];let zeros=0;
  for(const value of rbsp){if(zeros>=2&&value<=3){escaped.push(3);zeros=0;}escaped.push(value);zeros=value===0?zeros+1:0;}
  const sps=Uint8Array.from(escaped);
  assert.equal(parseH264Sps(sps).width,65536);
  assert.throws(()=>adaptInitSar(actualInit,{...actualSource,sps}),/SAR_GEOMETRY_RANGE/);
});
