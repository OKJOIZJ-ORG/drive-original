import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createTransmuxSession} from './transmux-session.mjs';
const require=createRequire(import.meta.url),{Transmuxer}=require('mux.js/dist/mux-mp4.min.js');
const {extract,decode}=require('./incremental-probe.cjs'),{compare}=require('./preservation-probe.cjs');
function command(exe,args){const r=spawnSync(exe,args,{windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});assert.equal(r.status,0);assert.equal(r.stderr.length,0);return r.stdout;}
function transmux(bytes){const chunks=[];const session=createTransmuxSession({generation:1,sourceSize:bytes.length,Transmuxer,send(m){if(m.type==='fragment')chunks.push(Buffer.from(m.bytes));}});
 let sequence=0;const ack=()=>{while(session.stats().awaitingFragment)session.receive({type:'ack',generation:1,fragmentSequence:session.stats().awaitingFragment});};
 for(let offset=0;offset<bytes.length;offset+=65536){session.receive({type:'input',generation:1,sequence:++sequence,offset,bytes:Uint8Array.from(bytes.subarray(offset,offset+65536)).buffer});ack();assert.equal(session.stats().state,'open',session.stats().failure);}
 session.receive({type:'eof',generation:1});ack();assert.equal(session.stats().state,'finished',session.stats().failure);return Buffer.concat(chunks);
}
for(const ratio of ['4/3','3/4','2600/2601'])test(`non-square SAR ${ratio} preserves declared display ratio and decoded original pixels`,()=>{
 const dir=mkdtempSync(fileURLToPath(new URL('./run-sar-',import.meta.url))),source=join(dir,'source.ts'),target=join(dir,'target.mp4');
 try{
  // Create public test data by changing only synthetic SPS metadata. The
  // product pipeline below receives that fixture as its immutable original.
  command('ffmpeg',['-v','error','-nostdin','-i',fileURLToPath(new URL('./synthetic-bframes-audiolead.ts',import.meta.url)),'-map','0','-c','copy','-bsf:v',`h264_metadata=sample_aspect_ratio=${ratio}`,'-f','mpegts',source]);
  writeFileSync(target,transmux(readFileSync(source)));
  const before=extract(source),after=extract(target),same=compare(before,after);
  assert.equal(same.videoVcl.equal,true);assert.equal(same.parameterSetsEqual,true);assert.equal(same.aac.equal,true);
  for(const file of [source,target]){
   const stream=JSON.parse(command('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,sample_aspect_ratio,display_aspect_ratio','-of','json',file])).streams[0];
   assert.equal(stream.width,360);assert.equal(stream.height,640);assert.equal(stream.sample_aspect_ratio,ratio.replace('/',':'));
   assert.equal(stream.display_aspect_ratio,ratio==='4/3'?'3:4':ratio==='3/4'?'27:64':'325:578');
  }
  const a=decode(source),b=decode(target);assert.deepEqual(b.frames,a.frames);assert.ok(b.pcm.equals(a.pcm));
  const video=x=>x.packets.filter(p=>p.stream_index===x.streams.find(s=>s.codec_type==='video').index);
  const aPackets=video(before),bPackets=video(after);assert.equal(aPackets.length,bPackets.length);
  for(let i=0;i<aPackets.length;i++)for(const field of ['pts_time','dts_time'])assert.ok(Math.abs(Number(aPackets[i][field])-Number(bPackets[i][field]))<=0.000002);
 }finally{for(const file of [source,target])if(existsSync(file))unlinkSync(file);rmdirSync(dir);}
});
