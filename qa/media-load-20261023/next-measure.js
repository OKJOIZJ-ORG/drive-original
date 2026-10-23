async () => {
  performance.setResourceTimingBufferSize(20000); performance.clearResourceTimings();
  const ready = (file) => file.mimeType.startsWith('video/') ? (el.videoPlayer.readyState >= 2 && el.videoPlayer.videoWidth && !el.videoPlayer.hidden) : (!el.imageViewer.hidden && el.imageViewer.complete && el.imageViewer.naturalWidth > 0 && el.mediaLoading.hidden);
  const waitReady = async (file, t) => { while (performance.now() - t < 20000) { if (state.selected?.id === file.id && ready(file)) return Math.round(performance.now() - t); await new Promise(r => setTimeout(r, 10)); } return null; };
  const out = [];
  for (const idx of window.__nextIdxs) {
    const first = state.files[idx];
    let t = performance.now(); openPlayer(first); const firstReady = await waitReady(first, t);
    await new Promise(r => setTimeout(r, 1500));
    const prewarmedFor = typeof q0Prewarm !== 'undefined' && q0Prewarm ? state.files.findIndex(f => f.id === q0Prewarm.fileId) : -1;
    t = performance.now(); await playNextFile('left'); const commitMs = Math.round(performance.now() - t); const next = state.selected; const nextReady = await waitReady(next, t);
    out.push({ idx, firstReady, prewarmedFor, nextIdx: state.files.indexOf(next), nextKind: next.mimeType.split('/')[0], nextReady, commitMs });
    closePlayer(); await new Promise(r => setTimeout(r, 1200));
  }
  return out;
}
