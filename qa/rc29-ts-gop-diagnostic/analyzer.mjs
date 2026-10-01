import { scanTsWindow } from '../v2-07b-ts-q1/ts-window.mjs';
import { createPsiStream } from '../v2-07b-ts-q1/psi-stream.mjs';
import { validateVideoClock, videoGopTiming } from '../v2-07b-ts-q1/video-clock.mjs';
import { probeTsSeek } from '../v2-07b-ts-q1/ts-seek.mjs';

export const VERSION='1.22.0-rc.29';
export const SOURCE_COMMIT='10f1dd2ee9550866933e693dbf41c62e1fb2daad';
const WIDTH=524144, MAX=90000;
const safeTick=n=>Number.isSafeInteger(n)&&n>=0&&n<2**33;
const goodStep=n=>Number.isSafeInteger(n)&&n>0&&n<=MAX;
const attempt=fn=>{try{fn();return true;}catch{return false;}};
const safeDelta=n=>Number.isSafeInteger(n)&&Math.abs(n)<2**33?n:null;

function clockConditions(rows,step){
  return {
    ticksValid:rows.every(r=>safeTick(r.pts)&&safeTick(r.dts)),
    referenceStepValid:goodStep(step),
    dtsStrictlyIncreasing:rows.every((r,i)=>!i||r.dts>rows[i-1].dts),
    dtsIntervalsBounded:rows.every((r,i)=>!i||r.dts-rows[i-1].dts<=MAX),
    uniquePts:new Set(rows.map(r=>r.pts)).size===rows.length,
    reorderBounded:goodStep(step)&&rows.every(r=>Math.abs(r.pts-r.dts)<=16*step),
    canonicalClockPass:attempt(()=>validateVideoClock(rows,{referenceStep:step}))
  };
}

function groupSummary(rows,step,following,eof){
  const presentation=[...rows].sort((a,b)=>a.pts-b.pts),first=rows[0],last=presentation.at(-1);
  const lastInterval=rows.length>=2?rows.at(-1).dts-rows.at(-2).dts:null;
  return {
    frameCount:rows.length,atEof:eof,hasFollowing:!!following,shorterThanThree:rows.length<3,
    ...clockConditions(rows,step),
    idrIsMinimumPts:first.pts===presentation[0].pts,
    presentationIntervalsBounded:presentation.every((r,i)=>!i||r.pts-presentation[i-1].pts<=MAX),
    followingDecodePass:!following||attempt(()=>validateVideoClock([following],{referenceStep:step,previousDts:rows.at(-1).dts})),
    followingPtsAfterMaximum:!following||following.pts>last.pts,
    followingPtsGapBounded:!following||following.pts-last.pts<=MAX,
    endTickValid:following?safeTick(following.pts):lastInterval!==null&&safeTick(last.pts+lastInterval),
    minimumMinusIdrTicks:safeDelta(presentation[0].pts-first.pts),
    followingMinusMaximumTicks:following?safeDelta(following.pts-last.pts):null,
    lastDecodeIntervalTicks:safeDelta(lastInterval),
    canonicalTimingPass:attempt(()=>videoGopTiming(rows,{referenceStep:step,following}))
  };
}

function summarize(result,step,eof){
  const frames=result.video,ids=frames.flatMap((r,i)=>r.idr?[i]:[]),groups=[];
  for(let n=0;n<ids.length;n++){
    const next=ids[n+1];if(next===undefined&&!eof)continue;
    groups.push(groupSummary(frames.slice(ids[n],next),step,next===undefined?null:frames[next],next===undefined&&eof));
  }
  const failures=groups.filter(g=>!g.canonicalTimingPass);
  return {videoFrames:frames.length,audioRecords:result.audio.length,
    leadingPartial:{...result.leadingPartial},trailingPartial:{...result.trailingPartial},
    ...clockConditions(frames,step),gopCount:groups.length,failedGopCount:failures.length,
    firstGop:groups[0]??null,lastGop:groups.at(-1)??null,
    failedGops:failures.slice(0,8),failureDetailsTruncated:failures.length>8,
    audioSampleRate:result.audio[0]?.sampleRate??null,audioChannels:result.audio[0]?.channels??null};
}

function inspectPsi(bytes,required){
  const psi=createPsiStream();let found=null,started=false;
  try{
    for(let i=0;i<bytes.length;i+=188){
      const p=bytes.subarray(i,i+188),pid=((p[1]&31)<<8)|p[2];
      if(!started){if(pid!==0||!(p[1]&64))continue;started=true;}
      found=psi.push(p)||found;
    }
    if(required&&!found)throw Error('PSI');return found;
  }finally{psi.abort();}
}

const PROBE_CODES=new Set(['SEEK_OPTIONS','SEEK_PSI_INVALID','SEEK_HEAD_UNPROVEN','SEEK_TOPOLOGY_CHANGED',
  'SEEK_WINDOW_UNPROVEN','SEEK_VIDEO_CLOCK_UNPROVEN','SEEK_PARAMETERS_CHANGED','SEEK_AUDIO_CONFIG_CHANGED',
  'SEEK_AUDIO_CLOCK_UNPROVEN','SEEK_SAMPLE_CONFLICT','SEEK_SAMPLED_CLOCK_ORDER','SEEK_WINDOW_BUDGET',
  'SEEK_READ_FAILED','SEEK_READ_LENGTH','SEEK_WINDOW_INVALID','SEEK_GOP_PRESENTATION_UNPROVEN',
  'SEEK_EDGE_GOP_UNPROVEN','SEEK_TIMELINE_UNPROVEN','SEEK_TARGET_BEFORE_VIDEO','SEEK_TARGET_AFTER_LAST_ANCHOR',
  'SEEK_TARGET_UNBRACKETED','SEEK_LOCAL_GOP_UNPROVEN']);

// Pure, bounded byte consumer. No network/browser/storage/console or retention.
// Caller owns immutable identity-fenced GETs, cancellation, source hash proof and
// exact EOF. Fixed version/commit checks are binding consistency, not live proof.
export async function analyzeTsGops(input={}){
  const {headBytes,tailBytes,sourceSize,tailOffset,headAtEof,tailAtEof,version,sourceCommit}=input;
  if(version!==VERSION||sourceCommit!==SOURCE_COMMIT)return {stage:'binding',code:'FIXED29_BINDING_REQUIRED'};
  const width=Math.min(WIDTH,sourceSize);
  if(!Number.isSafeInteger(sourceSize)||sourceSize<188||sourceSize%188!==0||
    !(headBytes instanceof Uint8Array)||!(tailBytes instanceof Uint8Array)||headBytes.length!==width||tailBytes.length!==width||
    tailOffset!==sourceSize-width||tailOffset%188!==0||headAtEof!==(width===sourceSize)||tailAtEof!==true)
    return {stage:'input',code:'TWO_BOUNDED_EDGE_WINDOWS_REQUIRED'};
  // Immutable private copies prevent caller mutation across probe awaits.
  const head=Uint8Array.from(headBytes),tail=Uint8Array.from(tailBytes);
  try {
  if(tailOffset===0&&!head.every((v,i)=>v===tail[i]))return {stage:'input',code:'SAME_WINDOW_CONFLICT'};
  let topology,tailTopology;
  try{topology=inspectPsi(head,true);tailTopology=inspectPsi(tail,false);}
  catch{return {stage:'psi',code:'PSI_REJECTED'};}
  if(tailTopology&&!Object.keys(topology).every(k=>topology[k]===tailTopology[k]))return {stage:'psi',code:'TOPOLOGY_CHANGED'};
  let h,t;
  try{h=scanTsWindow(head,{offset:0,...topology,atEof:headAtEof});}
  catch{return {stage:'head-syntax',code:'WINDOW_SYNTAX_REJECTED'};}
  try{t=scanTsWindow(tail,{offset:tailOffset,...topology,atEof:true});}
  catch{return {stage:'tail-syntax',code:'WINDOW_SYNTAX_REJECTED'};}
  const step=h.video[1]?.dts-h.video[0]?.dts;
  let reads=0,beyond=false,code='CANONICAL_STARTUP_PLAN_PASS';
  try{
    await probeTsSeek({sourceSize,positionSeconds:0,windowBytes:width,maxWindows:2,read:async({start,end})=>{
      reads++;
      if(reads>2||end-start+1!==width||(start!==0&&start!==tailOffset)){beyond=true;throw Error('UNSUPPLIED');}
      return start===0?head:tail;
    }});
  }catch(error){code=beyond?'FIXED_WINDOWS_EXHAUSTED':PROBE_CODES.has(error?.message)?error.message:'CANONICAL_REJECTED';}
  return {stage:'timing',code,referenceStepTicks:safeDelta(step),canonicalReadCount:reads,
    additionalWindowsNeeded:beyond||code==='SEEK_WINDOW_BUDGET',head:summarize(h,step,headAtEof),tail:summarize(t,step,true)};
  } finally { head.fill(0);tail.fill(0); }
}
