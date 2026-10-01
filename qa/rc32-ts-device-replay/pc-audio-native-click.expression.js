(function installRc32PcAudioKick() {
  'use strict';
  const fail = code => { throw Error(code); };
  if (window.__rc32PcAudioKick) fail('PC_AUDIO_KICK_ALREADY_OWNED');
  const version = '1.22.0-rc.32', commit = '1d79897fd32c569137cab079bfd93107be2ee33f';
  const hashes = {
    'app.js': '7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497',
    'sw.js': '8f27c0aa6710b78353b87911702a7e4c6e66535c404d5a66869992fc861b242b',
    'version.json': 'f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea',
    'media/drive-source.mjs': 'cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a',
    'media/ts-player.mjs': '1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705'
  };
  let disposed = false, used = false, p = null, timer = null, raf = null, listening = false;
  let listenerFailure = false, frameFailure = false;
  const cleanup = { listenerRemoved: true, frameCancelled: true, timersCleared: true };
  const receipt = { armed: false, fraction: null, trustedClickReceived: false, activationAtClick: false,
    startCalled: false, startReturned: false, completed: false, result: null, fences: null };
  function exposed(button) {
    if (!button || el.ctrlPlayPause !== button || !button.isConnected || button.disabled) return false;
    for (let a = button; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (a.hidden || a.inert || s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility)
          || s.pointerEvents === 'none' || Number(s.opacity) === 0) return false;
    }
    const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
      && !!hit && (hit === button || button.contains(hit));
  }
  function fences() {
    if (!p) return {};
    const proof = window.__resumeSwProof?.get(), current = q1Playback?.player?.stats?.(), selected = state.selected;
    const seek = p.sampler.read().seek, v = getActiveMediaElement();
    return {
      sourceSame: APP_VERSION === version && proof?.version === version && proof.sourceCommit === commit
        && proof.controller === p.controller && navigator.serviceWorker.controller === p.controller && p.controller?.state === 'activated'
        && Object.keys(hashes).every(key => proof.sourceSHA256?.[key] === hashes[key]),
      accountSame: !!p.account.authAccountKey && state.accountId === p.account.accountId && state.authAccountKey === p.account.authAccountKey
        && state.authStatus === 'online' && state.authGeneration === p.authGeneration && state.driveSessionGeneration === p.driveGeneration,
      targetSame: !!selected && ['id', 'name', 'size', 'mimeType', 'modifiedTime', 'version', 'headRevisionId', 'sha256Checksum', 'md5Checksum']
        .every(key => p.target[key] == null || selected[key] == null && !['id', 'name', 'size', 'mimeType', 'modifiedTime'].includes(key)
          || String(p.target[key]) === String(selected[key])),
      observerSame: window.__rc32AudioSeekRemaining === p.sampler,
      seekSame: seek?.passed === true && seek.fraction === p.fraction && seek.completedAt === p.seekAt,
      withinSeekWindow: Date.now() - p.seekAt <= 10000,
      ownerSame: q1Playback === p.owner && q1Playback?.kind === 'ts' && !p.owner.controller?.signal?.aborted,
      sessionSame: state.mediaSession === p.session, sourceGenerationSame: mediaSourceGeneration === p.sourceGeneration,
      seekGenerationSame: mediaSeekGeneration === p.seekGeneration, swOwnerCurrent: q1Playback?.swGeneration === mediaSourceGeneration,
      statsSame: current === p.stats && current?.generation === p.generation && current?.phase === 'ready' && !current?.disposed,
      nativeOwnerSame: v === p.video && isCurrentMediaEvent(v), settled: mediaSeekSettledGeneration >= mediaSeekGeneration
        && !mediaSeekWatchdog && !state.isSeeking, visible: document.visibilityState === 'visible', controlExposed: exposed(p.button),
      normalOutput: !!v && !v.ended && !v.error && !v.muted && v.volume === p.volume && v.volume > 0 && v.playbackRate === 1
    };
  }
  function cancelOwned() {
    clearTimeout(timer); timer = null; cleanup.timersCleared = true;
    if (listening) {
      try { p.button.removeEventListener('click', onClick); } catch { listenerFailure = true; }
      listening = false;
    }
    cleanup.listenerRemoved = !listenerFailure;
    if (raf !== null) { try { cancelAnimationFrame(raf); } catch { frameFailure = true; } raf = null; }
    cleanup.frameCancelled = !frameFailure;
  }
  function read() {
    return { schema: 'drive-original.rc32-pc-audio-native-click/1', sourceCommit: commit, version, disposed,
      ...receipt, currentFences: p && !disposed ? fences() : null, cleanup: { ...cleanup },
      observerOnly: true, rawIdentifiersExported: false, rawPcmExported: false };
  }
  function finish(code) { if (receipt.completed) return; receipt.completed = true; receipt.result = code; cancelOwned(); }
  function stop() {
    disposed = true; if (!receipt.completed) finish('CANCELLED'); else cancelOwned(); p = null;
    return read();
  }
  function attempt() {
    raf = null; cleanup.frameCancelled = !frameFailure;
    if (disposed || receipt.completed) return;
    receipt.fences = fences();
    if (!Object.values(receipt.fences).every(value => value === true)) { finish('NATIVE_CLICK_OWNER_FENCE'); return; }
    if (navigator.userActivation?.isActive !== true) { finish('NATIVE_ACTIVATION_EXPIRED'); return; }
    if (Date.now() - p.clickedAt > 2000) { finish('NATIVE_PLAYING_DEADLINE'); return; }
    if (p.video.paused || p.video.seeking || p.video.readyState < 2) {
      raf = requestAnimationFrame(attempt); cleanup.frameCancelled = false; return;
    }
    receipt.startCalled = true; clearTimeout(timer);
    timer = setTimeout(() => finish('START_RETURN_DEADLINE'), 10000);
    // This call runs only from a genuine click's microtask/RAF. Evaluation only arms/reads.
    p.sampler.startAudio().then(result => {
      if (disposed || receipt.completed) return;
      receipt.startReturned = true;
      if (result?.audio?.completed && result.audio.passed !== true) {
        finish(/^[A-Z0-9_]+$/.test(result.audio.result) ? result.audio.result : 'START_FAILED'); return;
      }
      finish('STARTED');
    }, error => {
      if (disposed || receipt.completed) return;
      finish(/^[A-Z0-9_]+$/.test(error?.message) ? error.message : 'START_FAILED');
    });
  }
  function onClick(event) {
    if (disposed || receipt.completed || receipt.trustedClickReceived) return;
    if (event.isTrusted !== true || event.currentTarget !== p.button || !(event.target === p.button || p.button.contains(event.target))) {
      finish('UNTRUSTED_INPUT'); return;
    }
    receipt.trustedClickReceived = true; receipt.activationAtClick = navigator.userActivation?.isActive === true;
    p.clickedAt = Date.now(); cancelOwned();
    timer = setTimeout(() => finish('NATIVE_PLAYING_DEADLINE'), 2000); cleanup.timersCleared = false;
    // Existing app handler was registered earlier on the same control and plays first.
    queueMicrotask(attempt);
  }
  function arm(fraction) {
    if (disposed || used || (fraction !== .5 && fraction !== .9)) fail('PC_AUDIO_KICK_ARM');
    const sampler = window.__rc32AudioSeekRemaining, r = sampler?.read?.(), seek = r?.seek;
    const holder = window.__resumeReplayTarget30, target = holder?.target || holder?.metadata || holder;
    const v = getActiveMediaElement(), stats = q1Playback?.player?.stats?.();
    if (!target?.id || !sampler?.startAudio || r.version !== version || r.sourceCommit !== commit || r.disposed
        || !seek?.passed || seek.fraction !== fraction || !seek.nativeInputObserved || !seek.firstTargetFrame?.generationAdvanced
        || !seek.firstTargetFrame?.readinessQualified || !seek.firstTargetFrame?.seekSettled
        || !r.metadata?.some(row => row.label === 'before' && row.qualified === true)
        || !Number.isFinite(seek.completedAt) || !v?.paused || !exposed(el.ctrlPlayPause)) fail('PC_AUDIO_KICK_ADMISSION');
    p = { sampler, target: { ...target }, account: { ...(holder?.account || { accountId: holder?.accountId || state.accountId,
      authAccountKey: holder?.authAccountKey || state.authAccountKey }) }, button: el.ctrlPlayPause, video: v,
      owner: q1Playback, stats, generation: stats?.generation, session: state.mediaSession, sourceGeneration: mediaSourceGeneration,
      seekGeneration: mediaSeekGeneration, authGeneration: state.authGeneration, driveGeneration: state.driveSessionGeneration,
      controller: navigator.serviceWorker.controller, fraction, seekAt: seek.completedAt, clickedAt: null, volume: v.volume };
    receipt.fences = fences();
    if (!Object.values(receipt.fences).every(value => value === true)) { p = null; fail('PC_AUDIO_KICK_ADMISSION'); }
    used = true; receipt.armed = true; receipt.fraction = fraction;
    p.button.addEventListener('click', onClick); listening = true; cleanup.listenerRemoved = false;
    timer = setTimeout(() => finish('NATIVE_CLICK_DEADLINE'), Math.max(0, 10000 - (Date.now() - p.seekAt)));
    cleanup.timersCleared = false;
    return read();
  }
  window.__rc32PcAudioKick = Object.freeze({ arm, read, stop });
  return { installed: true, observerOnly: true, nativeControl: 'ctrlPlayPause', playingWaitMaxMs: 2000, rawIdentifiersExported: false };
})()
