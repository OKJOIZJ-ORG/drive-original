import { prepareTsSeekInput } from './seek-input.mjs';
import { createPsiStream } from './psi-stream.mjs';

const PACKET=188,CHUNK=65536;
class BootstrapError extends Error {}
const demand=(value,code)=>{if(!value)throw new BootstrapError(code);};
const safe=value=>Number.isSafeInteger(value)&&value>=0;
const pidOf=packet=>((packet[1]&31)<<8)|packet[2];
const payloadOf=packet=>4+(packet[3]&32?1+packet[4]:0);

// QA-only continuous suffix bootstrap. Source identity/range ownership remains
// with the reader. Original positions and the prefixed virtual output position
// are distinct. Every packet after each selected PES start is preserved except
// its continuity nibble; pre-start elementary/PSI packets become null packets.
// No PCR/PES/payload/media timestamp is rewritten. Future elementary semantics
// and bounded GOP admission belong to the downstream gop-stream/session owner.
// push accepts <=64KiB, arbitrary splits and exact original source offsets.
// It returns caller-owned bytes; finish returns stats, never additional bytes.
// Retained-byte stats exclude caller/output arrays and JS object overhead.
export function createSeekBootstrap(options={}) {
  try{return createOwner(configuration(options));}
  catch(error){throw new Error(error instanceof BootstrapError?error.message:'BOOTSTRAP_OPTIONS');}
}

function configuration({generation=1,headBytes,bytes,offset,plan,isCurrent=()=>true}) {
  demand(safe(generation)&&generation>0&&typeof isCurrent==='function','BOOTSTRAP_OPTIONS');
  let prepared;
  try{prepared=prepareTsSeekInput({headBytes,bytes,offset,plan});}
  catch{throw new BootstrapError('BOOTSTRAP_INPUT');}
  const topology={...plan.topology},sourceSize=plan.sourceSize;
  const prefix=prepared.bytes.slice(0,prepared.source.bootstrapPackets*PACKET);
  demand(prefix.length>0&&prefix.length<=16384,'BOOTSTRAP_PREFIX_LIMIT');
  const starts=['video','audio'].map(kind=>prepared.source.ranges.find(row=>row.kind===kind));
  demand(starts.every(Boolean),'BOOTSTRAP_INPUT');
  const readStart=Math.min(...starts.map(row=>row.offset)),outputSize=prefix.length+sourceSize-readStart;
  demand(safe(outputSize)&&outputSize>0,'BOOTSTRAP_SIZE');
  function binding(row){
    const payload=new Uint8Array(row.bytes);let used=0;
    for(let position=row.offset;position<row.end;position+=PACKET){
      const packet=bytes.subarray(position-offset,position-offset+PACKET);
      if(pidOf(packet)!==row.pid||!(packet[3]&16))continue;
      const part=packet.subarray(payloadOf(packet));payload.set(part,used);used+=part.length;
    }
    demand(used===payload.length&&used>0&&used<=65536,'BOOTSTRAP_BINDING');
    return {pid:row.pid,start:row.offset,end:row.end,bytes:payload,matched:0,started:false};
  }
  return {generation,isCurrent,topology,sourceSize,prefix,readStart,outputSize,
    videoBinding:binding(starts[0]),audioBinding:binding(starts[1])};
}

function createOwner(configuration) {
  const {generation,isCurrent,topology,sourceSize,readStart,outputSize}=configuration;
  let {prefix,videoBinding,audioBinding}=configuration;configuration=null;
  const starts=new Map([[topology.videoPid,videoBinding.start],[topology.audioPid,audioBinding.start]]);
  const allowed=new Set([0,17,8191,topology.pmtPid,topology.videoPid,topology.audioPid]);
  const rawCounters=new Map(),outputCounters=new Map(),psiStarted=new Set();
  let psi=createPsiStream(),carry=new Uint8Array(PACKET),carryBytes=0;
  let state='open',failure=null,busy=false,prefixSent=false,sourceOffset=readStart,outputBytes=0;
  let packets=0,nulledPackets=0,peakRetainedBytes=0;
  const sameTopology=value=>value&&Object.keys(topology).every(key=>value[key]===topology[key]);
  function normalize(packet){
    const pid=pidOf(packet),previous=outputCounters.get(pid);
    const next=previous===undefined?0:(previous+(packet[3]&16?1:0))%16;
    packet[3]=(packet[3]&240)|next;outputCounters.set(pid,next);
  }
  for(let i=0;i<prefix.length;i+=PACKET){
    const packet=prefix.subarray(i,i+PACKET);normalize(packet);
    const result=psi.push(packet);if(result)demand(sameTopology(result),'BOOTSTRAP_TOPOLOGY');
  }
  function retained(){return (prefix?.byteLength||0)+(carry?.byteLength||0)
    +(videoBinding?.bytes.byteLength||0)+(audioBinding?.bytes.byteLength||0)+(psi?.stats().retainedBytes||0);}
  function observe(){peakRetainedBytes=Math.max(peakRetainedBytes,retained());}
  function release(){prefix=null;carry=null;carryBytes=0;videoBinding=null;audioBinding=null;
    psi?.abort();psi=null;rawCounters.clear();outputCounters.clear();psiStarted.clear();}
  function stop(code){if(state==='open'){state='failed';failure=code;release();}throw new BootstrapError(code);}
  function check(){
    demand(state==='open','BOOTSTRAP_CLOSED');
    let current;
    try{current=isCurrent(generation);
      if(current&&typeof current.then==='function'){Promise.resolve(current).catch(()=>{});throw new Error();}
    }catch{throw new BootstrapError('BOOTSTRAP_CURRENT_CHECK');}
    demand(state==='open','BOOTSTRAP_CLOSED');demand(current===true,'BOOTSTRAP_STALE');
  }
  function own(operation){
    demand(state==='open','BOOTSTRAP_CLOSED');if(busy)stop('BOOTSTRAP_REENTRANT');busy=true;
    try{check();const result=operation();check();return result;}
    catch(error){const code=error instanceof BootstrapError?error.message:'BOOTSTRAP_INVALID';
      if(state==='open'){state='failed';failure=code;release();}throw new Error(code);
    }finally{busy=false;}
  }
  function transport(packet){
    demand(packet[0]===71&&!(packet[1]&128)&&!(packet[3]&192),'BOOTSTRAP_TRANSPORT');
    const pid=pidOf(packet),control=(packet[3]>>4)&3;
    demand(allowed.has(pid),'BOOTSTRAP_EXTRA_PID');demand(control!==0,'BOOTSTRAP_ADAPTATION');
    let payload=4;
    if(control&2){
      const length=packet[4];demand(length<=(control===2?183:182)&&(control!==2||length===183),'BOOTSTRAP_ADAPTATION');
      payload=5+length;
      if(length){
        const flags=packet[5];demand(!(flags&128),'BOOTSTRAP_DISCONTINUITY');
        demand(!(flags&16)||pid===topology.pcrPid,'BOOTSTRAP_PCR_PID');
        let cursor=6;
        for(const [flag,count] of [[16,6],[8,6],[4,1]])if(flags&flag)cursor+=count;
        demand(cursor<=payload,'BOOTSTRAP_ADAPTATION');
        for(const flag of [2,1])if(flags&flag){demand(cursor<payload,'BOOTSTRAP_ADAPTATION');
          cursor+=1+packet[cursor];demand(cursor<=payload,'BOOTSTRAP_ADAPTATION');}
      }
    }
    if(pid!==8191){const cc=packet[3]&15,previous=rawCounters.get(pid);
      demand(previous===undefined||cc===(previous+(control&1?1:0))%16,'BOOTSTRAP_CONTINUITY');rawCounters.set(pid,cc);}
    if((control&1)&&!starts.has(pid)&&(packet[1]&64))
      demand(!(packet[payload]===0&&packet[payload+1]===0&&packet[payload+2]===1),'BOOTSTRAP_EXTRA_PES');
    return {pid,hasPayload:Boolean(control&1),payload,start:Boolean(packet[1]&64)};
  }
  function bind(record,packet,position,info){
    if(!record||position<record.start)return record;
    if(position===record.start){demand(info.hasPayload&&info.start,'BOOTSTRAP_START');record.started=true;}
    demand(record.started&&position<record.end,'BOOTSTRAP_BINDING');
    if(info.hasPayload){
      demand(info.start===(position===record.start),'BOOTSTRAP_START');
      const part=packet.subarray(info.payload);
      demand(record.matched+part.length<=record.bytes.length&&part.every((value,i)=>value===record.bytes[record.matched+i]),'BOOTSTRAP_BINDING');
      record.matched+=part.length;
    }
    if(position+PACKET===record.end){demand(record.matched===record.bytes.length,'BOOTSTRAP_BINDING');return null;}
    return record;
  }
  function transform(packet,position){
    const info=transport(packet),{pid,hasPayload,start}=info;packets++;
    if(pid===topology.videoPid)videoBinding=bind(videoBinding,packet,position,info);
    if(pid===topology.audioPid)audioBinding=bind(audioBinding,packet,position,info);
    let replace=starts.has(pid)&&position<starts.get(pid);
    if(pid===0||pid===topology.pmtPid){
      if(hasPayload&&start)psiStarted.add(pid);
      replace=!psiStarted.has(pid);
    }
    if(replace){packet.fill(255);packet.set([71,31,255,16]);nulledPackets++;}
    normalize(packet);
    try{const next=psi.push(packet);if(next)demand(sameTopology(next),'BOOTSTRAP_TOPOLOGY');}
    catch(error){if(error instanceof BootstrapError)throw error;throw new BootstrapError('BOOTSTRAP_PSI');}
  }
  observe();
  const stats=()=>({state,failure,generation,readStart,sourceSize,sourceOffset,sourceReceived:sourceOffset-readStart,
    outputSize,outputBytes,packets,nulledPackets,carryBytes,prefixBytes:prefix?.byteLength||0,
    bindingBytes:(videoBinding?.bytes.byteLength||0)+(audioBinding?.bytes.byteLength||0),
    psiRetainedBytes:psi?.stats().retainedBytes||0,retainedBytes:retained(),peakRetainedBytes,
    maxPushOutputBytes:CHUNK+187+16384,
    scope:'bounded owned byte arrays/PSI only; excludes caller/output arrays, JS heap and downstream mux/decoder; no source identity or decode proof'});
  return Object.freeze({readStart,outputSize,
    push(chunk,request={}){const result=own(()=>{
      demand(request.generation===generation,'BOOTSTRAP_STALE');
      demand(chunk instanceof Uint8Array&&chunk.length>0&&chunk.length<=CHUNK,'BOOTSTRAP_CHUNK');
      demand(request.offset===sourceOffset&&safe(request.offset)&&sourceOffset+chunk.length<=sourceSize,'BOOTSTRAP_OFFSET');
      const prefixLength=prefixSent?0:prefix.length;
      const result=new Uint8Array(prefixLength+Math.floor((carryBytes+chunk.length)/PACKET)*PACKET);
      if(!prefixSent){result.set(prefix);prefixSent=true;prefix=null;}
      let output=prefixLength;
      for(let i=0;i<chunk.length;){
        const count=Math.min(PACKET-carryBytes,chunk.length-i);
        carry.set(chunk.subarray(i,i+count),carryBytes);carryBytes+=count;sourceOffset+=count;i+=count;
        if(carryBytes===PACKET){transform(carry,sourceOffset-PACKET);result.set(carry,output);output+=PACKET;carryBytes=0;}
      }
      observe();return result;
    });outputBytes+=result.length;return result;},
    finish(request={}){
      own(()=>{demand(request.generation===generation,'BOOTSTRAP_STALE');
        demand(request.sourceSize===sourceSize&&sourceOffset===sourceSize&&!carryBytes&&prefixSent
          &&outputBytes===outputSize&&!videoBinding&&!audioBinding,'BOOTSTRAP_EOF');
        try{demand(sameTopology(psi.finish()),'BOOTSTRAP_TOPOLOGY');}
        catch(error){if(error instanceof BootstrapError)throw error;throw new BootstrapError('BOOTSTRAP_PSI');}
      });
      state='finished';release();return stats();
    },
    abort(){if(state==='open'){state='aborted';failure='BOOTSTRAP_ABORTED';release();}},stats,
  });
}
