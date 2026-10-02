'use strict';
// Join an existing product promise only. Do not open another source or change playback.
async function joinSetup(timeoutMs){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>25000)throw Error('Q0_SETUP_WAIT_BOUND');
 const owner=q0Playback,source=mediaSourceGeneration,fileId=state.selected?.id,controller=navigator.serviceWorker.controller;
 const current=()=>owner&&q0Playback===owner&&!q1Playback&&isCurrentQ0Playback(owner,fileId,source)&&source===mediaSourceGeneration&&controller===navigator.serviceWorker.controller&&document.visibilityState==='visible';
 if(!current()||!owner.audioProbeStarted||!owner.setupDone||typeof owner.setupDone.then!=='function')return{qualified:false,reason:'Q0_SETUP_ADMISSION',sourceOrPlaybackMutated:false};
 let timer;try{
  const result=await Promise.race([owner.setupDone.then(()=>({settled:true}),()=>({settled:false,rejected:true})),new Promise(resolve=>{timer=setTimeout(()=>resolve({settled:false,deadline:true}),timeoutMs);})]);
  const stillCurrent=current(),cleanupOk=owner.cleanupOk!==false;
  return{...result,sameCurrentQ0:stillCurrent,cleanupOk,qualified:result.settled===true&&stillCurrent&&cleanupOk,maxMs:timeoutMs,sourceOrPlaybackMutated:false};
 }finally{clearTimeout(timer);}
}
module.exports={joinSetup};
