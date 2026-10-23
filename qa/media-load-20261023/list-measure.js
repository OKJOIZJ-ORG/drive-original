async () => {
  performance.setResourceTimingBufferSize(20000); performance.clearResourceTimings();
  window.__big ||= { id: state.currentFolderId, name: state.currentFolderName };
  state.folderStack = []; enterFolder('root', '내 드라이브', 'back');
  for (let i = 0; i < 300 && (!state.folders.length || state.loadingFiles); i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 500));
  const f = window.__big;
  const mark = performance.now();
  const before = performance.getEntriesByType('resource').length;
  enterFolder(f.id, f.name, 'forward');
  let first = null, thumbs = null;
  while (performance.now() - mark < 30000) {
    if (first === null && state.files.length) first = Math.round(performance.now() - mark);
    if (thumbs === null && document.querySelectorAll('.file-card-thumb.loaded').length >= 8) thumbs = Math.round(performance.now() - mark);
    if (state.populationComplete && thumbs !== null) break;
    await new Promise(r => setTimeout(r, 20));
  }
  const res = performance.getEntriesByType('resource').slice(before);
  return { patched: !!window.__patchApplied, firstPageRendered: first, eightThumbs: thumbs, allPages: Math.round(performance.now() - mark), files: state.files.length,
    parentsSample: state.files[0]?.parents?.length === 1 && state.files[0].parents[0] === f.id,
    lists: res.filter(e => /orderBy=folder/.test(e.name)).map(e => `${Math.round(e.startTime - mark)}+${Math.round(e.duration)} ps=${new URL(e.name).searchParams.get('pageSize')}`) };
}
