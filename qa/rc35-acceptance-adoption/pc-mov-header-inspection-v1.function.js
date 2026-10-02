async function inspectMovHeader(t) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
  let reader;
  try {
    const u = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(t.id) + '/revisions/' + encodeURIComponent(t.headRevisionId));
    u.searchParams.set('alt', 'media');
    const headers = { Authorization: 'Bearer ' + state.token, Range: 'bytes=0-16383' };
    if (t.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = t.id + '/' + t.resourceKey;
    const r = await fetch(u, { headers, cache: 'no-store', redirect: 'error', signal: abort.signal });
    if (r.status !== 206) throw Error('MOV_DIAG_STATUS');
    reader = r.body.getReader(); const bytes = new Uint8Array(16384); let n = 0;
    for (;;) { const v = await reader.read(); if (v.done) break; if (n + v.value.length > bytes.length) throw Error('MOV_DIAG_BOUND'); bytes.set(v.value, n); n += v.value.length; }
    if (n !== bytes.length) throw Error('MOV_DIAG_LENGTH');
    const view = new DataView(bytes.buffer), boxes = [], tag = p => String.fromCharCode(...bytes.slice(p, p + 4)).replace(/[^ -~]/g, '?');
    let p = 0;
    for (let i = 0; i < 8 && p + 8 <= n; i++) {
      let size = view.getUint32(p), headerBytes = 8;
      if (size === 1) { if (p + 16 > n) break; const big = view.getBigUint64(p + 8); if (big > BigInt(Number.MAX_SAFE_INTEGER)) break; size = Number(big); headerBytes = 16; }
      const type = tag(p + 4), item = { offset: p, type, size, headerBytes, fitsHeader: size >= headerBytes && p + size <= n };
      if (type === 'ftyp' && size >= headerBytes + 8 && p + size <= n) { item.majorBrand = tag(p + headerBytes); item.compatibleBrands = []; for (let q = p + headerBytes + 8; q + 4 <= p + size && item.compatibleBrands.length < 16; q += 4) item.compatibleBrands.push(tag(q)); }
      boxes.push(item); if (size < headerBytes || p + size > n) break; p += size;
    }
    return { status: r.status, bytes: n, headerSHA256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join(''), boxes, rawBytesOrPrivateIdentityExported: false, playbackStarted: false };
  } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
}
