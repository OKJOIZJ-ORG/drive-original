'use strict';
// Read-only current35/source/state qualification; never updates or plays media.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const file=path.join(__dirname,'android-update-source-proof.expression.js'),proof=fs.readFileSync(file,'utf8');
if(hash(Buffer.from(proof))!=='b3083590371fa99d7fbb95449fa16e09ca70a2ffd26568c1c13464720aa30ba7')throw Error('UPDATE_PROOF_CHANGED');
if(process.argv[2]!=='--execute-read-only')throw Error('READ_ONLY_GO_REQUIRED');
const output='android-update-qualified-state-safe.json';
if(fs.existsSync(path.join(__dirname,output)))throw Error('NO_OVERWRITE');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'android-update-inspection-safe.json'))).steps.find(s=>s.name==='read-only-update-admission');
if(!original?.readOnlyAdmissionReady||original.version!=='1.22.0-rc.34'||!original.snapshotStable)throw Error('ORIGINAL_HASH_BASELINE_REQUIRED');
require('./android.cjs').common35()(__filename,'../rc35-cold-q0/'+output,async c=>{
 let ownsProof=false;
 const start=Date.now();
 try{
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  const admission=await c.evaluateNative(`()=>({version:APP_VERSION,ready:APP_VERSION==='1.22.0-rc.35'&&!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner&&q1RetirementResult?.settled===true&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountIdentityPending&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&document.visibilityState==='visible',foreignProof:!!window.__resumeSwProof,root:state.currentFolderId==='root',emptyQuery:el.searchInput.value==='',bannerHidden:el.updateBanner.hidden})`);
  c.step('current35 read-only admission',admission);
  if(!admission.ready||admission.foreignProof||!admission.root||!admission.emptyQuery||!admission.bannerHidden)throw Error('CURRENT35_ADMISSION');
  ownsProof=true;
  c.step('current35 public/cache/controller proof',await c.evaluateNative('async()=>await ('+proof.trim()+')'));
  const state=await c.evaluateNative(`async()=>{
   const before=[state.accountId,state.authAccountKey,state.accountStateWriterId,state.accountMediaState,localStorage.getItem(accountStateCacheKey(state.accountId))].map(x=>JSON.stringify(x));
   const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),v=>v.toString(16).padStart(2,'0')).join('');
   const hashes=await Promise.all(before.map(hash));
   const after=[state.accountId,state.authAccountKey,state.accountStateWriterId,state.accountMediaState,localStorage.getItem(accountStateCacheKey(state.accountId))].map(x=>JSON.stringify(x));
   const r=await navigator.serviceWorker.getRegistration('/');
   return{version:APP_VERSION,hashes:{account:hashes[0],accountKey:hashes[1],writer:hashes[2],projection:hashes[3],privateCache:hashes[4]},snapshotStable:before.every((v,i)=>v===after[i]),controllerCurrent:r?.active===navigator.serviceWorker.controller,controllerActivated:navigator.serviceWorker.controller?.state==='activated',noWaiting:!r?.waiting,noInstalling:!r?.installing,closed:!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner,accountIdle:!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&!state.accountStateLoadingPromise&&!state.accountIdentityPending,root:state.currentFolderId==='root',emptyQuery:el.searchInput.value==='',bannerHidden:el.updateBanner.hidden,rawIdentifiersExported:false};
  }`);
  const preserved=Object.fromEntries(Object.keys(original.hashes).map(k=>[k,state.hashes[k]===original.hashes[k]]));
  const passed=Object.values(preserved).every(Boolean)&&state.snapshotStable&&state.controllerCurrent&&state.controllerActivated&&state.noWaiting&&state.noInstalling&&state.closed&&state.accountIdle&&state.root&&state.emptyQuery&&state.bannerHidden&&state.version==='1.22.0-rc.35';
  c.step('observed34 to35 state/source qualification',{...state,preserved,passed,trustedClickProvenance:'UNKNOWN',pagehideProvenance:'UNKNOWN',normalTrustedUpdateAcceptance:'NOT_QUALIFIED',updateOrInputIssued:false,actualMs:Date.now()-start});
  if(!passed)throw Error('CURRENT35_STATE_QUALIFICATION');
 }finally{
  const cleanup=await c.evaluateNative(`()=>{const owns=${ownsProof};if(owns&&window.__resumeSwProof?.get?.()?.sourceCommit==='2c2b1244bee0f1a5e500318c83c6e126c5124e34')delete window.__resumeSwProof;return{ownedSourceProofAbsent:!owns||!window.__resumeSwProof,updateBaselineAbsent:!localStorage.getItem('drive-original.qa.rc35-android-update-baseline'),updateListenersAbsent:!window.__qaRc35AndroidUpdate,ownersAbsent:!state.selected&&!q0Playback&&!q1Playback&&!playerTracksOwner};}`);
  c.step('read-only source helper cleanup',cleanup);
  if(!Object.values(cleanup).every(Boolean))throw Error('CURRENT35_HELPER_CLEANUP');
 }
});
