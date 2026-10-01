'use strict';
// Recovery only: no new playback, seeks, settings or Drive writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const base = require('./android-q3-actor.cjs');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function execute() {
  const output = 'android-eof-cua2-recovery-safe.json';
  if (fs.existsSync(path.join(__dirname, output))) throw Error('RESULT_ALREADY_EXISTS');
  const p = base.prepare('eof-recovery-binding-only');
  const bytes = fs.readFileSync(path.join(__dirname, '../v2-state-recovery-backup/q3-target-cua1-1-private.json'));
  if (hash(bytes) !== '2604a0f5da6e1d380046b5c3dcc558e372e7e358104d3b5b63d2255c2f663167') throw Error('PRIVATE_TARGET_DRIFT');
  const holder = JSON.parse(bytes);
  const log = console.log;
  console.log = s => { let r; try { r = JSON.parse(s); } catch { return log(s); } log(JSON.stringify({ completed: r.completed, failure: r.failure || null, steps: r.steps, ownedForwardRemoved: r.ownedForwardRemoved })); };
  try { return await require('./android-common33.cjs')(__filename, output, async c => {
    await c.unmaskNativeVisibility(); await c.releaseMcpForNativeLifecycle();
    const admission = await c.evaluateNative(`async()=>{
      if(window.__q3EofRecovery33)throw Error('RECOVERY_ALREADY_PRESENT');
      const h=${JSON.stringify(holder)},t=h.metadata||h.target||h.file||h,a=h.account||h,b=${JSON.stringify(p.binding)},owner=q1Playback,controller=navigator.serviceWorker.controller;
      const identity={accountId:state.accountId,authAccountKey:state.authAccountKey,authGeneration:state.authGeneration,driveSessionGeneration:state.driveSessionGeneration};
      const targetSame=f=>!!f&&['id','name','size','mimeType','modifiedTime','version','headRevisionId','sha256Checksum','md5Checksum'].every(k=>t[k]==null||String(f[k])===String(t[k]))&&(!t.parents||Array.isArray(f.parents)&&JSON.stringify([...f.parents].sort())===JSON.stringify([...t.parents].sort()));
      const same=()=>APP_VERSION===b.version&&document.visibilityState==='visible'&&navigator.serviceWorker.controller===controller&&controller?.state==='activated'&&state.authStatus==='online'&&state.accountId===a.accountId&&state.authAccountKey===a.authAccountKey&&Object.keys(identity).every(k=>state[k]===identity[k]);
      if(!same()||el.playerSheet.hidden||!targetSame(state.selected)||!owner||owner.fileId!==t.id||q0Playback||window.__q3ActorOwned33||window.__q3ActualReplay33||window.__q3ActualEof33)throw Error('EXACT_FAILED_OWNER_REQUIRED');
      for(const [file,sha]of Object.entries(b.sourceSHA256)){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);try{if(!same())throw Error('RECOVERY_SOURCE_FENCE');const r=await fetch('/'+file,{cache:'no-store',redirect:'error',signal:abort.signal});const raw=await r.arrayBuffer();if(!r.ok||raw.byteLength>1048576||Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('')!==sha)throw Error('RECOVERY_SOURCE_DRIFT');}finally{clearTimeout(timer);}}
      if(!same()||q1Playback!==owner||!targetSame(state.selected))throw Error('RECOVERY_OWNER_DRIFT');
      window.__q3EofRecovery33={same,targetSame,owner,t,mayClose:()=>same()&&!el.playerSheet.hidden&&q1Playback===owner&&q1Playback.fileId===t.id&&targetSame(state.selected)};
      return{sourceFiveHashesMatched:true,accountExact:true,targetExact:true,currentOwner:true,oldObserversAbsent:true};
    }`);
    c.step('exact failed owner admitted', admission);
    const geometry = key => c.evaluateNative(`()=>{const h=window.__q3EofRecovery33;if(!h?.mayClose())throw Error('RECOVERY_CLOSE_OWNER');const n=el[${JSON.stringify(key)}],r=n?.getBoundingClientRect(),x=r?.left+r?.width/2,y=r?.top+r?.height/2,dpr=devicePixelRatio,px=Math.round(x*dpr),py=Math.round(2800-innerHeight*dpr+y*dpr),hit=document.elementFromPoint(x,y),qhit=document.elementFromPoint(px/dpr,(py-(2800-innerHeight*dpr))/dpr);let shown=!!n;for(let e=n;e;e=e.parentElement){const s=getComputedStyle(e);if(e.hidden||e.inert||s.display==='none'||s.visibility==='hidden'||s.pointerEvents==='none'||Number(s.opacity)===0)shown=false;}const match=e=>e===n||n?.contains(e);return{available:shown&&r.width>0&&r.height>0&&match(hit)&&match(qhit),exactHit:match(hit),quantizedHit:match(qhit),x,y,width:innerWidth,height:innerHeight,dpr,screenWidth:1752,screenHeight:2800};}`);
    const tap = g => { const point = base.physicalPoint(g); c.adb(['shell','input','tap',String(point.x),String(point.y)]); };
    let g = await geometry('closePlayerButton');
    if (!g.available) { tap(await geometry('playerControlsEntry')); const end=Date.now()+3000; do { await c.wait(100); g=await geometry('closePlayerButton'); } while(!g.available&&Date.now()<end); }
    tap(g); c.step('native exact owned close', { trustedNativeInput: true, freshQuantizedHit: true });
    let settled; const end = Date.now()+15000;
    do { settled=await c.evaluateNative('()=>({same:window.__q3EofRecovery33.same(),settled:el.playerSheet.hidden&&!q0Playback&&!q1Playback&&!q3Choice&&q1RetirementResult?.settled===true&&!el.videoPlayer.getAttribute("src")})'); if(!settled.same)throw Error('RECOVERY_ACCOUNT_SOURCE_DRIFT'); if(settled.settled)break; await c.wait(250); } while(Date.now()<end);
    if(!settled.settled)throw Error('RECOVERY_CLOSE_UNCONFIRMED'); c.step('failed owner settled',settled);
    const metadata=await c.evaluateNative(`async()=>{const h=window.__q3EofRecovery33;if(!h.same())throw Error('RECOVERY_METADATA_FENCE');const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);try{const fields='id,name,size,mimeType,modifiedTime,parents,version,headRevisionId,sha256Checksum,md5Checksum,trashed,capabilities(canDownload)',headers=h.t.resourceKey?{'X-Goog-Drive-Resource-Keys':h.t.id+'/'+h.t.resourceKey}:{};const r=await driveFetch(DRIVE_API+'/files/'+encodeURIComponent(h.t.id)+'?fields='+encodeURIComponent(fields)+'&supportsAllDrives=true',{signal:abort.signal,headers});const raw=await r.arrayBuffer();if(!r.ok||raw.byteLength>1048576)throw Error('RECOVERY_METADATA_READ');const f=JSON.parse(new TextDecoder().decode(raw));if(!h.same()||!h.targetSame(f)||f.trashed!==false||f.capabilities?.canDownload!==true)throw Error('RECOVERY_METADATA_MISMATCH');return{freshRead:true,status:r.status,targetExact:true,accountSourceSame:true,notTrashed:true,canDownload:true};}finally{clearTimeout(timer);}}`);
    c.step('fresh revision after recovery close', metadata);
    const cleared=await c.evaluateNative('()=>{if(!window.__q3EofRecovery33.same()||!el.playerSheet.hidden||q1Playback||q0Playback||q1RetirementResult?.settled!==true)throw Error("RECOVERY_CLEAR_PRECONDITION");delete window.__q3EofRecovery33;return{closed:true,settled:true,recoveryHolderCleared:true};}'); c.step('recovery complete',cleared);
  }); } finally { console.log=log; }
}
if(require.main===module)execute().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'RECOVERY_OPERATION_FAILED');process.exitCode=1;});
module.exports={execute};
