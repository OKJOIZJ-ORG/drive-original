'use strict';
// Pure numeric aggregation. Residual wall time is never labelled CPU/parser time.
function unionMs(ranges){const sorted=ranges.filter(r=>r.every(Number.isFinite)&&r[1]>r[0]).sort((a,b)=>a[0]-b[0]);let total=0,left=null,right=null;for(const[a,b]of sorted){if(left===null){left=a;right=b;}else if(a<=right)right=Math.max(right,b);else{total+=right-left;left=a;right=b;}}return total+(left===null?0:right-left);}
function summarize(runtime,network){
 return runtime.phases.map(p=>{
  const frame=p.firstTargetFrame?.elapsedMs??null,end=p.armedAt+(frame??(p.last?.at-p.armedAt||0));
  const first=predicate=>{const i=p.samples.findIndex(predicate);if(i<0)return{lowerMs:null,upperMs:null};return{lowerMs:i>0?p.samples[i-1].at-p.armedAt:0,upperMs:p.samples[i].at-p.armedAt};};
  const rows=[...network.records,...network.inflight].filter(r=>r.startedEpochMs!==null&&r.startedEpochMs<=end&&(r.completedEpochMs===null||r.completedEpochMs>=p.armedAt));
  const ranges=rows.map(r=>[Math.max(p.armedAt,r.startedEpochMs),Math.min(end,r.completedEpochMs??end)]);
  const requestUnion=unionMs(ranges),responses=unionMs(rows.map(r=>[Math.max(p.armedAt,r.startedEpochMs),Math.min(end,r.respondedEpochMs??r.completedEpochMs??end)]));
  const delivery=unionMs(rows.filter(r=>r.respondedEpochMs!==null).map(r=>[Math.max(p.armedAt,r.respondedEpochMs),Math.min(end,r.completedEpochMs??end)]));
  const anchorsGood=rows.every(r=>r.startedEpochMs!==null),span=Math.max(0,end-p.armedAt);
  return{label:p.label,armedAt:p.armedAt,targetFrameMs:frame,deadline15Passed:frame!==null&&frame<=15000,
   firstPipelineGenerationAdvance:first(s=>s.pipeline?.generation!==p.samples[0]?.pipeline?.generation),
   firstBuffering:first(s=>s.pipeline?.phase==='buffering'),firstAppend:first(s=>s.pipeline?.appends>0),
   firstReady:first(s=>['ready','buffered-to-end','ended'].includes(s.pipeline?.phase)),
   observedRequestCount:rows.length,observedRequestWallUnionMs:requestUnion,observedResponseWaitUnionMs:responses,
   observedBodyDeliveryUnionMs:delivery,residualWallTimeMs:anchorsGood?Math.max(0,span-requestUnion):null,
   timestampAlignment:'CDP request wallTime plus monotonic deltas versus browser Date.now arm; clock accuracy not independently measured',
   networkCompleteness:network.overflowCount===0?'PAGE_TARGET_EVENTS_ONLY':'CAPPED_INCOMPLETE',
   upstreamSWNetwork:'UNKNOWN',probeParserCPU:'UNKNOWN',workerInnerCPUAndAck:'UNKNOWN',
   interpretation:'Request intervals may overlap processing. Residual is unobserved wall time, not CPU or a causal attribution.'};
 });
}
module.exports={unionMs,summarize};
