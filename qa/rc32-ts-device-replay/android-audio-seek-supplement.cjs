'use strict';
// Additive runtime-only driver. Importing never reads private input or connects a device.
const fs = require('node:fs'), path = require('node:path');
const gate = require('./binding-gate.cjs');
const { loadPrivate, inputCommand } = require('./android-replay.cjs');
const SUPPLEMENT_SHA = '41305a9e20b7329cb9f46055e3b0d256848373f19211655c7fd0f15a1bd42967';
function resultPath(name) {
  if (!/^[a-z0-9-]+\.json$/.test(name)) throw Error('RESULT_NAME_INVALID');
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
  return r?.disposed === true && !!r.cleanup && Object.keys(r.cleanup).length === 5
    && ['tracksStopped', 'nodesDisconnected', 'contextClosed', 'frameCancelled', 'timersCleared'].every(k => r.cleanup[k] === true);
}
async function execute(privateFile, resultName = 'actual-android-rc32-audio-seek-supplement-result.json') {
  const output = resultPath(resultName);
  if (fs.existsSync(output)) throw Error('RESULT_ALREADY_EXISTS');
  const binding = gate.verifyBound();
  const supplement = fs.readFileSync(path.join(__dirname, 'audio-seek-supplement.expression.js'), 'utf8');
  if (gate.sha(Buffer.from(supplement)) !== SUPPLEMENT_SHA) throw Error('SUPPLEMENT_SOURCE_DRIFT');
  const observer = fs.readFileSync(path.join(__dirname, 'observer.expression.js'), 'utf8');
  const sourceProof = fs.readFileSync(path.join(__dirname, 'source-proof.expression.js'), 'utf8');
  const folderResolver = fs.readFileSync(path.join(__dirname, 'native-folder-target.function.js'), 'utf8');
  const uiResolver = fs.readFileSync(path.join(__dirname, 'native-ui-target-v3.function.js'), 'utf8');
  const input = loadPrivate(privateFile); // Root supplies this protected path only at actual invocation.
  return require('./android-common.cjs')(__filename, resultName, async c => {
    const preparedAt = Date.now(); let actualAt = null, installed = false, supplementInstalled = false;
    let privateInstalled = false, proofSaved = false, ownsPlayer = false, navigations = 0, cleanupComplete = true;
    const fail = code => { throw Error(code); };
    const within = () => {
      // Reserve 60 seconds of the 240-second unit for ordinary Back and owned cleanup.
      if (actualAt === null ? Date.now() - preparedAt > 180000 : Date.now() - actualAt > 180000)
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
    const supplementRead = () => evaluate('()=>window.__rc32AudioSeekSupplement.read()');
    const geometry = (key, options = {}) => {
      if (!['card', 'folder', 'folderMoreButton', 'searchInput', 'ctrlPlayPause', 'mediaStage',
        'playerControlsEntry', 'seekBarContainer'].includes(key)) fail('NATIVE_KEY_NOT_ALLOWED');
      return evaluate(key === 'folder' ? `()=>(${folderResolver})(window.__rc32AndroidReplayPrivate.nextFolder)`
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
      await evaluate(`()=>{if(window.__rc32TsReplay||window.__rc32AudioSeekSupplement||window.__resumeReplayTarget30
        ||window.__rc32AndroidReplayPrivate||window.__rc32AndroidPriorProof)throw Error('PRIVATE_HELPER_ALREADY_OWNED');
        window.__rc32AndroidPriorProof=window.__resumeSwProof;return{saved:true};}`); proofSaved = true;
      c.step('immutable source module shell/controller proof', await evaluate('async()=>(' + sourceProof.trim() + ')'));
      const ready = await evaluate(`()=>{const input=${JSON.stringify(input)};
        if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)return{ready:false};
        window.__resumeReplayTarget30=input;window.__rc32AndroidReplayPrivate={query:el.searchInput.value,scrollY:window.scrollY,folderId:state.currentFolderId,nextFolder:null};
        return{ready:true,accountSame:true};}`);
      if (!ready.ready) fail('PRIVATE_ACCOUNT_MISMATCH'); privateInstalled = true;
      if (!await evaluate('()=>el.searchInput.value===""||el.searchInput.value===window.__resumeReplayTarget30.target.name')) fail('NORMAL_SEARCH_PRESTATE_REQUIRED');
      for (const folder of input.folderPath) {
        if (await evaluate('()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)')) break;
        await evaluate(`()=>{window.__rc32AndroidReplayPrivate.nextFolder=${JSON.stringify(folder)};return{ready:true};}`);
        let g = await geometry('folder');
        if (!g.currentFolderSame) {
          for (let i = 0; !g.available && g.metadataUnique && g.moreVisible && i < 3; i++) { await tap('folderMoreButton'); g = await geometry('folder'); }
          if (!g.available) fail('NORMAL_FOLDER_TARGET_UNAVAILABLE'); await tap('folder'); navigations++;
        }
        const end = Date.now() + 25000; let settled;
        do { await c.wait(250); settled = await evaluate(`()=>({same:state.currentFolderId===window.__rc32AndroidReplayPrivate.nextFolder.id,
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
        nativeSearchInput: !already, supplementSHA256: SUPPLEMENT_SHA, sourceCommit: binding.sourceCommit });
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
      await pause(true); await controls();
      const slider = await geometry('seekBarContainer', { xFraction: .1 });
      const point = physicalPoint(slider, screenHeight);
      const duration = await evaluate('()=>q1Playback?.player?.stats()?.duration||getActiveMediaElement()?.duration');
      const quantized = (point[0] / slider.dpr - slider.left) / slider.width * duration;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(quantized)
          || Math.abs(quantized - duration * .1) > .75) fail('NATIVE_SEEK_QUANTIZATION_BOUND');
      const metaBefore = await evaluate('()=>window.__rc32TsReplay.metadata("before")');
      c.step('fresh before metadata after startup', metaBefore); if (!metadataQualified(metaBefore)) fail('FRESH_METADATA_MISMATCH');
      c.step('exact bounded supplement installation', await evaluate('()=>(' + supplement.trim() + ')')); supplementInstalled = true;
      c.step('one normal native 10% seek intent', { ...await evaluate('()=>window.__rc32AudioSeekSupplement.armSeek10()'),
        quantizedTargetSeconds: quantized, nativeOsInput: true, humanFingerInput: false });
      c.adb(['shell', 'input', 'swipe', String(point[0]), String(point[1]), String(point[0]), String(point[1]), '120']);
      let receipt; const seekEnd = Date.now() + 46000;
      do { await c.wait(250); receipt = await supplementRead(); } while (!receipt.seek10?.completed && Date.now() < seekEnd);
      c.step('bounded seek10 presented frame and late settlement receipt', receipt);
      if (!receipt.seek10?.passed) fail('SEEK10_UNCONFIRMED');
      await pause(false);
      const features = await evaluate(`()=>{const v=getActiveMediaElement();return{captureStream:typeof v?.captureStream==='function',
        audioContext:typeof(window.AudioContext||window.webkitAudioContext)==='function',normalUnmuted:!!v&&!v.muted,
        normalVolume:Number.isFinite(v?.volume)?v.volume:null,normalPlaying:!!v&&!v.paused&&!v.ended};}`);
      c.step('native PCM feature and original output admission', features);
      if (!features.captureStream || !features.audioContext) fail('NATIVE_PCM_CAPTURE_UNSUPPORTED');
      if (!features.normalUnmuted || !(features.normalVolume > 0) || !features.normalPlaying) fail('NORMAL_AUDIO_OUTPUT_UNAVAILABLE');
      c.step('bounded native rendered PCM observation start', await evaluate('()=>window.__rc32AudioSeekSupplement.startAudio()'));
      const audioEnd = Date.now() + 10000;
      do { await c.wait(150); receipt = await supplementRead(); } while (!receipt.audio?.completed && Date.now() < audioEnd);
      c.step('native element PCM result before close', receipt);
      if (!receipt.audio?.passed) fail('NATIVE_PCM_UNCONFIRMED');
      const metaAfter = await evaluate('()=>window.__rc32TsReplay.metadata("after")');
      c.step('fresh after metadata following output', metaAfter); if (!metadataQualified(metaAfter)) fail('FRESH_METADATA_MISMATCH');
      receipt = await supplementRead(); c.step('same target actual missing clauses final live receipt', receipt);
      if (!receipt.qualified) fail('SUPPLEMENT_QUALIFICATION_UNCONFIRMED');
    } catch (error) {
      if (supplementInstalled) try { c.step('retained failed live supplement before close', await c.evaluateNative('()=>window.__rc32AudioSeekSupplement.read()')); }
        catch { c.step('failed live safe read boundary', { confirmed: false }); }
      else if (installed) try { c.step('retained failed startup before close', await startupRead(true)); }
        catch { c.step('failed startup safe read boundary', { confirmed: false }); }
      throw error;
    } finally {
      if (supplementInstalled) try { const cleaned = await c.evaluateNative('()=>window.__rc32AudioSeekSupplement.stop()');
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
        do { restoration = await c.evaluateNative(`()=>({folderSame:state.currentFolderId===window.__rc32AndroidReplayPrivate.folderId,
          loading:!!state.loadingFiles||!!state.loadingTree})`);
          if (restoration.folderSame && !restoration.loading) break; await c.wait(250);
        } while (Date.now() < end);
        c.step('ordinary Back original folder settled restoration', restoration);
        if (!restoration.folderSame || restoration.loading) cleanupComplete = false;
      } catch { cleanupComplete = false; c.step('folder settled restoration unconfirmed', { confirmed: false }); }
      if (privateInstalled) try { const restored = await c.evaluateNative(`()=>{const q=window.__rc32AndroidReplayPrivate;
        if(q){el.searchInput.value=q.query;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));window.scrollTo(0,q.scrollY);}
        const folderRestored=!!q&&state.currentFolderId===q.folderId,queryRestored=!!q&&el.searchInput.value===q.query;
        delete window.__rc32AudioSeekSupplement;delete window.__rc32TsReplay;delete window.__resumeReplayTarget30;delete window.__rc32AndroidReplayPrivate;
        return{privateHandlesRemoved:true,queryRestored,folderRestored,closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true};}`);
        c.step('owned private query target handle restoration', restored);
        if (!restored.queryRestored || !restored.folderRestored || !restored.closed || !restored.retired) cleanupComplete = false; }
        catch { cleanupComplete = false; c.step('private restoration unconfirmed', { confirmed: false }); }
      if (proofSaved) try { c.step('owned prior proof restoration', await c.evaluateNative(`()=>{if(window.__rc32AndroidPriorProof)window.__resumeSwProof=window.__rc32AndroidPriorProof;
        else delete window.__resumeSwProof;delete window.__rc32AndroidPriorProof;return{priorProofRestored:true};}`)); }
        catch { cleanupComplete = false; }
      Object.assign(c.report, { sourceCommit: binding.sourceCommit, actualUnitMs: actualAt === null ? 0 : Date.now() - actualAt,
        preparationMs: (actualAt || Date.now()) - preparedAt, cleanupComplete, nativeOsInput: true, humanFingerInput: false,
        originalMediaReadOnly: true, rawPcmExported: false, physicalSpeakerAudibility: 'UNKNOWN', wholeAudioFidelity: 'UNKNOWN' });
      c.report.actualUnitWithin240Seconds = c.report.actualUnitMs <= 240000;
      if (!c.report.actualUnitWithin240Seconds) fail('SUPPLEMENT_UNIT_TOTAL_BOUND');
      if (!cleanupComplete) fail('CLEANUP_UNCONFIRMED');
    }
  });
}
module.exports = { execute, resultPath, physicalPoint, metadataQualified, supplementCleanupQualified, SUPPLEMENT_SHA };
if (require.main === module) {
  if (!process.argv[2]) { console.error('PRIVATE_INPUT_REQUIRED'); process.exitCode = 1; }
  else execute(path.resolve(process.argv[2]), process.argv[3]).catch(error => {
    console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'PREPARATION_FAILED'); process.exitCode = 1;
  });
}
