import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPsiStream } from './psi-stream.mjs';
import { crc32Mpeg2 } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';
import { makePatSection, makePmtSection, packetizePsiSection, makeTsPacket, concatBytes } from '../v2-07a-container-probe/synthetic-mpeg-ts-fixtures.mjs';

const pat = options => makePatSection([{ programNumber: 1, pmtPid: 4096 }], options);
const pmt = options => makePmtSection({ programNumber: 1, pcrPid: 256,
  streams: [{ streamType: 27, elementaryPid: 256 }, { streamType: 15, elementaryPid: 257 }], ...options });
const feed = (owner, pid, section, options) => {
  let result;
  for (const packet of packetizePsiSection(pid, section, options)) result = owner.push(packet);
  return result;
};
const ready = options => { const owner = createPsiStream(options); feed(owner, 0, pat()); feed(owner, 4096, pmt()); return owner; };
const crc = bytes => { const result = bytes.slice(); const value = crc32Mpeg2(result.subarray(0,-4));
  result.set([value >>> 24, value >>> 16, value >>> 8, value], result.length - 4); return result; };

test('split PSI creates frozen topology, without codec details or elementary inspection', () => {
  const owner = createPsiStream();
  assert.equal(feed(owner,0,pat(),{ firstPayloadCapacity: 5 }),null);
  const topology = feed(owner,4096,pmt(),{ firstPayloadCapacity: 7 });
  assert.deepEqual(topology,{ transportStreamId:1,programNumber:1,pmtPid:4096,pcrPid:256,
    patVersion:0,pmtVersion:0,videoPid:256,audioPid:257 });
  assert.ok(Object.isFrozen(topology));
  assert.equal(topology.codecDetails,undefined);
  assert.equal(owner.push(makeTsPacket({pid:256,continuityCounter:0,payload:Uint8Array.of(1)})),topology);
  assert.equal(owner.finish(),topology);
  assert.equal(owner.stats().retainedBytes,0);
  assert.throws(()=>owner.push(new Uint8Array(188)),/PSI_TERMINAL/);
});

test('multipart PAT and PMT wait for every section, including pointer completion', () => {
  const owner=createPsiStream();
  const first=makePatSection([],{sectionNumber:0,lastSectionNumber:1});
  const second=pat({sectionNumber:1,lastSectionNumber:1});
  const initial=concatBytes(Uint8Array.of(0),first.subarray(0,6));
  assert.equal(owner.push(makeTsPacket({pid:0,continuityCounter:0,payloadUnitStart:true,payload:initial})),null);
  const rest=first.subarray(6);
  assert.equal(owner.push(makeTsPacket({pid:0,continuityCounter:1,payloadUnitStart:true,
    payload:concatBytes(Uint8Array.of(rest.length),rest,second)})),null);
  assert.equal(feed(owner,4096,pmt({sectionNumber:1,lastSectionNumber:1,streams:[{streamType:15,elementaryPid:257}]})),null);
  const topology=feed(owner,4096,pmt({sectionNumber:0,lastSectionNumber:1,streams:[{streamType:27,elementaryPid:256}]}),{continuityStart:1});
  assert.equal(topology.audioPid,257); assert.equal(owner.finish(),topology);
});

test('identical section repeats and identical transport duplicates do not exhaust a lifetime budget', () => {
  const owner=ready({maxSections:2}); const before=owner.stats(); let current;
  for(let i=1;i<=2000;i++) {
    const packet=packetizePsiSection(0,pat(),{continuityStart:i%16})[0];
    owner.push(packet); owner.push(packet);
    current=feed(owner,4096,pmt(),{continuityStart:i%16});
  }
  assert.equal(current.videoPid,256);
  assert.deepEqual(owner.stats(),before);
});

test('CRC, continuity, current flags and identity changes fail terminally with codes only', () => {
  const cases=[
    o=>{const s=pat();s[s.length-1]^=1;feed(o,0,s,{continuityStart:1});},
    o=>feed(o,0,pat(),{continuityStart:3}),
    o=>feed(o,0,pat({currentNext:0}),{continuityStart:1}),
    o=>feed(o,0,pat({version:1}),{continuityStart:1}),
    o=>feed(o,0,pat({transportStreamId:2}),{continuityStart:1}),
    o=>feed(o,4096,pmt({version:1}),{continuityStart:1}),
    o=>feed(o,4096,pmt({pcrPid:257}),{continuityStart:1}),
    o=>feed(o,4096,pmt({programNumber:2}),{continuityStart:1}),
    o=>feed(o,0,makePatSection([{programNumber:1,pmtPid:4097}]),{continuityStart:1}),
  ];
  for(const change of cases){const owner=ready();assert.throws(()=>change(owner),e=>/^[A-Z0-9_]+$/.test(e.message));
    assert.equal(owner.stats().retainedBytes,0);assert.throws(()=>owner.finish(),/PSI_TERMINAL/);}
});

test('transport errors, discontinuities, malformed pointers and conflicting duplicate flags fail closed', () => {
  for(const mutate of [p=>p[1]|=128,p=>p[3]|=128,p=>p[3]&=0xcf,p=>p[5]|=128]){
    const owner=ready();const packet=packetizePsiSection(0,pat(),{continuityStart:1})[0];mutate(packet);
    assert.throws(()=>owner.push(packet));
  }
  const owner=ready();const packet=packetizePsiSection(0,pat())[0];packet[1]&=~64;
  assert.throws(()=>owner.push(packet),/PSI_DUPLICATE_START_CONFLICT/);
  assert.throws(()=>feed(createPsiStream(),0,pat(),{pointerPadding:Uint8Array.of(0)}),/PSI_ORPHAN_POINTER/);
  const orphan=makeTsPacket({pid:0,continuityCounter:0,payload:Uint8Array.of(0)});
  assert.throws(()=>createPsiStream().push(orphan),/PSI_ORPHAN_CONTINUATION/);
});

test('exact one H264/ADTS topology, PID separation, syntax and snapshots are bounded', () => {
  assert.throws(()=>feed(createPsiStream(),0,makePatSection([{programNumber:1,pmtPid:4096},{programNumber:2,pmtPid:4097}])));
  for(const streams of [[{streamType:27,elementaryPid:256}],
    [{streamType:27,elementaryPid:256},{streamType:3,elementaryPid:257}],
    [{streamType:27,elementaryPid:256},{streamType:15,elementaryPid:256}],
    [{streamType:27,elementaryPid:4096},{streamType:15,elementaryPid:257}]]){
    const owner=createPsiStream();feed(owner,0,pat());assert.throws(()=>feed(owner,4096,pmt({streams})));
  }
  const malformed=pat();malformed[8+2]&=31;
  assert.throws(()=>feed(createPsiStream(),0,crc(malformed)),/PSI_SECTION_SYNTAX/);
  assert.throws(()=>ready({maxSnapshotBytes:32}),/PSI_SNAPSHOT_LIMIT/);
  assert.throws(()=>ready({maxSectionBytes:16}),/PSI_SECTION_LENGTH_INVALID/);
  for(const options of [{maxSections:1},{maxSections:Infinity},{maxSectionBytes:1025},{maxSnapshotBytes:NaN}])assert.throws(()=>createPsiStream(options));
});

test('finish refuses missing or truncated PSI and abort releases source state', () => {
  assert.throws(()=>createPsiStream().finish(),/PSI_INCOMPLETE/);
  const owner=ready();const packets=packetizePsiSection(0,pat(),{continuityStart:1,firstPayloadCapacity:5});
  owner.push(packets[0]);assert.throws(()=>owner.finish(),/PSI_INCOMPLETE/);
  const cancelled=ready();cancelled.abort();cancelled.abort();assert.equal(cancelled.stats().retainedBytes,0);
  assert.throws(()=>cancelled.finish(),/PSI_TERMINAL/);
});

test('adaptation-only PSI preserves continuity and cannot hide discontinuity', () => {
  const owner=ready(); const packet=new Uint8Array(188).fill(255);
  packet.set([0x47,0,0,0x20,183,0]);
  assert.equal(owner.push(packet).videoPid,256);
  packet[3]|=1;assert.throws(()=>owner.push(packet),/PSI_ADAPTATION_CONTINUITY/);
  packet[3]=0x20;packet[5]=128;
  assert.throws(()=>ready().push(packet),/PSI_DISCONTINUITY/);
});

test('aborted state cannot retain caller buffers and snapshot section counts are enforced', () => {
  const owner=createPsiStream();const packet=packetizePsiSection(0,pat())[0];owner.push(packet);
  packet.fill(0);assert.equal(feed(owner,4096,pmt()).videoPid,256);
  const limited=createPsiStream({maxSections:2});
  feed(limited,0,makePatSection([],{sectionNumber:0,lastSectionNumber:1}));
  feed(limited,0,pat({sectionNumber:1,lastSectionNumber:1}),{continuityStart:1});
  assert.throws(()=>feed(limited,4096,pmt()),/PSI_SNAPSHOT_LIMIT/);
  assert.equal(limited.stats().retainedBytes,0);
});

test('public fixture PSI remains bounded for a complete media input', () => {
  const bytes=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
  const owner=createPsiStream();let first=null;
  for(let offset=0;offset<bytes.length;offset+=188){const result=owner.push(bytes.subarray(offset,offset+188));if(result&&!first)first=offset;}
  assert.equal(first,376); assert.equal(owner.finish().videoPid,256);
  assert.ok(owner.stats().peakRetainedBytes<1024);
});
