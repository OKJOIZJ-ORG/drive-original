import { videoSeekGroups } from './video-clock.mjs';
import { scanTsWindow } from './ts-window.mjs';
import { createPsiStream } from './psi-stream.mjs';
import { readPes } from './gop-boundaries.mjs';

const PACKET = 188;
const OUTPUT_LIMIT = Math.floor(1024*1024/PACKET)*PACKET;
class InputError extends Error {}
const demand = (value, code) => { if (!value) throw new InputError(code); };
const safe = value => Number.isSafeInteger(value) && value >= 0;
const equal = (a,b) => a instanceof Uint8Array && b instanceof Uint8Array
  && a.length === b.length && a.every((value,index)=>value===b[index]);
const sameAnchor = (left,right) => left && right && ['offset','pts','dts'].every(key=>left[key]===right[key]);
const pidOf = packet => ((packet[1]&31)<<8)|packet[2];
const payloadOf = packet => packet.subarray(4+(packet[3]&32?packet[4]+1:0));

// QA-only bounded decode-start candidate, not a continuous seek pipeline.
// A short true-EOF GOP includes its preceding validated GOP as decode preroll.
// read identity/generation and true source size remain the caller's ownership.
// source.ranges.end is exclusive; ranges.bytes counts original PES bytes, NOT
// TS packet interval bytes. Output PAT/PMT payloads and complete selected PES
// are copied; only TS packet boundaries, continuity and adaptation/PCR change.
// SPS/PPS, encoded NAL/AAC data, PES headers and media timestamps are untouched.
export function prepareTsSeekInput(options) {
  try { return prepare(options); }
  catch (error) { throw new Error(error instanceof InputError ? error.message : 'SEEK_INPUT_INVALID'); }
}

function prepare({headBytes,bytes,offset,plan}={}) {
  demand(headBytes instanceof Uint8Array && headBytes.length>0 && headBytes.length<=65536
    && headBytes.length%PACKET===0 && bytes instanceof Uint8Array && bytes.length>0
    && bytes.length<=1024*1024 && bytes.length%PACKET===0, 'SEEK_INPUT_BYTES');
  demand(safe(offset) && offset%PACKET===0 && plan && safe(plan.sourceSize) && plan.sourceSize>0
    && plan.sourceSize%PACKET===0 && headBytes.length<=plan.sourceSize && Number.isSafeInteger(offset+bytes.length)
    && offset+bytes.length<=plan.sourceSize && plan.local?.windowStart===offset
    && plan.local.windowEndExclusive===offset+bytes.length, 'SEEK_INPUT_WINDOW');
  demand(Number.isFinite(plan.targetTicks) && plan.timeline?.kind==='sampled-candidate'
    && plan.timeline.globalContinuityVerified===false && plan.local.sourceClockPreserved===true
    && plan.local.completePicturesVerified===false && plan.local.decodeStartSliceVerified===false, 'SEEK_INPUT_PLAN');
  const head=Uint8Array.from(headBytes),window=Uint8Array.from(bytes);
  const psi=createPsiStream();let topology=null,bootstrapEnd=null;
  try {
    for(let position=0;position<head.length;position+=PACKET){
      topology=psi.push(head.subarray(position,position+PACKET))||topology;
      if(topology&&bootstrapEnd===null)bootstrapEnd=position+PACKET;
    }
  }catch{throw new InputError('SEEK_INPUT_PSI');}finally{psi.abort();}
  demand(topology && plan.topology && Object.keys(topology).every(key=>topology[key]===plan.topology[key])
    && [topology.videoPid,topology.audioPid].includes(topology.pcrPid), 'SEEK_INPUT_TOPOLOGY');
  const bootstrap=[];
  for(let i=0;i<bootstrapEnd;i+=PACKET){
    const packet=head.subarray(i,i+PACKET);
    if((packet[3]&16)&&[0,topology.pmtPid].includes(pidOf(packet)))bootstrap.push(packet);
  }
  demand(bootstrap.length>0 && bootstrap.length*PACKET<=16384, 'SEEK_INPUT_BOOTSTRAP_LIMIT');
  let headScan,scan;
  try {
    headScan=scanTsWindow(head,{...topology,atEof:head.length===plan.sourceSize});
    scan=scanTsWindow(window,{...topology,offset,atEof:offset+window.length===plan.sourceSize});
  }catch{throw new InputError('SEEK_INPUT_SCAN');}
  const original=headScan.video[0],originalAudio=headScan.audio[0];
  demand(original?.idr && original.sps && original.pps && originalAudio
    && !headScan.leadingPartial.video && !headScan.leadingPartial.audio, 'SEEK_INPUT_HEAD');
  demand(plan.timeline.originTicks===Math.min(original.pts,originalAudio.pts), 'SEEK_INPUT_ORIGIN');
  // Reject undeclared PES/transport PIDs instead of silently discarding a third
  // elementary track. SDT and null packets are the only extra initial-QA PIDs.
  const allowed=new Set([0,17,8191,topology.pmtPid,topology.videoPid,topology.audioPid]);
  for(const source of [head,window])for(let i=0;i<source.length;i+=PACKET){
    const packet=source.subarray(i,i+PACKET),pid=pidOf(packet);
    demand(allowed.has(pid),'SEEK_INPUT_EXTRA_TRACK');
    if((packet[3]&16)&&(packet[1]&64)&&![topology.videoPid,topology.audioPid].includes(pid)){
      const payload=payloadOf(packet);
      demand(!(payload[0]===0&&payload[1]===0&&payload[2]===1),'SEEK_INPUT_EXTRA_TRACK');
    }
  }
  // Reobserve any complete local PSI after its first PAT. Random windows may
  // precede a PSI continuation; source bootstrap, not that continuation, owns it.
  const localPsi=createPsiStream();let started=false;
  try{
    for(let i=0;i<window.length;i+=PACKET){
      const packet=window.subarray(i,i+PACKET);
      if(!started){if(pidOf(packet)!==0||!(packet[1]&64))continue;started=true;}
      const local=localPsi.push(packet);
      demand(!local||Object.keys(topology).every(key=>local[key]===topology[key]),'SEEK_INPUT_TOPOLOGY');
    }
  }catch(error){if(error instanceof InputError)throw error;throw new InputError('SEEK_INPUT_PSI');}
  finally{localPsi.abort();}
  for(const row of scan.video){
    demand((!row.sps||equal(row.sps,original.sps))&&(!row.pps||equal(row.pps,original.pps)), 'SEEK_INPUT_PARAMETERS');
  }
  const index=scan.video.findIndex(row=>row.offset===plan.rap?.offset),rap=scan.video[index];
  demand(rap?.idr && sameAnchor(rap,plan.rap) && rap.end===plan.rap.end && equal(rap.sps,plan.rap.sps)
    && equal(rap.pps,plan.rap.pps) && equal(rap.sps,original.sps) && equal(rap.pps,original.pps), 'SEEK_INPUT_RAP');
  const step=headScan.video[1]?.dts-headScan.video[0]?.dts;
  let group;
  try{group=videoSeekGroups(scan.video,{referenceStep:step,atEof:offset+window.length===plan.sourceSize}).find(g=>g.rows[0]===rap);}
  catch{throw new InputError('SEEK_INPUT_PRESENTATION');}
  demand(group,'SEEK_INPUT_GOP_END');
  const {following,rows:video,presentation,endPts:videoEnd}=group;
  demand(following? sameAnchor(following,plan.local.followingRap)
    : plan.local.followingRap===null && offset+window.length===plan.sourceSize, 'SEEK_INPUT_GOP_END');
  demand(video.length===plan.local.videoFrames && step===plan.timeline.videoStepTicks, 'SEEK_INPUT_VIDEO_CLOCK');
  const before=[...presentation].reverse().find(row=>row.pts<=plan.targetTicks);
  const after=presentation.find(row=>row.pts>=plan.targetTicks)||following;
  demand(before && after && plan.targetTicks>=rap.pts && plan.targetTicks<videoEnd
    && sameAnchor(before,plan.local.before)&&sameAnchor(after,plan.local.after), 'SEEK_INPUT_TARGET');
  const audioStep=1024*90000/originalAudio.sampleRate;
  let prior=null,total=0;const audioOrigin=scan.audio[0]?.pts;
  for(const row of scan.audio){
    demand(row.sampleRate===originalAudio.sampleRate && row.channels===originalAudio.channels, 'SEEK_INPUT_AUDIO_CONFIG');
    demand((prior===null||row.pts>prior) && Math.abs(row.pts-audioOrigin-total*audioStep)<=1
      && Math.abs(row.pts-originalAudio.pts-Math.round((row.pts-originalAudio.pts)/audioStep)*audioStep)<=1,
    'SEEK_INPUT_AUDIO_CLOCK');
    prior=row.pts;total+=row.frames;
  }
  const atBeginning=rap.offset===original.offset;
  let audioStart=-1;
  if(atBeginning)audioStart=scan.audio.findIndex(row=>row.offset===originalAudio.offset);
  else for(let i=0;i<scan.audio.length;i++)if(scan.audio[i].pts+2*audioStep<=rap.pts)audioStart=i;
  demand(audioStart>=0,'SEEK_INPUT_AUDIO_PREROLL');
  let audioEnd=-1;
  for(let i=audioStart;i<scan.audio.length;i++)if(scan.audio[i].pts+scan.audio[i].frames*audioStep>=videoEnd){audioEnd=i;break;}
  // A true source EOF may have an audio track ending before the last picture.
  // Preserve that real gap; require the independently sampled tail endpoint,
  // not fabricated silence or an absent PES. Non-EOF coverage stays strict.
  if(audioEnd<0&&!following&&offset+window.length===plan.sourceSize&&scan.audio.length){
    const last=scan.audio.at(-1),end=last.pts+last.frames*audioStep;
    if(end===plan.timeline.audioEndTicks&&end>=rap.pts&&videoEnd===plan.timeline.videoEndTicks)
      audioEnd=scan.audio.length-1;
  }
  demand(audioEnd>=audioStart,'SEEK_INPUT_AUDIO_COVERAGE');
  const audio=scan.audio.slice(audioStart,audioEnd+1);
  const prerollFrames=audio.reduce((sum,row)=>sum+Math.max(0,Math.min(row.frames,Math.floor((rap.pts-row.pts)/audioStep))),0);
  demand(atBeginning||prerollFrames>=2,'SEEK_INPUT_AUDIO_PREROLL');

  function rawPes(row,pid){
    const parts=[];let count=0;
    for(let position=row.offset-offset;position<row.end-offset;position+=PACKET){
      const packet=window.subarray(position,position+PACKET);
      if(pidOf(packet)!==pid||!(packet[3]&16))continue;
      demand(Boolean(packet[1]&64)===(parts.length===0),'SEEK_INPUT_PES');
      const payload=payloadOf(packet);count+=payload.length;demand(count<=65536,'SEEK_INPUT_PES_LIMIT');parts.push(payload);
    }
    try{const parsed=readPes({offset:row.offset,end:row.end,parts},pid===topology.videoPid?'video':'audio');
      demand(parsed.pts===row.pts&&parsed.dts===row.dts,'SEEK_INPUT_PES');
    }catch{throw new InputError('SEEK_INPUT_PES');}
    const result=new Uint8Array(count);let cursor=0;
    for(const part of parts){result.set(part,cursor);cursor+=part.length;}
    return result;
  }
  const records=[...video.map(row=>({kind:'video',pid:topology.videoPid,row})),...audio.map(row=>({kind:'audio',pid:topology.audioPid,row}))]
    .sort((a,b)=>a.row.offset-b.row.offset);
  demand(records.length<=4096,'SEEK_INPUT_RECORD_LIMIT');
  let packetCount=bootstrap.length;
  for(const record of records){record.bytes=rawPes(record.row,record.pid);packetCount+=Math.ceil(record.bytes.length/184);
    demand(packetCount*PACKET<=OUTPUT_LIMIT,'SEEK_INPUT_OUTPUT_LIMIT');}
  const output=new Uint8Array(packetCount*PACKET),counters=new Map();let cursor=0;
  function packet(pid,payload,start){
    const count=payload.length;demand(count>0&&count<=184,'SEEK_INPUT_PACKET');
    const next=output.subarray(cursor,cursor+PACKET);cursor+=PACKET;next.fill(255);
    next[0]=0x47;next[1]=(pid>>8)|(start?64:0);next[2]=pid&255;
    const cc=counters.get(pid)||0;counters.set(pid,(cc+1)%16);next[3]=16|cc;
    let destination=4;
    if(count<184){next[3]|=32;next[4]=183-count;if(next[4])next[5]=0;destination=188-count;}
    next.set(payload,destination);
  }
  for(const originalPacket of bootstrap)packet(pidOf(originalPacket),payloadOf(originalPacket),Boolean(originalPacket[1]&64));
  for(const record of records)for(let start=0;start<record.bytes.length;start+=184)
    packet(record.pid,record.bytes.subarray(start,start+184),start===0);
  return {bytes:output,video:{frames:video.length,startPts:rap.pts,endPts:videoEnd,step},
    audio:{frames:audio.reduce((n,row)=>n+row.frames,0),startPts:audio[0].pts,
      endPts:audio.at(-1).pts+audio.at(-1).frames*audioStep,prerollFrames},
    source:{ranges:records.map(({kind,pid,row,bytes})=>({kind,pid,offset:row.offset,end:row.end,bytes:bytes.length})),
      selectedPesCount:records.length,bootstrapPackets:bootstrap.length,rapOffset:rap.offset,targetTicks:plan.targetTicks,sourceSize:plan.sourceSize},
    configuration:{videoTrackId:topology.videoPid,sps:Uint8Array.from(rap.sps),pps:Uint8Array.from(rap.pps)},
    scope:'bounded decode group plus complete AAC preroll/coverage; short true-EOF GOP retains preceding GOP; media/PES bytes and source clock preserved, transport repacketized without PCR; not decoder success or continuous post-seek playback'};
}
