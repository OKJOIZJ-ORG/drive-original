async () => {
  performance.setResourceTimingBufferSize(20000); performance.clearResourceTimings();
  const idxs = window.__openIdxs || [];
  const runs = [];
  for (const idx of idxs) {
    const file = state.files[idx];
    const events = [];
    const t0 = performance.now();
    globalThis.__driveOriginalMediaTraceSink = (e) => events.push({ t: Math.round(performance.now() - t0), s: e?.stage || e?.type || '?' });
    const resBefore = performance.getEntriesByType('resource').length;
    if (window.__prewarm && typeof prewarmRevisionPin === 'function') { prewarmRevisionPin(file); await new Promise(r => setTimeout(r, window.__prewarm)); }
    const t1 = performance.now();
    openPlayer(file);
    const isVideo = file.mimeType.startsWith('video/');
    let done = null;
    while (performance.now() - t1 < 20000) {
      if (isVideo ? (el.videoPlayer.readyState >= 2 && el.videoPlayer.videoWidth) : (!el.imageViewer.hidden && el.imageViewer.complete && el.imageViewer.naturalWidth > 0 && el.imageViewer.currentSrc)) { done = Math.round(performance.now() - t1); break; }
      await new Promise(r => setTimeout(r, 10));
    }
    const res = performance.getEntriesByType('resource').slice(resBefore).filter(e => /googleapis|__drive_media/.test(e.name))
      .map(e => `${Math.round(e.startTime - t1)}+${Math.round(e.duration)} ${e.name.includes('__drive_media') ? 'media' : e.name.replace(/https:\/\/www.googleapis.com\/drive\/v3\/files\/[^?/]+/, 'F').slice(0, 60)}`);
    runs.push({ idx, kind: isVideo ? 'video' : 'image', kb: Math.round(file.size / 1024), ready: done, stages: events.filter(e => e.t >= 0).slice(0, 30).map(e => `${e.t - Math.round(t1 - t0)}:${e.s}`), res });
    closePlayer();
    await new Promise(r => setTimeout(r, 1500));
  }
  globalThis.__driveOriginalMediaTraceSink = null;
  return runs;
}
