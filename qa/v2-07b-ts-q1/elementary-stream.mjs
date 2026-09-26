import { readPes, readAnnexBNals } from './gop-boundaries.mjs';
import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const demand = (value, code) => { if (!value) throw new Error(code); };
const equal = (a,b) => a.length === b.length && a.every((v,i)=>v===b[i]);
const rates = [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];

// Bounded syntax/timing owner for the initial CFR + ADTS-framed Q1 slice.
// No stored payload except copied SPS/PPS; PTS bookkeeping is capped per GOP.
export function createElementaryStream({ maxFramesPerGop = 4096 } = {}) {
  demand(Number.isSafeInteger(maxFramesPerGop) && maxFramesPerGop >= 3 && maxFramesPerGop <= 4096,'ES_LIMIT');
  let sps=null,pps=null,step=null,previousDts=null,previousMaxPts=null;
  let gop=[],audioConfig=null,audioOrigin=null,audioSamples=0,videoCount=0,audioCount=0;
  let peakFrames=0,closed=false;

  function closeGop() {
    demand(gop.length>=3 && step>0,'GOP_TOO_SHORT');
    const presentation=gop.map(frame=>frame.pts).sort((a,b)=>a-b);
    demand(presentation.every((pts,i)=>!i||pts-presentation[i-1]===step),'GOP_PRESENTATION_CADENCE');
    demand(previousMaxPts===null||presentation[0]-previousMaxPts===step,'CROSS_IDR_PRESENTATION_UNPROVEN');
    const result={videoFrames:gop.length,start:gop[0].offset,firstDts:gop[0].dts,lastDts:gop[gop.length-1].dts,
      firstPts:presentation[0],lastPts:presentation[presentation.length-1],step};
    previousMaxPts=result.lastPts;gop=[];
    return result;
  }

  function video(record) {
    demand(!closed,'ES_CLOSED');
    const parsed=readPes(record,'video');
    const units=readAnnexBNals(parsed.payload);const types=units.map(unit=>unit[0]&31);
    demand(types[0]===9&&types.filter(type=>type===9).length===1,'ONE_AU_PER_PES');
    demand(types.every(type=>[1,5,6,7,8,9].includes(type)),'NAL_TYPE_UNPROVEN');
    const pictures=types.filter(type=>type===1||type===5);
    demand(pictures.length&&pictures.every(type=>type===pictures[0]),'MIXED_OR_ABSENT_PICTURE');
    const idr=pictures[0]===5;
    for(const [type,prior]of[[7,sps],[8,pps]]) {
      const entries=units.filter(unit=>(unit[0]&31)===type);
      demand(entries.length<=1&&(!idr||entries.length===1),'PARAMETER_SET_REQUIRED');
      if(entries.length){demand(entries[0].length<=65536&&(!prior||equal(prior,entries[0])),'PARAMETER_SET_CHANGE');
        if(type===7&&!prior)demand(parseH264Sps(entries[0]).status==='parsed','H264_SPS_INVALID');
        if(!prior){if(type===7)sps=entries[0].slice();else pps=entries[0].slice();}}
    }
    demand(sps&&pps&&(videoCount||idr),'FIRST_IDR_REQUIRED');
    if(previousDts!==null){const delta=parsed.dts-previousDts;if(step===null)step=delta;
      demand(step>0&&step<=90000&&delta===step,'VFR_OR_DISCONTINUITY_UNPROVEN');}
    previousDts=parsed.dts;
    const completed=idr&&gop.length?closeGop():null;
    demand(gop.length<maxFramesPerGop,'GOP_FRAME_LIMIT');
    const frame={offset:parsed.offset,end:parsed.end,pts:parsed.pts,dts:parsed.dts,idr};
    gop.push(frame);peakFrames=Math.max(peakFrames,gop.length);videoCount++;
    return {frame,completed};
  }

  function audio(record) {
    demand(!closed,'ES_CLOSED');
    const parsed=readPes(record,'audio');const bytes=parsed.payload;
    demand(parsed.pts===parsed.dts,'AAC_PTS_DTS');
    let offset=0,count=0;
    while(offset<bytes.length){
      demand(offset+7<=bytes.length&&bytes[offset]===255&&(bytes[offset+1]&254)===240,'ADTS_HEADER');
      const header=bytes[offset+1]&1?7:9;
      const size=((bytes[offset+3]&3)<<11)|(bytes[offset+4]<<3)|(bytes[offset+5]>>5);
      demand(size>header&&offset+size<=bytes.length&&(bytes[offset+6]&3)===0,'ADTS_CROSS_PES_UNPROVEN');
      const config=[bytes[offset+2]>>6,(bytes[offset+2]>>2)&15,((bytes[offset+2]&1)<<2)|(bytes[offset+3]>>6)];
      demand(config[0]===1&&rates[config[1]]&&config[2]>0&&config[2]<=7,'AAC_CONFIGURATION_UNPROVEN');
      demand(!audioConfig||equal(audioConfig,config),'AAC_CONFIGURATION_CHANGE');audioConfig=config;
      count++;offset+=size;
    }
    if(audioOrigin===null)audioOrigin=parsed.dts;
    demand(count&&Math.abs(parsed.dts-audioOrigin-audioSamples*90000/rates[audioConfig[1]])<=1,'AAC_TIMING_DISCONTINUITY');
    audioSamples+=count*1024;audioCount+=count;
    return {offset:record.offset,end:record.end,frames:count,dts:parsed.dts};
  }

  return {
    video,audio,
    finish(){demand(!closed,'ES_CLOSED');const result=closeGop();demand(audioCount>0,'AAC_REQUIRED');closed=true;return result;},
    abort(){closed=true;sps=null;pps=null;gop=[];audioConfig=null;},
    stats(){return {parameterBytes:(sps?.length||0)+(pps?.length||0),retainedFrames:gop.length,peakFrames,videoFrames:videoCount,aacFrames:audioCount};}
  };
}
