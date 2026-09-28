async function () {
  // Runtime.callFunctionOn: this is the coordinator's private control handle.
  // Only this.job.recoveryRun is consumed; no IDs or metadata leave this scope.
  let requests = 0, bytes = 0, ownerStable = true;
  const rows = [];
  const lifetime = new AbortController();
  const started = Date.now();
  const cancel = () => lifetime.abort();
  const deadline = setTimeout(cancel, 20000);
  window.addEventListener('pagehide', cancel, { once: true });
  const readOwner = () => ({
    accountId: state.accountId, accountKey: state.authAccountKey,
    authGeneration: state.authGeneration, dataGeneration: state.driveSessionGeneration,
    token: state.token, revision: state.tokenRevision,
    signal: state.accountStateAbortController?.signal, sw: navigator.serviceWorker.controller,
    safe: DRIVE_MUTATIONS_ENABLED === false && state.authStatus === 'online' && hasUsableToken()
      && !state.accountIdentityPending && !state.demo && !state.selected
      && !playerMediaPriorityActive && !q1Playback && q1RetirementResult?.settled === true
  });
  const initial = readOwner();
  const assertOwner = () => {
    const now = readOwner();
    if (!initial.safe || !now.safe || !initial.accountId || !initial.accountKey || !initial.token
      || initial.signal?.aborted || lifetime.signal.aborted || Date.now() - started >= 20000
      || !['accountId','accountKey','authGeneration','dataGeneration','token','revision','signal','sw'].every(key => initial[key] === now[key])) {
      ownerStable = false;
      throw new Error('QA_FINAL_OWNER');
    }
  };
  const roles = ['folder-a', 'folder-b', 'test-file'];
  const fields = 'id,version,parents,trashed,mimeType,appProperties,ownedByMe,driveId';
  const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_-]{5,200}$/.test(id);
  const folderMime = 'application/vnd.google-apps.folder';
  const mimeFor = role => role === 'test-file' ? 'text/plain' : folderMime;
  const versionOK = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
  const parentsEqual = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === 1 && b.length === 1 && idOK(a[0]) && idOK(b[0]) && a[0] === b[0];
  try {
    assertOwner();
    const run = this.job?.recoveryRun;
    if (typeof run !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run)) throw new Error('QA_FINAL_LEDGER');
    const raw = localStorage.getItem(`drive-original.qa.disposable.${run}.recovery`);
    if (!raw || raw.length > 131072) throw new Error('QA_FINAL_LEDGER');
    const ledger = JSON.parse(raw);
    if (ledger.schema !== 1 || ledger.run !== run || ledger.accountId !== initial.accountId || ledger.accountKey !== initial.accountKey
      || !['complete', 'recovery-verified'].includes(ledger.status)
      || !Array.isArray(ledger.created) || !Array.isArray(ledger.planned)
      || ledger.created.length !== 3 || ledger.planned.length !== 3
      || new Set(ledger.created.map(row => row.id)).size !== 3) throw new Error('QA_FINAL_LEDGER');
    for (let i = 0; i < 3; i++) {
      const row = ledger.created[i], planned = ledger.planned[i], before = row.metadata;
      if (row.role !== roles[i] || planned.role !== roles[i] || planned.id !== row.id || planned.sent !== true || !idOK(row.id)
        || before?.id !== row.id || !versionOK(before.version)
        || typeof before.trashed !== 'boolean' || before.trashed !== (row.role === 'test-file')
        || !parentsEqual(before.parents, before.parents) || before.mimeType !== mimeFor(row.role)
        || before.appProperties?.qaRun !== run || before.appProperties?.qaRole !== row.role
        || before.ownedByMe !== true || before.driveId) throw new Error('QA_FINAL_LEDGER');
    }
    assertOwner();
    const snapshots = new Map();
    for (let pass = 0; pass < 2; pass++) for (const row of ledger.created) {
      assertOwner();
      const perRequest = new AbortController();
      const timer = setTimeout(() => perRequest.abort(), 6000);
      const signals = [lifetime.signal, perRequest.signal, initial.signal].filter(Boolean);
      const signal = AbortSignal.any(signals);
      try {
        requests++;
        const query = new URLSearchParams({ supportsAllDrives: 'true', fields });
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.id)}?${query}`, {
          method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
          headers: { Authorization: `Bearer ${initial.token}` }
        });
        assertOwner();
        if (signal.aborted || !response.ok) throw new Error('QA_FINAL_NETWORK');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('QA_FINAL_BODY');
        const chunks = []; let replyBytes = 0;
        try {
          while (true) {
            assertOwner(); if (signal.aborted) throw new Error('QA_FINAL_NETWORK');
            const chunk = await reader.read();
            assertOwner(); if (signal.aborted) throw new Error('QA_FINAL_NETWORK');
            if (chunk.done) break;
            replyBytes += chunk.value.byteLength; bytes += chunk.value.byteLength;
            if (replyBytes > 32768 || bytes > 196608) throw new Error('QA_FINAL_BODY');
            chunks.push(chunk.value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        const buffer = new Uint8Array(replyBytes); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
        const after = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
        assertOwner();
        const before = row.metadata;
        const tagMatches = after.appProperties?.qaRun === run && after.appProperties?.qaRole === row.role;
        const owned = after.ownedByMe === true && !after.driveId;
        const isFile = row.role === 'test-file';
        const versionMatches = versionOK(after.version) && (isFile ? after.version === before.version
          : BigInt(after.version) >= BigInt(before.version));
        const stateMatches = after.id === row.id && versionMatches
          && after.trashed === before.trashed && parentsEqual(after.parents, before.parents)
          && after.mimeType === before.mimeType;
        const ok = tagMatches && owned && stateMatches;
        if (pass === 0) {
          rows.push({ role: row.role, httpStatus: response.status, secondHttpStatus: null,
            status: ok ? 'snapshot-recorded' : 'drift', stateMatches, tagMatches, owned,
            trashed: after.trashed === true, snapshotStable: false,
            ...(!isFile ? { creationVersionMatches: after.version === before.version } : {}) });
          if (!ok) throw new Error('QA_FINAL_DRIFT');
          snapshots.set(row.id, after);
        } else {
          const first = snapshots.get(row.id);
          const snapshotStable = ok && after.id === first.id && after.version === first.version
            && after.trashed === first.trashed && parentsEqual(after.parents, first.parents)
            && after.mimeType === first.mimeType && after.ownedByMe === first.ownedByMe
            && (after.driveId || null) === (first.driveId || null)
            && after.appProperties?.qaRun === first.appProperties?.qaRun
            && after.appProperties?.qaRole === first.appProperties?.qaRole;
          Object.assign(rows.find(result => result.role === row.role), {secondHttpStatus:response.status,
            status:snapshotStable?'verified':'drift',stateMatches,tagMatches,owned,trashed:after.trashed===true,snapshotStable});
          if (!snapshotStable) throw new Error('QA_FINAL_SNAPSHOT_DRIFT');
        }
      } finally { clearTimeout(timer); }
    }
    assertOwner();
    return { ok: true, requests, bytes, ownerStable, readOnly: true, targetsVerified: 3, rows };
  } catch (error) {
    return { ok: false, code: /^QA_FINAL_[A-Z_]+$/.test(error.message) ? error.message : 'QA_FINAL_UNCERTAIN',
      requests, bytes, ownerStable, readOnly: true, targetsVerified: rows.filter(row => row.status === 'verified').length, rows };
  } finally {
    clearTimeout(deadline);
    window.removeEventListener('pagehide', cancel);
  }
}
