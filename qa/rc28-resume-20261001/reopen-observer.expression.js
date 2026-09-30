(()=>{'use strict';
if(window.__resumeReopen||APP_VERSION!=='1.22.0-rc.28'||!window.__resumeSwProof?.get?.()||state.selected||q0Playback||q1Playback||q1RetirementResult?.settled!==true)throw Error('QA_CURRENT_CLOSED_SOURCE_REQUIRED');
const video=document.getElementById('videoPlayer'),account=state.authAccountKey,controller=navigator.serviceWorker.controller;
if(!video||typeof video.requestVideoFrameCallback!=='function'||state.authStatus!=='online')throw Error('QA_NATIVE_FRAME_REQUIRED');
let stopped=false,handle=null,target=null,openedAt=null,deadline=null,frameCount=0,first=null,last=null,failure=null;
const clicks={open:0,close:0,pauseControl:0},source='944f00607cf05e586b1c88e2876dd796ce114e82';
const current=()=>APP_VERSION==='1.22.0-rc.28'&&state.authAccountKey===account&&state.authStatus==='online'&&navigator.serviceWorker.controller===controller&&window.__resumeSwProof?.get?.()?.controller===controller;
const route=()=>q0Playback?'Q0':q1Playback?'Q1':'native-or-other';
const frame=(at,meta)=>{handle=null;if(stopped||first&&frameCount>=24)return;if(!current()){failure='OWNER_CHANGED';return;}
  if(openedAt&&state.selected){if(!target)target=state.selected.id;if(target!==state.selected.id){failure='TARGET_CHANGED';return;}
    if(Number.isFinite(meta.mediaTime)&&meta.width>0&&meta.height>0){frameCount++;const safe={at:Date.now(),elapsedMs:Math.round(performance.now()-openedAt),mediaTime:meta.mediaTime,width:meta.width,height:meta.height,presentedFrames:meta.presentedFrames,route:route(),selectedMime:state.selected.mimeType};if(!first)first=safe;last=safe;}}
  if(!stopped&&frameCount<24)handle=video.requestVideoFrameCallback(frame);
};
const click=e=>{if(!e.isTrusted||stopped)return;
  if(e.target?.closest?.('.file-card-open')){clicks.open++;if(openedAt===null){openedAt=performance.now();deadline=setTimeout(()=>{if(!first)failure='FIRST_FRAME_60S_TIMEOUT';},60000);}}
  if(e.target?.closest?.('#closePlayerButton'))clicks.close++;
  if(e.target?.closest?.('#ctrlPlayPause'))clicks.pauseControl++;
};
document.addEventListener('click',click,true);handle=video.requestVideoFrameCallback(frame);
const read=()=>({schema:'drive-original.actual-force28-reopen/1',source,version:APP_VERSION,clicks:{...clicks},opened:openedAt!==null,frameCount,first,last,failure,ownerCurrent:current(),closed:!state.selected&&!q0Playback&&!q1Playback,retirementSettled:q1RetirementResult?.settled===true,mediaBlobAbsent:state.mediaBlobUrl===null,abortAbsent:state.mediaAbortController===null,privateTargetExported:false});
window.__resumeReopen={read,clear(){const before=read();stopped=true;clearTimeout(deadline);if(handle!==null)video.cancelVideoFrameCallback(handle);document.removeEventListener('click',click,true);return{before,released:true,listenersAfter:0,callbackRemoved:true};}};
return {armed:true,networkRequests:0,canonicalWritesByObserver:0};})()
