async function runColorPathDiscriminator() {
  if (window.__colorPathRun) throw Error('COLOR_RUN_ALREADY_STARTED');
  window.__colorPathRun = true;
  const report = { schema: 'native-file-mse-color-path/1', scope: 'Exact existing generated fixture and prior copied-video remux. No account, original-media, product or production mutation.', userAgent: navigator.userAgent, startedAt: Date.now(), cases: [], cleanup: null };
  const videos = [], urls = [], callbacks = new Map(), timers = new Set(), planes = new Map(), pixels = new Map();
  const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map(x => x.toString(16).padStart(2, '0')).join('');
  const bounded = async (label, setup, ms = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { timers.delete(timer); dispose(); reject(Error('COLOR_' + label + '_DEADLINE')); }, ms); timers.add(timer); let dispose = () => {};
    dispose = setup(value => { clearTimeout(timer); timers.delete(timer); dispose(); resolve(value); }, error => { clearTimeout(timer); timers.delete(timer); dispose(); reject(error); }) || dispose;
  });
  const event = (node, type, action) => bounded(type.toUpperCase(), (ok, bad) => {
    const done = e => ok({ trusted: e.isTrusted }), error = () => bad(Error('COLOR_NATIVE_ERROR'));
    node.addEventListener(type, done, { once: true }); node.addEventListener('error', error, { once: true }); action();
    return () => { node.removeEventListener(type, done); node.removeEventListener('error', error); };
  });
  const addVideo = label => { const v = document.createElement('video'); v.width = 320; v.height = 180; v.muted = true; v.controls = true; const text = document.createElement('p'); text.textContent = label; document.body.append(text, v); videos.push(v); return v; };
  const capture = async (v, label, frame) => {
    const vf = new VideoFrame(v), out = { label, frame, elementTime: v.currentTime, duration: v.duration, decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames, format: vf.format, timestamp: vf.timestamp, codedWidth: vf.codedWidth, codedHeight: vf.codedHeight, visibleRect: vf.visibleRect.toJSON(), displayWidth: vf.displayWidth, displayHeight: vf.displayHeight, colorSpace: vf.colorSpace.toJSON() };
    try {
      try { const bytes = new Uint8Array(vf.allocationSize({ rect: vf.visibleRect })); const layout = await vf.copyTo(bytes, { rect: vf.visibleRect }); planes.set(label, bytes); out.nativePlanes = { bytes: bytes.length, sha256: await hash(bytes), layout, formatConversionRequested: false }; } catch (e) { out.nativePlanes = { status: 'UNKNOWN', errorName: e.name }; }
      const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }); context.drawImage(v, 0, 0); const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      pixels.set(label, rgba); out.canvas = { width: canvas.width, height: canvas.height, attributes: context.getContextAttributes(), sha256: await hash(rgba), png: canvas.toDataURL() };
      return out;
    } finally { vf.close(); }
  };
  const seekFrame = (v, target, pts) => bounded('LAST_FRAME', (ok, bad) => {
    let active = true;
    const watch = () => { const id = v.requestVideoFrameCallback((_, m) => { callbacks.delete(v); if (!active) return; if (Math.abs(m.mediaTime - pts) > .0001) { watch(); return; } active = false; capture(v, v.dataset.case, { mediaTime: m.mediaTime, presentedFrames: m.presentedFrames, width: m.width, height: m.height }).then(ok, bad); }); callbacks.set(v, id); };
    const error = () => bad(Error('COLOR_SEEK_NATIVE_ERROR')); v.addEventListener('error', error, { once: true }); watch(); v.currentTime = target;
    return () => { active = false; const id = callbacks.get(v); if (id != null) v.cancelVideoFrameCallback(id); callbacks.delete(v); v.removeEventListener('error', error); };
  });
  const compare = (a, b) => {
    const x = pixels.get(a), y = pixels.get(b); if (!x || !y || x.length !== y.length) return { status: 'UNKNOWN' };
    let changed = 0, max = 0, absolute = 0, squared = 0;
    for (let p = 0; p < x.length; p++) { if (p % 4 === 3) continue; const d = Math.abs(x[p] - y[p]); changed += d > 0; max = Math.max(max, d); absolute += d; squared += d * d; }
    const count = x.length / 4 * 3, mse = squared / count, ac = report.cases.find(c => c.label === a), bc = report.cases.find(c => c.label === b);
    const compatible = ac.format === bc.format && JSON.stringify(ac.visibleRect) === JSON.stringify(bc.visibleRect) && JSON.stringify(ac.nativePlanes.layout) === JSON.stringify(bc.nativePlanes.layout);
    return { a, b, rgbaExact: changed === 0, differentChannels: changed, maxChannelDelta: max, meanAbsoluteChannelDelta: absolute / count, psnr: mse ? 10 * Math.log10(255 ** 2 / mse) : null, sameNativePlaneLayout: compatible, nativePlaneBytesExact: compatible && ac.nativePlanes.sha256 && bc.nativePlanes.sha256 ? ac.nativePlanes.sha256 === bc.nativePlanes.sha256 : 'UNKNOWN' };
  };
  try {
    if (typeof VideoFrame !== 'function' || !HTMLVideoElement.prototype.requestVideoFrameCallback || !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42c00c,mp4a.40.2"')) throw Error('COLOR_CAPABILITY');
    for (const item of [{ label: 'original-file', url: '/source.mp4', target: 5.999999, pts: 5.958333333333333 }, { label: 'copied-remux-file', url: '/remux.mp4', target: 1.007999, pts: .9663333333333334 }]) {
      const v = addVideo(item.label); v.dataset.case = item.label; await event(v, 'loadeddata', () => { v.src = item.url; v.load(); }); report.cases.push(await seekFrame(v, item.target, item.pts));
    }
    const v = addVideo('same-copied-remux-MSE'); v.dataset.case = 'same-copied-remux-MSE'; const ms = new MediaSource(), url = URL.createObjectURL(ms); urls.push(url);
    await event(ms, 'sourceopen', () => { v.src = url; v.load(); }); const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42c00c,mp4a.40.2"'); const response = await fetch('/remux.mp4'); const bytes = await response.arrayBuffer();
    const loaded = event(v, 'loadeddata', () => {}); await event(sb, 'updateend', () => sb.appendBuffer(bytes)); ms.endOfStream(); await loaded; report.cases.push(await seekFrame(v, 1.007999, .9663333333333334));
    report.comparisons = [compare('original-file', 'copied-remux-file'), compare('copied-remux-file', 'same-copied-remux-MSE'), compare('original-file', 'same-copied-remux-MSE')]; report.observationCompleted = true;
  } catch (e) { report.failure = /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'COLOR_OPERATION_FAILED'; report.errorName = e.name; }
  finally {
    for (const [v, id] of callbacks) v.cancelVideoFrameCallback(id); callbacks.clear(); for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const v of videos) { v.pause(); v.removeAttribute('src'); v.load(); } for (const url of urls) URL.revokeObjectURL(url);
    report.cleanup = { callbacksEmpty: callbacks.size === 0, timersEmpty: timers.size === 0, allSourcesRemoved: videos.every(v => !v.hasAttribute('src')), objectUrlsRevoked: urls.length }; report.completedAt = Date.now();
    const response = await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); if (!response.ok) throw Error('COLOR_RESULT_SAVE');
  }
  return { observationCompleted: report.observationCompleted === true, failure: report.failure || null, cases: report.cases.map(({ canvas, ...c }) => ({ ...c, canvas: canvas ? { ...canvas, png: undefined } : null })), comparisons: report.comparisons, cleanup: report.cleanup };
}
