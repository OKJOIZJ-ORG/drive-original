(() => {
  const all = performance.getEntriesByType('resource');
  let latest = null;
  for (const e of all) {try {const u=new URL(e.name);if(u.origin===location.origin
    && /\/__drive_media\/[^/]+$/.test(u.pathname) && u.searchParams.get('mediaOwner')==='q1') latest=u;}catch (_) {}}
  const file = state.selected?.id || (latest && decodeURIComponent(latest.pathname.split('/').at(-1)));
  if (!file) return {selected:false,mostRecentQ1Available:false,rows:[]};
  const classify = entry => {
    try {
      const u = new URL(entry.name);
      if (u.origin === location.origin && u.pathname.endsWith('/__drive_media/' + encodeURIComponent(file))) {
        return u.searchParams.get('mediaOwner') === 'q1' ? 'range' : null;
      }
      if (u.origin === 'https://www.googleapis.com' && u.pathname === '/drive/v3/files/' + encodeURIComponent(file)
          && !u.searchParams.has('alt') && u.searchParams.has('fields')) return 'metadata';
    } catch (_) {}
    return null;
  };
  const entries = all.filter(e => classify(e)).slice(-48);
  const base = entries[0]?.startTime || 0;
  const finite = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
  return {selected:Boolean(state.selected),mostRecentQ1Available:Boolean(latest),nativeOwnerCurrent:isCurrentMediaEvent(el.videoPlayer),
    selectedOrMostRecentFileOnly:true,metadataSessionBound:false,currentRangeSessionBound:false,
    exactSeekSpanKnown:false,bufferMayBeTruncated:true,rows:entries.map(e => ({stage:classify(e),
      mostRecentRangeGeneration:classify(e)==='range' && Boolean(latest)
        && new URL(e.name).searchParams.get('sourceGeneration')===latest.searchParams.get('sourceGeneration'),
      startMs:finite(e.startTime-base),durationMs:finite(e.duration),
      timingExposed:e.responseStart>0,headersMs:e.responseStart>0 ? finite(e.responseStart-e.startTime) : null,
      bodyMs:e.responseStart>0 ? finite(e.responseEnd-e.responseStart) : null,
      swStartMs:e.workerStart>0 ? finite(e.workerStart-e.startTime) : null,
      transferBytes:finite(e.transferSize),encodedBytes:finite(e.encodedBodySize)}))};
})()
