'use strict';
const vm=require('node:vm');
const select=require('../player-track-selection/android-native-select.cjs');

function calibrate({xml,expected='내 드라이브',screenWidth,screenHeight,dom,dpr,viewportHeight}){
 if(!Number.isSafeInteger(screenWidth)||!Number.isSafeInteger(screenHeight)||screenWidth<1||screenHeight<1)throw Error('GEOMETRY_SCREEN');
 if(!Number.isFinite(dpr)||dpr<=0||!Number.isFinite(viewportHeight)||viewportHeight<=0)throw Error('GEOMETRY_VIEWPORT');
 if(!dom||dom.matches!==1||![dom.left,dom.top,dom.width,dom.height].every(Number.isFinite)||dom.width<=0||dom.height<=0)throw Error('GEOMETRY_DOM_TARGET');
 const native=select.target(xml,expected,screenWidth,screenHeight);
 if(!native.available)throw Error('GEOMETRY_NATIVE_TARGET');
 const scaled={left:dom.left*dpr,width:dom.width*dpr,height:dom.height*dpr};
 const tolerance=4;
 if(Math.abs(native.left-scaled.left)>tolerance||Math.abs((native.right-native.left)-scaled.width)>tolerance||Math.abs((native.bottom-native.top)-scaled.height)>tolerance)throw Error('GEOMETRY_SCALE_MISMATCH');
 const contentOriginY=native.top-dom.top*dpr;
 if(!Number.isFinite(contentOriginY)||contentOriginY<=0||contentOriginY>160)throw Error('GEOMETRY_ORIGIN_OUT_OF_BOUNDS');
 const bottomGapPx=screenHeight-contentOriginY-viewportHeight*dpr;
 if(!Number.isFinite(bottomGapPx)||bottomGapPx<0||bottomGapPx>160)throw Error('GEOMETRY_GAP_OUT_OF_BOUNDS');
 const tap={x:native.x,y:native.y};
 const domPoint={x:tap.x/dpr,y:(tap.y-contentOriginY)/dpr};
 if(domPoint.x<dom.left||domPoint.x>dom.left+dom.width||domPoint.y<dom.top||domPoint.y>dom.top+dom.height)throw Error('GEOMETRY_POINT_OUT_OF_BOUNDS');
 return{native,screen:{width:screenWidth,height:screenHeight},dpr,viewportHeight,contentOriginY,bottomGapPx,tap,domPoint,tolerancePx:tolerance,rawXmlOrLabelsExported:false};
}

function adjudicate({calibration,event,post,pre}){
 if(!calibration||!event||event.isTrusted!==true||event.exactCurrentTarget!==true)throw Error('GEOMETRY_UNTRUSTED_INPUT');
 if(![event.clientX,event.clientY].every(Number.isFinite)||event.clientX<0||event.clientY<0)throw Error('GEOMETRY_EVENT_COORDINATE');
 const d=calibration.domPoint;
 if(Math.abs(event.clientX-d.x)>8||Math.abs(event.clientY-d.y)>8)throw Error('GEOMETRY_EVENT_MISMATCH');
 if(!pre||!post||post.root!==pre.root||post.query!==pre.query||post.scrollY!==pre.scrollY||post.closed!==pre.closed||post.ownerIdle!==true||pre.ownerIdle!==true)throw Error('GEOMETRY_POSTSTATE_CHANGED');
 return{trustedClick:true,exactCurrentTarget:true,eventMatchesNativeCenter:true,prestatePreserved:true};
}

function browserExpressions(expected,key){
 const label=JSON.stringify(expected),slot=JSON.stringify(key);
 return{
  prestate:`()=>{const buttons=[...document.querySelectorAll('#folderNav button')],matches=buttons.filter(b=>b.innerText.trim()===${label}),r=matches.length===1?matches[0].getBoundingClientRect():null;const accountIdle=!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&!state.accountStateLoadingPromise&&!state.accountIdentityPending&&state.accountStateLoaded&&hasUsableToken()&&state.authStatus==='online';const closed=!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner&&q1RetirementResult?.settled===true;const ownerIdle=accountIdle&&closed&&!state.loadingFiles&&!state.loadingFavorites&&!state.loadingTree&&!state.pendingPlay;return{origin:location.origin,version:APP_VERSION,library:!el.libraryView.hidden,root:state.currentFolderId==='root',query:el.searchInput.value,scrollY:window.scrollY,closed:el.playerSheet.hidden&&closed,ownerIdle,accountIdle,activeOwners:{selected:!!state.selected,q0:!!q0Playback,q1:!!q1Playback,tracks:!!playerTracksOwner,retirementSettled:q1RetirementResult?.settled===true,loads:!!(state.loadingFiles||state.loadingFavorites||state.loadingTree),pendingPlay:!!state.pendingPlay},width:innerWidth,height:innerHeight,dpr:devicePixelRatio,chrome:navigator.userAgent.split('Chrome/')[1]?.split(' ')[0]||null,target:{matches:matches.length,...r?{left:r.left,top:r.top,width:r.width,height:r.height,enabled:!matches[0].disabled,visible:r.width>0&&r.height>0}:{}}};}`,
  observer:`()=>{const matches=[...document.querySelectorAll('#folderNav button')].filter(b=>b.innerText.trim()===${label});if(matches.length!==1)throw Error('GEOMETRY_TARGET_DRIFT');const key=${slot},button=matches[0];if(window[key])throw Error('GEOMETRY_LISTENER_COLLISION');const holder={button,event:null,listener:null,priorScrollY:window.scrollY};holder.listener=e=>{if(!holder.event)holder.event={isTrusted:e.isTrusted===true,exactCurrentTarget:e.currentTarget===button,clientX:e.clientX,clientY:e.clientY};};button.addEventListener('click',holder.listener,{capture:true,passive:true});window[key]=holder;return{listenerInstalled:true,targetCount:1};}`,
  readEvent:`()=>{const h=window[${slot}];return h?.event||null;}`,
  cleanup:`()=>{const key=${slot},h=window[key];if(!h)return{listenerRemoved:true,scrollRestored:true};h.button.removeEventListener('click',h.listener,{capture:true});delete window[key];const before=window.scrollY;if(before!==h.priorScrollY)window.scrollTo(window.scrollX,h.priorScrollY);return{listenerRemoved:true,scrollRestored:window.scrollY===h.priorScrollY};}`
 };
}
function compileBrowserExpressions(expressions){for(const [name,expression]of Object.entries(expressions)){try{new vm.Script('('+expression+')');}catch{throw Error('GEOMETRY_EXPRESSION_INVALID_'+name.toUpperCase());}}return true;}
function parsePhysicalScreen(text){const m=/^Physical size: (\d+)x(\d+)$/.exec(String(text));if(!m)throw Error('GEOMETRY_SCREEN_UNKNOWN');const width=Number(m[1]),height=Number(m[2]);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error('GEOMETRY_SCREEN_UNKNOWN');return{width,height};}

module.exports={calibrate,adjudicate,browserExpressions,compileBrowserExpressions,parsePhysicalScreen};
