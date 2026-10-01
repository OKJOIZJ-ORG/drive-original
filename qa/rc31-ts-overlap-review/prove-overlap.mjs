// Local synthetic canonical-source proof. No browser/device/network/private input.
import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const SOURCE='4a484e6f839d2e6c3eb83503acb08147362cb011',root=new URL('../../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const files=['media/ts-player.mjs','media/drive-source.mjs','media/core-entry.mjs','media/q1-core.mjs','qa/v2-07b-ts-q1/ts-seek.mjs','qa/v2-07b-ts-q1/seek-input.mjs','qa/v2-07b-ts-q1/seek-bootstrap.mjs'];
const sourceHashes=Object.fromEntries(files.map(file=>{const immutable=execFileSync('git',['show',SOURCE+':'+file],{cwd:root,maxBuffer:4*1024**2});if(hash(readFileSync(new URL(file,root)))!==hash(immutable))throw Error('IMMUTABLE_SOURCE_DRIFT');return[file,hash(immutable)];}));
const {probeTsSeek}=await import('../v2-07b-ts-q1/ts-seek.mjs'),{createSeekBootstrap}=await import('../v2-07b-ts-q1/seek-bootstrap.mjs');
const fixture=new Uint8Array(readFileSync(new URL('../v2-07b-ts-q1/synthetic-bframes-audiolead.ts',import.meta.url))),cases=[];
for(const positionSeconds of [0,5,11.95]){
 const ranges=[];let input,bootstrap;
 const plan=await probeTsSeek({sourceSize:fixture.length,positionSeconds,read:async({start,end})=>{ranges.push({start,end,bytes:end-start+1});return fixture.subarray(start,end+1);},onInput:value=>{input=value;bootstrap=createSeekBootstrap({...value,generation:1});}});
 const readStart=bootstrap.readStart,firstEnd=Math.min(readStart+262143,fixture.length-1),selectedEnd=input.offset+input.bytes.length;
 const overlap=Math.max(0,Math.min(firstEnd+1,selectedEnd)-Math.max(readStart,input.offset));
 const suffix=input.bytes.slice(readStart-input.offset),fresh=createSeekBootstrap({...input,generation:1});let equal=true;
 // Compare one admitted-suffix split against ordinary fresh-source byte stream.
 // This establishes bytes/offsets only, NOT a safe source revalidation lease or decode.
 let position=readStart;
 for(let offset=0;offset<suffix.length;offset+=65536){const part=suffix.subarray(offset,offset+65536),reference=fixture.subarray(position,position+part.length),request={offset:position,generation:1};
  const a=bootstrap.push(part,request),b=fresh.push(reference,request);equal=equal&&a.length===b.length&&a.every((v,i)=>v===b[i]);position+=part.length;}
 for(;position<fixture.length;){const part=fixture.subarray(position,Math.min(position+65536,fixture.length)),request={offset:position,generation:1};const a=bootstrap.push(part,request),b=fresh.push(part,request);equal=equal&&a.length===b.length&&a.every((v,i)=>v===b[i]);position+=part.length;}
 bootstrap.finish({sourceSize:fixture.length,generation:1});fresh.finish({sourceSize:fixture.length,generation:1});
 cases.push({positionSeconds,sourceBytes:fixture.length,probeRanges:ranges,selectedWindow:{start:input.offset,endExclusive:selectedEnd},readStart,
  firstPlaybackRange:{start:readStart,end:firstEnd,bytes:firstEnd-readStart+1},firstRangeAlreadyProbeReadBytes:overlap,
  admittedSelectedSuffixBytes:suffix.length,readStartInsideSelectedWindow:readStart>=input.offset&&readStart<selectedEnd,
  readStartPacketAligned:readStart%188===0,selectedEndPacketAligned:selectedEnd%188===0,
  identicalContinuousBootstrapOutput:equal,bootstrapFinished:bootstrap.stats().state==='finished',
  syntheticOnly:true,nativeDecodeTested:false,sourceLeaseRevalidationTested:false});
}
const result={schema:'drive-original.rc31-ts-overlap-proof/1',sourceCommit:SOURCE,actualExecution:false,privateInputRead:false,networkCalls:false,sourceHashes,cases,
 findings:{existingRc19Reuse:'head/chosen inputs construct bootstrap without two extra Range reads; does not feed continuous worker suffix',
  remainingOverlap:'first playback read starts inside already-admitted chosen probe window',actualTargetOffsets:'UNKNOWN',actualSavedRequestsOrLatency:'UNKNOWN',
  directSuffixFeedSafeUnderFreshFenceContract:'NOT_ESTABLISHED'}};
writeFileSync(new URL('synthetic-overlap-proof.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({localSyntheticProof:true,cases:cases.length,allReadStartsInsideSelectedWindow:cases.every(c=>c.readStartInsideSelectedWindow),allOutputsEqual:cases.every(c=>c.identicalContinuousBootstrapOutput),actualExecution:false}));
