// Evaluate only in an owned, authenticated Drive Original QA tab after the
// inventory/signature survey. Read-only; checks native first-image decoding,
// not every animation frame. Results contain private IDs: never commit them.
() => {
  const audit = window.__formatAudit;
  if (!audit || window.__formatImageCheck?.active) throw new Error('QA_STATE');
  const kinds = new Set(['jpeg', 'png', 'gif', 'webp', 'bmp']);
  const signatures = new Map(audit.results.filter(r => r.extensionMismatch && kinds.has(r.kind)).map(r => [r.id, r]));
  const files = audit.files.filter(f => signatures.has(f.id));
  const bytes = files.reduce((sum, f) => sum + Number(f.size), 0);
  if (bytes > 128 * 1024 * 1024 || files.some(f => Number(f.size) > 32 * 1024 * 1024)) throw new Error('QA_BYTE_BUDGET');
  const account = state.authAccountKey, generation = state.driveSessionGeneration;
  const current = () => state.authAccountKey === account && state.driveSessionGeneration === generation;
  const result = window.__formatImageCheck = {active: true, total: files.length, bytes, results: []};
  result.task = (async () => {
    const {openDriveQ1Source} = await import('./media/drive-source.mjs');
    let index = 0;
    await Promise.all(Array.from({length: 2}, async () => {
      while (index < files.length && current()) {
        const file = files[index++]; let source;
        try {
          source = await openDriveQ1Source({fileId: file.id, accountKey: account, accountGeneration: generation,
            allowCorsHiddenRange: true, isCurrent: current,
            readMetadata: ({signal}) => readSourceRevisionMetadata(file, signal),
            readRange: ({range, signal}) => driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, {signal, headers: {Range: range}})});
          const size = Number(source.identity.size), parts = [], blockSize = source.stats().maxReadBytes;
          if (size !== Number(file.size)) throw new Error('QA_SIZE_CHANGED');
          if (!Number.isSafeInteger(blockSize) || blockSize < 1 || blockSize > 1024 * 1024) throw new Error('QA_RANGE_CONTRACT');
          for (let start = 0; start < size; start += blockSize)
            parts.push(await source.read({start, end: Math.min(size, start + blockSize) - 1}));
          const cleanup = await source.abort(); source = null;
          if (!cleanup.settled || !current()) throw new Error('QA_OWNER_CHANGED');
          const blob = new Blob(parts, {type: file.mimeType}), url = URL.createObjectURL(blob), picture = new Image();
          try {
            await new Promise((resolve, reject) => {
              const finish = error => { clearTimeout(timer); picture.onload = picture.onerror = null; error ? reject(error) : resolve(); };
              const timer = setTimeout(() => finish(new Error('NATIVE_IMAGE_TIMEOUT')), 10000);
              picture.onload = () => finish(picture.naturalWidth ? null : new Error('NATIVE_IMAGE_EMPTY'));
              picture.onerror = () => finish(new Error('NATIVE_IMAGE_ERROR'));
              picture.src = url;
            });
            result.results.push({id: file.id, bytes: size, kind: signatures.get(file.id).kind, width: picture.naturalWidth, height: picture.naturalHeight});
          } finally { picture.removeAttribute('src'); URL.revokeObjectURL(url); }
        } catch (error) { result.results.push({id: file.id, error: error.message}); }
        finally { await source?.abort(); }
      }
    }));
    result.active = false;
  })();
  return {started: true, total: result.total, bytes};
}
