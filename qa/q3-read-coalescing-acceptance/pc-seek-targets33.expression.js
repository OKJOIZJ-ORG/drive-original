(function installQ3PcSeekTargets33() {
  'use strict';
  const fail = code => { throw Error(code); };
  if (window.__q3PcSeekTargets33) fail('PC_TARGETS_ALREADY_OWNED');
  const version = "1.22.0-rc.34", commit = "09c61bdc1438df24e4213e348caea745823b5ee1";
  const hashes = {
  "app.js": "366a39fc924ba064a5f3e7a38b779136ca04fa256fce505ace9933254599b4d8",
  "sw.js": "937fc8a21a13f9d42a4e03682e682c5ff46a45d55b0d8813701f559591e636db",
  "version.json": "665dc35c57dddee8c1de22b766498044ae5dabd93d64f1d08930200982a8e694",
  "media/drive-source.mjs": "cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a",
  "media/ts-player.mjs": "1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705"
};
  const holder = window.__q3ActualTarget33, target = holder?.target || holder?.metadata || holder;
  const account = { ...(holder?.account || { accountId: holder?.accountId || state.accountId,
    authAccountKey: holder?.authAccountKey || state.authAccountKey }) };
  const controller = navigator.serviceWorker.controller, owner = q1Playback, session = state.mediaSession;
  const authGeneration = state.authGeneration, driveGeneration = state.driveSessionGeneration;
  const bar = el.seekBarContainer;
  if (!target?.id || !/^\d+$/.test(String(target.version||'')) || target.sha256Checksum!=="cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a" || Number(target.size)!==18075476 || !bar || !owner || owner.kind !== 'general') fail('PC_TARGETS_ADMISSION');
  const priorRolePresent = bar.hasAttribute('role'), priorRole = bar.getAttribute('role');
  let disposed = false, timer = null, roleOwned = false;
  const nodes = [], cleanup = { markersRemoved: false, timerCleared: false, roleRestored: false, roleIntegrity: true };
  const number = value => Number.isFinite(value) ? value : null;
  function roleFence() {
    if (roleOwned && !disposed && bar.getAttribute('role') !== 'group') cleanup.roleIntegrity = false;
    return cleanup.roleIntegrity && (disposed ? cleanup.roleRestored : !roleOwned || bar.getAttribute('role') === 'group');
  }
  function fences() {
    const proof = window.__resumeSwProof?.get();
    const sourceSame = APP_VERSION === version && proof?.version === version && proof.sourceCommit === commit
      && proof.controller === controller && navigator.serviceWorker.controller === controller && controller?.state === 'activated'
      && Object.keys(hashes).every(key => proof.sourceSHA256?.[key] === hashes[key]);
    const accountSame = !!account.authAccountKey && state.accountId === account.accountId && state.authAccountKey === account.authAccountKey
      && state.authStatus === 'online' && state.authGeneration === authGeneration && state.driveSessionGeneration === driveGeneration;
    const selected = state.selected;
    const targetSame = !!selected && ['id', 'name', 'size', 'mimeType', 'modifiedTime', 'version', 'headRevisionId', 'sha256Checksum', 'md5Checksum']
      .every(key => target[key] == null || selected[key] == null && !['id', 'name', 'size', 'mimeType', 'modifiedTime'].includes(key)
        || String(target[key]) === String(selected[key]));
    const native = getActiveMediaElement(), stats = q1Playback?.player?.stats?.();
    return { sourceSame: !!sourceSame, accountSame, targetSame, sameBar: el.seekBarContainer === bar,
      ownerSame: q1Playback === owner && q1Playback?.kind === 'general' && q1Playback?.fileId===target.id && stats.status?.level==='Q3' && stats.status?.video==='lossy-transformed' && stats.status?.bitPerfectVideo===false && state.mediaPlaybackMode===PLAYBACK_MODE.VIDEO_COMPATIBILITY && !!stats && !owner.controller?.signal?.aborted
        && !stats.disposed && !['failed', 'cancelled'].includes(stats.phase),
      sessionSame: state.mediaSession === session, visible: document.visibilityState === 'visible',
      nativeOwnerCurrent: !!native && isCurrentMediaEvent(native), currentFrameVerified:state.mediaDecodeVerified===true&&Number.isFinite(state.lastPresentedMediaTime)&&native?.readyState>=2&&native?.videoWidth===640&&native?.videoHeight===360, paused: !!native?.paused, axRoleCurrent: roleFence() };
  }
  const admitted = () => !disposed && Object.values(fences()).every(value => value === true);
  if (!admitted() || getComputedStyle(bar).position === 'static') fail('PC_TARGETS_ADMISSION');
  function geometry(node, fraction) {
    const r = bar.getBoundingClientRect(), m = node.getBoundingClientRect();
    const mapping=q1Playback?.player?.stats?.()?.mapping;
    const duration=Number.isFinite(mapping?.sourceEnd)&&Number.isFinite(mapping?.sourceOrigin)?mapping.sourceEnd-mapping.sourceOrigin:NaN;
    const x = m.left + m.width / 2, y = m.top + m.height / 2;
    const distance = Math.abs(((x - r.left) / r.width - fraction) * duration);
    const hit = document.elementFromPoint(x, y), style = getComputedStyle(node);
    let exposed = true;
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      const s = getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.inert || s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility) || s.pointerEvents === 'none') exposed = false;
    }
    const available = admitted() && node.isConnected && node.offsetParent === bar && exposed && style.visibility === 'visible'
      && m.width > 0 && m.height > 0 && r.width > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
      && hit === node && Number.isFinite(duration) && Math.abs(duration-180)<.000001 && Number.isFinite(distance) && distance <= .75;
    return { fraction, label: node.getAttribute('aria-label'), available, exposed, exactHit: hit === node,
      x: number(x), y: number(y), targetSeconds: number(duration * fraction), hitTargetSeconds: number((x - r.left) / r.width * duration),
      sourceTargetSeconds:number(mapping?.sourceOrigin+duration*fraction),
      distanceSeconds: number(distance), toleranceSeconds: .75 };
  }
  function read() {
    return { schema: 'drive-original.q3-pc-seek-targets33/1', version, sourceCommit: commit, disposed, fences: fences(),
      targets: disposed ? [] : nodes.map(({ node, fraction }) => geometry(node, fraction)), cleanup: { ...cleanup },
      observerOnly: true, nativeInputRequired: true, rawIdentifiersExported: false, listenersInstalled: 0,
      axTargetingInstrumentation: true, productAccessibilityProof: false,
      priorRolePresent, priorRoleWasSlider: priorRole === 'slider' };
  }
  function stop() {
    if (!disposed) {
      roleFence();
      disposed = true; clearTimeout(timer); timer = null; cleanup.timerCleared = true;
      cleanup.markersRemoved = true;
      for (const { node } of nodes) {
        try { node.remove(); if (node.isConnected) cleanup.markersRemoved = false; }
        catch { cleanup.markersRemoved = false; }
      }
      try {
        if (roleOwned) {
          if (priorRolePresent) bar.setAttribute('role', priorRole);
          else bar.removeAttribute('role');
        }
        cleanup.roleRestored = bar.hasAttribute('role') === priorRolePresent && bar.getAttribute('role') === priorRole;
      } catch { cleanup.roleRestored = false; }
    }
    return { disposed, cleanup: { ...cleanup }, rawIdentifiersExported: false };
  }
  // Retain cleanup evidence even when construction fails after the role mutation.
  window.__q3PcSeekTargets33 = Object.freeze({ read, stop });
  try {
    // Group the QA markers for AX targeting without changing the bar or its
    // existing input handlers. This instrumentation is not product AX proof.
    roleOwned = true; bar.setAttribute('role', 'group');
    if (!roleFence()) fail('PC_TARGETS_AX_ROLE');
    for (const fraction of [.5, .9]) {
      const node = document.createElement('button'); node.type = 'button';
      node.setAttribute('aria-label', fraction === .5 ? 'RC33 Q3 QA seek50' : 'RC33 Q3 QA seek90');
      node.style.cssText = 'all:initial;position:absolute;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;margin:0;padding:0;border:0;border-radius:50%;background:#2775dd;pointer-events:auto;cursor:pointer;z-index:2;';
      // Align with the unchanged listener's border-box calculation, including borders.
      node.style.left = `${bar.getBoundingClientRect().width * fraction - bar.clientLeft}px`;
      nodes.push({ node, fraction }); bar.appendChild(node);
    }
    if (!read().targets.every(target => target.available)) fail('PC_TARGETS_NOT_EXPOSED');
    timer = setTimeout(stop, 180000);
    return { installed: true, ...read(), maxMs: 180000 };
  } catch (error) { stop(); throw error; }
})()
