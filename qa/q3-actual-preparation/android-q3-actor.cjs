'use strict';
// Import is inert. Only the explicit --execute <new-label> CLI starts actual work.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const DIR = __dirname, ROOT = path.resolve(DIR, '../..');
const VERSION = '1.22.0-rc.33', COMMIT = '5174485b3c17d047259701bbdd889f9b0740f555';
const PRIVATE = path.join(ROOT, 'qa/v2-state-recovery-backup/q3-target-cua1-1-private.json');
const PRIVATE_SHA = '2604a0f5da6e1d380046b5c3dcc558e372e7e358104d3b5b63d2255c2f663167';
const PINNED = {
  'source-proof.expression.js': 'fdd71db2cc76e36921db9c2bb512183ea2f8ad70d4302d094276551884b57954',
  'observer.expression.js': 'c2f8df2f7e29da5d93bac064d81236a96d0338f85724c62bcb703c7055d05f5e',
  'pc-seek-targets33.expression.js': '145a0533560cf6e37eb1c9a56f3cc85d97a5e88dc71cb7c209dfd8c09dbf1e9a'
};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const code = e => /^[A-Z0-9_]+$/.test(e?.message || '') ? e.message : 'ACTOR_OPERATION_FAILED';
function names(label) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(label || '')) throw Error('NEW_SAFE_LABEL_REQUIRED');
  return { report: `actual-android-q3-actor-${label}-safe.json`, receipt: `actual-android-q3-actor-receipt-${label}-safe.json`, failure: `actual-android-q3-actor-failure-${label}-safe.json`, screenshot: `actual-android-q3-actor-seek50-${label}-safe.png` };
}
function prepare(label) {
  const output = names(label);
  for (const name of Object.values(output)) if (fs.existsSync(path.join(DIR, name))) throw Error('RESULT_ALREADY_EXISTS');
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'observer-manifest.json')));
  const binding = JSON.parse(fs.readFileSync(path.join(DIR, 'binding-observer.json')));
  if (manifest.sourceCommit !== COMMIT || manifest.version !== VERSION || binding.sourceCommit !== COMMIT || binding.version !== VERSION) throw Error('EXACT33_BINDING_REQUIRED');
  const scripts = {};
  for (const [name, sha] of Object.entries(PINNED)) {
    const bytes = fs.readFileSync(path.join(DIR, name));
    if (hash(bytes) !== sha) throw Error('PINNED_HELPER_DRIFT');
    if (name !== 'pc-seek-targets33.expression.js' && manifest.files.find(x => x.file === name)?.sha256 !== sha) throw Error('MANIFEST_HELPER_DRIFT');
    scripts[name] = bytes.toString('utf8').trim();
  }
  for (const name of ['android-common33.cjs', 'binding-observer.json']) {
    if (hash(fs.readFileSync(path.join(DIR, name))) !== manifest.files.find(x => x.file === name)?.sha256) throw Error('MANIFEST_TRANSPORT_DRIFT');
  }
  if (binding.fixture.duration !== 180 || binding.fixture.width !== 640 || binding.fixture.height !== 360 || binding.fixture.fps !== 30
      || binding.fixture.bytes !== 18075476 || binding.fixture.sha256 !== 'cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a') throw Error('EXACT_FIXTURE_REQUIRED');
  return { output, scripts, binding };
}
function scriptAdmission(expression, dest, api) {
  if (!/^__q3Actor[A-Za-z0-9]+33$/.test(dest) || [api, '__q3ActualReplay33', '__q3PcSeekTargets33', '__resumeSwProof'].includes(dest)) throw Error('SEPARATE_HELPER_ADMISSION_REQUIRED');
  if (!['__resumeSwProof', '__q3ActualReplay33', '__q3PcSeekTargets33'].includes(api)) throw Error('OWNED_API_REQUIRED');
  return `async()=>{const owned=window.__q3ActorOwned33;if(!owned||owned.cleanupStarted||window[${JSON.stringify(api)}])throw Error('ACTOR_HELPER_OWNERSHIP');try{const result=await(${expression});if(!owned.cleanupStarted){window[${JSON.stringify(dest)}]=result;owned.refs[${JSON.stringify(dest)}]=result;}return result;}finally{const ref=window[${JSON.stringify(api)}];if(ref){owned.refs[${JSON.stringify(api)}]=ref;if(owned.cleanupStarted){ref.stop?.();if(window[${JSON.stringify(api)}]===ref)delete window[${JSON.stringify(api)}];}}}}`;
}
function physicalPoint(g) {
  if (!g || g.width !== 824 || g.height !== 1191 || g.dpr !== 2.125 || g.screenWidth !== 1752 || g.screenHeight !== 2800
      || !g.available || !g.exactHit || !g.quantizedHit || !Number.isFinite(g.x) || !Number.isFinite(g.y)) throw Error('FRESH_EXACT_GEOMETRY_REQUIRED');
  const x = Math.round(g.x * g.dpr), y = Math.round(g.screenHeight - g.height * g.dpr + g.y * g.dpr);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= g.screenWidth || y >= g.screenHeight) throw Error('BOUNDED_NATIVE_POINT_REQUIRED');
  return { x, y };
}
// DOM reads only. No product functions, scroll, dispatchEvent, click(), play() or seek assignments.
function ownershipExpression() {
  return `()=>{const owned=window.__q3ActorOwned33,h=window.__q3ActualTarget33,t=h?.metadata||h?.target||h?.file||h,admitted=owned?.identity,account=h?.account||(h?.accountId&&h?.authAccountKey?{accountId:h.accountId,authAccountKey:h.authAccountKey}:admitted),controller=navigator.serviceWorker.controller,p=window.__resumeSwProof?.get(),selected=state.selected;
    const sourceSame=!!owned&&window.__resumeSwProof===owned.refs.__resumeSwProof&&APP_VERSION==='${VERSION}'&&p?.version==='${VERSION}'&&p.sourceCommit==='${COMMIT}'&&p.controller===controller&&controller?.state==='activated'&&Object.keys(owned.sourceSHA256||{}).length===5&&Object.keys(owned.sourceSHA256).every(k=>p.sourceSHA256?.[k]===owned.sourceSHA256[k]);
    const accountSame=!!account?.authAccountKey&&!!admitted&&state.accountId===account.accountId&&state.authAccountKey===account.authAccountKey&&state.accountId===admitted.accountId&&state.authAccountKey===admitted.authAccountKey&&state.authGeneration===admitted.authGeneration&&state.driveSessionGeneration===admitted.driveSessionGeneration&&state.authStatus==='online';
    const stable=['id','name','size','mimeType','modifiedTime'],fresh=['version','headRevisionId','sha256Checksum','md5Checksum'];
    const targetSame=!!t?.id&&h===owned?.refs.__q3ActualTarget33&&!!selected&&stable.every(k=>t[k]==null||String(selected[k])===String(t[k]))&&fresh.every(k=>t[k]==null||selected[k]==null||String(selected[k])===String(t[k]))&&(!t.parents||Array.isArray(selected.parents)&&JSON.stringify([...selected.parents].sort())===JSON.stringify([...t.parents].sort()));
    const playbackSame=!!t?.id&&(!q1Playback||q1Playback.fileId===t.id)&&(!q0Playback||q0PinnedSource?.descriptor?.fileId===t.id);
    return{closed:el.playerSheet.hidden===true,sourceSame:!!sourceSame,accountSame:!!accountSame,targetSame:!!targetSame,playbackSame:!!playbackSame,visible:document.visibilityState==='visible',mayClose:sourceSame&&accountSame&&targetSame&&playbackSame&&document.visibilityState==='visible'};}`;
}
function geometryExpression(kind, fraction) {
  if (!['card', 'folder', 'entry', 'pause', 'close', 'choice', 'marker'].includes(kind)) throw Error('OWNED_GEOMETRY_KIND');
  return `()=>{const kind=${JSON.stringify(kind)},fraction=${JSON.stringify(fraction ?? null)};const h=window.__q3ActualTarget33,t=h?.metadata||h?.target||h?.file||h;let node=null,identity=false,ownershipCurrent=null;
    if(kind==='card'){const all=[...document.querySelectorAll('.file-card[data-file-id]')].filter(n=>n.dataset.fileId===t?.id);node=all.length===1?all[0]:null;identity=!!node;}
    else if(kind==='folder'){const folder=state.folders.find(f=>f.id===t?.parents?.[0]);const all=folder?[...document.querySelectorAll('.folder-row')].filter(n=>n.querySelector('.folder-name')?.textContent===folder.name):[];node=all.length===1?all[0]:null;identity=!!node&&state.currentFolderId!==folder.id;}
    else if(kind==='marker'){const r=window.__q3PcSeekTargets33?.read(),p=r?.targets?.find(p=>p.fraction===fraction);node=p?.available?document.elementFromPoint(p.x,p.y):null;identity=!!p?.available&&p.exactHit&&p.targetSeconds===180*fraction&&p.sourceTargetSeconds===180*fraction;}
    else{node=el[{entry:'playerControlsEntry',pause:'ctrlPlayPause',close:'closePlayerButton',choice:'videoCompatButton'}[kind]];const ownership=(${ownershipExpression()})();ownershipCurrent=!ownership.closed&&ownership.mayClose;identity=!!node&&ownershipCurrent;}
    const r=node?.getBoundingClientRect(),x=r?r.left+r.width/2:null,y=r?r.top+r.height/2:null,dpr=devicePixelRatio;
    let exposed=!!node;for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.inert||s.display==='none'||['hidden','collapse'].includes(s.visibility)||s.pointerEvents==='none'||Number(s.opacity)===0)exposed=false;}
    const accepts=hit=>!!node&&(kind==='marker'?hit===node:hit===node||node.contains(hit));
    const px=Math.round(x*dpr),py=Math.round(2800-innerHeight*dpr+y*dpr),qx=px/dpr,qy=(py-(2800-innerHeight*dpr))/dpr;
    const exactHit=accepts(document.elementFromPoint(x,y)),quantizedHit=accepts(document.elementFromPoint(qx,qy));
    return{available:identity&&exposed&&!!node?.isConnected&&!node.disabled&&!!r&&r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&exactHit&&quantizedHit,ownershipCurrent,exactHit,quantizedHit,x,y,width:innerWidth,height:innerHeight,dpr,screenWidth:1752,screenHeight:2800};}`;
}
async function maintainOwnedControls(io) {
  // Lossy status/label can be unavailable during a Q2_GENERAL -> Q3 seek transition.
  // Keep actual controls exposed independently of that status, before the sole paused RVFC.
  const controls = await io.geometry('pause');
  if (controls.ownershipCurrent !== true) throw Error('ACTOR_CONTROL_OWNERSHIP_CHANGED');
  if (controls.available) return { visible: true, tapped: false, skipped: false };
  const entry = await io.geometry('entry');
  if (entry.ownershipCurrent !== true) throw Error('ACTOR_CONTROL_OWNERSHIP_CHANGED');
  if (!entry.available) return { visible: false, tapped: false, skipped: true };
  physicalPoint(entry); await io.tap('entry', entry);
  return { visible: false, tapped: true, skipped: false };
}
function summaryExpression(label, cancelOnFrame = false) {
  return `()=>{const r=window.__q3ActualReplay33.read(),p=r.phases.find(p=>p.label===${JSON.stringify(label)});let cancel=null;if(${cancelOnFrame}&&p?.firstTargetFrame&&!p.fenceFailure){window.__q3ActualReplay33.arm('cancel');cancel=window.__q3ActualReplay33.read().phases.find(p=>p.label==='cancel');}return{nativeRejection:r.nativeRejectionObserved,offer:r.latest.lossyChoiceVisible,choice:r.explicitChoiceObserved,route:r.latest.route,ready:r.latest.native?.ready,width:r.latest.native?.width,height:r.latest.native?.height,paused:r.latest.native?.paused,label:r.latest.lossyLabelVisible,frame:!!p?.firstTargetFrame,latencyMs:p?.firstTargetFrame?.elapsedMs??null,fenceFailure:!!p?.fenceFailure,sourceSame:r.latest.sourceSame,accountSame:r.latest.accountSame,visible:r.latest.visible,streamActiveAtArm:cancel?.streamActiveAtArm??null};}`;
}
function writeReceipt(name, receipt, binding) {
  if (receipt?.schema !== 'drive-original.q3-actual-observation/1' || receipt.version !== binding.version || receipt.sourceCommit !== binding.sourceCommit
      || receipt.rawIdentifiersExported !== false || receipt.observerOnly !== true || receipt.performanceAcceptance !== 'NOT_QUALIFIED') throw Error('SAFE_RECEIPT_REQUIRED');
  const bytes = JSON.stringify(receipt, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > 2097152) throw Error('SAFE_RECEIPT_LIMIT');
  fs.writeFileSync(path.join(DIR, name), bytes, { flag: 'wx' });
  return { saved: true, complete: receipt.complete === true, bytes: Buffer.byteLength(bytes) };
}
async function cleanupActor(io, options) {
  const failures = [], result = { observedBeforeStop: false, receiptSaved: false, markersStopped: false, observerStopped: false, closeOwnershipConfirmed: false, foreignPlaybackLeftUntouched: false, settled: false, postCloseMetadata: null, globalsCleared: false };
  const attempt = async (name, fn) => { try { return await fn(); } catch { failures.push(name); return null; } };
  // The failed observer is exported before its retained owners are discarded by stop().
  if (options.failed && options.observerOwned) await attempt('failureReceipt', async () => {
    const receipt = await io.evaluate('()=>window.__q3ActorOwned33?.refs.__q3ActualReplay33?.read()||null');
    if (receipt) {
      result.observedBeforeStop = true; receipt.complete = false; receipt.performanceAcceptance = 'NOT_QUALIFIED';
      receipt.actorFailure = options.failure; result.receiptSaved = (await options.exportFailure(receipt)).saved === true;
    }
  });
  if (options.guardOwned) {
    await attempt('markCleanup', () => io.evaluate('()=>{window.__q3ActorOwned33.cleanupStarted=true;return{marked:true};}'));
    const stopped = await attempt('stopHelpers', () => io.evaluate(`()=>{const owned=window.__q3ActorOwned33;const marker=owned?.refs.__q3PcSeekTargets33,observer=owned?.refs.__q3ActualReplay33;const m=marker?.stop(),o=observer?.stop();return{markersStopped:!marker||m?.disposed===true&&m.cleanup?.markersRemoved===true&&m.cleanup?.timerCleared===true&&m.cleanup?.roleRestored===true&&m.cleanup?.roleIntegrity===true,observerStopped:!observer||o?.disposed===true&&o.removed===true};}`));
    result.markersStopped = stopped?.markersStopped === true; result.observerStopped = stopped?.observerStopped === true;
    const closeAllowed = await attempt('nativeClose', async () => {
      const ownership = await io.evaluate(ownershipExpression());
      if (ownership.closed) { result.closeOwnershipConfirmed = true; return true; }
      if (!ownership.mayClose) { result.foreignPlaybackLeftUntouched = true; throw Error('ACTOR_CLOSE_OWNERSHIP_CHANGED'); }
      result.closeOwnershipConfirmed = true; await io.close(); return true;
    });
    if (closeAllowed === true) { const settled = await attempt('settlement', () => io.pollSettled()); result.settled = settled?.settled === true; }
    if (options.failed && options.observerOwned && result.settled) await attempt('postCloseMetadata', async () => {
      const evidence = await io.evaluate(`async()=>{const ownership=(${ownershipExpression()})();if(!ownership.closed||!ownership.sourceSame||!ownership.accountSame||!ownership.visible)throw Error('ACTOR_POSTCLOSE_METADATA_OWNER');const observer=window.__q3ActorOwned33?.refs.__q3ActualReplay33;if(!observer)throw Error('ACTOR_POSTCLOSE_OBSERVER_REQUIRED');const prior=observer.read().metadataResults.find(r=>r.label==='after');const metadata=prior||await observer.metadata('after');return{freshRead:!prior,metadata};}`);
      if (!evidence?.metadata || !['sameExactTarget','stableMetadataSame','freshRevisionChecksumSame','accountSame','sourceSame','notTrashed','canDownload'].every(k => evidence.metadata[k] === true)) throw Error('ACTOR_POSTCLOSE_METADATA_REQUIRED');
      result.postCloseMetadata = evidence; options.recordMetadataAfter?.(evidence);
    });
    const cleared = await attempt('clearGlobals', () => io.evaluate(`()=>{const owned=window.__q3ActorOwned33;if(!owned)return{cleared:false};let intact=true;for(const [key,ref]of Object.entries(owned.refs)){if(window[key]===ref)delete window[key];else if(window[key]!==undefined)intact=false;}delete window.__q3ActorOwned33;return{cleared:intact&&!window.__q3ActualTarget33&&!window.__q3ActualReplay33&&!window.__q3PcSeekTargets33&&!window.__resumeSwProof&&!window.__q3ActorOwned33};}`));
    result.globalsCleared = cleared?.cleared === true;
  }
  result.failures = failures; result.confirmed = options.guardOwned ? result.markersStopped && result.observerStopped && result.settled && result.globalsCleared && failures.length === 0 : failures.length === 0;
  return result;
}
async function runActor(c, prepared, dependencies = {}) {
  const now = dependencies.now || Date.now, started = dependencies.startedAt ?? now(), actionDeadline = started + 285000, finalDeadline = started + 330000;
  const progress = dependencies.progress || (row => console.log(JSON.stringify(row)));
  const mark = (stage, data = {}) => { c.step(stage, data); progress({ stage, elapsedMs: now() - started, ...data }); };
  let guardOwned = false, observerOwned = false, success = false, failure = null, cleanupMode = false;
  const boundedOperation = async (operation, phaseRemaining = 35000) => {
    const remaining = (cleanupMode ? finalDeadline : actionDeadline) - now();
    if (remaining <= 0) throw Error('ACTOR_TOTAL_BOUND');
    let timer;
    return Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('ACTOR_COMMAND_BOUND')), Math.min(35000, remaining, phaseRemaining)); })]).finally(() => clearTimeout(timer));
  };
  const evaluate = (fn, phaseRemaining) => boundedOperation(() => c.evaluateNative(fn), phaseRemaining);
  const tapGeometry = async (kind, geometry) => {
    const point = physicalPoint(geometry); progress({ stage: `native-${kind}-input-ready`, elapsedMs: now() - started, exactHit: true, quantizedHit: true });
    c.adb(['shell', 'input', 'tap', String(point.x), String(point.y)]);
    mark(`native-${kind}`, { exactHit: true, quantizedHit: true, x: point.x, y: point.y });
  };
  const tap = async (kind, fraction) => tapGeometry(kind, await evaluate(geometryExpression(kind, fraction)));
  const reveal = async () => {
    const controls = await evaluate(geometryExpression('pause'));
    if (!controls.available) await tap('entry');
  };
  const poll = async (stage, ms, fn, accepted, keepLabel = false) => {
    const end = Math.min(now() + ms, cleanupMode ? finalDeadline : actionDeadline); let lastProgress = now(), lastReveal = -Infinity;
    while (now() < end) {
      const value = await evaluate(fn, end - now());
      if (value?.fenceFailure || value?.sourceSame === false || value?.accountSame === false || value?.visible === false) throw Error('ACTOR_OBSERVER_FENCE');
      if (accepted(value)) { mark(stage, { observed: true, latencyMs: value.latencyMs ?? null }); return value; }
      if (keepLabel && now() - lastReveal >= 1500) {
        const upkeep = await maintainOwnedControls({ geometry: kind => evaluate(geometryExpression(kind), Math.max(1, end - now())), tap: tapGeometry });
        if (upkeep.tapped) lastReveal = now();
      }
      if (now() - lastProgress >= 5000) { progress({ stage, elapsedMs: now() - started, waiting: true, route: value?.route || null, ready: value?.ready ?? null, frame: value?.frame === true }); lastProgress = now(); }
      await c.wait(200);
    }
    throw Error(`ACTOR_${stage.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_BOUND`);
  };
  const pollSettled = () => poll('owners-settled', 15000, `()=>({settled:el.playerSheet.hidden&&!q0Playback&&!q1Playback&&!q3Choice&&q1RetirementResult?.settled===true&&!el.videoPlayer.getAttribute('src')})`, r => r.settled);
  const close = async () => { const g = await evaluate(geometryExpression('close')); if (!g.available) await tap('entry'); await tap('close'); };
  const install = async (file, dest, api) => { if (api === '__q3ActualReplay33') observerOwned = true; const result = await evaluate(scriptAdmission(prepared.scripts[file], dest, api)); mark(`install-${api}`, { installed: result?.installed === true || result?.sourceProofInstalled === true }); };
  try {
    if (c.report.model !== 'SM-X800' || c.report.android !== '16' || !/^Physical size:\s*1752x2800\s*$/.test(c.report.physicalScreen)) throw Error('EXACT_PHYSICAL_DEVICE_REQUIRED');
    mark('native-transport-admission-start');
    await boundedOperation(() => c.unmaskNativeVisibility()); await boundedOperation(() => c.releaseMcpForNativeLifecycle());
    const admission = await evaluate(`()=>({identity:location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'&&APP_VERSION==='${VERSION}',idle:el.playerSheet.hidden&&state.selected===null&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true,account:!!state.accountId&&!!state.authAccountKey&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken(),visible:document.visibilityState==='visible',writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null&&!state.loadingFiles,globalsAbsent:!window.__q3ActorOwned33&&!window.__q3ActualTarget33&&!window.__q3ActualReplay33&&!window.__q3PcSeekTargets33&&!window.__resumeSwProof&&!window.__q3ActualReceipt33,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})`);
    mark('admission', admission);
    if (!['identity', 'idle', 'account', 'visible', 'writerIdle', 'globalsAbsent'].every(k => admission[k] === true) || admission.width !== 824 || admission.height !== 1191 || admission.dpr !== 2.125) throw Error('ACTOR_IDLE_ADMISSION_REQUIRED');
    guardOwned = true; await evaluate(`()=>{window.__q3ActorOwned33={refs:{},cleanupStarted:false,sourceSHA256:${JSON.stringify(prepared.binding.sourceSHA256)},identity:{accountId:state.accountId,authAccountKey:state.authAccountKey,authGeneration:state.authGeneration,driveSessionGeneration:state.driveSessionGeneration}};return{owned:true};}`);
    // This is the only private disk read; it occurs after native visibility/MCP detachment.
    const privateBytes = (dependencies.readPrivate || (() => fs.readFileSync(PRIVATE)))();
    if (hash(privateBytes) !== PRIVATE_SHA) throw Error('PRIVATE_TARGET_DRIFT');
    const holder = JSON.parse(privateBytes.toString('utf8'));
    const target = holder?.metadata || holder?.target || holder?.file || holder;
    if (!target?.id || !target?.name || !target.parents?.[0] || target.sha256Checksum !== prepared.binding.fixture.sha256 || Number(target.size) !== prepared.binding.fixture.bytes) throw Error('EXACT_PRIVATE_FIXTURE_REQUIRED');
    await evaluate(`()=>{const holder=${JSON.stringify(holder)};window.__q3ActualTarget33=holder;window.__q3ActorOwned33.refs.__q3ActualTarget33=holder;return{installed:true};}`);
    mark('private-target-admitted', { privateTargetRead: true, privateIdentityExported: false, fixture: '180s-640x360-30fps-silent-MPEG4SP', physicalMappingScope: 'Pinned prior screen/viewport mapping; fresh DOM and quantized CSS hit checks; no per-run screenshot calibration' });
    await install('source-proof.expression.js', '__q3ActorProofAdmission33', '__resumeSwProof');
    const proof = await evaluate(`()=>{const p=window.__resumeSwProof?.get();return{valid:!!p&&p.version==='${VERSION}'&&p.sourceCommit==='${COMMIT}'&&p.controller===navigator.serviceWorker.controller};}`);
    if (!proof.valid) throw Error('ACTOR_SOURCE_PROOF_REQUIRED');
    await install('observer.expression.js', '__q3ActorObserverAdmission33', '__q3ActualReplay33');
    const before = await evaluate("()=>window.__q3ActualReplay33.metadata('before')"); mark('fresh-metadata-before', before);
    const folder = await evaluate('()=>{const h=window.__q3ActualTarget33,t=h.metadata||h.target||h.file||h;return{alreadyOpen:state.currentFolderId===t.parents[0]};}');
    if (!folder.alreadyOpen) { await tap('folder'); await poll('folder-open', 15000, '()=>{const h=window.__q3ActualTarget33,t=h.metadata||h.target||h.file||h;return{open:state.currentFolderId===t.parents[0]&&!state.loadingFiles};}', r => r.open); }
    await evaluate("()=>window.__q3ActualReplay33.arm('native')"); await tap('card');
    await poll('native-rejection-offer', 30000, summaryExpression('native'), r => r.nativeRejection && r.offer);
    await evaluate("()=>window.__q3ActualReplay33.arm('startup')"); await tap('choice');
    await poll('q3-native-ready', 40000, summaryExpression('startup'), r => r.route === 'Q3' && r.ready >= 2 && r.width === 640 && r.height === 360, true);
    await reveal();
    await poll('startup-frame', 25000, summaryExpression('startup'), r => r.frame && r.label && r.choice, true);
    const paused = await evaluate('()=>({paused:getActiveMediaElement()?.paused===true})');
    if (!paused.paused) { await reveal(); await tap('pause'); }
    await poll('native-paused', 5000, '()=>({paused:getActiveMediaElement()?.paused===true})', r => r.paused);
    for (const [label, fraction] of [['seek50', .5], ['seek90', .9]]) {
      await reveal();
      await install('pc-seek-targets33.expression.js', '__q3ActorSeekAdmission33', '__q3PcSeekTargets33');
      await evaluate(`()=>window.__q3ActualReplay33.arm('${label}',{toleranceSeconds:.75})`);
      await tap('marker', fraction);
      const result = await poll(`${label}-frame`, 40000, summaryExpression(label, label === 'seek90'), r => r.frame, true);
      if (label === 'seek90') {
        if (result.streamActiveAtArm !== true) throw Error('ACTIVE_CANCEL_ARM_REQUIRED');
        // Cancel was armed inside the read that observed the first qualified 90% frame.
        await close(); await pollSettled();
      } else {
        const pausedFrame = await evaluate(`()=>{const owner=(${ownershipExpression()})();return{owned:owner.mayClose,paused:getActiveMediaElement()?.paused===true};}`);
        if (!pausedFrame.owned || !pausedFrame.paused) throw Error('OWNED_PAUSED_SCREENSHOT_REQUIRED');
        if (fs.existsSync(path.join(DIR, prepared.output.screenshot))) throw Error('SCREENSHOT_ALREADY_EXISTS');
        progress({ stage: 'seek50-native-screenshot-start', elapsedMs: now() - started });
        c.screenshot(prepared.output.screenshot);
        const shot = fs.readFileSync(path.join(DIR, prepared.output.screenshot));
        if (shot.length < 24 || shot.length > 16777216 || shot.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || shot.readUInt32BE(16) !== 1752 || shot.readUInt32BE(20) !== 2800) throw Error('BOUNDED_NATIVE_SCREENSHOT_REQUIRED');
        mark('seek50-native-screenshot', { saved: true, bytes: shot.length, sha256: hash(shot), paused: true, nativeScreenScope: 'Actual physical screen pixels; local UI text is not independently redacted' });
        const stopped = await evaluate(`()=>{const o=window.__q3ActorOwned33,api=o.refs.__q3PcSeekTargets33;if(window.__q3PcSeekTargets33!==api||window.__q3ActorSeekAdmission33!==o.refs.__q3ActorSeekAdmission33)throw Error('ACTOR_MARKER_OWNER_DRIFT');const r=api.stop();delete window.__q3PcSeekTargets33;delete o.refs.__q3PcSeekTargets33;delete window.__q3ActorSeekAdmission33;delete o.refs.__q3ActorSeekAdmission33;return r;}`);
        if (!stopped.disposed || !stopped.cleanup.markersRemoved || !stopped.cleanup.roleRestored || !stopped.cleanup.roleIntegrity) throw Error('SEEK_MARKER_CLEANUP_REQUIRED');
      }
    }
    const after = await evaluate("()=>window.__q3ActualReplay33.metadata('after')"); mark('fresh-metadata-after', after);
    await evaluate('()=>{const r=window.__q3ActualReplay33.save();window.__q3ActorOwned33.refs.__q3ActualReceipt33=window.__q3ActualReceipt33;return r;}');
    const receipt = await evaluate('()=>window.__q3ActualReceipt33');
    const saved = (dependencies.writeReceipt || writeReceipt)(prepared.output.receipt, receipt, prepared.binding); mark('safe-receipt', saved);
    if (receipt.complete !== true || receipt.observerCleanup?.removed !== true) throw Error('BOUNDED_FUNCTIONAL_RECEIPT_INCOMPLETE');
    success = true;
  } catch (e) { failure = code(e); mark('actor-failure', { failure }); }
  finally {
    cleanupMode = true;
    const cleanup = await cleanupActor({ evaluate, close, pollSettled }, { guardOwned, observerOwned, failed: !success, failure,
      recordMetadataAfter: evidence => mark('failure-postclose-metadata', evidence),
      exportFailure: r => (dependencies.writeReceipt || writeReceipt)(prepared.output.failure, r, prepared.binding) });
    mark('actor-cleanup', cleanup);
    c.report.actorFunctionalComplete = success && cleanup.confirmed; c.report.performanceAcceptance = 'NOT_QUALIFIED'; c.report.actorDeadlineFromInvocationMs = 330000;
    if (!cleanup.confirmed) { success = false; failure ||= 'ACTOR_CLEANUP_UNCONFIRMED'; }
  }
  if (!success) throw Error(failure || 'ACTOR_FUNCTIONAL_INCOMPLETE');
}
async function execute(label) {
  const startedAt = Date.now(), prepared = prepare(label), originalLog = console.log;
  // Common stores its full safe report on disk; stdout remains a compact progress feed.
  console.log = value => {
    let row; try { row = JSON.parse(value); } catch { originalLog(value); return; }
    if (row.schema === 'drive-original.actual-android-acceptance/1') originalLog(JSON.stringify({ stage: 'transport-finished', completed: row.completed === true, functionalComplete: row.actorFunctionalComplete === true, failure: row.failure || null, ownedForwardRemoved: row.ownedForwardRemoved === true, performanceAcceptance: 'NOT_QUALIFIED' }));
    else originalLog(value);
  };
  try { return await require('./android-common33.cjs')(__filename, prepared.output.report, c => runActor(c, prepared, { startedAt })); }
  finally { console.log = originalLog; }
}
if (require.main === module) {
  if (process.argv.length !== 4 || process.argv[2] !== '--execute') { console.error('Explicit invocation required: --execute <new-safe-label>'); process.exitCode = 1; }
  else execute(process.argv[3]).catch(e => { console.error(JSON.stringify({ failed: true, failure: code(e) })); process.exitCode = 1; });
}
module.exports = { names, prepare, scriptAdmission, physicalPoint, ownershipExpression, geometryExpression, maintainOwnedControls, summaryExpression, writeReceipt, cleanupActor, runActor, execute };
