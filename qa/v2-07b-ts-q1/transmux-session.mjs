import { bindFragmentClock } from './fragment-clock.mjs';
import { createGopStream } from './gop-stream.mjs';
import { adaptInitSar } from './init-sar.mjs';

const INPUT_LIMIT = 64 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const CACHE_LIMIT = 8 * 1024 * 1024;
const integer = value => Number.isSafeInteger(value) && value > 0;
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// QA-only synchronous protocol owner, not a Worker or product engine. Input is
// copied on admission; output ArrayBuffers belong to send (which may transfer
// them). One input credit and one fragment credit, no asynchronous send/queue.
// Reentrant ACK/abort is supported: send is called only AFTER parser work has
// unwound, and the pump never reenters the parser. Other generations are ignored.
// The bounded observed-clock H264/AAC eligibility and SAR restrictions remain those
// of createGopStream/adaptInitSar. Byte counters exclude JS objects, MSE/decoder,
// transport/caller buffers and unobservable mux scratch; they are NOT heap proof.
export function createTransmuxSession({ generation, sourceSize, Transmuxer, send } = {}) {
  if (!integer(generation) || !integer(sourceSize) || typeof Transmuxer !== 'function' || typeof send !== 'function') {
    throw new Error('SESSION_OPTIONS');
  }
  let state = 'open', failure = null, busy = false, ending = false, eofProcessed = false;
  let mux = null, owner = null, sink = send, input = null, output = null, awaiting = null;
  let intervalClock = null;
  let config = null, init = null, ownerSnapshot = null, inInterval = false, intervalOutputs = 0;
  let sequence = 0, consumed = 0, fragments = 0, acknowledged = 0, operationFailure = null;
  let peakInputBytes = 0, peakOutputBytes = 0, peakConfigBytes = 0, peakInitBytes = 0;
  let cacheCount = 0, cacheNalBytes = 0, cacheBufferBytes = 0;
  let peakCacheCount = 0, peakCacheNalBytes = 0, peakCacheBufferBytes = 0, cleanup = null;
  const terminal = () => state !== 'open';
  function reject(code) { operationFailure = code; throw new Error(code); }

  // Pinned mux.js 7.1.0 GOP cache: count both NAL view lengths and unique backing
  // ArrayBuffers (views can retain a much larger input allocation), including SPS/PPS.
  function measureCache() {
    const entries = mux?.transmuxPipeline_?.videoSegmentStream?.gopCache_ || [];
    const buffers = new Set();
    cacheCount = entries.length; cacheNalBytes = 0; cacheBufferBytes = 0;
    const count = bytes => {
      if (!(bytes instanceof Uint8Array)) reject('SESSION_CACHE_SHAPE');
      cacheNalBytes += bytes.byteLength;
      if (!buffers.has(bytes.buffer)) { buffers.add(bytes.buffer); cacheBufferBytes += bytes.buffer.byteLength; }
    };
    for (const entry of entries) {
      for (const frame of entry.gop) for (const nal of frame) count(nal.data);
      for (const bytes of entry.sps || []) count(bytes);
      for (const bytes of entry.pps || []) count(bytes);
    }
    peakCacheCount = Math.max(peakCacheCount, cacheCount);
    peakCacheNalBytes = Math.max(peakCacheNalBytes, cacheNalBytes);
    peakCacheBufferBytes = Math.max(peakCacheBufferBytes, cacheBufferBytes);
    if (cacheCount > 6 || cacheBufferBytes > CACHE_LIMIT) reject('SESSION_CACHE_LIMIT');
  }
  function stats() {
    return { state, failure, generation, sourceSize, consumed, inputSequence: sequence,
      fragments, acknowledged, awaitingFragment: awaiting?.sequence || null,
      retainedInputBytes: input?.bytes.byteLength || 0, retainedOutputBytes: output?.bytes.byteLength || 0,
      outstandingOutputBytes: awaiting?.bytes || 0, configBytes: config ? config.sps.length + config.pps.length : 0,
      initBytes: init?.byteLength || 0, peakInputBytes, peakOutputBytes, peakConfigBytes, peakInitBytes,
      muxCachedGops: cacheCount, muxCachedNalBytes: cacheNalBytes, muxCachedBufferBytes: cacheBufferBytes,
      peakMuxCachedGops: peakCacheCount, peakMuxCachedNalBytes: peakCacheNalBytes,
      peakMuxCachedBufferBytes: peakCacheBufferBytes, muxReleased: mux === null,
      owner: owner?.stats() || ownerSnapshot, cleanup: cleanup ? { ...cleanup } : null,
      limits: { inputBytes: INPUT_LIMIT, outputBytes: OUTPUT_LIMIT, muxCacheBufferBytes: CACHE_LIMIT },
      scope: 'encoded input/init/config/output credit and pinned mux GOP backing buffers; owner separately accounted; excludes JS heap, mux scratch, transport, caller, MSE and decoder' };
  }
  function invoke(callback, message, transfers = []) {
    let asynchronous = false;
    try {
      const result = callback(message, transfers);
      if (result && typeof result.then === 'function') {
        asynchronous = true; Promise.resolve(result).catch(() => {});
      }
    } catch { throw new Error('SESSION_SEND_FAILED'); }
    if (asynchronous) throw new Error('SESSION_ASYNC_SEND');
  }
  function terminate(next, code = null) {
    if (terminal()) return;
    state = next; failure = code;
    input = null; output = null; awaiting = null; config = null; init = null;
    let cleanupFailed = false;
    try { owner?.abort(); ownerSnapshot = owner?.stats() || null; } catch { cleanupFailed = true; }
    owner = null;
    try { measureCache(); } catch { cleanupFailed = true; }
    const before = { gops: cacheCount, nalBytes: cacheNalBytes, bufferBytes: cacheBufferBytes };
    try { mux?.reset(); } catch { cleanupFailed = true; }
    try { measureCache(); } catch { cleanupFailed = true; }
    cleanup = { beforeGops: before.gops, beforeNalBytes: before.nalBytes, beforeBufferBytes: before.bufferBytes,
      afterGops: cacheCount, afterNalBytes: cacheNalBytes, afterBufferBytes: cacheBufferBytes };
    try { mux?.dispose(); } catch { cleanupFailed = true; }
    mux = null;
    if (cleanupFailed || cacheCount !== 0 || cacheBufferBytes !== 0) { state = 'error'; failure = 'SESSION_CLEANUP_FAILED'; }
    const notify = sink; sink = null;
    // A failed terminal notification cannot be delivered over a broken channel;
    // retain fixed failure state for stats(), never retry recursively.
    try { invoke(notify, { type: state, generation, ...(failure ? { code: failure } : {}), stats: stats() }); }
    catch (error) { state = 'error'; failure = error.message; }
  }
  function emit(message, transfers = []) {
    try { invoke(sink, message, transfers); }
    catch (error) { if (!terminal()) terminate('error', error.message); }
  }
  function onData(segment) {
    if (!inInterval || terminal() || output || ++intervalOutputs !== 1 || segment.type !== 'combined') reject('SESSION_MUX_OUTPUT');
    if (!(segment.initSegment instanceof Uint8Array) || !(segment.data instanceof Uint8Array)
        || !segment.data.length || segment.initSegment.length > OUTPUT_LIMIT || segment.data.length > OUTPUT_LIMIT) reject('SESSION_OUTPUT_LIMIT');
    try { bindFragmentClock(segment.data,{videoTrackId:config.videoTrackId,...intervalClock}); } catch { reject('SESSION_FRAGMENT_CLOCK'); }
    let next;
    try { next = adaptInitSar(segment.initSegment, config).initSegment; } catch { reject('SESSION_INIT_INVALID'); }
    if (init && !equal(init, next)) reject('SESSION_INIT_CHANGED');
    const first = init === null;
    const length = segment.data.length + (first ? next.length : 0);
    if (length > OUTPUT_LIMIT) reject('SESSION_OUTPUT_LIMIT');
    const bytes = new Uint8Array(length);
    if (first) bytes.set(next);
    bytes.set(segment.data, first ? next.length : 0);
    init = next; peakInitBytes = Math.max(peakInitBytes, init.length);
    output = { bytes: bytes.buffer, initIncluded: first };
    peakOutputBytes = Math.max(peakOutputBytes, length);
  }
  function onInterval(item) {
    if (item.configuration) {
      if (config) reject('SESSION_CONFIG_CHANGED');
      config = { videoTrackId: item.configuration.videoTrackId,
        sps: Uint8Array.from(item.configuration.sps), pps: Uint8Array.from(item.configuration.pps) };
      peakConfigBytes = config.sps.length + config.pps.length;
    }
    if (!config || output || awaiting) reject('SESSION_OUTPUT_OWNER');
    intervalClock={samples:item.proof.samples,nextDts:item.proof.nextDts,atEof:item.final};
    inInterval = true; intervalOutputs = 0;
    try { mux.push(item.bytes); mux.flush(); } finally { inInterval = false; intervalClock=null; }
    if (intervalOutputs !== 1 || !output) reject('SESSION_MUX_OUTPUT');
    measureCache();
  }
  function pump() {
    if (busy || terminal()) return;
    busy = true;
    try {
      while (!terminal() && !awaiting) {
        if (output) {
          const item = output; output = null;
          awaiting = { sequence: ++fragments, bytes: item.bytes.byteLength };
          emit({ type: 'fragment', generation, fragmentSequence: fragments, bytes: item.bytes,
            initIncluded: item.initIncluded, sourceConsumed: consumed }, [item.bytes]);
          continue;
        }
        if (input) {
          if (input.cursor === input.bytes.length) {
            const completed = input.sequence; input = null;
            emit({ type: 'input-done', generation, sequence: completed, offset: consumed });
            continue;
          }
          const end = Math.min(input.cursor + 188, input.bytes.length);
          const part = input.bytes.subarray(input.cursor, end);
          consumed += part.length; input.cursor = end;
          operationFailure = null; owner.push(part);
          continue;
        }
        if (ending) {
          if (!eofProcessed) { eofProcessed = true; operationFailure = null; owner.finish({ sourceSize }); continue; }
          terminate('finished');
        }
        break;
      }
    } catch { if (!terminal()) terminate('error', operationFailure || 'SESSION_PIPELINE_FAILED'); }
    finally { busy = false; }
  }
  function receive(message) {
    if (terminal() || !message || message.generation !== generation) return;
    try {
      if (message.type === 'abort') { terminate('aborted'); return; }
      if (message.type === 'ack') {
        if (!awaiting || message.fragmentSequence !== awaiting.sequence) reject('SESSION_ACK_SEQUENCE');
        awaiting = null; acknowledged++; pump(); return;
      }
      if (message.type === 'input') {
        if (ending || input || awaiting || output) reject('SESSION_INPUT_CREDIT');
        if (!integer(message.sequence) || message.sequence !== sequence + 1 || message.offset !== consumed) reject('SESSION_INPUT_SEQUENCE');
        if (!(message.bytes instanceof ArrayBuffer) || message.bytes.byteLength < 1 || message.bytes.byteLength > INPUT_LIMIT
            || message.bytes.byteLength > sourceSize - consumed) reject('SESSION_INPUT_LIMIT');
        const bytes = new Uint8Array(message.bytes).slice();
        input = { sequence: message.sequence, bytes, cursor: 0 }; sequence++;
        peakInputBytes = Math.max(peakInputBytes, bytes.length); pump(); return;
      }
      if (message.type === 'eof') {
        if (ending || input || awaiting || output || consumed !== sourceSize) reject('SESSION_EOF');
        ending = true; pump(); return;
      }
      reject('SESSION_MESSAGE');
    } catch { if (!terminal()) terminate('error', operationFailure || 'SESSION_MESSAGE'); }
  }
  try {
    mux = new Transmuxer({ remux: true, keepOriginalTimestamps: true });
    mux.on('data', onData);
    owner = createGopStream({ generation, maxChunkBytes: 188, onInterval });
  } catch { terminate('error', 'SESSION_INITIALIZE'); }
  return { receive, stats };
}
