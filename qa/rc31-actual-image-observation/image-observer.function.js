function installRc31ImageObservation(privateInput) {
  'use strict';
  const key = '__rc31ImageObservation';
  const fail = code => { throw Error(code); };
  if (window[key]) fail('IMAGE_OBSERVER_ALREADY_PRESENT');
  const target = privateInput?.target, account = privateInput?.account;
  if (!target?.id || !account?.accountId || !account?.authAccountKey) fail('PRIVATE_BINDING_REQUIRED');
  const controller = navigator.serviceWorker.controller;
  const source = '4a484e6f839d2e6c3eb83503acb08147362cb011';
  const hashes = { 'app.js': 'f92f9440b25781c8c6f144688d96d58612747f148bb6ded0bf31d4a35bb6193e',
    'sw.js': 'e65e51527fad4df7633e2a10d36f2d90966e47fb8c73e23d5ebb78b7059a747a',
    'version.json': 'd8903d703880dbb1ef1068575974d70e5666a127cb2970cfb951cfd3ff5bff06' };
  let owner = null, disposed = false;
  const sourceQualified = () => {
    const p = window.__resumeSwProof?.get();
    return !!p && APP_VERSION === '1.22.0-rc.31' && p.version === APP_VERSION
      && p.sourceCommit === source && p.controller === controller && controller?.state === 'activated'
      && navigator.serviceWorker.controller === controller
      && Object.keys(hashes).every(k => p.sourceSHA256?.[k] === hashes[k]);
  };
  const accountSame = () => state.accountId === account.accountId && state.authAccountKey === account.authAccountKey;
  const metadataSame = f => !!f && ['id', 'name', 'size', 'mimeType', 'modifiedTime', 'version', 'headRevisionId', 'sha256Checksum', 'md5Checksum']
    .every(k => target[k] == null || String(f[k]) === String(target[k]))
    && (!target.parents || Array.isArray(f.parents) && JSON.stringify([...f.parents].sort()) === JSON.stringify([...target.parents].sort()));
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  const admitted = () => !disposed && sourceQualified() && accountSame() && state.authStatus === 'online' && foreground();
  const sameOwner = () => !!owner && metadataSame(state.selected) && owner.session === state.mediaSession
    && owner.playback === state.playbackSession && owner.generation === mediaSourceGeneration
    && owner.accountGeneration === state.driveSessionGeneration && owner.pin === q0PinnedSource;
  const finite = n => Number.isFinite(n) ? n : null;
  const shown = node => {
    if (!node || node.hidden) return false;
    const r = node.getBoundingClientRect(), s = getComputedStyle(node);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0;
  };
  const imageReady = () => shown(el.imageViewer) && el.imageViewer.complete && el.imageViewer.naturalWidth > 0 && el.imageViewer.naturalHeight > 0;
  const dormantPreview = () => el.drivePreview.hidden && (!el.drivePreview.getAttribute('src') || el.drivePreview.getAttribute('src') === 'about:blank');
  const snapshot = () => ({ sourceQualified: sourceQualified(), accountSame: accountSame(), foreground: foreground(),
    online: state.authStatus === 'online', exactSelectedMetadata: metadataSame(state.selected), sameOwner: sameOwner(),
    closed: !!el.playerSheet.hidden, imageReady: imageReady(), width: finite(el.imageViewer.naturalWidth), height: finite(el.imageViewer.naturalHeight),
    transportVerified: state.mediaTransportVerified === true,
    originalMode: ['original-range', 'original-sequential', 'original-opfs'].includes(state.mediaPlaybackMode),
    verifiedWrongMimeImage: !!currentVerifiedOriginalImage(), videoHidden: !!el.videoPlayer.hidden,
    videoControlsHidden: !!el.customVideoControls.hidden, noImageIframeFallback: dormantPreview(),
    imageErrorHidden: !!el.mediaError.hidden, viewed: getViewedIdSet().has(target.id),
    retired: q1RetirementResult?.settled === true && !q0Playback && !q1Playback,
    sourcesCleared: !el.imageViewer.getAttribute('src') && !state.mediaBlobUrl,
    selectionCleared: state.selected === null, activeObserver: !disposed });
  const fence = phase => {
    if (!['card', 'viewer'].includes(phase)) fail('IMAGE_PHASE_NOT_ALLOWED');
    let node;
    if (phase === 'viewer') {
      if (!admitted() || !sameOwner() || !imageReady() || !dormantPreview() || !el.mediaError.hidden) return { admitted: false };
      node = el.imageViewer;
    } else {
      if (!admitted() || !el.playerSheet.hidden) return { admitted: false };
      const cards = [...document.querySelectorAll('.file-card')].filter(n => n.dataset.fileId === target.id);
      if (cards.length !== 1) return { admitted: false };
      node = cards[0].querySelector('.file-card-visual');
    }
    if (!shown(node)) return { admitted: false };
    const r = node.getBoundingClientRect(), x = Math.floor(r.left + r.width / 2), y = Math.floor(r.top + r.height / 2);
    const hit = document.elementFromPoint(x + .5, y + .5);
    const unobscured = !!hit && (node === hit || node.contains(hit) || phase === 'viewer' && hit === el.mediaStage);
    return { admitted: unobscured && x >= 0 && y >= 0 && x + 1 <= innerWidth && y + 1 <= innerHeight,
      clip: { x, y, width: 1, height: 1, scale: 1 / devicePixelRatio },
      staticCanvasPresent: phase === 'card' && !!node.querySelector('canvas'),
      liveThumbnailImagePresent: phase === 'card' && !!node.querySelector('img') };
  };
  if (!admitted()) fail('IMAGE_OBSERVER_PREFLIGHT');
  window[key] = { snapshot, fence,
    arm() {
      if (!admitted() || !metadataSame(state.selected) || el.playerSheet.hidden) fail('IMAGE_OWNER_NOT_ADMITTED');
      owner = { session: state.mediaSession, playback: state.playbackSession, generation: mediaSourceGeneration,
        accountGeneration: state.driveSessionGeneration, pin: q0PinnedSource };
      return snapshot();
    },
    dispose() { disposed = true; owner = null; if (window[key] === this) delete window[key]; return { observerRemoved: !window[key], timersOwned: 0, listenersOwned: 0 }; }
  };
  return { installed: true, sourceQualified: true, accountSame: true, timersOwned: 0, listenersOwned: 0 };
}
