import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {shortEof} from './fixture.mjs';
import {createTransmuxSession} from '../v2-07b-ts-q1/transmux-session.mjs';
const require=createRequire(import.meta.url),{Transmuxer}=require('../v2-07b-ts-q1/node_modules/mux.js/dist/mux-mp4.min.js');
const {extract,decode}=require('../v2-07b-ts-q1/incremental-probe.cjs'),{compare}=require('../v2-07b-ts-q1/preservation-probe.cjs');
const base=new URL('./generated/',import.meta.url);mkdirSync(base,{recursive:true});const results=[];
for(const count of [1,2]){
 const source=shortEof(count),chunks=[];let session;
 session=createTransmuxSession({generation:1,sourceSize:source.length,Transmuxer,send(message){if(message.type==='fragment'){
  chunks.push(Buffer.from(message.bytes));session.receive({type:'ack',generation:1,fragmentSequence:message.fragmentSequence});}}});
 for(let offset=0,sequence=1;offset<source.length;offset+=65536,sequence++)session.receive({type:'input',generation:1,sequence,offset,bytes:Uint8Array.from(source.subarray(offset,offset+65536)).buffer});
 session.receive({type:'eof',generation:1});assert.equal(session.stats().state,'finished');
 const output=Buffer.concat(chunks),sourceFile=fileURLToPath(new URL(`short-${count}.ts`,base)),targetFile=fileURLToPath(new URL(`short-${count}.mp4`,base));
 writeFileSync(sourceFile,source);writeFileSync(targetFile,output);
 const before=extract(sourceFile),after=extract(targetFile),comparison=compare(before,after);
 assert.equal(comparison.videoVcl.equal,true);assert.equal(comparison.parameterSetsEqual,true);assert.equal(comparison.aac.equal,true);
 const a=decode(sourceFile),b=decode(targetFile);assert.deepEqual(b.frames,a.frames);assert.ok(b.pcm.equals(a.pcm));assert.equal(b.frames.length,300+count);
 const video=x=>x.packets.filter(p=>p.stream_index===x.streams.find(s=>s.codec_type==='video').index);
 const first=video(before),second=video(after);assert.equal(first.length,second.length);
 for(let i=0;i<first.length;i++)for(const clock of ['pts_time','dts_time'])assert.ok(Math.abs(Number(first[i][clock])-Number(second[i][clock]))<.000002);
 for(let i=0;i+1<second.length;i++)assert.ok(Math.abs(Number(second[i].duration_time)-(Number(first[i+1].dts_time)-Number(first[i].dts_time)))<.000002);
 assert.ok(Math.abs(Number(second.at(-1).duration_time)-(Number(first.at(-1).dts_time)-Number(first.at(-2).dts_time)))<.000002);
 results.push({shortEofFrames:count,sourceSHA256:createHash('sha256').update(source).digest('hex'),outputSHA256:createHash('sha256').update(output).digest('hex'),
  videoFrames:b.frames.length,videoBytesPreserved:true,aacBytesPreserved:true,decodedFramesEqual:true,decodedPcmEqual:true,rawPtsDtsPreserved:true,
  finalDurationMatchesObservedAdjacentDts:true,decoderErrorDiagnostics:0,session:session.stats()});
}
writeFileSync(new URL('./preservation-results.json',import.meta.url),JSON.stringify({scope:'public synthetic full-stream FFmpeg decoder preservation; no actual account/device claim',results},null,2)+'\n');
console.log(JSON.stringify(results.map(({shortEofFrames,videoFrames,decodedFramesEqual,decodedPcmEqual})=>({shortEofFrames,videoFrames,decodedFramesEqual,decodedPcmEqual}))));
