import { validateVideoClock, videoGopTiming } from './video-clock.mjs';
import { scanTsWindow } from './ts-window.mjs';
import { createPsiStream } from './psi-stream.mjs';
import { BoundedProbeError } from '../v2-07a-bounded-probe/bounded-probe.mjs';

const demand = (condition, code) => { if (!condition) throw new Error(code); };
const equal = (a,b) => a.length === b.length && a.every((value,index) => value === b[index]);
const align = value => Math.floor(value/188)*188;
const anchor = ({offset,pts,dts}) => ({offset,pts,dts});

// QA-only bounded sample search. read owns authenticated source identity,
// generation, cancellation, deadlines and transport limits. No raw TS escapes.
// A sampled timeline is only a candidate: unseen clock epochs/format changes,
// complete pictures, decoder preroll and playable seek slices remain unproven.
export async function probeTsSeek({ read,sourceSize,fraction,positionSeconds,windowBytes=524144,maxWindows=12 } = {}) {
  demand(typeof read === 'function' && Number.isSafeInteger(sourceSize) && sourceSize > 0 && sourceSize%188 === 0,
    'SEEK_OPTIONS');
  const absolute=positionSeconds!==undefined;
  demand((absolute? fraction===undefined&&Number.isFinite(positionSeconds)&&positionSeconds>=0:
    Number.isFinite(fraction)&&fraction>0&&fraction<1) && Number.isSafeInteger(windowBytes)
    && windowBytes >= 188 && windowBytes <= 1024*1024 && windowBytes%188 === 0
    && Number.isInteger(maxWindows) && maxWindows >= 1 && maxWindows <= 16, 'SEEK_OPTIONS');
  const width = Math.min(windowBytes,sourceSize), cache = new Map(), windows = [];
  const widest=Math.min(align(1024*1024),sourceSize);
  const key=(start,length=width)=>`${start}:${length}`;
  let topology = null, sourceSps = null, sourcePps = null, audioConfig = null, step = null;
  let firstAudioPts = null;

  function inspectPsi(bytes, required) {
    const psi = createPsiStream(); let found = null, started = false;
    try {
      for (let i=0;i<bytes.length;i+=188) {
        const packet=bytes.subarray(i,i+188),pid=((packet[1]&31)<<8)|packet[2];
        // A random window can begin inside a PSI section. Wait for a new PAT
        // section before starting this independent, sample-local PSI owner.
        if (!started) { if (pid!==0 || !(packet[1]&64)) continue; started=true; }
        found=psi.push(packet)||found;
      }
    } catch { throw new Error('SEEK_PSI_INVALID'); }
    finally { psi.abort(); }
    demand(!required || found, 'SEEK_HEAD_UNPROVEN');
    if (found && topology) demand(Object.keys(topology).every(key=>topology[key]===found[key]), 'SEEK_TOPOLOGY_CHANGED');
    return found;
  }
  function validate(result) {
    demand(result.video.length>=3 && result.audio.length>0, 'SEEK_WINDOW_UNPROVEN');
    const delta=result.video[1].dts-result.video[0].dts;
    demand(delta>0 && delta<=90000, 'SEEK_VIDEO_CLOCK_UNPROVEN');
    if (step===null) step=delta;
    try { validateVideoClock(result.video,{referenceStep:step}); }
    catch { throw new Error('SEEK_VIDEO_CLOCK_UNPROVEN'); }
    for (const row of result.video) {
      if (row.sps) demand(equal(row.sps,sourceSps), 'SEEK_PARAMETERS_CHANGED');
      if (row.pps) demand(equal(row.pps,sourcePps), 'SEEK_PARAMETERS_CHANGED');
    }
    let samples=0; const origin=result.audio[0].pts;
    for (const row of result.audio) {
      demand(row.sampleRate===audioConfig.sampleRate && row.channels===audioConfig.channels, 'SEEK_AUDIO_CONFIG_CHANGED');
      const ticksPerFrame=1024*90000/row.sampleRate;
      demand(Math.abs(row.pts-origin-samples*90000/row.sampleRate)<=1
        && Math.abs((row.pts-firstAudioPts)-Math.round((row.pts-firstAudioPts)/ticksPerFrame)*ticksPerFrame)<=1,
      'SEEK_AUDIO_CLOCK_UNPROVEN');
      samples+=row.frames*1024;
    }
  }
  function validateSampleOrder() {
    for (const kind of ['video','audio']) {
      const samples=new Map();
      for (const item of cache.values()) for (const row of item.result[kind]) {
        const prior=samples.get(row.offset);
        demand(!prior || (prior.pts===row.pts && prior.dts===row.dts && prior.end===row.end), 'SEEK_SAMPLE_CONFLICT');
        samples.set(row.offset,row);
      }
      const ordered=[...samples.values()].sort((a,b)=>a.offset-b.offset);
      for (let i=1;i<ordered.length;i++) demand(ordered[i].dts>ordered[i-1].dts, 'SEEK_SAMPLED_CLOCK_ORDER');
    }
  }
  async function sample(start, head=false, length=width) {
    start=Math.max(0,Math.min(sourceSize-length,align(start)));
    if (cache.has(key(start,length))) return cache.get(key(start,length));
    demand(windows.length<maxWindows, 'SEEK_WINDOW_BUDGET');
    const end=start+length-1;
    let bytes;
    try { bytes=await read({start,end}); } catch (error) {
      if(error instanceof BoundedProbeError)throw new BoundedProbeError(error.code);
      throw new Error('SEEK_READ_FAILED');
    }
    demand(bytes instanceof Uint8Array && bytes.length===length, 'SEEK_READ_LENGTH');
    bytes=Uint8Array.from(bytes);
    const observed=inspectPsi(bytes,head);
    if (head) topology=observed;
    let result;
    try { result=scanTsWindow(bytes,{offset:start,videoPid:topology.videoPid,audioPid:topology.audioPid,atEof:end+1===sourceSize}); }
    catch { throw new Error('SEEK_WINDOW_INVALID'); }
    if (head) {
      const first=result.video[0];
      demand(first?.idr && first.sps && first.pps && result.audio.length && !result.leadingPartial.video
        && !result.leadingPartial.audio, 'SEEK_HEAD_UNPROVEN');
      sourceSps=Uint8Array.from(first.sps); sourcePps=Uint8Array.from(first.pps);
      firstAudioPts=result.audio[0].pts;
      audioConfig={sampleRate:result.audio[0].sampleRate,channels:result.audio[0].channels};
    }
    validate(result);
    const item={start,end,result};cache.set(key(start,length),item);validateSampleOrder();
    windows.push({start,end,bytes:length,videoAnchors:result.video.length,audioAnchors:result.audio.length,
      firstVideoDts:result.video[0].dts,lastVideoDts:result.video.at(-1).dts,topologyReobserved:Boolean(observed)});
    return item;
  }
  function gops(item) {
    const frames=item.result.video, ids=frames.flatMap((row,index)=>row.idr?[index]:[]), result=[];
    for (let n=0;n<ids.length;n++) {
      const next=ids[n+1];
      if (next===undefined && item.end+1!==sourceSize) continue;
      const group=frames.slice(ids[n],next);let presentation;
      try { ({presentation}=videoGopTiming(group,{referenceStep:step,following:next===undefined?null:frames[next]})); }
      catch { throw new Error('SEEK_GOP_PRESENTATION_UNPROVEN'); }
      result.push({rap:group[0],presentation,next:next===undefined?null:frames[next],count:group.length});
    }
    return result;
  }

  let head=await sample(0,true),tail=await sample(sourceSize-width);
  if(!gops(head).length&&width<widest)head=await sample(0,true,widest);
  if(!gops(tail).length&&width<widest)tail=await sample(sourceSize-widest,false,widest);
  const headGops=gops(head),tailGops=gops(tail);
  demand(headGops.length && tailGops.length, 'SEEK_EDGE_GOP_UNPROVEN');
  const originTicks=Math.min(...head.result.video.map(row=>row.pts),head.result.audio[0].pts);
  const tailFrames=tail.result.video;
  const videoEnd=Math.max(...tailFrames.map(row=>row.pts))+(tailFrames.at(-1).dts-tailFrames.at(-2).dts);
  const audioLast=tail.result.audio.at(-1),audioEnd=audioLast.pts+audioLast.frames*1024*90000/audioLast.sampleRate;
  const endTicks=Math.max(videoEnd,audioEnd);
  demand(endTicks>originTicks && endTicks<2**33 && Math.max(videoEnd,audioEnd)-Math.min(videoEnd,audioEnd)<=90000,
    'SEEK_TIMELINE_UNPROVEN');
  const lastVideoPts=Math.max(...tail.result.video.map(row=>row.pts));
  // Product time requests clamp to real first/last picture anchors. The
  // requested audio-only lead/tail remains distinct from the decode target;
  // never fabricate a picture at zero or the duration endpoint.
  const targetTicks=absolute?Math.max(head.result.video[0].pts,Math.min(lastVideoPts,originTicks+positionSeconds*90000)):
    originTicks+fraction*(endTicks-originTicks);
  demand(targetTicks>=head.result.video[0].pts, 'SEEK_TARGET_BEFORE_VIDEO');
  // Cadence gives a candidate final-frame duration, not another observed frame
  // anchor. Do not invent an "after" anchor in that final span/audio-only tail.
  demand(targetTicks<=lastVideoPts, 'SEEK_TARGET_AFTER_LAST_ANCHOR');
  const timeline={kind:'sampled-candidate',originTicks,endTicks,durationSeconds:(endTicks-originTicks)/90000,
    videoEndTicks:videoEnd,audioEndTicks:audioEnd,videoStepTicks:step,videoTiming:'observed-intervals',finalVideoDurationInferred:true,globalContinuityVerified:false};

  function find() {
    let chosen=null;
    for (const item of cache.values()) for (const group of gops(item)) {
      if (group.rap.pts>targetTicks || (group.next && targetTicks>=group.next.pts)) continue;
      const following=group.presentation.find(row=>row.pts>=targetTicks)||group.next;
      const prior=[...group.presentation].reverse().find(row=>row.pts<=targetTicks);
      if (!following || !prior) continue;
      if (!chosen || group.rap.offset>chosen.rap.offset) chosen={group,item,rap:group.rap,prior,following};
    }
    return chosen;
  }
  let found=find(),lower=head.result.video[0],upper=tail.result.video.at(-1);
  while (!found) {
    demand(lower.dts<upper.dts && lower.offset<upper.offset, 'SEEK_TARGET_UNBRACKETED');
    const ratio=Math.max(0,Math.min(1,(targetTicks-lower.pts)/(upper.pts-lower.pts)));
    let start=align(lower.offset+ratio*(upper.offset-lower.offset)-width/2);
    start=Math.max(0,Math.min(sourceSize-width,start));
    if (cache.has(key(start))) {
      // Try one bounded overlap on either side of the closest sampled target;
      // this is local GOP backsearch, never a prefix walk from 0 to target.
      const center=start, alternatives=[center-align(width/2),center+align(width/2),align(lower.offset+(upper.offset-lower.offset)/2-width/2)];
      start=alternatives.map(value=>Math.max(0,Math.min(sourceSize-width,align(value)))).find(value=>!cache.has(key(value)));
      demand(start!==undefined, 'SEEK_TARGET_UNBRACKETED');
    }
    const item=await sample(start),frames=item.result.video;
    found=find();
    if (!found) {
      const firstPts=Math.min(...frames.map(row=>row.pts)),lastPts=Math.max(...frames.map(row=>row.pts));
      if(lastPts<targetTicks&&frames.at(-1).offset>lower.offset)lower={...frames.at(-1),pts:lastPts};
      else if(firstPts>targetTicks&&frames[0].offset<upper.offset)upper={...frames[0],pts:firstPts};
      else {
        // PTS order is not decode/byte order with B pictures. A straddling
        // window cannot safely tighten byte bounds using individual PTS rows.
        const expanded=Math.max(0,Math.min(sourceSize-widest,align(start-(widest-width)/2)));
        if(width<widest&&!cache.has(key(expanded,widest))){await sample(expanded,false,widest);found=find();}
        demand(found,'SEEK_LOCAL_GOP_UNPROVEN');
      }
    }
  }
  const {rap,group,item,prior,following}=found;
  return {topology:{...topology},sourceSize,timeline,targetTicks,
    rap:{offset:rap.offset,end:rap.end,pts:rap.pts,dts:rap.dts,sps:Uint8Array.from(rap.sps),pps:Uint8Array.from(rap.pps)},
    local:{windowStart:item.start,windowEndExclusive:item.end+1,videoFrames:group.count,
      before:anchor(prior),after:anchor(following),followingRap:group.next?anchor(group.next):null,
      sourceClockPreserved:true,completePicturesVerified:false,decodeStartSliceVerified:false},
    windows:windows.map(row=>({...row})),readBytes:windows.reduce((sum,row)=>sum+row.bytes,0),
    scope:'bounded sampled RAP candidate with observed-clock/bracket evidence; not global timeline, exact duration, decoded seek or a directly playable TS slice'};
}
