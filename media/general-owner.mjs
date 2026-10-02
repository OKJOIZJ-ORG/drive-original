const requireThat = (condition, code) => { if (!condition) throw new Error(`WORKER_${code}`); };
export function startGeneralWorker({ source, generation, isCurrent = () => true, signal,
  onWindow = () => {}, onChunk, targetTime = 0, endTime = Infinity, limits = {}, selectedAudioTrackId,
  timelinePolicy = true, workerFactory = url => new Worker(url, { type: 'module' }) }) {
  requireThat(source?.identity && typeof onChunk === 'function' && Number.isSafeInteger(generation) && generation > 0, 'OPTIONS');
  const worker = workerFactory(new URL('./general-worker.mjs', import.meta.url));
  const metrics = { reads: 0, bytes: 0, activeReads: 0, peakReads: 0, chunks: 0, acks: 0, pendingChunks: 0, peakPendingChunks: 0,
    detachedReadBuffers: 0, invalidMessages: 0, staleRepliesSuppressed: 0, pendingWindows: 0, terminated: false };
  let lastRequestId = 0; const consumers = new AbortController(); let active = true, terminal = false, cleanup, stopTimer, resolveDone, consumerDrain;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const abortSource = () => cleanup ||= source.abort();
  const current = () => active && !signal?.aborted && isCurrent();
  const consumersSettled = () => metrics.pendingChunks === 0 && metrics.pendingWindows === 0;
  const notifyConsumerDrain = () => { if (consumersSettled()) consumerDrain?.(); };
  const reply = (id, value, error, transfer = []) => worker.postMessage({ kind: 'reply', generation, id, value, error }, transfer);
  async function finish(payload) {
    if (terminal) return; terminal = true; active = false; consumers.abort(); clearTimeout(stopTimer); signal?.removeEventListener('abort', cancel);
    const originalCleanup = await abortSource();
    if (!consumersSettled()) await new Promise(resolve => {
      const timer = setTimeout(() => { consumerDrain = null; resolve(); }, 2000);
      consumerDrain = () => { clearTimeout(timer); consumerDrain = null; resolve(); };
    });
    await Promise.resolve(worker.terminate()); metrics.terminated = true;
    resolveDone({ ...payload, cleanup: originalCleanup, metrics,
      transportCleanup: { settled: originalCleanup.settled && consumersSettled() && metrics.activeReads === 0,
        originalSourceSettled: originalCleanup.settled, consumersSettled: consumersSettled(), activeReads: metrics.activeReads,
        pendingChunks: metrics.pendingChunks, pendingWindows: metrics.pendingWindows, workerTerminated: true } });
  }
  function cancel() {
    if (terminal) return done;
    active = false; consumers.abort(); worker.postMessage({ kind: 'cancel', generation }); void abortSource();
    stopTimer ||= setTimeout(() => { void finish({ error: { message: 'WORKER_TERMINAL_TIMEOUT' } }); }, 5000);
    return done;
  }
  async function receive(message) {
    try {
      requireThat(message && message.generation === generation, 'GENERATION');
      if (message.kind === 'terminal') { await finish(message); return; }
      requireThat(Number.isSafeInteger(message.id) && message.id > 0 && message.id > lastRequestId, 'REQUEST_ID');
      lastRequestId = message.id;
      if (message.kind === 'cleanup') { reply(message.id, await abortSource()); return; }
      requireThat(current(), 'STALE_GENERATION');
      if (message.kind === 'read') {
        const { start, end } = message, size = Number(source.identity.size);
        requireThat(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end < size && end - start + 1 <= 1048576, 'READ_RANGE');
        requireThat(metrics.activeReads === 0, 'READ_CONCURRENCY'); metrics.activeReads++; metrics.peakReads = Math.max(metrics.peakReads, metrics.activeReads);
        let bytes; try { bytes = await source.read({ start, end }); } finally { metrics.activeReads--; }
        requireThat(current(), 'STALE_GENERATION'); requireThat(bytes instanceof Uint8Array && bytes.length === end - start + 1, 'READ_BODY');
        const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
        metrics.reads++; metrics.bytes += owned.byteLength; reply(message.id, owned.buffer, null, [owned.buffer]);
        requireThat(owned.buffer.byteLength === 0, 'READ_TRANSFER_OWNERSHIP'); metrics.detachedReadBuffers++; return;
      }
      if (message.kind === 'window') {
        metrics.pendingWindows++; try { await onWindow(message.value, consumers.signal); } finally { metrics.pendingWindows--; notifyConsumerDrain(); }
        requireThat(current(), 'STALE_GENERATION'); reply(message.id, true); return;
      }
      if (message.kind === 'chunk') {
        requireThat(message.buffer instanceof ArrayBuffer && message.buffer.byteLength > 0 && message.buffer.byteLength <= 262144 && metrics.pendingChunks === 0, 'CHUNK_BOUNDS');
        requireThat(Number.isSafeInteger(message.batchSize) && message.batchSize >= message.buffer.byteLength && message.batchSize <= 8 * 1024 * 1024 && typeof message.batchEnd === 'boolean', 'BATCH_BOUNDS');
        metrics.chunks++; metrics.pendingChunks++; metrics.peakPendingChunks = Math.max(metrics.peakPendingChunks, metrics.pendingChunks);
        try { await onChunk({ generation, bytes: new Uint8Array(message.buffer), position: message.position, batchSize: message.batchSize, batchEnd: message.batchEnd, signal: consumers.signal }); }
        finally { metrics.pendingChunks--; notifyConsumerDrain(); }
        if (!current()) { metrics.staleRepliesSuppressed++; return; }
        metrics.acks++; reply(message.id, true); return;
      }
      throw new Error('WORKER_MESSAGE_KIND');
    } catch (error) {
      if (!current()) metrics.staleRepliesSuppressed++;
      else metrics.invalidMessages++;
      if (!terminal && Number.isSafeInteger(message?.id)) reply(message.id, null, /^(?:GENERAL|WORKER|Q1_EXACT|Q1_SOURCE|TIMING)_[A-Z_]+$/.test(error.message) ? error.message : 'GENERAL_CONSUMER_FAILED');
      if (!current() || /CONCURRENCY|BOUNDS|GENERATION|REQUEST_ID|MESSAGE_LIMIT/.test(error.message)) void cancel();
    }
  }
  if (typeof worker.addEventListener === 'function') {
    worker.addEventListener('message', event => { void receive(event.data); });
    worker.addEventListener('error', () => { void finish({ error: { message: 'WORKER_RUNTIME_ERROR' } }); });
  } else {
    worker.on('message', message => { void receive(message); });
    worker.on('error', () => { void finish({ error: { message: 'WORKER_RUNTIME_ERROR' } }); });
  }
  signal?.addEventListener('abort', cancel, { once: true });
  worker.postMessage({ kind: 'start', generation, identity: source.identity, targetTime, endTime, limits, timelinePolicy, selectedAudioTrackId });
  if (signal?.aborted) void cancel();
  return { done, cancel, metrics };
}
