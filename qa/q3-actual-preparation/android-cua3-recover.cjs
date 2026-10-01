'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function execute(){
 return require('./android-common33.cjs')(__filename,'android-cua3-recovery-safe.json',async c=>{
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  const before=await c.evaluateNative("()=>{const r=window.__q3ActualReplay33?.read();return {version:APP_VERSION,observerPresent:!!r,observerDisposed:r?.disposed,sourceCurrent:!!window.__resumeSwProof?.get(),nativeRejectionObserved:r?.nativeRejectionObserved,explicitChoiceObserved:r?.explicitChoiceObserved,phases:r?.phases.map(p=>({label:p.label,firstTarget:!!p.firstTargetFrame,activeAtArm:p.streamActiveAtArm,fenceFailure:p.fenceFailure})),closed:el.playerSheet.hidden};}");
  c.step('failed timed owner recovery admission',before);
  if(before.version!=='1.22.0-rc.33'||!before.observerPresent||!before.sourceCurrent)throw Error('EXACT_FAILED_QA_OWNER_REQUIRED');
  const point=async key=>c.evaluateNative(`()=>{const e=el[${JSON.stringify(key)}];if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {available:r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(h===e||e.contains(h)),x:Math.round(x*devicePixelRatio),y:Math.round(2800-innerHeight*devicePixelRatio+y*devicePixelRatio)};}`);
  const tap=async p=>{if(!p?.available||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.x>=1752||p.y<0||p.y>=2800)throw Error('CURRENT_NATIVE_POINT_REQUIRED');c.adb(['shell','input','tap',String(p.x),String(p.y)]);};
  if(!before.closed){let close=await point('closePlayerButton');if(!close?.available){await tap(await point('playerControlsEntry'));await c.wait(400);close=await point('closePlayerButton');}await tap(close);}
  let closed=false,deadline=Date.now()+15000;do{closed=await c.evaluateNative("()=>el.playerSheet.hidden&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true");if(closed)break;await c.wait(250);}while(Date.now()<deadline);
  if(!closed)throw Error('FAILED_OWNER_CLOSE_UNCONFIRMED');
  const after=await c.evaluateNative("async()=>window.__q3ActualReplay33.metadata('after')");c.step('fresh metadata after native close',after);
  const receipt=await c.evaluateNative("()=>{const r=window.__q3ActualReplay33.read();r.complete=false;r.saveSuccess=false;r.failedSaveAttempted=false;r.failure='ANDROID_OWNER420_BOUND';r.performanceAcceptance='NOT_QUALIFIED';r.observerCleanup=window.__q3ActualReplay33.stop();return r;}");
  if(receipt.rawIdentifiersExported!==false||receipt.observerOnly!==true||receipt.observerCleanup?.removed!==true||receipt.closedOwnership!==true)throw Error('SAFE_FAILED_RECEIPT_REQUIRED');
  const bytes=JSON.stringify(receipt,null,2)+'\n';if(Buffer.byteLength(bytes)>2097152)throw Error('SAFE_RECEIPT_LIMIT');
  const file='actual-android-q3-observer-receipt-cua3-failed-safe.json';fs.writeFileSync(path.join(__dirname,file),bytes,{flag:'wx'});
  c.step('saved failed observation without promoting missing phases',{file,bytes:Buffer.byteLength(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),complete:false,closedOwnership:true,observerCleanup:receipt.observerCleanup});
  const cleanup=await c.evaluateNative("()=>{if(!el.playerSheet.hidden||q0Playback||q1Playback||q1RetirementResult?.settled!==true||window.__q3ActualReplay33.read().disposed!==true)throw Error('QA_CLEANUP_PRECONDITION');for(const k of ['__q3ActualReplay33','__q3ActualTarget33','__resumeSwProof','__q3Source33','__q3ObserverAdmission33','__q3AndroidPoint33','__q3QaWait33','__q3ActualReceipt33'])delete window[k];return {closed:true,stopped:true,privateHolderCleared:true,helpersCleared:true};}");c.step('failed unit app cleanup',cleanup);
 });
}
if(require.main===module)execute();
module.exports={execute};
