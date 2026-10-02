async function observeMseColorOnly() {
  if (window.__mseColorProbe) throw Error('COLOR_MSE_PROBE_ALREADY_USED');
  window.__mseColorProbe = true;
  const result = { schema: 'same-remux-MSE-color-only/1', priorFileCasesReused: true, expectedPacketPTS: .9663333333333334, capturePolicy: 'Capture actual last seek RVFC; compare native pixel-plane hash with previously pinned exact last decoded packet. Do not presume file and MSE presentation clock coincide.' };
  const v = document.createElement('video'); v.width = 320; v.height = 180; v.muted = true; v.controls = true; document.body.append(v);
  const ms = new MediaSource(), url = URL.createObjectURL(ms); let callback = null, timer = null, vf = null;
  const event = (node, type, action) => new Promise((resolve, reject) => { const handle = e => { clearTimeout(t); node.removeEventListener(type, handle); resolve({ trusted: e.isTrusted }); }; const t = setTimeout(() => { node.removeEventListener(type, handle); reject(Error('COLOR_' + type.toUpperCase() + '_DEADLINE')); }, 15000); node.addEventListener(type, handle); action(); });
  const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map(x => x.toString(16).padStart(2, '0')).join('');
  try {
    await event(ms, 'sourceopen', () => { v.src = url; v.load(); }); const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42c00c,mp4a.40.2"'); const bytes = await (await fetch('/remux.mp4')).arrayBuffer();
    const loaded = event(v, 'loadeddata', () => {}); await event(sb, 'updateend', () => sb.appendBuffer(bytes)); ms.endOfStream(); await loaded;
    result.beforeSeek = { duration: v.duration, readyState: v.readyState, buffered: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]) };
    const frame = new Promise((resolve, reject) => { timer = setTimeout(() => reject(Error('COLOR_MSE_FRAME_DEADLINE')), 15000); const watch = () => { callback = v.requestVideoFrameCallback((_, m) => { callback = null; if (m.mediaTime < .90) { watch(); return; } clearTimeout(timer); timer = null; vf = new VideoFrame(v); resolve({ mediaTime: m.mediaTime, presentedFrames: m.presentedFrames, width: m.width, height: m.height }); }); }; watch(); });
    const [seekState, metadata] = await Promise.all([event(v, 'seeked', () => { v.currentTime = 1.007999; }), frame]); result.seekState = seekState; result.frame = metadata;
    result.elementTime = v.currentTime; result.format = vf.format; result.timestamp = vf.timestamp; result.visibleRect = vf.visibleRect.toJSON(); result.colorSpace = vf.colorSpace.toJSON();
    const raw = new Uint8Array(vf.allocationSize({ rect: vf.visibleRect })); result.nativePlanes = { bytes: raw.length, layout: await vf.copyTo(raw, { rect: vf.visibleRect }), formatConversionRequested: false }; result.nativePlanes.sha256 = await hash(raw);
    const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight; const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }); ctx.drawImage(v, 0, 0); result.canvas = { width: canvas.width, height: canvas.height, attributes: ctx.getContextAttributes(), sha256: await hash(ctx.getImageData(0, 0, canvas.width, canvas.height).data), png: canvas.toDataURL() };
    result.observed = true;
  } catch (e) { result.failure = /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'COLOR_MSE_OPERATION'; result.errorName = e.name; }
  finally { if (callback != null) v.cancelVideoFrameCallback(callback); if (timer != null) clearTimeout(timer); vf?.close(); v.pause(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); result.cleanup = { callbackRemoved: true, timerRemoved: true, videoFrameClosed: true, sourceRemoved: !v.hasAttribute('src'), objectUrlRevoked: true }; const response = await fetch('/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }); if (!response.ok) throw Error('COLOR_MSE_RESULT_SAVE'); }
  return { ...result, canvas: result.canvas ? { ...result.canvas, png: undefined } : null };
}
