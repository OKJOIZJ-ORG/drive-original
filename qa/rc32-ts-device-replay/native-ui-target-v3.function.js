function observeRc30NativeTarget(key, options) {
  'use strict';
  options = options || {};
  const keys = ['card', 'folderMoreButton', 'searchInput', 'ctrlPlayPause', 'mediaStage', 'playerControlsEntry', 'seekBarContainer'];
  if (!keys.includes(key)) throw Error('NATIVE_KEY_NOT_ALLOWED');
  const number = n => Number.isFinite(n) ? n : null;
  const token = (value, allowed) => allowed.includes(value) ? value : 'other';
  const belongs = (node, hit) => !!node && !!hit && (node === hit || node.contains(hit));
  const chrome = typeof playerChrome !== 'undefined' ? playerChrome : el.playerModal?.querySelector('.player-chrome');
  let node = el[key];
  if (key === 'card') {
    const target = window.__resumeReplayTarget30?.target || window.__resumeReplayTarget30?.metadata;
    const found = [...document.querySelectorAll('.file-card-open')].filter(n => n.closest('.file-card')?.dataset.fileId === target?.id);
    node = found.length === 1 ? found[0] : null;
  }
  const context = { key, controlsIdle: !!el.playerModal?.classList.contains('controls-idle'),
    viewport: { width: number(innerWidth), height: number(innerHeight), dpr: number(devicePixelRatio), screenHeight: number(screen.height) },
    modalScrollTop: number(el.playerModal?.scrollTop), chromeInert: !!chrome?.inert,
    customControlsHidden: !!el.customVideoControls?.hidden, paused: !!el.videoPlayer?.paused };
  if (!node) return { ...context, available: false, nodePresent: false, points: [] };
  // Library preparation can scroll normally. Player probes never move its scroll
  // container merely to make a hidden control look accessible.
  if (['card', 'folderMoreButton', 'searchInput'].includes(key)) node.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = node.getBoundingClientRect(), style = getComputedStyle(node);
  let hiddenAncestor = false, inertAncestor = false;
  for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden) hiddenAncestor = true;
    if (ancestor.inert) inertAncestor = true;
    if (ancestor === el.playerModal) break;
  }
  const visible = !hiddenAncestor && !inertAncestor && r.width > 0 && r.height > 0
    && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
    && style.pointerEvents !== 'none' && Number(style.opacity) !== 0;
  let ratios = [[.5, .5]];
  if (key === 'playerControlsEntry') ratios = [[.5, .5], [.5, .82], [.5, .18], [.15, .82], [.85, .82], [.15, .5], [.85, .5]];
  if (key === 'mediaStage') ratios = [[.5, .5], [.5, .35], [.5, .2]];
  if (key === 'seekBarContainer' && Number.isFinite(options.xFraction)) ratios = [[Math.max(0, Math.min(1, options.xFraction)), .5]];
  const points = ratios.map(([rx, ry]) => {
    const x = r.left + r.width * rx, y = r.top + r.height * ry;
    const inViewport = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight;
    const hit = inViewport ? document.elementFromPoint(x, y) : null;
    const hitIsVideo = belongs(el.videoPlayer, hit), hitIsEntry = belongs(el.playerControlsEntry, hit);
    const hitIsChrome = belongs(chrome, hit), hitIsModal = belongs(el.playerModal, hit);
    const interactive = !!hit?.closest?.('button,a,input,select,textarea,summary,[role="slider"]');
    const hitMatchesTarget = belongs(node, hit);
    const stageSurface = key !== 'mediaStage' || (hitMatchesTarget && !interactive && !hitIsChrome && !hitIsEntry);
    return { x: number(x), y: number(y), inViewport, hitMatchesTarget, hitIsVideo, hitIsEntry, hitIsChrome, hitIsModal,
      hitInteractive: interactive, usable: visible && inViewport && hitMatchesTarget && stageSurface };
  });
  const selected = points.find(p => p.usable);
  return { ...context, available: !!selected, nodePresent: true, hiddenAncestor, inertAncestor,
    rect: { left: number(r.left), top: number(r.top), width: number(r.width), height: number(r.height), bottom: number(r.bottom) },
    style: { display: token(style.display, ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid']),
      visibility: token(style.visibility, ['visible', 'hidden', 'collapse']), pointerEvents: token(style.pointerEvents, ['auto', 'none']),
      position: token(style.position, ['static', 'relative', 'absolute', 'fixed', 'sticky']), opacity: number(Number(style.opacity)) },
    x: selected?.x ?? null, y: selected?.y ?? null, left: number(r.left), width: number(r.width), height: number(r.height),
    dpr: number(devicePixelRatio), viewportHeight: number(innerHeight), screenHeight: number(screen.height), points,
    rawIdentifiersExported: false };
}
