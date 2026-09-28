import { scanTsWindow } from './ts-window.mjs';
import { createPsiStream } from './psi-stream.mjs';

const demand=(ok,code)=>{if(!ok)throw new Error(code);};
const histogram=values=>{
  const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
  return {distinct:counts.size,values:[...counts].sort((a,b)=>a[0]-b[0]).slice(0,32).map(([value,count])=>({value,count}))};
};
const deltas=rows=>rows.slice(1).map((row,i)=>row.dts-rows[i].dts);
function summarize(result,head){
  const rows=result.video,step=head.video[1]?.dts-head.video[0]?.dts;
  const firstDts=head.video[0]?.dts,firstPts=head.video[0]?.pts,seen=new Set(),violations=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i],reasons=[];
    if(i&&row.dts-rows[i-1].dts!==step)reasons.push('dts-step');
    if((row.dts-firstDts)%step!==0)reasons.push('dts-phase');
    if((row.pts-firstPts)%step!==0)reasons.push('pts-phase');
    if(seen.has(row.pts))reasons.push('duplicate-pts');
    if(Math.abs(row.pts-row.dts)>16*step)reasons.push('reorder-bound');
    seen.add(row.pts);
    if(reasons.length&&violations.length<8)violations.push({index:i,pts:row.pts,dts:row.dts,
      previousDts:i?rows[i-1].dts:null,reasons});
  }
  const ordered=[...rows].sort((a,b)=>a.pts-b.pts);
  return {videoCount:rows.length,audioCount:result.audio.length,headStep:step,
    first:rows[0]?{pts:rows[0].pts,dts:rows[0].dts,idr:rows[0].idr}:null,
    last:rows.length?{pts:rows.at(-1).pts,dts:rows.at(-1).dts,idr:rows.at(-1).idr}:null,
    dtsDeltas:histogram(deltas(rows)),ptsDeltas:histogram(ordered.slice(1).map((row,i)=>row.pts-ordered[i].pts)),
    reorderTicks:histogram(rows.map(row=>row.pts-row.dts)),violations,
    leadingPartial:result.leadingPartial,trailingPartial:result.trailingPartial};
}

// Diagnostic only. Caller supplies the existing identity-fenced bounded reader
// and cancellation owner. Two serial reads, <=1,048,288 bytes total; no media,
// SPS/PPS, file/account identity, URLs or credentials are returned or retained.
export async function diagnoseTsClock({read,sourceSize,isCurrent}={}){
  demand(typeof read==='function'&&typeof isCurrent==='function'&&Number.isSafeInteger(sourceSize)
    &&sourceSize>=188&&sourceSize%188===0,'CLOCK_OPTIONS');
  const width=Math.min(524144,sourceSize),ranges=[0,sourceSize-width];let reads=0,bytesRead=0;
  const results=[];let topology=null;
  for(const start of [...new Set(ranges)]){
    demand(isCurrent()===true,'CLOCK_STALE');
    const bytes=await read({start,end:start+width-1});
    demand(isCurrent()===true,'CLOCK_STALE');
    demand(bytes instanceof Uint8Array&&bytes.length===width,'CLOCK_READ_LENGTH');
    reads++;bytesRead+=bytes.length;
    if(start===0){
      const psi=createPsiStream();
      try{for(let i=0;i<bytes.length;i+=188)topology=psi.push(bytes.subarray(i,i+188))||topology;}
      finally{psi.abort();}
      demand(topology,'CLOCK_TOPOLOGY');
    }
    results.push(scanTsWindow(bytes,{offset:start,videoPid:topology.videoPid,audioPid:topology.audioPid,atEof:start+width===sourceSize}));
  }
  return {scope:'bounded diagnostic clock samples, no admission/decode claim',reads,bytesRead,
    head:summarize(results[0],results[0]),tail:summarize(results.at(-1),results[0])};
}
