import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {variant,shiftTimestamp,vfr} from './synthetic-variants.mjs';
import {probeTsSeek} from './ts-seek.mjs';
import {prepareTsSeekInput} from './seek-input.mjs';
import {createTransmuxSession} from './transmux-session.mjs';
const require=createRequire(import.meta.url),{Transmuxer}=require('mux.js/dist/mux-mp4.min.js');
const {extract,decode}=require('./incremental-probe.cjs'),{compare}=require('./preservation-probe.cjs');
const tick=(b,o)=>(b[o]&14)*536870912+b[o+1]*4194304+(b[o+2]&254)*16384+b[o+3]*128+(b[o+4]>>1);
function rational(){return variant((records,base)=>{
 const origin=base.frames[0].dts;
 for(const r of records)if(r.videoIndex!==undefined)for(const off of [9,14]){
  const old=tick(r.data,off),index=(old-origin)/3000;
  shiftTimestamp(r.data,off,origin+Math.floor(index*90000/21)-old);
 }
 return records.filter(r=>r.videoIndex===undefined||r.videoIndex<240)
  .sort((a,b)=>tick(a.data,a.videoIndex===undefined?9:14)-tick(b.data,b.videoIndex===undefined?9:14));
}).bytes;}
function transmux(bytes){const chunks=[];let session;
 session=createTransmuxSession({generation:1,sourceSize:bytes.length,Transmuxer,send(message){
  if(message.type==='fragment')chunks.push(Buffer.from(message.bytes));
 }});
 let sequence=0;for(let offset=0;offset<bytes.length;offset+=65536){
  session.receive({type:'input',generation:1,sequence:++sequence,offset,bytes:Uint8Array.from(bytes.subarray(offset,offset+65536)).buffer});
  while(session.stats().awaitingFragment)session.receive({type:'ack',generation:1,fragmentSequence:session.stats().awaitingFragment});
  assert.equal(session.stats().state,'open',session.stats().failure);
 }
 session.receive({type:'eof',generation:1});while(session.stats().awaitingFragment)session.receive({type:'ack',generation:1,fragmentSequence:session.stats().awaitingFragment});
 assert.equal(session.stats().state,'finished',session.stats().failure);return Buffer.concat(chunks);
}
for(const [name,make] of [['phase-five',()=>variant(records=>{for(const r of records)if(r.videoIndex>=180){shiftTimestamp(r.data,9,5);shiftTimestamp(r.data,14,5);}}).bytes],
 ['rational-21fps',rational],['vfr-boundary',()=>vfr().bytes]]){
 test(name+' retains original payloads, actual timestamps and nonoverlapping mux sample durations',async()=>{
  const bytes=make();
  for(const fraction of [.1,.5,.9]){
   const plan=await probeTsSeek({sourceSize:bytes.length,fraction,read:async({start,end})=>bytes.subarray(start,end+1)});
   const input=prepareTsSeekInput({headBytes:bytes.subarray(0,Math.floor(65536/188)*188),bytes:bytes.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan});
   assert.equal(input.source.targetTicks,plan.targetTicks);assert.ok(plan.local.before.pts<=plan.targetTicks&&plan.local.after.pts>=plan.targetTicks);
  }
  const output=transmux(bytes),directory=mkdtempSync(fileURLToPath(new URL('./run-clock-',import.meta.url)));
  const source=join(directory,'source.ts'),target=join(directory,'target.mp4');
  try{
   writeFileSync(source,bytes);writeFileSync(target,output);
   const before=extract(source),after=extract(target),comparison=compare(before,after);
   assert.equal(comparison.videoVcl.equal,true);assert.equal(comparison.parameterSetsEqual,true);assert.equal(comparison.aac.equal,true);
   const video=b=>b.packets.filter(p=>p.stream_index===b.streams.find(s=>s.codec_type==='video').index);
   const a=video(before),b=video(after);assert.equal(a.length,b.length);
   for(let i=0;i<a.length;i++){
    assert.ok(Math.abs(Number(a[i].pts_time)-Number(b[i].pts_time))<=0.000002);
    assert.ok(Math.abs(Number(a[i].dts_time)-Number(b[i].dts_time))<=0.000002);
    if(i+1<a.length)assert.ok(Math.abs(Number(b[i].duration_time)-(Number(a[i+1].dts_time)-Number(a[i].dts_time)))<=0.000002);
   }
   const decodedBefore=decode(source),decodedAfter=decode(target);
   assert.deepEqual(decodedAfter.frames,decodedBefore.frames);assert.ok(decodedAfter.pcm.equals(decodedBefore.pcm));
  }finally{unlinkSync(source);unlinkSync(target);rmdirSync(directory);}
 });
}
