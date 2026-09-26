import { readFileSync } from 'node:fs';
import { analyzeGopBoundaries } from './gop-boundaries.mjs';
const input = readFileSync(new URL('./synthetic-bframes-audiolead.ts', import.meta.url));
const baseline = analyzeGopBoundaries(input);

// Only the public, hash-pinned synthetic fixture is used. Repacketization is a
// controlled counterexample generator, not a repair path or product TS writer.
export function variant(mutate = () => {}) {
  const records = []; const active = new Map();
  for (let offset = 0; offset < input.length; offset += 188) {
    const packet = input.subarray(offset,offset+188);
    const pid = ((packet[1]&31)<<8)|packet[2];
    if (![baseline.videoPid,baseline.audioPid].includes(pid) || !(packet[3]&16)) continue;
    const payload = 4 + (packet[3]&32 ? packet[4]+1 : 0);
    if (packet[1]&64) {
      const record = { pid,offset,parts:[] }; records.push(record); active.set(pid,record);
    }
    active.get(pid).parts.push(packet.subarray(payload));
  }
  let videoIndex = 0;
  for (const record of records) {
    record.data = Buffer.concat(record.parts); delete record.parts;
    if (record.pid === baseline.videoPid) { record.videoIndex = videoIndex; record.idr = baseline.frames[videoIndex++].idr; }
  }
  const changed = mutate(records, baseline) || records;
  const chunks = [input.subarray(0,records[0].offset)];
  let size = chunks[0].length;
  const counters = new Map(); const idrStarts = [];
  for (const record of changed) {
    if (record.idr) idrStarts.push(size);
    for (let cursor = 0; cursor < record.data.length;) {
      const count = Math.min(cursor===0?(record.firstPacketBytes||184):184,record.data.length-cursor);
      const packet = Buffer.alloc(188,255);
      packet[0]=0x47;packet[1]=(record.pid>>8)|(cursor===0?64:0);packet[2]=record.pid&255;
      const cc=counters.get(record.pid)||0;counters.set(record.pid,(cc+1)%16);
      packet[3]=16|cc;
      let payload=4;
      if(count<184){packet[3]|=32;packet[4]=183-count;if(packet[4])packet[5]=0;payload=188-count;}
      record.data.copy(packet,payload,cursor,cursor+count);cursor+=count;
      chunks.push(packet);size+=188;
    }
  }
  return { bytes:Buffer.concat(chunks),cuts:idrStarts.slice(1) };
}

export function shiftTimestamp(bytes, offset, ticks) {
  const value = (bytes[offset]&14)*536870912+bytes[offset+1]*4194304+(bytes[offset+2]&254)*16384+bytes[offset+3]*128+(bytes[offset+4]>>1)+ticks;
  bytes[offset]=(bytes[offset]&240)|(Math.floor(value/1073741824)&7)*2|1;
  bytes[offset+1]=Math.floor(value/4194304)&255;
  bytes[offset+2]=(Math.floor(value/32768)&127)*2|1;
  bytes[offset+3]=Math.floor(value/128)&255;
  bytes[offset+4]=(value&127)*2|1;
}

export const crossAdts = () => variant((records, base) => {
  const audio = records.filter(record=>record.pid===base.audioPid);
  const index=audio.findIndex(record=>record.offset>base.cuts[0]);
  const before=audio[index-1];const after=audio[index];
  const tail=before.data.subarray(before.data.length-10);
  before.data=before.data.subarray(0,before.data.length-10);
  const header=9+after.data[8];
  after.data=Buffer.concat([after.data.subarray(0,header),tail,after.data.subarray(header)]);
  for(const record of [before,after]) record.data.writeUInt16BE(record.data.length-6,4);
});
export const vfr = () => variant(records => {
  const video=records.find(record=>record.videoIndex===59);
  shiftTimestamp(video.data,9,900);shiftTimestamp(video.data,14,900);
});
export const delayedAudio = () => variant((records,base)=>records.filter(record=>record.pid!==base.audioPid||record.offset>=base.cuts[1]));
