'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pinned=(file,sha)=>{const b=fs.readFileSync(file);if(hash(b)!==sha)throw Error('UPDATE_PRODUCER_PIN');return b.toString();};
const old=path.resolve(__dirname,'../rc32-ts-device-replay/android-common.cjs');
const source=pinned(old,'c6822041c663495142b71356db26caed3270722dafa6d37a449713a659cc1286');
const baseline=pinned(path.join(__dirname,'android-update-baseline.expression.js'),'44c85a725ed14255f1a8f00c1d6bd51a249bf6159122ff2ca43ce247cdd7d0bd');
const proof=pinned(path.join(__dirname,'android-update-source-proof.expression.js'),'b3083590371fa99d7fbb95449fa16e09ca70a2ffd26568c1c13464720aa30ba7');
const needle="safe.version!=='1.22.0-rc.32'";
if(source.split(needle).length!==2)throw Error('ADMISSION_DERIVATION');
const m=new Module(old,module);m.filename=old;m.paths=Module._nodeModulePaths(path.dirname(old));
m._compile(source.replace(needle,"!['1.22.0-rc.34','1.22.0-rc.35'].includes(safe.version)"),old);
if(process.argv[2]!=='--execute-once')throw Error('EXPLICIT_EXECUTE_REQUIRED');
const output='../rc35-cold-q0/android-update-actual-safe.json';
if(fs.existsSync(path.resolve(path.dirname(old),output)))throw Error('NO_OVERWRITE');
m.exports(__filename,output,async c=>{
 let armed=false,clicked=false,ownsProof=false;
 const deadline=Date.now()+120000;
 const within=()=>{if(Date.now()>deadline)throw Error('UPDATE_UNIT_DEADLINE');};
 try{
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  const admission=await c.evaluateNative(`async()=>{
   const reg=await navigator.serviceWorker.getRegistration(),controller=navigator.serviceWorker.controller;
   const b=el.bannerUpdateButton,r=b?.getBoundingClientRect(),x=r?.x+r?.width/2,y=r?.y+r?.height/2;
   const target=el.updateBannerText?.textContent?.match(/v?(\\d+\\.\\d+\\.\\d+(?:-rc\\.\\d+)?)/)?.[1]||null;
   const hit=Number.isFinite(x)&&Number.isFinite(y)&&document.elementFromPoint(x,y)?.closest('#bannerUpdateButton')===b;
   const ready=APP_VERSION==='1.22.0-rc.34'&&target==='1.22.0-rc.35'&&!el.updateBanner.hidden&&!b?.disabled&&!!r&&r.width>0&&r.height>0&&hit&&x>0&&x<innerWidth&&y>0&&y<innerHeight&&document.visibilityState==='visible'&&!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner&&q1RetirementResult?.settled===true&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountIdentityPending&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&controller?.state==='activated'&&reg?.active===controller&&!reg.waiting&&!reg.installing&&!window.__qaRc35AndroidUpdate&&!localStorage.getItem('drive-original.qa.rc35-android-update-baseline');
   return {ready,version:APP_VERSION,targetVersion:target,nativeButtonHit:hit,x,y,dpr:devicePixelRatio,viewportHeight:innerHeight,rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim()};
  }`);
  c.step('fresh native update admission',admission);if(!admission.ready)throw Error('UPDATE_ADMISSION');
  const height=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);
  if(![height,admission.x,admission.y,admission.dpr,admission.viewportHeight].every(Number.isFinite))throw Error('UPDATE_NATIVE_GEOMETRY');
  within();c.step('hashed baseline installed',await c.evaluateNative(`async()=>await (${baseline})`));armed=true;
  c.adb(['shell','input','tap',String(Math.round(admission.x*admission.dpr)),String(Math.round(height-admission.viewportHeight*admission.dpr+admission.y*admission.dpr))]);clicked=true;c.step('single ordinary native tap',{issued:true});
  let ready=null;const end=Math.min(deadline,Date.now()+60000);
  do{
   await c.wait(500);try{ready=await c.evaluateNative(`()=>({version:typeof APP_VERSION==='undefined'?null:APP_VERSION,ready:typeof APP_VERSION!=='undefined'&&APP_VERSION==='1.22.0-rc.35'&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner&&q1RetirementResult?.settled===true&&document.visibilityState==='visible',foreignProof:!!window.__resumeSwProof})`);}catch{ready=null;}
  }while(!ready?.ready&&Date.now()<end);
  c.step('post reload readiness',ready||{ready:false});if(!ready?.ready)throw Error('UPDATE_RELOAD_READINESS');if(ready.foreignProof)throw Error('UPDATE_FOREIGN_SOURCE_PROOF');
  within();const result=await c.evaluateNative(`async()=>await (${proof})`);ownsProof=true;
  c.step('source cache and preservation proof',result);
  const p=result.preserved;
  if(!p||!['account','accountKey','writer','projection','cache','playerClosed'].every(k=>p[k]===true)||!Number.isFinite(p.clickedAt)||!Number.isFinite(p.pagehideAt)||p.pagehideAt<p.clickedAt||result.matchedCache!==49||result.matchedCacheAliases!==50||result.network.length!==3||!result.network.every(r=>r.matched))throw Error('UPDATE_PRESERVATION_OR_SOURCE');
  const final=await c.evaluateNative(`()=>({version:APP_VERSION,bannerHidden:el.updateBanner.hidden,applyUpdateHidden:el.applyUpdateButton.hidden,closed:!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner,rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim()})`);
  c.step('final update state',final);if(final.version!=='1.22.0-rc.35'||!final.bannerHidden||!final.closed)throw Error('UPDATE_FINAL_STATE');
 }finally{
  try{c.step('owned update cleanup',await c.evaluateNative(`()=>{let listenersRemoved=true;if(window.__qaRc35AndroidUpdate)window.__qaRc35AndroidUpdate.stop();else localStorage.removeItem('drive-original.qa.rc35-android-update-baseline');const proof=${ownsProof?'true':'false'};if(proof&&window.__resumeSwProof?.get?.()?.sourceCommit==='2c2b1244bee0f1a5e500318c83c6e126c5124e34')delete window.__resumeSwProof;return {ownedBaselineAbsent:!localStorage.getItem('drive-original.qa.rc35-android-update-baseline'),ownedListenersAbsent:!window.__qaRc35AndroidUpdate,ownedSourceProofRemoved:!proof||!window.__resumeSwProof,tabClosed:false};}`));}
  catch{c.step('owned update cleanup',{confirmed:false,baselineWasArmed:armed,nativeTapIssued:clicked});throw Error('UPDATE_OWNED_CLEANUP_UNCONFIRMED');}
 }
});
