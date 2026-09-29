import {openDriveQ1Source} from '/media/drive-source.mjs';
import {createGeneralPlayer} from '/media/general-player.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(x,s)=>{if(!x)throw Error(s);};
window.runGeneral=async function(name,{longPause=false,immediateCancel=false}={}){
 const video=document.querySelector('video');let alive=true,opens=0,activeSources=0,peakSources=0,aborts=0;const events=[];
 const player=createGeneralPlayer({video,isCurrent:()=>alive,onEvent:e=>events.push(e),openSource:async({signal})=>{
  opens++;activeSources++;peakSources=Math.max(peakSources,activeSources);
  const s=await openDriveQ1Source({fileId:name,accountKey:'general-local-fixture',accountGeneration:1,isCurrent:()=>alive,signal,readMetadata:async()=> (await fetch('/fixture/'+name+'/metadata')).json(),readRange:({start,end,signal})=>fetch('/fixture/'+name+'/range',{signal,headers:{Range:`bytes=${start}-${end}`}})});
  let closed;return{get identity(){return s.identity;},read:r=>s.read(r),abort:()=>closed||=(async()=>{const r=await s.abort();activeSources--;aborts++;return r;})()};
 }});
 const observations=[];let cleanup,error;
 try{
  if(immediateCancel){cleanup=await player.dispose();return{passed:cleanup.settled,immediateCancel,cleanup,opens,aborts,peakSources};}
  const map=await player.ready;observations.push({stage:'ready',map,stats:structuredClone(player.stats())});
  if(longPause){for(let i=0;i<100&&player.stats().waits===0;i++)await sleep(50);assert(player.stats().waits>0,'NO_HYSTERESIS_WAIT');const before=structuredClone(player.stats());await sleep(31000);assert(!player.stats().failure,'PAUSE_TIMEOUT');observations.push({stage:'paused31seconds',before,after:structuredClone(player.stats())});video.playbackRate=16;await video.play();for(let i=0;i<240&&player.sourceTime()<map.sourceOrigin+75;i++)await sleep(50);video.pause();video.playbackRate=1;assert(player.stats().removals>0&&!player.stats().failure,'HYSTERESIS_REMOVE');observations.push({stage:'resumedAndEvicted',time:player.sourceTime(),stats:structuredClone(player.stats())});}
  for(const target of [map.sourceOrigin+.2,map.sourceOrigin+(map.sourceEnd-map.sourceOrigin)*.5,map.sourceEnd-.7]){
   const m=await player.seek(target,{autoplay:false});assert(Math.abs(player.sourceTime()-m.targetSource)<.03,'SOURCE_CLOCK_TARGET');let frame;const presented=new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('FRAME_TIMEOUT')),5000);video.requestVideoFrameCallback((_,f)=>{clearTimeout(timer);frame=f;r();});});await video.play();await presented;video.pause();assert(video.videoWidth>0&&!video.error,'NATIVE_DECODE');observations.push({stage:'seek',target,mapping:m,frame:{mediaTime:frame.mediaTime,presentedFrames:frame.presentedFrames},stats:structuredClone(player.stats())});
  }
 }catch(e){error=e.stack;}finally{cleanup=await player.dispose();alive=false;}
 return{passed:!error&&cleanup.settled&&peakSources===1&&opens===aborts,error,cleanup,observations,events,opens,aborts,peakSources};
};
window.runGeneralFaults=async()=>{
 const video=document.querySelector('video'),rows=[];
 {let opens=0;const p=createGeneralPlayer({video,isCurrent:()=>true,openSource:async()=>{opens++;const e=Error('PRIVATE');e.cleanup={settled:false};throw e;}});let first,second;try{await p.ready;}catch(e){first=e.message;}await p.completion();try{await p.seek(1);}catch(e){second=e.message;}const cleanup=await p.dispose();rows.push({kind:'failedOpenUnsettled',passed:opens===1&&second==='GENERAL_CLEANUP_UNCONFIRMED'&&!cleanup.settled,opens,first,second,cleanup});}
 {let opens=0,aborts=0;const p=createGeneralPlayer({video,isCurrent:()=>true,openSource:async({signal})=>{opens++;const s=await openDriveQ1Source({fileId:'seed',accountKey:'fixture',accountGeneration:1,isCurrent:()=>true,signal,readMetadata:async()=>{const m=await(await fetch('/fixture/seed/metadata')).json();if(opens>1)m.modifiedTime='2026-09-30T00:00:00Z';return m;},readRange:({start,end,signal})=>fetch('/fixture/seed/range',{signal,headers:{Range:`bytes=${start}-${end}`}})});let done;return{get identity(){return s.identity;},read:r=>s.read(r),abort:()=>done||=(async()=>{aborts++;return s.abort();})()};}});await p.ready;let code;try{await p.seek(2);}catch(e){code=e.message;}const cleanup=await p.dispose();rows.push({kind:'identityChangedOnSeek',passed:code==='GENERAL_CONTENT_CHANGED'&&opens===2&&aborts===2&&cleanup.settled,opens,aborts,code,cleanup});}
 return rows;
};
