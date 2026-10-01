const demand=(ok)=>{if(!ok)throw new Error('VIDEO_CLOCK_UNPROVEN');};
const tick=n=>Number.isSafeInteger(n)&&n>=0&&n<2**33;
export const MAX_VIDEO_INTERVAL=90000;
// Validate observed clocks without rounding them onto a frame grid. The first
// DTS interval is a reorder-budget reference, not a global timestamp origin.
// These bounded observations never establish continuity in unsampled gaps.
export function validateVideoClock(rows,{referenceStep,previousDts=null}={}){
  demand(Array.isArray(rows)&&rows.length>0&&Number.isSafeInteger(referenceStep)
    &&referenceStep>0&&referenceStep<=MAX_VIDEO_INTERVAL);
  const seen=new Set();let previous=previousDts;
  for(const row of rows){
    demand(tick(row.dts)&&tick(row.pts));
    if(previous!==null)demand(row.dts>previous&&row.dts-previous<=MAX_VIDEO_INTERVAL);
    demand(!seen.has(row.pts)&&Math.abs(row.pts-row.dts)<=16*referenceStep);
    seen.add(row.pts);previous=row.dts;
  }
}
export function videoGopTiming(rows,{referenceStep,following=null,previousMaxPts=null,atEof=false,previousDts=null}={}){
  demand(rows.length>=3||(atEof===true&&following===null&&rows.length>=1));
  validateVideoClock(rows,{referenceStep,previousDts});
  const presentation=[...rows].sort((a,b)=>a.pts-b.pts);
  demand(presentation[0].pts===rows[0].pts);
  for(let i=1;i<presentation.length;i++)demand(presentation[i].pts-presentation[i-1].pts<=MAX_VIDEO_INTERVAL);
  if(previousMaxPts!==null)demand(presentation[0].pts>previousMaxPts&&presentation[0].pts-previousMaxPts<=MAX_VIDEO_INTERVAL);
  // A singleton at confirmed EOF has no intra-GOP interval. Only its observed
  // adjacent predecessor may supply one; referenceStep is not duration proof.
  const last=presentation.at(-1).pts,lastDtsInterval=rows.length>1?
    rows.at(-1).dts-rows.at(-2).dts:previousDts===null?null:rows[0].dts-previousDts;
  demand(lastDtsInterval!==null&&lastDtsInterval>0&&lastDtsInterval<=MAX_VIDEO_INTERVAL);
  if(following){
    validateVideoClock([following],{referenceStep,previousDts:rows.at(-1).dts});
    demand(following.pts>last&&following.pts-last<=MAX_VIDEO_INTERVAL);
  }
  // At true EOF no following timestamp exists: use the last observed decode
  // interval only as a duration estimate. Never create a seek/frame anchor.
  const endPts=following?following.pts:last+lastDtsInterval;
  demand(tick(endPts));
  return {presentation,endPts,lastDtsInterval,endInferred:!following};
}

// Bounded seek decode groups. Preserve a short true-EOF GOP and the preceding
// validated GOP as decoder preroll so the suffix worker observes its own DTS
// interval. No timestamp hint is injected and no terminal picture is dropped.
export function videoSeekGroups(frames,{referenceStep,atEof=false}={}){
  const ids=frames.flatMap((row,index)=>row.idr?[index]:[]),groups=[];
  for(let n=0;n<ids.length;n++){
    const next=ids[n+1],following=next===undefined?null:frames[next];
    if(!following&&!atEof)continue;
    const rows=frames.slice(ids[n],next),previousDts=ids[n]>0?frames[ids[n]-1].dts:null;
    let timing=videoGopTiming(rows,{referenceStep,following,atEof:atEof&&!following,previousDts});
    if(rows.length<3){
      const prior=groups.at(-1);
      // If the predecessor RAP is outside this bounded window, the caller may
      // use its existing bounded expansion; never bootstrap a cadence-less GOP.
      if(!prior)continue;
      demand(prior.following===rows[0]);
      prior.rows.push(...rows);
      timing=videoGopTiming(prior.rows,{referenceStep,atEof:true});
      Object.assign(prior,{following:null,...timing});
    }else groups.push({rows,following,...timing});
  }
  return groups;
}
