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
const output='../rc35-cold-q0/android-update-actual-attempt3-safe.json';
if(fs.existsSync(path.resolve(path.dirname(old),output)))throw Error('NO_OVERWRITE');
m.exports(__filename,output,async c=>{
 let armed=false,clicked=false,ownsProof=false;
 const deadline=Date.now()+120000;
 const within=()=>{if(Date.now()>deadline)throw Error('UPDATE_UNIT_DEADLINE');};
 try{
  await c.unmaskNativeVisibility();
  const admission=await c.evaluateNative(`async()=>{
   const reg=await navigator.serviceWorker.getRegistration(),controller=navigator.serviceWorker.controller;
   const b=el.bannerUpdateButton,r=b?.getBoundingClientRect(),x=r?.x+r?.width/2,y=r?.y+r?.height/2;
   const target=el.updateBannerText?.textContent?.match(/v?(\\d+\\.\\d+\\.\\d+(?:-rc\\.\\d+)?)/)?.[1]||null;
   const hit=Number.isFinite(x)&&Number.isFinite(y)&&document.elementFromPoint(x,y)?.closest('#bannerUpdateButton')===b;
   const ready=APP_VERSION==='1.22.0-rc.34'&&target==='1.22.0-rc.35'&&!el.updateBanner.hidden&&!b?.disabled&&!!r&&r.width>0&&r.height>0&&hit&&x>0&&x<innerWidth&&y>0&&y<innerHeight&&document.visibilityState==='visible'&&!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner)&&q1RetirementResult?.settled===true&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountIdentityPending&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&controller?.state==='activated'&&reg?.active===controller&&!reg.waiting&&!reg.installing&&!window.__qaRc35AndroidUpdate&&!localStorage.getItem('drive-original.qa.rc35-android-update-baseline');
   return {ready,version:APP_VERSION,targetVersion:target,nativeButtonHit:hit,x,y,dpr:devicePixelRatio,viewportHeight:innerHeight,rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim()};
  }`);
  c.step('fresh native update admission',admission);if(!admission.ready)throw Error('UPDATE_ADMISSION');
  const clickSchema=c.report.toolSchemas.find(t=>t.name==='click')?.inputSchema;
  if(!clickSchema?.properties?.uid||!clickSchema?.properties?.pageId)throw Error('UPDATE_CLICK_UNSUPPORTED');
  const snapshot=await c.call('take_snapshot',{});if(snapshot.isError)throw Error('UPDATE_SNAPSHOT_FAILED');
  const text=snapshot.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  const rows=text.split(/\r?\n/).filter(line=>/button\s+"지금 업데이트"/.test(line)&&!/disabled/.test(line));
  const uid=rows.length===1?rows[0].match(/uid=([^\s]+)/)?.[1]:null;
  if(!uid)throw Error('UPDATE_SNAPSHOT_TARGET_AMBIGUOUS');
  c.step('MCP input admission',{uniqueVisibleUpdateButton:true,input:'ChromeDevToolsMCP trusted ordinary UI click',rawSnapshotExported:false});
  within();c.step('hashed baseline installed',await c.evaluateNative(`async()=>await (${baseline})`));armed=true;
  const click=await c.call('click',{uid,includeSnapshot:false});if(click.isError)throw Error('UPDATE_MCP_CLICK_FAILED');clicked=true;c.step('single ordinary MCP click',{issued:true,input:'ChromeDevToolsMCP trusted ordinary UI click'});
  let ready=null;const end=Math.min(deadline,Date.now()+60000);
  do{
   await c.wait(500);try{ready=await c.evaluate(`()=>({version:typeof APP_VERSION==='undefined'?null:APP_VERSION,ready:typeof APP_VERSION!=='undefined'&&APP_VERSION==='1.22.0-rc.35'&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner)&&q1RetirementResult?.settled===true&&document.visibilityState==='visible',foreignProof:!!window.__resumeSwProof})`);}catch{ready=null;}
  }while(!ready?.ready&&Date.now()<end);
  c.step('post reload readiness',ready||{ready:false});if(!ready?.ready)throw Error('UPDATE_RELOAD_READINESS');if(ready.foreignProof)throw Error('UPDATE_FOREIGN_SOURCE_PROOF');
  within();ownsProof=true;const result=await c.evaluate(`async()=>await (${proof})`);
  c.step('source cache and preservation proof',result);
  const p=result.preserved;
  if(!p||!['account','accountKey','writer','projection','cache','playerClosed'].every(k=>p[k]===true)||!Number.isFinite(p.clickedAt)||!Number.isFinite(p.pagehideAt)||p.pagehideAt<p.clickedAt||result.matchedCache!==49||result.matchedCacheAliases!==50||result.network.length!==3||!result.network.every(r=>r.matched))throw Error('UPDATE_PRESERVATION_OR_SOURCE');
  const final=await c.evaluate(`()=>({version:APP_VERSION,bannerHidden:el.updateBanner.hidden,applyUpdateHidden:el.applyUpdateButton.hidden,closed:!state.selected&&!q0Playback&&!q1Playback&&!(typeof playerTracksOwner!=='undefined'&&playerTracksOwner),rootReady:state.currentFolderId==='root',queryEmpty:!String(state.query||'').trim()})`);
  c.step('final update state',final);if(final.version!=='1.22.0-rc.35'||!final.bannerHidden||!final.closed)throw Error('UPDATE_FINAL_STATE');
 }catch(error){
  try{c.step('safe failure observation',await c.evaluate(`()=>{let b=null;try{b=JSON.parse(localStorage.getItem('drive-original.qa.rc35-android-update-baseline')||'null')}catch{}return {version:typeof APP_VERSION==='undefined'?null:APP_VERSION,clickedAt:b?.clickedAt??null,pagehideAt:b?.pagehideAt??null,baselinePresent:!!b,bannerTargetVersion:el.updateBannerText?.textContent?.match(/v?(\\d+\\.\\d+\\.\\d+(?:-rc\\.\\d+)?)/)?.[1]||null};}`));}catch{c.step('safe failure observation',{available:false});}
  c.step('update failure',{error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'UPDATE_OPERATION_FAILED'});throw error;
 }finally{
  try{c.step('owned update cleanup',await c.evaluate(`()=>{if(window.__qaRc35AndroidUpdate)window.__qaRc35AndroidUpdate.stop();else localStorage.removeItem('drive-original.qa.rc35-android-update-baseline');const proof=${ownsProof?'true':'false'};if(proof&&window.__resumeSwProof?.get?.()?.sourceCommit==='2c2b1244bee0f1a5e500318c83c6e126c5124e34')delete window.__resumeSwProof;return {ownedBaselineAbsent:!localStorage.getItem('drive-original.qa.rc35-android-update-baseline'),ownedListenersAbsent:!window.__qaRc35AndroidUpdate,ownedSourceProofRemoved:!proof||!window.__resumeSwProof,tabClosed:false};}`));await c.releaseMcpForNativeLifecycle();}
  catch{c.step('owned update cleanup',{confirmed:false,baselineWasArmed:armed,nativeTapIssued:clicked});throw Error('UPDATE_OWNED_CLEANUP_UNCONFIRMED');}
 }
});
