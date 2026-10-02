'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pinned=(file,sha)=>{const b=fs.readFileSync(file);if(hash(b)!==sha)throw Error('UPDATE_PRODUCER_PIN');return b.toString();};
const old=path.resolve(__dirname,'../rc32-ts-device-replay/android-common.cjs');
const source=pinned(old,'c6822041c663495142b71356db26caed3270722dafa6d37a449713a659cc1286');
const baseline=pinned(path.join(__dirname,'android-baseline.expression.js'),'01bee3d8aa976d913537372c96503a630e878a84e5dc8b44176d6ef223e4dbab');
const proof=pinned(path.join(__dirname,'android-proof.expression.js'),'ac4972b68ccc16e0e178f4e721ed70d714cb479bcd4240d097b805fcdb78fb37');
const needle="safe.version!=='1.22.0-rc.32'";
if(source.split(needle).length!==2)throw Error('ADMISSION_DERIVATION');
const m=new Module(old,module);m.filename=old;m.paths=Module._nodeModulePaths(path.dirname(old));
m._compile(source.replace("const context={report,","const context={report,setNormalForceFlag:async()=>{try{await nativeSession.send('ServiceWorker.setForceUpdateOnPageLoad',{forceUpdateOnPageLoad:false});}catch{throw Error('NORMAL_FORCE_FLAG_UNSUPPORTED');}return{acknowledged:true,forceUpdateOnPageLoad:false}},").replace(needle,"safe.version!=='1.22.0-rc.35'"),old);
if(process.argv[2]!=='--execute-once'||process.argv[3]!=='d3f78f321a804f582668dde1b7cd3e0f949b24c9')throw Error('EXPLICIT_EXECUTE_REQUIRED');
const output='../candidate-rc36-delivery/android-update-actual-result.json';
if(fs.existsSync(path.resolve(path.dirname(old),output)))throw Error('NO_OVERWRITE');
const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'android-binding.json'))),readiness=JSON.parse(fs.readFileSync(path.join(__dirname,'source-readiness.json')));if(!readiness.passed||readiness.sourceCommit!=='d3f78f321a804f582668dde1b7cd3e0f949b24c9'||readiness.version!=='1.22.0-rc.36'||readiness.cacheAssets!==50||!/^[a-f0-9-]{36}$/.test(readiness.workerVersion||'')||!Object.entries(binding.sourceSHA256).every(([file,sha])=>(readiness.fixedSourceAssetBindings||[]).some(row=>row.file===file&&row.sha256===sha)))throw Error('VERIFIED_DELIVERY_GO_REQUIRED');
m.exports(__filename,output,async c=>{
 let armed=false,clicked=false,ownsProof=false;
 const deadline=Date.now()+120000;
 const within=()=>{if(Date.now()>deadline)throw Error('UPDATE_UNIT_DEADLINE');};
 try{
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();c.step('normal debugger force flag acknowledged BEFORE admission',await c.setNormalForceFlag());if(c.report.model!=='SM-X800')throw Error('ACTUAL_DEVICE_MODEL');
  const admission=await c.evaluateNative(`async()=>{
   const reg=await navigator.serviceWorker.getRegistration(),controller=navigator.serviceWorker.controller;
   const b=el.bannerUpdateButton,r=b?.getBoundingClientRect(),x=r?.x+r?.width/2,y=r?.y+r?.height/2;
   const target=el.updateBannerText?.textContent?.match(/v?(\\d+\\.\\d+\\.\\d+(?:-rc\\.\\d+)?)/)?.[1]||null;
   const hit=Number.isFinite(x)&&Number.isFinite(y)&&document.elementFromPoint(x,y)?.closest('#bannerUpdateButton')===b;
   const ready=APP_VERSION==='1.22.0-rc.35'&&target==='1.22.0-rc.36'&&!el.updateBanner.hidden&&!b?.disabled&&!!r&&r.width>0&&r.height>0&&hit&&x>0&&x<innerWidth&&y>0&&y<innerHeight&&document.visibilityState==='visible'&&!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner)&&q1RetirementResult?.settled===true&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountIdentityPending&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&controller?.state==='activated'&&reg?.active===controller&&!reg.waiting&&!reg.installing&&!window.__resumeSwProof&&!window.__androidTracksObserver&&!window.__qaRc35AndroidUpdate&&!window.__qaRc36AndroidUpdate&&!localStorage.getItem('drive-original.qa.rc36-android-update-baseline');
   return {ready,version:APP_VERSION,targetVersion:target,nativeButtonHit:hit,x,y,dpr:devicePixelRatio,viewportHeight:innerHeight,rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim()};
  }`);
  c.step('fresh native update admission',admission);if(!admission.ready)throw Error('UPDATE_ADMISSION');
  const height=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);
  if(![height,admission.x,admission.y,admission.dpr,admission.viewportHeight].every(Number.isFinite))throw Error('UPDATE_NATIVE_GEOMETRY');
  within();c.step('hashed baseline installed',await c.evaluateNative(`async()=>await (${baseline})`));armed=true;
  c.adb(['shell','input','tap',String(Math.round(admission.x*admission.dpr)),String(Math.round(height-admission.viewportHeight*admission.dpr+admission.y*admission.dpr))]);clicked=true;c.step('single ordinary native tap',{issued:true});
  let ready=null;const end=Math.min(deadline,Date.now()+60000);
  do{
   await c.wait(500);try{ready=await c.evaluateNative(`()=>({version:typeof APP_VERSION==='undefined'?null:APP_VERSION,ready:typeof APP_VERSION!=='undefined'&&APP_VERSION==='1.22.0-rc.36'&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner)&&q1RetirementResult?.settled===true&&document.visibilityState==='visible',foreignProof:!!window.__resumeSwProof})`);}catch{ready=null;}
  }while(!ready?.ready&&Date.now()<end);
  c.step('post reload readiness',ready||{ready:false});if(!ready?.ready)throw Error('UPDATE_RELOAD_READINESS');if(ready.foreignProof)throw Error('UPDATE_FOREIGN_SOURCE_PROOF');
  within();ownsProof=true;const result=await c.evaluateNative(`async()=>await (${proof})`);
  c.step('source cache and preservation proof',result);
  const p=result.preserved;
  if(!p||!['account','accountKey','writer','projection','cache','playerClosed'].every(k=>p[k]===true)||!Number.isFinite(p.clickedAt)||!Number.isFinite(p.pagehideAt)||p.pagehideAt<p.clickedAt||result.matchedCache!==50||result.matchedCacheAliases!==51||result.network.length!==6||!result.network.every(r=>r.matched))throw Error('UPDATE_PRESERVATION_OR_SOURCE');
  const final=await c.evaluateNative(`()=>({version:APP_VERSION,bannerHidden:el.updateBanner.hidden,applyUpdateHidden:el.applyUpdateButton.hidden,closed:!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner),rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim(),online:state.authStatus==='online',accountReady:!!state.accountStateLoaded&&hasUsableToken(),accountIdle:!state.accountIdentityPending&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer,retirementSettled:q1RetirementResult?.settled===true,controllerActivated:navigator.serviceWorker.controller?.state==='activated'})`);
  c.step('final update state',final);if(final.version!=='1.22.0-rc.36'||!final.bannerHidden||!final.closed||!final.online||!final.accountReady||!final.accountIdle||!final.retirementSettled||!final.controllerActivated)throw Error('UPDATE_FINAL_STATE');
 }finally{
  try{const cleanup=await c.evaluateNative(`()=>{let listenersRemoved=true;if(window.__qaRc36AndroidUpdate)window.__qaRc36AndroidUpdate.stop();else localStorage.removeItem('drive-original.qa.rc36-android-update-baseline');const proof=${ownsProof?'true':'false'};if(proof&&window.__resumeSwProof?.get?.()?.sourceCommit==='d3f78f321a804f582668dde1b7cd3e0f949b24c9')delete window.__resumeSwProof;return {ownedBaselineAbsent:!localStorage.getItem('drive-original.qa.rc36-android-update-baseline'),ownedListenersAbsent:!window.__qaRc36AndroidUpdate,ownedSourceProofRemoved:!proof||!window.__resumeSwProof,tabClosed:false};}`);c.step('owned update cleanup',cleanup);if(!cleanup.ownedBaselineAbsent||!cleanup.ownedListenersAbsent||!cleanup.ownedSourceProofRemoved)throw Error('UPDATE_OWNED_CLEANUP_UNCONFIRMED');}
  catch{c.step('owned update cleanup',{confirmed:false,baselineWasArmed:armed,nativeTapIssued:clicked});throw Error('UPDATE_OWNED_CLEANUP_UNCONFIRMED');}
 }
});
