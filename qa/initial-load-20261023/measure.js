async () => {
  const t0 = performance.now(); let acct = null, grid = null;
  while (performance.now() - t0 < 25000) {
    const s = document.getElementById('librarySummary')?.textContent || '';
    if (grid === null && s && !/불러오는/.test(s)) grid = Math.round(performance.now());
    if (acct === null && (typeof state !== 'undefined' && state.accountStateLoaded)) acct = Math.round(performance.now());
    if (grid !== null && acct !== null) break;
    await new Promise(r => setTimeout(r, 25));
  }
  await new Promise(r => setTimeout(r, 1500));
  const r = performance.getEntriesByType('resource');
  const g = r.filter(e => e.name.startsWith('https://www.googleapis.com/'));
  const list = g.find(e => /orderBy=folder/.test(e.name));
  const cred = r.find(e => e.name.includes('/api/session/credential'));
  return { patched: !!window.__patchApplied, patchError: window.__patchError || null,
    credEnd: Math.round(cred?.responseEnd || -1), listStart: Math.round(list?.startTime || -1), listEnd: Math.round(list?.responseEnd || -1),
    gridReady: grid, accountStateLoaded: acct, media: g.filter(e => /alt=media/.test(e.name)).length,
    about: g.filter(e => /\/about/.test(e.name)).length, catalog: g.filter(e => /appDataFolder/.test(e.name)).length,
    summary: document.getElementById('librarySummary')?.textContent };
}
