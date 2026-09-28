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
export function videoGopTiming(rows,{referenceStep,following=null,previousMaxPts=null}={}){
  demand(rows.length>=3);validateVideoClock(rows,{referenceStep});
  const presentation=[...rows].sort((a,b)=>a.pts-b.pts);
  demand(presentation[0].pts===rows[0].pts);
  for(let i=1;i<presentation.length;i++)demand(presentation[i].pts-presentation[i-1].pts<=MAX_VIDEO_INTERVAL);
  if(previousMaxPts!==null)demand(presentation[0].pts>previousMaxPts&&presentation[0].pts-previousMaxPts<=MAX_VIDEO_INTERVAL);
  const last=presentation.at(-1).pts,lastDtsInterval=rows.at(-1).dts-rows.at(-2).dts;
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
