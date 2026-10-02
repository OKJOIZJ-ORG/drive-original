import { streamGeneralQ2 } from './audio-general-pipeline.mjs';
const browser = typeof self !== 'undefined' && typeof self.postMessage === 'function';
const endpoint = browser ? self : (await import('node:worker_threads')).parentPort;
const send = (message, transfer = []) => endpoint.postMessage(message, transfer);
const listen = fn => browser ? endpoint.addEventListener('message', event => fn(event.data)) : endpoint.on('message', fn);
let controller, generation, started = false, nextId = 0;
const pending = new Map();
function request(kind, fields = {}, transfer = []) {
  if (pending.size >= 4) return Promise.reject(new Error('WORKER_PENDING_LIMIT'));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = kind === 'chunk' ? null : setTimeout(() => { pending.delete(id); reject(new Error('WORKER_RPC_TIMEOUT')); }, kind === 'cleanup' ? 4000 : 30000);
    pending.set(id, { kind, resolve, reject, timer }); send({ kind, generation, id, ...fields }, transfer);
  });
}
listen(async message => {
  if (message?.kind === 'reply' && message.generation === generation) {
    const record = pending.get(message.id); if (!record) return;
    pending.delete(message.id); clearTimeout(record.timer);
    message.error ? record.reject(new Error(message.error)) : record.resolve(message.value); return;
  }
  if (message?.kind === 'cancel' && message.generation === generation) { controller?.abort(); for (const [id, record] of pending) if (record.kind !== 'cleanup') { clearTimeout(record.timer); record.reject(new Error('GENERAL_CANCELLED')); pending.delete(id); } return; }
  if (message?.kind !== 'start' || started) return;
  started = true; generation = message.generation; controller = new AbortController();
  const identity = Object.freeze(message.identity); let cleanup;
  const proxy = { identity, read: async ({ start, end }) => {
    const value = await request('read', { start, end }); return new Uint8Array(value);
  }, abort() { return cleanup ||= request('cleanup'); } };
  let result, error;
  try {
    result = await streamGeneralQ2({ source: proxy, generation, signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
      targetTime: message.targetTime, endTime: message.endTime, limits: message.limits, selectedAudioTrackId:message.selectedAudioTrackId,
      timelinePolicy: message.timelinePolicy, 
      onWindow: value => request('window', { value }),
      onChunk: ({ bytes, position, batchSize, batchEnd }) => request('chunk', { buffer: bytes.buffer, position, batchSize, batchEnd }, [bytes.buffer]) });
  } catch (failure) { error = { diagnostic: failure.diagnostic, audioMetrics: failure.audioMetrics, audioCleanup: failure.audioCleanup, message: /^(?:GENERAL|WORKER|Q1_EXACT|Q1_SOURCE|TIMING|AUDIO)_[A-Z0-9_]+$/.test(failure.message) ? failure.message : 'GENERAL_PIPELINE_FAILED', cleanup: failure.cleanup, reads: failure.reads }; }
  finally {
    // Original-source cleanup is owned by the page, and terminal is sent only
    // after that shared barrier (which may remain explicitly unsettled).
    const closed = await proxy.abort().catch(() => ({ settled: false, transportFailed: true }));
    for (const record of pending.values()) { clearTimeout(record.timer); record.reject(new Error('WORKER_TERMINAL')); } pending.clear();
    send({ kind: 'terminal', generation, result, error, cleanup: closed });
  }
});
