import { CustomSource } from './vendor/mediabunny.min.mjs';
const requireThat = (value, code) => { if (!value) throw new Error(`GENERAL_${code}`); };

// Page-side RPC endpoint: library/worker may request two reads, but the original
// identity-fenced Drive source sees one finite read at a time. No URLs/tokens.
export function createReadRpc(source, { generation = 1, isCurrent = () => true,
  signal,
  blockBytes = 64 * 1024, cacheBytes = 256 * 1024,
  maxBytes = 16 * 1024 * 1024, maxRequests = 512, maxMs = 15000 } = {}) {
  requireThat(source?.read && source?.abort && source.identity, 'SOURCE');
  requireThat(Number.isSafeInteger(blockBytes) && blockBytes > 0 && blockBytes <= 1024 * 1024, 'BLOCK');
  requireThat(Number.isSafeInteger(cacheBytes) && cacheBytes >= blockBytes && cacheBytes <= 1024 * 1024, 'CACHE');
  requireThat(Number.isFinite(maxMs) && maxMs >= 0 && maxMs <= 60000, 'TIME_BUDGET');
  const size = Number(source.identity.size), started = performance.now();
  requireThat(Number.isSafeInteger(size) && size > 0, 'SIZE');
  const cache = new Map(); let retained = 0, active = true, timedOut = false, chain = Promise.resolve(), closing;
  const metrics = { generation, size, logicalReads: 0, requests: 0, bytes: 0, cacheHits: 0,
    peakRetained: 0, inFlight: 0, peakInFlight: 0, ranges: [], failure: null };
  const check = requestGeneration => {
    requireThat(!timedOut && performance.now() - started <= maxMs, 'TIME_LIMIT');
    requireThat(active && !signal?.aborted && isCurrent() && requestGeneration === generation, 'STALE_GENERATION');
  };
  async function block(position, requestGeneration) {
    check(requestGeneration);
    const start = Math.floor(position / blockBytes) * blockBytes;
    const existing = cache.get(start);
    if (existing) { cache.delete(start); cache.set(start, existing); metrics.cacheHits++; return existing; }
    const end = Math.min(size, start + blockBytes) - 1, length = end - start + 1;
    requireThat(metrics.requests < maxRequests && metrics.bytes + length <= maxBytes, 'READ_LIMIT');
    metrics.requests++; metrics.bytes += length; metrics.ranges.push({ start, end });
    metrics.inFlight++; metrics.peakInFlight = Math.max(metrics.peakInFlight, metrics.inFlight);
    let bytes;
    try { bytes = await source.read({ start, end }); }
    catch (error) { if (timedOut) throw new Error('GENERAL_TIME_LIMIT'); throw error; }
    finally { metrics.inFlight--; }
    check(requestGeneration);
    requireThat(bytes instanceof Uint8Array && bytes.length === length, 'RPC_BODY');
    cache.set(start, bytes); retained += length;
    while (retained > cacheBytes && cache.size > 0) {
      const [old, data] = cache.entries().next().value; cache.delete(old); retained -= data.length;
    }
    metrics.peakRetained = Math.max(metrics.peakRetained, retained);
    return bytes;
  }
  function request({ generation: requestGeneration, start, end }) {
    requireThat(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= size, 'RPC_RANGE');
    // Serialized each bounded block; stale queued calls reject before transport.
    const next = chain.catch(() => {}).then(async () => {
      check(requestGeneration);
      const bytes = await block(start, requestGeneration);
      const offset = start % blockBytes, count = Math.min(end - start, bytes.length - offset);
      return bytes.slice(offset, offset + count);
    });
    chain = next; return next;
  }
  function close() {
    if (!closing) { active = false; clearTimeout(deadline); signal?.removeEventListener('abort', close); cache.clear(); retained = 0; closing = source.abort(); }
    return closing;
  }
  const deadline = setTimeout(() => { timedOut = true; metrics.failure = 'GENERAL_TIME_LIMIT'; void close(); }, maxMs);
  signal?.addEventListener('abort', close, { once: true });
  if (signal?.aborted) void close();
  const custom = new CustomSource({
    getSize() { check(generation); return size; }, maxCacheSize: 256 * 1024, prefetchProfile: 'none',
    read(start, end) {
      check(generation); metrics.logicalReads++;
      requireThat(end - start <= 8 * 1024 * 1024, 'LOGICAL_SPAN_LIMIT');
      let position = start;
      return new ReadableStream({ async pull(controller) {
        try {
          const bytes = await request({ generation, start: position, end });
          check(generation); position += bytes.length; controller.enqueue(bytes);
          if (position === end) controller.close();
        } catch (error) { metrics.failure = error.message; controller.error(error); }
      }, cancel() {} });
    }, dispose: () => { void close(); }, handleUnhandledError: error => { metrics.failure = error.message; },
  });
  return { custom, request, close, metrics, identity: source.identity,
    cleanup: () => closing || close(), check: () => check(generation) };
}
