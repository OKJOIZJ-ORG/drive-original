import { createPsiStream } from './psi-stream.mjs';
import { createElementaryStream } from './elementary-stream.mjs';

const demand=(value,code)=>{if(!value)throw new Error(code);};
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

// Synchronous bounded raw-TS owner. The consumer owns any emitted copy; async
// consumers need a separate acknowledged/backpressured adapter before adoption.
// Stats account this owner's byte arrays + bounded scratch/callback copy only,
// not JavaScript object overhead, the caller's chunks, or mux's cached GOPs.
export function createGopStream({ generation=1,maxWindowBytes=512*1024,maxLookaheadBytes=128*1024,
  maxPesBytes=64*1024,maxChunkBytes=64*1024,onInterval,isCurrent=()=>true }={}) {
  demand(integer(generation,1,Number.MAX_SAFE_INTEGER)&&typeof onInterval==='function'&&typeof isCurrent==='function','STREAM_OPTIONS');
  for(const [value,min,max]of[[maxWindowBytes,188,4*1024*1024],[maxLookaheadBytes,188,1024*1024],
    [maxPesBytes,32,256*1024],[maxChunkBytes,1,1024*1024]])demand(integer(value,min,max),'STREAM_LIMIT');
  const capacity=maxWindowBytes+maxLookaheadBytes;
  let arena=new Uint8Array(capacity),carry=new Uint8Array(188),counters=new Int16Array(8192).fill(-1);
  const psi=createPsiStream();const elementary=createElementaryStream();
  let topology=null,state='open',busy=false,used=0,carryBytes=0,base=0,received=0,packets=0;
  let firstEmissionOffset=null,emitted=0,peakRetained=0,peakOwned=arena.length+carry.length+counters.byteLength;
  let activeVideo=null,activeAudio=null,audioBeforeCut=0;
  const audioClosed=[];
  let failure=null;

  function observe(extra=0){
    peakRetained=Math.max(peakRetained,used+carryBytes);
    const psiBytes=psi.stats().maxRetainedEncodedBytes;
    peakOwned=Math.max(peakOwned,(arena?.byteLength||0)+(carry?.byteLength||0)+(counters?.byteLength||0)
      +elementary.stats().parameterBytes+psiBytes+(activeVideo?.prefix.byteLength||0)+(activeAudio?.prefix.byteLength||0)+extra);
  }
  function release(){arena=null;carry=null;counters=null;used=0;carryBytes=0;activeVideo=null;activeAudio=null;audioClosed.length=0;psi.abort();elementary.abort();}
  function terminate(code){if(state==='open'){state='failed';failure=code;release();}throw new Error(code);}
  function checkGeneration(){demand(state==='open','STREAM_ABORTED_DURING_CHECK');
    let current;try{current=isCurrent(generation);
      if(current&&typeof current.then==='function'){Promise.resolve(current).catch(()=>{});throw new Error('GENERATION_CHECK_FAILED');}
    }catch{throw new Error('GENERATION_CHECK_FAILED');}
    demand(state==='open','STREAM_ABORTED_DURING_CHECK');
    demand(current===true,'GENERATION_STALE');}
  function own(callback){
    demand(state==='open','STREAM_CLOSED');
    if(busy)terminate('STREAM_REENTRANT');
    busy=true;
    try{checkGeneration();return callback();}catch(error){if(state==='open'){state='failed';failure=error.message;release();}throw error;}finally{busy=false;}
  }
  function inspect(record,kind){
    // PES assembly plus a temporary SPS RBSP copy can overlap during validation.
    observe(record.bytes*2);
    const parts=record.ranges.map(([start,end])=>arena.subarray(start-base,end-base));
    const input={offset:record.offset,end:record.end,parts};
    return kind==='video'?elementary.video(input):elementary.audio(input);
  }
  function emit(end,proof,final){
    const length=end-base;
    demand(length>0&&length<=maxWindowBytes,'GOP_WINDOW_LIMIT');
    demand(used-length<=maxLookaheadBytes,'GOP_LOOKAHEAD_LIMIT');
    demand(!activeAudio||activeAudio.offset>=end,'AUDIO_PES_CROSSES_CUT_UNPROVEN');
    demand(!audioClosed.some(record=>record.offset<end&&record.end>end),'AUDIO_PES_CROSSES_CUT_UNPROVEN');
    const completed=audioClosed.filter(record=>record.end<=end);
    demand(completed.length>0&&completed.every(record=>record.offset>=base),'EACH_FRAGMENT_NEEDS_BOTH_TRACKS');
    const aacFrames=completed.reduce((count,record)=>count+record.frames,0);
    const bytes=arena.slice(0,length);
    const configuration=emitted===0?{videoTrackId:topology.videoPid,...elementary.configuration()}:null;
    observe(bytes.byteLength+(configuration?configuration.sps.byteLength+configuration.pps.byteLength:0));
    const start=base;
    checkGeneration();
    if(firstEmissionOffset===null)firstEmissionOffset=received;
    emitted++;
    let result;
    try{result=onInterval({generation,start,end,bytes,configuration,final,proof:{...proof,aacFrames}});
      if(result&&typeof result.then==='function'){
        // Drain rejection only; no acknowledgment or successful delivery is
        // inferred. Async consumers can already have their own side effects.
        Promise.resolve(result).catch(()=>{});throw new Error('ASYNC_CONSUMER_UNSUPPORTED');
      }
    }catch(error){throw new Error(error?.message==='ASYNC_CONSUMER_UNSUPPORTED'?'ASYNC_CONSUMER_UNSUPPORTED':'CONSUMER_FAILED');}
    demand(state==='open','STREAM_ABORTED_DURING_CONSUME');
    checkGeneration();
    audioBeforeCut+=aacFrames;
    audioClosed.splice(0,completed.length);
    arena.copyWithin(0,length,used);used-=length;base=end;
  }
  function closeVideo(){
    if(!activeVideo)return;
    const record=activeVideo;activeVideo=null;
    const {frame,completed}=inspect(record,'video');
    if(completed)emit(frame.offset,completed,false);
  }
  function closeAudio(){
    if(!activeAudio)return;
    const record=activeAudio;activeAudio=null;
    audioClosed.push(inspect(record,'audio'));
    demand(audioClosed.length<=4096,'AUDIO_RECORD_LIMIT');
  }
  function process(packet){
    demand(used+188<=capacity,'GOP_STORAGE_LIMIT');
    const absolute=base+used;arena.set(packet,used);used+=188;packets++;
    demand(packet[0]===0x47&&!(packet[1]&128)&&!(packet[3]&192),'TS_TRANSPORT');
    const pid=((packet[1]&31)<<8)|packet[2];const control=(packet[3]>>4)&3;
    demand(control!==0,'TS_ADAPTATION');
    let payload=4;
    if(control&2){demand(packet[4]<=183&&(control!==2||packet[4]===183),'TS_ADAPTATION');
      if(packet[4])demand(!(packet[5]&128),'TS_DISCONTINUITY_UNPROVEN');payload+=1+packet[4];}
    topology=psi.push(packet)||topology;
    if(!(control&1)){observe();return;}
    demand(payload<188,'TS_PAYLOAD');
    if(pid!==8191){const cc=packet[3]&15;demand(counters[pid]<0||cc===(counters[pid]+1)%16,'TS_CONTINUITY');counters[pid]=cc;}
    const kind=pid===topology?.videoPid?'video':pid===topology?.audioPid?'audio':null;
    if(!kind){
      demand(!(packet[1]&64&&packet[payload]===0&&packet[payload+1]===0&&packet[payload+2]===1),'UNDECLARED_OR_EARLY_PES');
      observe();return;
    }
    if(packet[1]&64){
      if(kind==='video')closeVideo();else closeAudio();
      const record={offset:absolute,end:absolute+188,bytes:0,ranges:[],prefix:new Uint8Array(6),prefixLength:0};
      if(kind==='video')activeVideo=record;else activeAudio=record;
    }
    const record=kind==='video'?activeVideo:activeAudio;
    demand(record,'PARTIAL_FIRST_PES');
    demand(record.bytes+188-payload<=maxPesBytes,'PES_STORAGE_LIMIT');
    const prefixBytes=Math.min(6-record.prefixLength,188-payload);
    record.prefix.set(packet.subarray(payload,payload+prefixBytes),record.prefixLength);record.prefixLength+=prefixBytes;
    record.ranges.push([absolute+payload,absolute+188]);record.bytes+=188-payload;record.end=absolute+188;
    // Fixed-length audio PES can be completed before the next audio PUSI.
    // This permits a GOP flush when its last audio packet is already complete.
    if(kind==='audio'&&record.bytes>=6){
      const declared=record.prefix[4]*256+record.prefix[5];
      demand(declared>0&&record.bytes<=declared+6,'PES_LENGTH');
      if(record.bytes===declared+6)closeAudio();
    }
    observe();
  }
  return {
    push(chunk){return own(()=>{
      demand(chunk instanceof Uint8Array&&chunk.length>0&&chunk.length<=maxChunkBytes,'CHUNK_LIMIT');
      demand(Number.isSafeInteger(received+chunk.length),'SOURCE_SIZE_LIMIT');
      for(let offset=0;offset<chunk.length;){
        const count=Math.min(188-carryBytes,chunk.length-offset);
        carry.set(chunk.subarray(offset,offset+count),carryBytes);carryBytes+=count;offset+=count;received+=count;
        if(carryBytes===188){process(carry);carryBytes=0;}
      }
      observe();
    });},
    finish({sourceSize}={}){return own(()=>{
      demand(integer(sourceSize,1,Number.MAX_SAFE_INTEGER)&&sourceSize===received&&!carryBytes,'EXACT_EOF_REQUIRED');
      psi.finish();closeAudio();closeVideo();
      const proof=elementary.finish();emit(received,proof,true);
      state='finished';release();
    });},
    abort(){if(state==='open'){state='aborted';failure='ABORTED';release();}},
    stats(){return {state,failure,generation,received,packets,emittedIntervals:emitted,firstEmissionOffset,
      retainedBytes:used+carryBytes,peakRetainedBytes:peakRetained,peakOwnedByteStorage:peakOwned,
      storageCapacity:capacity,emittedAacFrames:audioBeforeCut,elementary:elementary.stats(),psi:psi.stats(),
      scope:'owner raw byte arrays/scratch plus bounded encoded PSI accounting; excludes JS heap/object overhead, caller/output retention and mux allocations'};}
  };
}
