import { createAudioRuntime, AUDIO_BOUNDS } from './audio-runtime.mjs';
// One job per Worker; close is a priority message and can cancel asynchronous open.
export function installAudioWorker(endpoint, { runtime = createAudioRuntime() } = {}) {
  let session, generation, closed = false, busy = false, awaitingAck = null, started = false;
  const send = (message, transfer = []) => endpoint.postMessage(message, transfer);
  const reply = (id, fields, transfer) => send({ id, generation, ...fields }, transfer);
  const fail = async (id, failure) => {
    closed = true; awaitingAck = null; const cleanup = await session?.close();
    reply(id, { kind: 'error', error: failure.message, cleanup, metrics: runtime.metrics() });
  };
  const receive = async event => {
    const msg = event.data;
    if (!msg || !Number.isSafeInteger(msg.id) || msg.id < 1) return;
    if (msg.kind === 'open') {
      if (started) return reply(msg.id, { kind: 'error', error: 'AUDIO_WORKER_ALREADY_OPENED' });
      started = true; generation = msg.generation;
      try {
        if (generation !== msg.mapping?.generation) throw Error('AUDIO_WORKER_GENERATION');
        session = runtime.createSession(msg.config, msg.mapping);
        await session.ready;
        if (!closed) reply(msg.id, { kind: 'ready', window: session.window, metrics: runtime.metrics() });
      } catch (failure) { if (!closed) await fail(msg.id, failure); }
      return;
    }
    if (!started || msg.generation !== generation) return;
    if (msg.kind === 'close') {
      closed = true; awaitingAck = null;
      const cleanup = await session?.close();
      reply(msg.id, { kind: 'closed', cleanup: cleanup ?? { settled: true }, metrics: runtime.metrics() }); return;
    }
    if (closed) return reply(msg.id, { kind: 'error', error: 'AUDIO_WORKER_CLOSED' });
    if (msg.kind === 'ack') {
      if (msg.sampleId !== awaitingAck) return fail(msg.id, Error('AUDIO_WORKER_ACK_MISMATCH'));
      awaitingAck = null; reply(msg.id, { kind: 'acked' }); return;
    }
    if (busy || awaitingAck !== null) return fail(msg.id, Error('AUDIO_WORKER_BACKPRESSURE'));
    busy = true;
    try {
      if (msg.kind === 'decode') {
        if (!(msg.buffer instanceof ArrayBuffer) || msg.buffer.byteLength > AUDIO_BOUNDS.maxPacketBytes)
          throw Error('AUDIO_WORKER_PACKET_LIMIT');
        const pcm = await session.decode({ data: new Uint8Array(msg.buffer), timestamp: msg.timestamp });
        if (!closed) {
          awaitingAck = msg.id;
          const { data, ...metadata } = pcm;
          reply(msg.id, { kind: 'sample', buffer: data.buffer, ...metadata, metrics: runtime.metrics() }, [data.buffer]);
        }
      } else if (msg.kind === 'flush') { await session.flush(); if (!closed) reply(msg.id, { kind: 'flushed' }); }
      else throw Error('AUDIO_WORKER_MESSAGE');
    } catch (failure) { if (!closed) await fail(msg.id, failure); }
    finally { busy = false; }
  };
  endpoint.addEventListener('message', receive);
  return { dispose: async () => { closed = true; endpoint.removeEventListener('message', receive); return session?.close(); } };
}
if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
  installAudioWorker(self);
