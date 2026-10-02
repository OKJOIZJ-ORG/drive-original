'use strict';
// Local preparation/import/--plan are inert. Only --execute starts a new native lifetime.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const base = require('./android-q3-actor.cjs');
const DIR = __dirname, ROOT = path.resolve(DIR, '../..');
const BASE_SHA = 'f23515ade91f8f5bac2dc0d6b5dc7102c9adc30cc96b1f28776d2a9bd4165af8';
const EOF_HELPER_SHA = 'df9000db5f1670f5d7fe67f65baca427f610fdafa8994a46976b424e640f3854';
const RESOURCE_SHA = '5f533f7fe33d54a0134a3ca27e3d11900361d48d7082f523e17c1f1f85f8acbd';
const PRIVATE = path.join(ROOT, 'qa/v2-state-recovery-backup/q3-target-cua1-1-private.json');
const PRIVATE_SHA = '2604a0f5da6e1d380046b5c3dcc558e372e7e358104d3b5b63d2255c2f663167';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safeCode = e => /^[A-Z0-9_]+$/.test(e?.message || '') ? e.message : 'EOF_OPERATION_FAILED';
function names(label) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(label || '')) throw Error('NEW_SAFE_LABEL_REQUIRED');
  return { report: `actual-android-q3-eof-${label}-safe.json`, receipt: `actual-android-q3-eof-receipt-${label}-safe.json`, failure: `actual-android-q3-eof-failure-${label}-safe.json`, resource: `actual-android-q3-eof-resources-${label}-safe.json` };
}
function prepare(label) {
  const output = names(label); for (const name of [output.report, output.receipt, output.failure]) if (fs.existsSync(path.join(DIR, name))) throw Error('RESULT_ALREADY_EXISTS');
  if (hash(fs.readFileSync(path.join(DIR, 'android-q3-actor.cjs'))) !== BASE_SHA) throw Error('REUSED_ACTOR_DRIFT');
  const reused = base.prepare('eof-local-binding-only'), observer = fs.readFileSync(path.join(DIR, 'eof-observer.function.js'));
  if (hash(observer) !== EOF_HELPER_SHA) throw Error('EOF_HELPER_DRIFT');
  if (hash(fs.readFileSync(path.join(DIR, 'resource-watch.cjs'))) !== RESOURCE_SHA) throw Error('RESOURCE_WATCHER_DRIFT');
  // New helper/watcher pins belong to this producer; the inherited immutable manifest is untouched.
  return { ...reused, output, observer: observer.toString('utf8').trim(), observerSha256: hash(observer), baseSha256: BASE_SHA };
}
function plan(label) {
  const p = prepare(label);
  return { prepared: true, output: p.output, observerSha256: p.observerSha256, actualOperationPerformed: false,
    resourceCommand: `node qa/q3-actual-preparation/resource-watch.cjs --execute android ${p.output.resource} 350`, resourcePrerequisite: 'Root pins Q3_ANDROID_SERIAL privately and waits for ready:true/deviceVerified:true/available first sample before launching actor',
    actorCommand: `node qa/q3-actual-preparation/android-q3-eof-actor.cjs --execute ${label}`, actionDeadlineMs: 300000, cleanupDeadlineMs: 345000, screenshotsPlanned: 0,
    estimatedFit: 'Prior startup about14s +180s real1x +source proof/setup/close; expected about220-260s, finite300s action bound remains unchanged if slower' };
}
function resourceReady(file, now = Date.now()) {
  if (!/^actual-android-q3-eof-resources-[a-z0-9-]+-safe\.json$/.test(file)) throw Error('SAFE_RESOURCE_NAME_REQUIRED');
  const bytes = fs.readFileSync(path.join(DIR, file)); if (bytes.length > 1048576) throw Error('BOUNDED_RESOURCE_REPORT_REQUIRED');
  const r = JSON.parse(bytes), age = now - Date.parse(r.startedAt);
  if (r.kind !== 'android' || r.ready !== true || r.deviceVerified !== true || r.samples?.[0]?.available !== true || !Number.isFinite(age) || age < 0 || age > 60000 || r.maximumSeconds < 300 || r.maximumSeconds > 360 || r.cleanup !== null) throw Error('FRESH_RESOURCE_WATCHER_READY_REQUIRED');
  return { ready: true, startedAt: r.startedAt, firstSampleAt: r.samples[0].wallTime, firstSampleElapsedMs: r.samples[0].elapsedMs, maximumSeconds: r.maximumSeconds,
    scope: 'External named-main-Chrome PSS/RSS, battery temperature/thermal status, whole-device CPU delta/GPU counter ratio and global RAM/data disk; process attribution, GPU unit/window, renderer/GPU/native encoder peak UNKNOWN' };
}
function eofAdmission(source, binding) {
  return `async()=>{const owned=window.__q3ActorOwned33;if(!owned||owned.cleanupStarted||window.__q3ActualEof33)throw Error('EOF_HELPER_OWNERSHIP');try{const r=(${source})(${JSON.stringify(binding)},(${base.ownershipExpression()}));if(!owned.cleanupStarted){window.__q3ActorEofAdmission33=r;owned.refs.__q3ActorEofAdmission33=r;}return r;}finally{const ref=window.__q3ActualEof33;if(ref){owned.refs.__q3ActualEof33=ref;if(owned.cleanupStarted){ref.stop();if(window.__q3ActualEof33===ref)delete window.__q3ActualEof33;}}}}`;
}
function receipt(observation, baseObservation, binding, extra = {}) {
  return { schema: 'drive-original.q3-android-sustained-eof/1', version: binding.version, sourceCommit: binding.sourceCommit,
    recordedAt: new Date().toISOString(), complete: false, completeScope: 'Bounded observed180s native1x/current-owner EOF and complete admitted source program; not full output cadence/perceptual quality/performance',
    observation, baseObservation, rawIdentifiersExported: false, observerOnly: true, performanceAcceptance: 'NOT_QUALIFIED', fullOutputQuality: 'NOT_QUALIFIED', nativeRetainedHeap: 'UNKNOWN', gpuEncoderPeak: 'UNKNOWN', ...extra };
}
function write(name, r) {
  if (!/^actual-android-q3-eof-(?:receipt|failure)-[a-z0-9-]+-safe\.json$/.test(name) || r?.schema !== 'drive-original.q3-android-sustained-eof/1' || r.rawIdentifiersExported !== false || r.observerOnly !== true || r.fullOutputQuality !== 'NOT_QUALIFIED') throw Error('SAFE_EOF_RECEIPT_REQUIRED');
  const bytes = JSON.stringify(r, null, 2) + '\n'; if (Buffer.byteLength(bytes) > 2097152) throw Error('EOF_RECEIPT_LIMIT');
  fs.writeFileSync(path.join(DIR, name), bytes, { flag: 'wx' }); return { saved: true, complete: r.complete === true, bytes: Buffer.byteLength(bytes) };
}
async function run(c, p, dependencies = {}) {
  const started = dependencies.startedAt ?? Date.now(), actionEnd = started + 300000, cleanupEnd = started + 345000;
  let cleanupMode = false, guardOwned = false, observerOwned = false, eofOwned = false, eofStopped = null, observation = null, success = false, failure = null, failureSaved = false;
  const progress = dependencies.progress || (r => console.log(JSON.stringify(r)));
  const mark = (stage, data = {}) => { c.step(stage, data); progress({ stage, elapsedMs: Date.now() - started, ...data }); };
  const bounded = async (operation, cap = 35000) => {
    const left = (cleanupMode ? cleanupEnd : actionEnd) - Date.now(); if (left <= 0) throw Error('EOF_TOTAL_BOUND'); let timer;
    return Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('EOF_COMMAND_BOUND')), Math.min(left, cap, 35000)); })]).finally(() => clearTimeout(timer));
  };
  const evaluate = (fn, cap) => bounded(() => c.evaluateNative(fn), cap);
  const tapGeometry = async (kind, g) => { const point = base.physicalPoint(g); progress({ stage: `native-${kind}-input-ready`, elapsedMs: Date.now() - started }); c.adb(['shell', 'input', 'tap', String(point.x), String(point.y)]); mark(`native-${kind}`, { exactHit: true, quantizedHit: true }); };
  const tap = async kind => tapGeometry(kind, await evaluate(base.geometryExpression(kind)));
  const keepControls = cap => base.maintainOwnedControls({ geometry: kind => evaluate(base.geometryExpression(kind), cap), tap: tapGeometry });
  const poll = async (stage, ms, expression, accepted, upkeep = false) => {
    const end = Math.min(Date.now() + ms, cleanupMode ? cleanupEnd : actionEnd); let lastProgress = Date.now(), lastTap = -Infinity;
    while (Date.now() < end) {
      const value = await evaluate(expression, Math.max(1, end - Date.now()));
      if (value.sourceSame === false || value.accountSame === false || value.visible === false || value.fenceFailure || value.failed) throw Error('EOF_OBSERVER_FENCE');
      if (accepted(value)) { mark(stage, { observed: true, sourceTime: value.sourceTime ?? null }); return value; }
      if (upkeep && Date.now() - lastTap >= 1500) { const r = await keepControls(Math.max(1, end - Date.now())); if (r.tapped) lastTap = Date.now(); }
      if (Date.now() - lastProgress >= 5000) { progress({ stage, elapsedMs: Date.now() - started, sourceTime: value.sourceTime ?? null, nativeEnded: value.nativeEnded === true, sourceProgramComplete: value.sourceProgramComplete === true, workerComplete: value.workerComplete === true, frameCount: value.frameCount ?? null, phase: value.phase ?? null, appends: value.appends ?? null, nativeBufferedEnd: value.nativeBufferedEnd ?? null }); lastProgress = Date.now(); }
      await c.wait(200);
    }
    throw Error(`EOF_${stage.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_BOUND`);
  };
  const close = () => base.closeOwnedNative({ geometry: (kind, ms) => evaluate(base.geometryExpression(kind), ms), tap: tapGeometry, wait: ms => c.wait(ms) }, { deadline: cleanupMode ? cleanupEnd : actionEnd, inputBudgetMs: 20000 });
  const pollSettled = () => poll('owners-settled', 15000, `()=>({settled:el.playerSheet.hidden&&!q0Playback&&!q1Playback&&!q3Choice&&q1RetirementResult?.settled===true&&!el.videoPlayer.getAttribute('src')})`, r => r.settled);
  const install = async (file, dest, api) => { if (api === '__q3ActualReplay33') observerOwned = true; await evaluate(base.scriptAdmission(p.scripts[file], dest, api)); mark(`install-${api}`, { installed: true }); };
  try {
    const resources = (dependencies.resourceReady || resourceReady)(p.output.resource); mark('external-resource-watcher-ready', resources);
    if (c.report.model !== 'SM-X800' || c.report.android !== '16' || !/^Physical size:\s*1752x2800\s*$/.test(c.report.physicalScreen)) throw Error('EXACT_PHYSICAL_DEVICE_REQUIRED');
    await bounded(() => c.unmaskNativeVisibility()); await bounded(() => c.releaseMcpForNativeLifecycle());
    const admission = await evaluate(`()=>({identity:location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'&&APP_VERSION==='1.22.0-rc.34',idle:el.playerSheet.hidden&&state.selected===null&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true,account:!!state.accountId&&!!state.authAccountKey&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken(),visible:document.visibilityState==='visible',writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null&&!state.loadingFiles,globalsAbsent:!window.__q3ActorOwned33&&!window.__q3ActualTarget33&&!window.__q3ActualReplay33&&!window.__q3PcSeekTargets33&&!window.__resumeSwProof&&!window.__q3ActualReceipt33&&!window.__q3ActualEof33&&!window.__q3ActorEofAdmission33,nativeLoopOff:el.videoPlayer.loop===false,nativeRate1x:el.videoPlayer.playbackRate===1,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})`);
    mark('admission', { ...admission, endedHandlerScope: 'Source-bound app ended handler clears seek/frame watchdogs only; no auto-next/replay handler or repeat preference is implemented' }); if (!['identity', 'idle', 'account', 'visible', 'writerIdle', 'globalsAbsent', 'nativeLoopOff', 'nativeRate1x'].every(k => admission[k] === true) || admission.width !== 824 || admission.height !== 1191 || admission.dpr !== 2.125) throw Error('EOF_IDLE_ADMISSION_REQUIRED');
    guardOwned = true; await evaluate(`()=>{window.__q3ActorOwned33={refs:{},cleanupStarted:false,sourceSHA256:${JSON.stringify(p.binding.sourceSHA256)},identity:{accountId:state.accountId,authAccountKey:state.authAccountKey,authGeneration:state.authGeneration,driveSessionGeneration:state.driveSessionGeneration}};return{owned:true};}`);
    const privateBytes = fs.readFileSync(PRIVATE); if (hash(privateBytes) !== PRIVATE_SHA) throw Error('PRIVATE_TARGET_DRIFT'); const holder = JSON.parse(privateBytes.toString('utf8'));
    await evaluate(`()=>{const h=${JSON.stringify(holder)};window.__q3ActualTarget33=h;window.__q3ActorOwned33.refs.__q3ActualTarget33=h;return{installed:true};}`);
    await install('source-proof.expression.js', '__q3ActorProofAdmission33', '__resumeSwProof');
    await install('observer.expression.js', '__q3ActorObserverAdmission33', '__q3ActualReplay33');
    mark('fresh-metadata-before', await evaluate("()=>window.__q3ActualReplay33.metadata('before')"));
    eofOwned = true; mark('eof-observer-admission', await evaluate(eofAdmission(p.observer, p.binding)));
    const folder = await evaluate('()=>{const h=window.__q3ActualTarget33,t=h.metadata||h.target||h.file||h;return{alreadyOpen:state.currentFolderId===t.parents[0]};}');
    if (!folder.alreadyOpen) { await tap('folder'); await poll('folder-open', 15000, '()=>{const h=window.__q3ActualTarget33,t=h.metadata||h.target||h.file||h;return{open:state.currentFolderId===t.parents[0]&&!state.loadingFiles};}', r => r.open); }
    await evaluate("()=>window.__q3ActualReplay33.arm('native')"); await tap('card');
    await poll('native-rejection-offer', 30000, base.summaryExpression('native'), r => r.nativeRejection && r.offer);
    await evaluate("()=>window.__q3ActualReplay33.arm('startup')"); await tap('choice');
    await poll('q3-startup', 40000, base.summaryExpression('startup'), r => r.frame && r.label && r.choice, true);
    // No seeks, pause, playbackRate writes, product functions or synthetic input are used.
    await poll('sustained-native-eof', actionEnd - Date.now(), `()=>{const r=window.__q3ActualEof33.read(),o=(${base.ownershipExpression()})();return{qualified:r.qualified,failed:Object.values(r.failures).some(Boolean),sourceSame:o.sourceSame,accountSame:o.accountSame,visible:o.visible,sourceTime:r.lastFrame?.sourceTime??null,frameCount:r.frameCount,nativeEnded:!!r.nativeEnded,sourceProgramComplete:r.sourceCompletion.admittedSourceProgramComplete,workerComplete:r.sourceCompletion.workerComplete,phase:r.progress.phase,appends:r.progress.appends,nativeBufferedEnd:r.progress.nativeBufferedEnd};}`, r => r.qualified, true);
    observation = await evaluate('()=>window.__q3ActualEof33.read()'); if (!observation.qualified) throw Error('CURRENT_EOF_REQUIRED');
    eofStopped = await evaluate('()=>window.__q3ActorOwned33.refs.__q3ActualEof33.stop()');
    await close(); await pollSettled(); mark('fresh-metadata-after', await evaluate("()=>window.__q3ActualReplay33.metadata('after')"));
    const original = await evaluate('()=>window.__q3ActualReplay33.read()'), observerCleanup = await evaluate('()=>window.__q3ActualReplay33.stop()');
    const complete = observation.qualified && original.nativeRejectionObserved && original.explicitChoiceObserved && original.closedOwnership
      && original.metadataResults.length === 2 && original.metadataResults.every(r => ['sameExactTarget', 'stableMetadataSame', 'freshRevisionChecksumSame', 'accountSame', 'sourceSame', 'notTrashed', 'canDownload'].every(k => r[k] === true)) && eofStopped.removed === true && observerCleanup.removed === true;
    const saved = (dependencies.write || write)(p.output.receipt, receipt(observation, original, p.binding, { complete, eofObserverCleanup: eofStopped, observerCleanup, resourceTimeline: resources })); mark('safe-sustained-eof-receipt', saved);
    if (!complete) throw Error('SUSTAINED_EOF_RECEIPT_INCOMPLETE'); success = true;
  } catch (e) { failure = safeCode(e); mark('eof-actor-failure', { failure }); }
  finally {
    cleanupMode = true;
    if (eofOwned && !observation) try { observation = await evaluate('()=>window.__q3ActorOwned33?.refs.__q3ActualEof33?.read()||null'); } catch { failure ||= 'EOF_FAILURE_READ_UNCONFIRMED'; }
    if (!success && observerOwned) try {
      const original = await evaluate('()=>window.__q3ActorOwned33?.refs.__q3ActualReplay33?.read()||null');
      if (original) { const preserved = (dependencies.write || write)(p.output.failure, receipt(observation, original, p.binding, { actorFailure: failure })); failureSaved = preserved.saved === true; mark('preserved-failure-before-observer-stop', preserved); }
    } catch { failure ||= 'EOF_FAILURE_EXPORT_UNCONFIRMED'; }
    if (eofOwned && !eofStopped) try { eofStopped = await evaluate('()=>window.__q3ActorOwned33?.refs.__q3ActualEof33?.stop()||null'); } catch { failure ||= 'EOF_OBSERVER_STOP_UNCONFIRMED'; }
    const cleanup = await base.cleanupActor({ evaluate, close, pollSettled }, { guardOwned, observerOwned, failed: !success, failure,
      recordMetadataAfter: r => mark('failure-postclose-metadata', r), exportFailure: original => failureSaved ? { saved: true, complete: false, retainedOriginalPreStopFailure: true } : (dependencies.write || write)(p.output.failure, receipt(observation, original, p.binding, { actorFailure: failure, eofObserverCleanup: eofStopped })) });
    const eofCleanupConfirmed = !eofOwned || eofStopped?.removed === true && eofStopped.intervalRemoved === true && eofStopped.rvfcRemoved === true && eofStopped.nativeListenersRemoved === true;
    mark('eof-actor-cleanup', { ...cleanup, eofCleanupConfirmed }); c.report.sustainedFunctionalComplete = success && cleanup.confirmed && eofCleanupConfirmed; c.report.fullOutputQuality = 'NOT_QUALIFIED'; c.report.nativeRetainedHeap = 'UNKNOWN';
    c.report.eofObserverSha256 = p.observerSha256; c.report.reusedActorSha256 = p.baseSha256; c.report.actorDeadlineFromInvocationMs = 345000;
    if (!cleanup.confirmed || !eofCleanupConfirmed) { success = false; failure ||= 'EOF_CLEANUP_UNCONFIRMED'; }
  }
  if (!success) throw Error(failure || 'SUSTAINED_EOF_INCOMPLETE');
}
async function execute(label) {
  const startedAt = Date.now(), p = prepare(label), originalLog = console.log;
  console.log = value => { let r; try { r = JSON.parse(value); } catch { originalLog(value); return; } if (r.schema === 'drive-original.actual-android-acceptance/1') originalLog(JSON.stringify({ stage: 'transport-finished', completed: r.completed === true, sustainedFunctionalComplete: r.sustainedFunctionalComplete === true, failure: r.failure || null, ownedForwardRemoved: r.ownedForwardRemoved === true, fullOutputQuality: 'NOT_QUALIFIED' })); else originalLog(value); };
  try { return await require('./android-common33.cjs')(__filename, p.output.report, c => run(c, p, { startedAt })); } finally { console.log = originalLog; }
}
if (require.main === module) { const args = process.argv.slice(2); if (args.length !== 2 || !['--plan', '--execute'].includes(args[0])) { console.error('Explicit --plan or --execute <new-safe-label> required'); process.exitCode = 1; } else if (args[0] === '--plan') { try { console.log(JSON.stringify(plan(args[1]))); } catch (e) { console.error(safeCode(e)); process.exitCode = 1; } } else execute(args[1]).catch(e => { console.error(safeCode(e)); process.exitCode = 1; }); }
module.exports = { names, prepare, plan, resourceReady, eofAdmission, receipt, write, run, execute };
