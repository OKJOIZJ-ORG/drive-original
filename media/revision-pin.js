(function (root) {
  'use strict';
  const PROTOCOL = 'drive-original-q0-revision-pin-v1';
  const DESCRIPTION_KEYS = ['fileId', 'accountKey', 'accountGeneration', 'headRevisionId', 'size',
    'mimeType', 'modifiedTime', 'sha256Checksum', 'canDownload', 'trashed', 'canReadRevisions', 'resourceKey'];
  function error(code, status = 409) {
    return Object.assign(new Error(`Q0_PIN_${code}`), { name: 'RevisionPinError', code, status });
  }
  const demand = (condition, code, status) => { if (!condition) throw error(code, status); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
  function owner(context) {
    demand(object(context) && id(context.fileId) && text(context.accountKey, 512)
      && Number.isSafeInteger(context.accountGeneration) && context.accountGeneration >= 0, 'OWNER');
    return Object.freeze({ fileId: context.fileId, accountKey: context.accountKey, accountGeneration: context.accountGeneration });
  }
  function descriptor(metadata, context) {
    const scope = owner(context);
    demand(object(metadata) && metadata.id === scope.fileId && typeof metadata.size === 'string'
      && /^[1-9]\d{0,15}$/.test(metadata.size) && Number.isSafeInteger(Number(metadata.size))
      && text(metadata.mimeType, 256) && text(metadata.modifiedTime, 128), 'METADATA');
    demand(metadata.trashed === false && metadata.capabilities?.canDownload === true, 'PERMISSION', 403);
    demand(!metadata.mimeType.startsWith('application/vnd.google-apps.'), 'UNSUPPORTED', 422);
    demand(metadata.headRevisionId != null, 'IDENTITY_UNAVAILABLE', 422);
    demand(id(metadata.headRevisionId), 'METADATA');
    const checksum = metadata.sha256Checksum ?? null;
    demand(checksum === null || (typeof checksum === 'string' && /^[a-fA-F0-9]{64}$/.test(checksum)), 'METADATA');
    demand(metadata.capabilities.canReadRevisions == null || typeof metadata.capabilities.canReadRevisions === 'boolean', 'METADATA');
    demand(metadata.resourceKey == null || text(metadata.resourceKey, 512), 'METADATA');
    return Object.freeze({ ...scope, headRevisionId: metadata.headRevisionId, size: metadata.size,
      mimeType: metadata.mimeType, modifiedTime: metadata.modifiedTime, sha256Checksum: checksum?.toLowerCase() ?? null,
      canDownload: true, trashed: false, canReadRevisions: metadata.capabilities.canReadRevisions ?? null,
      resourceKey: metadata.resourceKey ?? null });
  }
  function validateUri(uri, pin) {
    demand(text(uri, 8192), 'URI');
    let parsed;
    try { parsed = new URL(uri); } catch (_) { throw error('URI'); }
    demand(parsed.origin === 'https://www.googleapis.com' && !parsed.username && !parsed.password && !parsed.hash, 'URI');
    demand(parsed.pathname === `/drive/v3/files/${pin.fileId}/revisions/${pin.headRevisionId}`, 'URI');
    demand(parsed.searchParams.getAll('alt').length === 1 && parsed.searchParams.get('alt') === 'media', 'URI');
    for (const [key, value] of [['fileId', pin.fileId], ['id', pin.fileId], ['revisionId', pin.headRevisionId], ['revision', pin.headRevisionId]]) {
      demand(parsed.searchParams.getAll(key).every(entry => entry === value), 'URI');
    }
    for (const key of parsed.searchParams.keys()) {
      demand(!/^(?:access_token|authorization|oauth_token|id_token|refresh_token|token)$/i.test(key), 'URI');
    }
    return uri; // Exact private provider URI, including opaque query; never a public media URL.
  }
  function canonical(value) {
    return Object.fromEntries(DESCRIPTION_KEYS.map(key => [key, value[key] ?? null]));
  }
  function sameDescriptor(a, b) {
    if (!object(a) || !object(b)) return false;
    try {
      for (const value of [a, b]) {
        const normalized = descriptor({ ...value, id: value.fileId,
          capabilities: { canDownload: value.canDownload, canReadRevisions: value.canReadRevisions } }, value);
        if (JSON.stringify(canonical(value)) !== JSON.stringify(canonical(normalized))) return false;
      }
      return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    } catch (_) { return false; }
  }
  function validatePin(pin, context) {
    const scope = owner(context);
    demand(object(pin) && pin.protocol === PROTOCOL && pin.partialDownloadAllowed === true && object(pin.descriptor), 'PIN');
    const d = pin.descriptor;
    demand(d.accountKey === scope.accountKey && d.accountGeneration === scope.accountGeneration, 'OWNER');
    const validated = descriptor({ ...d, id: d.fileId,
      capabilities: { canDownload: d.canDownload, canReadRevisions: d.canReadRevisions } }, scope);
    demand(sameDescriptor(d, validated), 'PIN');
    validateUri(pin.uri, validated);
    Object.freeze(d); Object.freeze(pin);
    return pin; // SW restart/credential renewal returns the exact retained object; no latest-head lookup.
  }
  function samePin(a, b) {
    if (!object(a) || !object(b)) return false;
    try {
      validatePin(a, a.descriptor); validatePin(b, b.descriptor);
      return a.uri === b.uri && sameDescriptor(a.descriptor, b.descriptor);
    } catch (_) { return false; }
  }
  async function acquire({ context, retainedPin = null, readMetadata, startDownload, pollOperation,
    pause, isCurrent, signal, maxPolls = 3, maxAcquisitionMs = 40000 } = {}) {
    const scope = owner(context);
    demand(typeof isCurrent === 'function' && Number.isSafeInteger(maxPolls) && maxPolls >= 0 && maxPolls <= 3
      && Number.isSafeInteger(maxAcquisitionMs) && maxAcquisitionMs > 0 && maxAcquisitionMs <= 40000
      && (!signal || (typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function')), 'OPTIONS');
    const lifetime = new AbortController();
    const callerAborted = () => lifetime.abort(error('OWNER'));
    signal?.addEventListener('abort', callerAborted, { once: true });
    if (signal?.aborted) callerAborted();
    let timer;
    function check() {
      if (lifetime.signal.aborted) throw lifetime.signal.reason || error('OWNER');
      let current;
      try { current = isCurrent(context); } catch (_) { throw error('OWNER'); }
      if (current && typeof current.then === 'function') {
        Promise.resolve(current).catch(() => {}); throw error('OWNER');
      }
      demand(current === true, 'OWNER');
    }
    async function call(hook, args) {
      check();
      const value = await new Promise((resolve, reject) => {
        const aborted = () => reject(lifetime.signal.reason || error('OWNER'));
        lifetime.signal.addEventListener('abort', aborted, { once: true });
        Promise.resolve().then(() => { check(); return hook(args); }).then(resolve, reject)
          .finally(() => lifetime.signal.removeEventListener('abort', aborted));
      });
      check(); return value;
    }
    try {
      check();
      if (retainedPin != null) {
        const pin = validatePin(retainedPin, scope); check(); return pin;
      }
      demand(typeof readMetadata === 'function' && typeof startDownload === 'function', 'OPTIONS');
      timer = setTimeout(() => lifetime.abort(error('ACQUISITION_TIMEOUT', 504)), maxAcquisitionMs);
      const before = descriptor(await call(readMetadata, { context: scope, phase: 'before', signal: lifetime.signal }), scope);
      let operation = await call(startDownload, { context: scope, method: 'POST', body: null,
        revisionId: before.headRevisionId, resourceKey: before.resourceKey, signal: lifetime.signal });
      let name = null;
      for (let polls = 0;; polls++) {
        demand(object(operation) && operation.error == null && (operation.done == null || typeof operation.done === 'boolean'), 'OPERATION');
        demand(text(operation.name, 1024) && !/\s/.test(operation.name) && (name === null || name === operation.name), 'OPERATION_NAME');
        name = operation.name;
        demand(operation.metadata == null || object(operation.metadata), 'OPERATION');
        demand(operation.metadata?.['@type'] == null
          || operation.metadata['@type'] === 'type.googleapis.com/google.apps.drive.v3.DownloadFileMetadata', 'OPERATION');
        demand(operation.metadata?.resourceKey == null || operation.metadata.resourceKey === before.resourceKey, 'CONTENT_DRIFT');
        if (operation.done === true) break; // Completed initial operations may deny further polling.
        demand(operation.response == null, 'OPERATION');
        demand(polls < maxPolls && typeof pause === 'function' && typeof pollOperation === 'function', 'PENDING_LIMIT', 504);
        await call(args => pause(10000, args.signal), { signal: lifetime.signal });
        operation = await call(pollOperation, { context: scope, name, resourceKey: before.resourceKey, signal: lifetime.signal });
      }
      const response = operation.response;
      demand(object(response) && response['@type'] === 'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse', 'OPERATION');
      demand(response.partialDownloadAllowed === true, 'NONPARTIAL', 422);
      const uri = validateUri(response.downloadUri, before);
      const after = descriptor(await call(readMetadata, { context: scope, phase: 'after', signal: lifetime.signal }), scope);
      demand(sameDescriptor(before, after), 'CONTENT_DRIFT');
      check();
      return Object.freeze({ protocol: PROTOCOL, descriptor: before, uri, partialDownloadAllowed: true });
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', callerAborted);
      // Hooks own JSON reader/transport drain. Aborting is never cleanup proof.
      if (!lifetime.signal.aborted) lifetime.abort();
    }
  }
  const api = Object.freeze({ PROTOCOL, error, descriptor, validatePin, samePin, sameDescriptor, acquire });
  root.DriveRevisionPin = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(globalThis);
