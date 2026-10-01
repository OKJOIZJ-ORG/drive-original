'use strict';
// Additive runtime-only driver. Importing never reads private input or connects a device.
const fs = require('node:fs'), path = require('node:path');
const gate = require('./binding-gate.cjs');
const { loadPrivate, inputCommand } = require('./android-replay.cjs');
const SUPPLEMENT_SHA = 'fbbb95b7f89bc9c56f8df9659ef0ab309fb823b3c47dd5e5ea495046246987d7';
const FROZEN_HELPERS = Object.freeze({
  'audio-seek-remaining.expression.js': SUPPLEMENT_SHA,
  'audio-seek-supplement.expression.js': '41305a9e20b7329cb9f46055e3b0d256848373f19211655c7fd0f15a1bd42967',
  'android-audio-seek-supplement.cjs': '0111dd5c0edf91070022251934b143bd379e77f565707c6eaba594e66ae755cc',
  'android-common.cjs': 'c6822041c663495142b71356db26caed3270722dafa6d37a449713a659cc1286',
  'android-replay.cjs': 'a4bc2d94a8fbb6ca51391c8e2e0434c4d33c1bddb13cbdef6cef0bf111430fd3',
  'binding-gate.cjs': 'ba6e36462177a0a0f434d001bd78523c5799d6ef40b21cf785248916c239ad9a',
  'observer.expression.js': '7faaac95009e1519369de5bd2575925fa60558ff96a00352978dc5f98bc8bc68',
  'source-proof.expression.js': 'ca83526c00330c7391da8c6d1f9d28b3321f799570fdd300826c670743b02d52',
  'native-folder-target.function.js': '81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a',
  'native-ui-target-v3.function.js': '0e2af51d9c2234a4f81b447474838ef61954addf2b9618426c6442faa023d73e'
});
function verifyHelpers(base = __dirname) {
  for (const [name, expected] of Object.entries(FROZEN_HELPERS))
    if (gate.sha(fs.readFileSync(path.join(base, name))) !== expected) throw Error('REMAINING_HELPER_SOURCE_DRIFT');
  return { helperCount: Object.keys(FROZEN_HELPERS).length, remainingSHA256: SUPPLEMENT_SHA, sourceFrozen: true };
}
function fractions(value = 'both') {
  if (value === 'both') return [.5, .9];
  if (value === .5 || value === '.5') return [.5];
  if (value === .9 || value === '.9') return [.9];
  throw Error('REMAINING_FRACTION_REQUIRED');
}
function quantizedSeek(g, height, duration, fraction) {
  if (!fractions(fraction).includes(fraction) || !Number.isFinite(duration) || duration <= 0
      || !Number.isFinite(g?.left) || !Number.isFinite(g?.width) || g.width <= 0) throw Error('NATIVE_SEEK_QUANTIZATION_BOUND');
  const point = physicalPoint(g, height), targetSeconds = duration * fraction;
  const quantizedTargetSeconds = (point[0] / g.dpr - g.left) / g.width * duration;
  const distanceSeconds = Math.abs(quantizedTargetSeconds - targetSeconds);
  if (!Number.isFinite(distanceSeconds) || distanceSeconds > .75) throw Error('NATIVE_SEEK_QUANTIZATION_BOUND');
  return { point, targetSeconds, quantizedTargetSeconds, distanceSeconds, toleranceSeconds: .75 };
}
function liveQualified(receipt, fraction) {
  return (fraction === .5 || fraction === .9) && receipt?.schema === 'drive-original.rc32-audio-seek-remaining/1'
    && receipt.sourceCommit === gate.COMMIT && receipt.version === gate.VERSION && receipt.qualified === true
    && receipt.seek?.fraction === fraction && receipt.seek.passed === true && receipt.seek.nativeInputObserved === true
    && receipt.audio?.passed === true && receipt.audio.nativeUserActivationAtAdmission === true
    && receipt.audio.nonzeroWindows >= 3 && receipt.audio.videoFrames >= 2 && receipt.audio.videoTimeAdvanced === true
    && receipt.audio.sampleTimeAdvanced === true && receipt.audio.nativeTimeAdvanced === true
    && Number.isFinite(receipt.audio.maxNativeFrameDistanceSeconds) && receipt.audio.maxNativeFrameDistanceSeconds <= .75
    && Number.isFinite(receipt.audio.maxNativeAudioClockDifferenceSeconds) && receipt.audio.maxNativeAudioClockDifferenceSeconds <= .75
    && Array.isArray(receipt.metadata) && receipt.metadata.length === 2
    && ['before', 'after'].every(label => receipt.metadata.filter(r => r.label === label && r.qualified === true && r.timeBracketed === true).length === 1)
    && receipt.rawIdentifiersExported === false && receipt.rawPcmExported === false && supplementCleanupQualified(receipt);
}
function resultPath(name) {
  if (!/^actual-android-rc32-audio-seek-remaining-[a-z0-9-]+-safe\.json$/.test(name)) throw Error('RESULT_NAME_INVALID');
  return path.join(__dirname, name);
}
function physicalPoint(g, physicalHeight) {
  if (!g?.available || ![g.x, g.y, g.dpr, g.viewportHeight, physicalHeight].every(Number.isFinite)
      || g.dpr <= 0 || physicalHeight <= 0) throw Error('NATIVE_GEOMETRY_INVALID');
  return [Math.round(g.x * g.dpr), Math.round(physicalHeight - g.viewportHeight * g.dpr + g.y * g.dpr)];
}
function metadataQualified(r) {
  return r?.status === 200 && ['sameExactTarget', 'stableMetadataSame', 'freshRevisionChecksumSame',
    'accountSame', 'sourceSame', 'notTrashed', 'canDownload'].every(k => r[k] === true);
}
function supplementCleanupQualified(r) {
  return r?.disposed === true && !!r.cleanup && Object.keys(r.cleanup).length === 6
    && ['tracksStopped', 'nodesDisconnected', 'contextClosed', 'frameCancelled', 'timersCleared', 'listenersRemoved'].every(k => r.cleanup[k] === true);
}
async function execute(privateFile, resultName, fraction = 'both') {
  const phases = fractions(fraction), workBoundMs = phases.length === 2 ? 240000 : 180000, totalBoundMs = workBoundMs + 60000;
  const output = resultPath(resultName);
  if (fs.existsSync(output)) throw Error('RESULT_ALREADY_EXISTS');
  const helperFreeze = verifyHelpers();
  const binding = gate.verifyBound();
  const supplement = fs.readFileSync(path.join(__dirname, 'audio-seek-remaining.expression.js'), 'utf8');
  if (gate.sha(Buffer.from(supplement)) !== SUPPLEMENT_SHA) throw Error('SUPPLEMENT_SOURCE_DRIFT');
  const observer = fs.readFileSync(path.join(__dirname, 'observer.expression.js'), 'utf8');
  const sourceProof = fs.readFileSync(path.join(__dirname, 'source-proof.expression.js'), 'utf8');
  const folderResolver = fs.readFileSync(path.join(__dirname, 'native-folder-target.function.js'), 'utf8');
  const uiResolver = fs.readFileSync(path.join(__dirname, 'native-ui-target-v3.function.js'), 'utf8');
  const input = loadPrivate(privateFile); // Root supplies this protected path only at actual invocation.
  // Reserve exclusively before transport work; the common owns subsequent writes to this attempt.
  fs.closeSync(fs.openSync(output, 'wx'));
  return require('./android-common.cjs')(__filename, resultName, async c => {
    const preparedAt = Date.now(); let actualAt = null, installed = false, supplementInstalled = false;
    let privateInstalled = false, proofSaved = false, ownsPlayer = false, navigations = 0, cleanupComplete = true;
    const fail = code => { throw Error(code); };
    const within = () => {
      // Preparation has its own180s bound;60s is reserved after work for cleanup.
      if (actualAt === null ? Date.now() - preparedAt > 180000 : Date.now() - actualAt > workBoundMs)
        fail(actualAt === null ? 'PREPARATION_TOTAL_BOUND' : 'SUPPLEMENT_UNIT_TOTAL_BOUND');
    };
    const evaluate = async fn => { within(); return c.evaluateNative(fn); };
    const current = () => evaluate(`()=>({version:APP_VERSION,portrait:innerHeight>innerWidth,closed:el.playerSheet.hidden,
      online:state.authStatus==='online',accountLoaded:state.accountStateLoaded,retired:q1RetirementResult?.settled===true,
      q0:!!q0Playback,q1:!!q1Playback,blob:!!state.mediaBlobUrl,frameOwner:state.frameCallbackId!==null,
      paused:getActiveMediaElement()?.paused??null})`);
    // These bounded exports omit the frozen observer's frame/sample/event journals.
    const startupRead = (cleanupRead = false) => (cleanupRead ? c.evaluateNative : evaluate)(`()=>{const r=window.__rc32TsReplay.read(),p=r.phases.find(p=>p.label==='startup');
      return{sourceSame:r.latest.sourceSame,accountSame:r.latest.accountSame,targetSame:r.latest.targetSame,
        route:r.latest.route,paused:r.latest.native?.paused??null,error:r.latest.native?.error||null,
        pipelineFailure:r.latest.pipeline?.failure||null,fenceFailure:!!p?.fenceFailure,
        firstTargetFrame:p?.firstTargetFrame||null};}`);
    const supplementRead = () => evaluate('()=>window.__rc32AudioSeekRemaining.read()');
    const observerStop = async () => {
      const cleaned = await c.evaluateNative('()=>window.__rc32TsReplay.stop()');
      if (!cleaned.disposed || !cleaned.removed || !cleaned.frameCallbackRemoved || !cleaned.mediaListenersRemoved) fail('OBSERVER_CLEANUP_UNCONFIRMED');
      installed = false; await c.evaluateNative('()=>{delete window.__rc32TsReplay;return{removed:true};}');
    };
    const geometry = (key, options = {}) => {
      if (!['card', 'folder', 'folderMoreButton', 'searchInput', 'ctrlPlayPause', 'mediaStage',
        'playerControlsEntry', 'seekBarContainer'].includes(key)) fail('NATIVE_KEY_NOT_ALLOWED');
      return evaluate(key === 'folder' ? `()=>(${folderResolver})(window.__rc32AndroidRemainingPrivate.nextFolder)`
        : `()=>(${uiResolver})(${JSON.stringify(key)},${JSON.stringify(options)})`);
    };
    const screenHeight = Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);
    if (!screenHeight) fail('PHYSICAL_SCREEN_UNKNOWN');
    const tap = async (key, settleMs = 500) => {
      const g = await geometry(key), [x, y] = physicalPoint(g, screenHeight);
      c.adb(['shell', 'input', 'tap', String(x), String(y)]); await c.wait(settleMs); return g;
    };
    const controls = async () => {
      if ((await geometry('seekBarContainer')).available) return;
      let entry = await geometry('playerControlsEntry');
      if (!entry.available && !entry.controlsIdle) { await tap('mediaStage'); entry = await geometry('playerControlsEntry'); }
      if (!entry.available) fail('NATIVE_ENTRY_UNAVAILABLE'); await tap('playerControlsEntry');
      const end = Date.now() + 2000;
      do { if ((await geometry('seekBarContainer')).available) return; await c.wait(200); } while (Date.now() < end);
      fail('NATIVE_SEEK_TARGET_UNAVAILABLE');
    };
    const pause = async wanted => {
      let r = await current(); if (r.paused === wanted) return;
      if ((await geometry('ctrlPlayPause')).available) { await tap('ctrlPlayPause'); r = await current(); }
      for (let attempt = 0; r.paused !== wanted && attempt < 2; attempt++) { await tap('mediaStage'); r = await current(); }
      c.step('normal native playback state', { wantedPaused: wanted, actualPaused: r.paused, nativeOsInput: true });
      if (r.paused !== wanted) fail('NATIVE_PAUSE_UNCONFIRMED');
    };
    // Cleanup uses direct transport so an expired work budget cannot suppress retirement.
    const close = async () => {
      const read = () => c.evaluateNative(`()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,
        q0:!!q0Playback,q1:!!q1Playback,blob:!!state.mediaBlobUrl,frameOwner:state.frameCallbackId!==null})`);
      let s = await read(); if (!s.closed) c.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      const end = Date.now() + 15000;
      while (!(s.closed && s.retired && !s.q0 && !s.q1 && !s.blob && !s.frameOwner) && Date.now() < end) {
        await c.wait(250); s = await read();
      }
      c.step('normal Back and source retirement', s);
      if (!(s.closed && s.retired && !s.q0 && !s.q1 && !s.blob && !s.frameOwner)) fail('PLAYER_RETIREMENT_UNCONFIRMED');
    };
    try {
      await c.unmaskNativeVisibility(); await c.releaseMcpForNativeLifecycle();
      const before = await current(); c.step('closed source32 actual admission', before);
      if (c.report.model !== 'SM-X800' || before.version !== binding.version || !before.closed || !before.portrait
          || !before.online || !before.accountLoaded || !before.retired || before.q0 || before.q1 || before.blob)
        fail('ANDROID_SUPPLEMENT_ADMISSION');
      await evaluate(`()=>{if(window.__rc32TsReplay||window.__rc32AudioSeekRemaining||window.__resumeReplayTarget30
        ||window.__rc32AndroidRemainingPrivate||window.__rc32AndroidRemainingPriorProof||window.__rc32AudioSeekSupplement||window.__rc32AndroidReplayPrivate||window.__rc32AndroidPriorProof||window.__rc32PrivateTarget)throw Error('PRIVATE_HELPER_ALREADY_OWNED');
        window.__rc32AndroidRemainingPriorProof=window.__resumeSwProof;return{saved:true};}`); proofSaved = true;
      c.step('immutable source module shell/controller proof', await evaluate('async()=>(' + sourceProof.trim() + ')'));
      const ready = await evaluate(`()=>{const input=${JSON.stringify(input)};
        if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)return{ready:false};
        window.__resumeReplayTarget30=input;window.__rc32AndroidRemainingPrivate={query:el.searchInput.value,scrollY:window.scrollY,folderId:state.currentFolderId,nextFolder:null};
        return{ready:true,accountSame:true};}`);
      if (!ready.ready) fail('PRIVATE_ACCOUNT_MISMATCH'); privateInstalled = true;
      if (!await evaluate('()=>el.searchInput.value===""||el.searchInput.value===window.__resumeReplayTarget30.target.name')) fail('NORMAL_SEARCH_PRESTATE_REQUIRED');
      for (const folder of input.folderPath) {
        if (await evaluate('()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)')) break;
        await evaluate(`()=>{window.__rc32AndroidRemainingPrivate.nextFolder=${JSON.stringify(folder)};return{ready:true};}`);
        let g = await geometry('folder');
        if (!g.currentFolderSame) {
          for (let i = 0; !g.available && g.metadataUnique && g.moreVisible && i < 3; i++) { await tap('folderMoreButton'); g = await geometry('folder'); }
          if (!g.available) fail('NORMAL_FOLDER_TARGET_UNAVAILABLE'); await tap('folder'); navigations++;
        }
        const end = Date.now() + 25000; let settled;
        do { await c.wait(250); settled = await evaluate(`()=>({same:state.currentFolderId===window.__rc32AndroidRemainingPrivate.nextFolder.id,
          loading:!!state.loadingFiles||!!state.loadingTree,population:state.files.length>0||state.folders.length>0})`);
        } while (!(settled.same && !settled.loading && settled.population) && Date.now() < end);
        if (!(settled.same && !settled.loading && settled.population)) fail('NORMAL_FOLDER_POPULATION_UNCONFIRMED');
      }
      const already = await evaluate('()=>el.searchInput.value===window.__resumeReplayTarget30.target.name');
      if (!already) {
        const command = inputCommand(input.target.name); if (!command) fail('NATIVE_ASCII_SEARCH_UNSUPPORTED');
        await tap('searchInput'); c.adb(command); c.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      }
      let found; const searchEnd = Date.now() + 40000;
      do { await c.wait(250); found = await evaluate(`()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,
        querySame:el.searchInput.value===window.__resumeReplayTarget30.target.name,loading:!!state.loadingFiles||!!state.loadingTree})`);
      } while (!(found.found && found.querySame && !found.loading) && Date.now() < searchEnd);
      if (!(found.found && found.querySame && !found.loading)) fail('TARGET_NOT_IN_CURRENT_LIBRARY');
      const card = await geometry('card'); physicalPoint(card, screenHeight);
      c.step('all helpers source target input export and native card prepared before observer clocks', { ...found,
        nativeSearchInput: !already, ...helperFreeze, fractions: phases, workBoundMs, totalBoundMs, sourceCommit: binding.sourceCommit });
      Object.assign(c.report, { schema: 'drive-original.actual-android-audio-seek-remaining/1', fractions: phases,
        sourceCommit: binding.sourceCommit, helperSHA256: FROZEN_HELPERS, liveReceipts: [], failedLiveReceipts: [],
        privateInputExported: false, noForcedUserGesture: true, workBoundMs, totalBoundMs });
      const credential = await evaluate('()=>({expiresInMs:state.expiresAt-Date.now()})');
      if (!(Number.isFinite(credential.expiresInMs) && credential.expiresInMs > totalBoundMs)) fail('CREDENTIAL_LIFETIME_REQUIRED');
      actualAt = Date.now();
      c.step('fresh startup observer installation', await evaluate('()=>(' + observer.trim() + ')')); installed = true;
      await evaluate('()=>window.__rc32TsReplay.arm("startup",{targetSeconds:0,toleranceSeconds:3})');
      ownsPlayer = true; await tap('card');
      let startup; const startEnd = Date.now() + 45000;
      do { await c.wait(250); startup = await startupRead(); } while (!startup.firstTargetFrame && !startup.error
        && !startup.pipelineFailure && !startup.fenceFailure && Date.now() < startEnd);
      c.step('startup only to reach missing seek/audio', startup);
      if (!startup.firstTargetFrame || startup.route !== 'Q1_TS' || startup.error || startup.pipelineFailure
          || startup.fenceFailure || !startup.sourceSame || !startup.accountSame || !startup.targetSame) fail('STARTUP_UNCONFIRMED');
      await observerStop();
      for (const nextFraction of phases) {
        within(); await pause(true); await controls();
        const slider = await geometry('seekBarContainer', { xFraction: nextFraction });
        const duration = await evaluate('()=>q1Playback?.player?.stats()?.duration||getActiveMediaElement()?.duration');
        const intent = quantizedSeek(slider, screenHeight, duration, nextFraction);
        // Prepare resume geometry before arming. Never consume activation with a post-tap delay.
        physicalPoint(await geometry('ctrlPlayPause'), screenHeight);
        c.step('fresh per-fraction metadata observer', await evaluate('()=>(' + observer.trim() + ')')); installed = true;
        const metaBefore = await evaluate('()=>window.__rc32TsReplay.metadata("before")');
        c.step('fresh immutable metadata before remaining fraction', { fraction: nextFraction, ...metaBefore });
        if (!metadataQualified(metaBefore)) fail('FRESH_METADATA_MISMATCH');
        c.step('exact bounded remaining observer installation', await evaluate('()=>(' + supplement.trim() + ')')); supplementInstalled = true;
        const armed = await evaluate('()=>window.__rc32AudioSeekRemaining.armSeek(' + nextFraction + ')');
        c.step('one trusted native remaining seek intent', { fraction: nextFraction, duration, ...armed,
          quantizedTargetSeconds: intent.quantizedTargetSeconds, quantizationDistanceSeconds: intent.distanceSeconds,
          nativeOsInput: true, humanFingerInput: false });
        c.adb(['shell', 'input', 'swipe', String(intent.point[0]), String(intent.point[1]), String(intent.point[0]), String(intent.point[1]), '120']);
        let receipt; const seekEnd = Date.now() + 46000;
        do { await c.wait(200); receipt = await supplementRead(); } while (!receipt.seek?.completed && Date.now() < seekEnd);
        c.step('remaining presented frame and settlement', { fraction: nextFraction, receipt });
        if (!receipt.seek?.passed || receipt.seek.fraction !== nextFraction || !receipt.seek.nativeInputObserved) fail('REMAINING_SEEK_UNCONFIRMED');
        const [resumeX, resumeY] = physicalPoint(await geometry('ctrlPlayPause'), screenHeight);
        // Native ADB button input supplies real activation. No synthetic event/CDP userGesture.
        c.adb(['shell', 'input', 'tap', String(resumeX), String(resumeY)]);
        const started = await evaluate(`async()=>{try{return{started:true,receipt:await window.__rc32AudioSeekRemaining.startAudio()};}
          catch(e){return{started:false,failure:/^[A-Z0-9_]+$/.test(e.message)?e.message:'AUDIO_START_UNCONFIRMED'};}}`);
        c.step('immediate real-activation native PCM start', { fraction: nextFraction, ...started });
        if (!started.started) fail(started.failure);
        const audioEnd = Date.now() + 9000;
        do { await c.wait(150); receipt = await supplementRead(); } while (!receipt.audio?.completed && Date.now() < audioEnd);
        c.step('remaining native rendered PCM and AV clocks', { fraction: nextFraction, receipt });
        if (!receipt.audio?.passed) fail('REMAINING_PCM_UNCONFIRMED');
        const cleaned = await evaluate('()=>window.__rc32AudioSeekRemaining.stop()');
        if (!supplementCleanupQualified(cleaned)) fail('SAMPLER_CLEANUP_UNCONFIRMED');
        const metaAfter = await evaluate('()=>window.__rc32TsReplay.metadata("after")');
        c.step('fresh immutable metadata after output', { fraction: nextFraction, ...metaAfter });
        if (!metadataQualified(metaAfter)) fail('FRESH_METADATA_MISMATCH');
        receipt = await supplementRead();
        // Preserve qualified LIVE evidence before close; post-close fences are expected to fail.
        c.report.liveReceipts.push({ fraction: nextFraction, receipt });
        c.step('qualified live remaining receipt before close', { fraction: nextFraction, passed: liveQualified(receipt, nextFraction), receipt });
        if (!liveQualified(receipt, nextFraction)) fail('REMAINING_LIVE_QUALIFICATION_UNCONFIRMED');
        await observerStop();
        await c.evaluateNative('()=>{delete window.__rc32AudioSeekRemaining;return{removed:true};}'); supplementInstalled = false;
      }
      c.report.functionalPassed = c.report.liveReceipts.length === phases.length
        && c.report.liveReceipts.every(x => liveQualified(x.receipt, x.fraction));
    } catch (error) {
      c.report.operationFailure = /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OPERATION_FAILED';
      if (supplementInstalled) try { const receipt = await c.evaluateNative('()=>window.__rc32AudioSeekRemaining.read()');
        c.report.failedLiveReceipts ||= []; c.report.failedLiveReceipts.push(receipt);
        c.step('retained failed live remaining receipt before close', { receipt }); }
        catch { c.step('failed live safe read boundary', { confirmed: false }); }
      else if (installed) try { c.step('retained failed startup before close', await startupRead(true)); }
        catch { c.step('failed startup safe read boundary', { confirmed: false }); }
      throw error;
    } finally {
      if (supplementInstalled) try { const cleaned = await c.evaluateNative('()=>window.__rc32AudioSeekRemaining.stop()');
        c.step('owned supplement cleanup', cleaned);
        if (!supplementCleanupQualified(cleaned)) cleanupComplete = false; }
        catch { cleanupComplete = false; c.step('supplement cleanup unconfirmed', { confirmed: false }); }
      if (ownsPlayer) try { await close(); } catch { cleanupComplete = false; c.step('close cleanup unconfirmed', { confirmed: false }); }
      if (installed) try { const cleaned = await c.evaluateNative('()=>window.__rc32TsReplay.stop()');
        c.step('owned frozen observer cleanup', cleaned);
        if (!cleaned.disposed || !cleaned.removed || !cleaned.frameCallbackRemoved || !cleaned.mediaListenersRemoved) cleanupComplete = false; }
        catch { cleanupComplete = false; c.step('observer cleanup unconfirmed', { confirmed: false }); }
      for (let i = 0; i < navigations; i++) try { c.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']); await c.wait(400); }
        catch { cleanupComplete = false; }
      if (privateInstalled) try {
        const end = Date.now() + 10000; let restoration;
        do { restoration = await c.evaluateNative(`()=>({folderSame:state.currentFolderId===window.__rc32AndroidRemainingPrivate.folderId,
          loading:!!state.loadingFiles||!!state.loadingTree})`);
          if (restoration.folderSame && !restoration.loading) break; await c.wait(250);
        } while (Date.now() < end);
        c.step('ordinary Back original folder settled restoration', restoration);
        if (!restoration.folderSame || restoration.loading) cleanupComplete = false;
      } catch { cleanupComplete = false; c.step('folder settled restoration unconfirmed', { confirmed: false }); }
      if (privateInstalled) try { const restored = await c.evaluateNative(`()=>{const q=window.__rc32AndroidRemainingPrivate;
        if(q){el.searchInput.value=q.query;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));window.scrollTo(0,q.scrollY);}
        const folderRestored=!!q&&state.currentFolderId===q.folderId,queryRestored=!!q&&el.searchInput.value===q.query;
        delete window.__rc32AudioSeekRemaining;delete window.__rc32TsReplay;delete window.__resumeReplayTarget30;delete window.__rc32AndroidRemainingPrivate;
        return{privateHandlesRemoved:true,queryRestored,folderRestored,closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true};}`);
        c.step('owned private query target handle restoration', restored);
        if (!restored.queryRestored || !restored.folderRestored || !restored.closed || !restored.retired) cleanupComplete = false; }
        catch { cleanupComplete = false; c.step('private restoration unconfirmed', { confirmed: false }); }
      if (proofSaved) try { c.step('owned prior proof restoration', await c.evaluateNative(`()=>{if(window.__rc32AndroidRemainingPriorProof)window.__resumeSwProof=window.__rc32AndroidRemainingPriorProof;
        else delete window.__resumeSwProof;delete window.__rc32AndroidRemainingPriorProof;return{priorProofRestored:true};}`)); }
        catch { cleanupComplete = false; }
      Object.assign(c.report, { sourceCommit: binding.sourceCommit, actualUnitMs: actualAt === null ? 0 : Date.now() - actualAt,
        preparationMs: (actualAt || Date.now()) - preparedAt, cleanupComplete, nativeOsInput: true, humanFingerInput: false,
        originalMediaReadOnly: true, rawPcmExported: false, physicalSpeakerAudibility: 'UNKNOWN', wholeAudioFidelity: 'UNKNOWN' });
      c.report.actualUnitWithinBound = c.report.actualUnitMs <= totalBoundMs;
      if (!c.report.actualUnitWithinBound) fail('SUPPLEMENT_UNIT_TOTAL_BOUND');
      if (!cleanupComplete) fail('CLEANUP_UNCONFIRMED');
    }
  });
}
module.exports = { execute, resultPath, physicalPoint, quantizedSeek, fractions, metadataQualified, supplementCleanupQualified, liveQualified, verifyHelpers, FROZEN_HELPERS, SUPPLEMENT_SHA };
if (require.main === module) {
  if (!process.argv[2]) { console.error('PRIVATE_INPUT_REQUIRED'); process.exitCode = 1; }
  else execute(path.resolve(process.argv[2]), process.argv[3], process.argv[4]).catch(error => {
    console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'PREPARATION_FAILED'); process.exitCode = 1;
  });
}
