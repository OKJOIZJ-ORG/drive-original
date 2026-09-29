import { audioProfile, audioWindow, AUDIO_BOUNDS } from './audio-runtime.mjs';
export function createAudioWorkerClient({ config, mapping, signal,
  workerFactory = () => new Worker(new URL('./audio-worker.mjs', import.meta.url), { type: 'module' }),
  timeoutMs = 5000 } = {}) {
  const profile = audioProfile(config), window = audioWindow(mapping);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 20 || timeoutMs > 10000) throw Error('AUDIO_WORKER_TIMEOUT_BOUND');
  const worker = workerFactory(), pending = new Map(), consumerController = new AbortController();
  let consumerPromise = null;
  const bounded = promise => new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(Error('AUDIO_PCM_CONSUMER_TIMEOUT')),timeoutMs); Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},failure=>{clearTimeout(timer);reject(failure);}); });
  let nextId = 0, stopped = false, closing = false, closePromise, decoding = false;
  const metrics = { packets: 0, transferredInputBytes: 0, receivedPcmBytes: 0, peakPending: 0,
    peakPcmBytes: 0, pendingPcm: 0, acks: 0, staleReplies: 0, terminated: false, native: null };
  const settleAll = error => { for (const row of pending.values()) { clearTimeout(row.timer); row.reject(error); } pending.clear(); };
  function terminate() { if (!stopped) { stopped = true; worker.terminate(); metrics.terminated = true; } }
  function request(kind, fields = {}, transfer = []) {
    if (stopped || (closing && kind !== 'close')) return Promise.reject(Error('AUDIO_WORKER_CLOSED'));
    const id = ++nextId;
    if (pending.size >= (kind === 'close' ? 2 : 1)) return Promise.reject(Error('AUDIO_WORKER_PENDING_LIMIT'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error('AUDIO_WORKER_TIMEOUT')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer }); metrics.peakPending = Math.max(metrics.peakPending, pending.size);
      try { worker.postMessage({ kind, id, generation: window.generation, ...fields }, transfer); }
      catch (failure) { clearTimeout(timer); pending.delete(id); reject(failure); }
    });
  }
  worker.addEventListener('message', ({ data }) => {
    if (data?.generation !== window.generation) { metrics.staleReplies++; return; }
    const row = pending.get(data.id);
    if (!row) { metrics.staleReplies++; return; }
    pending.delete(data.id); clearTimeout(row.timer); if (data.metrics) metrics.native = data.metrics;
    data.kind === 'error' ? row.reject(Object.assign(Error(data.error), { cleanup: data.cleanup, metrics: data.metrics })) : row.resolve(data);
  });
  worker.addEventListener('error', event => { settleAll(Error(event.message || 'AUDIO_WORKER_FAILED')); terminate(); });
  const ready = request('open', { config: profile, mapping: window }); ready.catch(() => { void close(); });
  const abort = () => { void close(); };
  signal?.addEventListener('abort', abort, { once: true });
  async function close() {
    if (closePromise) return closePromise;
    closing = true; consumerController.abort(); signal?.removeEventListener('abort', abort);
    // Reject the data call immediately; the independent close command drains
    // the native session even if its open/sample reply is still outstanding.
    settleAll(Error('AUDIO_WORKER_CANCELLED'));
    closePromise = (async () => {
      let report;
      try { const reply = await request('close'); let consumersSettled=true; if(consumerPromise) {try {await bounded(consumerPromise.catch(()=>{}));}catch {consumersSettled=false;}} report = { ...reply.cleanup, settled:reply.cleanup?.settled===true&&consumersSettled, consumersSettled, native: reply.metrics }; }
      catch (failure) { report = { settled: false, error: failure.message, native: metrics.native }; }
      finally { terminate(); settleAll(Error('AUDIO_WORKER_CLOSED')); }
      return Object.freeze({ ...report, workerTerminated: metrics.terminated });
    })();
    return closePromise;
  }
  if (signal?.aborted) void close();
  return Object.freeze({ ready, window, close, metrics: () => ({ ...metrics, pending: pending.size }),
    async decode(packet, consume) {
      if (decoding) throw Error('AUDIO_WORKER_DECODE_BUSY');
      if (typeof consume !== 'function') throw Error('AUDIO_PCM_CONSUMER_REQUIRED');
      if (!(packet?.data instanceof Uint8Array) || packet.data.byteLength === 0 || packet.data.byteLength > AUDIO_BOUNDS.maxPacketBytes)
        throw Error('AUDIO_PACKET_LIMIT');
      decoding = true;
      try {
        await ready;
        const owned = packet.data.slice(); // Transfer an owned copy, never detach an encoded source packet.
        metrics.transferredInputBytes += owned.byteLength;
        const result = await request('decode', { buffer: owned.buffer, timestamp: packet.timestamp }, [owned.buffer]);
        if (closing) throw Error('AUDIO_WORKER_CANCELLED');
        if (!(result.buffer instanceof ArrayBuffer) || result.buffer.byteLength > AUDIO_BOUNDS.maxPcmBytes)
          throw Error('AUDIO_PCM_BYTE_LIMIT');
        metrics.pendingPcm = 1; metrics.peakPcmBytes = Math.max(metrics.peakPcmBytes, result.buffer.byteLength);
        metrics.receivedPcmBytes += result.buffer.byteLength;
        consumerPromise = Promise.resolve().then(()=>{ if(closing)throw Error('AUDIO_WORKER_CANCELLED'); return consume(Object.freeze({ data: new Uint8Array(result.buffer), format: result.format,
          sampleRate: result.sampleRate, numberOfChannels: result.numberOfChannels, numberOfFrames: result.numberOfFrames,
          timestamp: result.timestamp, duration: result.duration, window }), { signal: consumerController.signal }); }).finally(()=>{metrics.pendingPcm=0;});
        await bounded(consumerPromise);
        if(closing)throw Error('AUDIO_WORKER_CANCELLED');
        if (!closing) { await request('ack', { sampleId: result.id }); metrics.acks++; metrics.packets++; }
      } catch (failure) { await close(); throw failure; }
      finally { decoding = false; }
    },
    async flush() { await ready; if (decoding) throw Error('AUDIO_WORKER_DECODE_BUSY'); await request('flush'); } });
}
