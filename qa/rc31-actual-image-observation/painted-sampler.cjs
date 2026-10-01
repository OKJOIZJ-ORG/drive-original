'use strict';
const crypto = require('node:crypto'), zlib = require('node:zlib');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const safeError = code => Object.assign(Error(code), { safeImageSampler: true });
const fail = code => { throw safeError(code); };
function pixelHash(png) {
  if (!Buffer.isBuffer(png) || png.length > 8 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) fail('CAPTURE_PNG_REQUIRED');
  let p = 8, channels, ended = false; const data = [];
  while (p + 12 <= png.length) {
    const n = png.readUInt32BE(p); if (n > png.length - p - 12) fail('CAPTURE_PNG_TRUNCATED');
    const type = png.toString('ascii', p + 4, p + 8), body = png.subarray(p + 8, p + 8 + n);
    if (type === 'IHDR') {
      if (n !== 13 || body.readUInt32BE(0) !== 1 || body.readUInt32BE(4) !== 1 || body[8] !== 8 || ![2, 6].includes(body[9]) || body[10] || body[11] || body[12]) fail('CAPTURE_ONE_PIXEL_REQUIRED');
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') { ended = true; break; }
    p += n + 12;
  }
  if (!channels || !ended || !data.length) fail('CAPTURE_PNG_STRUCTURE');
  const raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: 5 });
  if (raw.length !== channels + 1 || raw[0] > 4) fail('CAPTURE_PNG_FILTER');
  // One pixel in the first row: every PNG filter predictor is zero.
  const rgba = Buffer.from([raw[1], raw[2], raw[3], channels === 4 ? raw[4] : 255]);
  return hash(rgba);
}
async function samplePainted({ capture, readFence, phase, durationMs = 8000, maxSamples = 12, budget = { sampleCount: 0, encodedBytes: 0 } }) {
  if (!['card', 'viewer'].includes(phase) || typeof capture !== 'function' || typeof readFence !== 'function'
    || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 8000 || !Number.isInteger(maxSamples) || maxSamples < 2 || maxSamples > 12
    || !Number.isInteger(budget.sampleCount) || budget.sampleCount < 0 || budget.sampleCount > 12
    || !Number.isInteger(budget.encodedBytes) || budget.encodedBytes < 0 || budget.encodedBytes > 8 * 1024 * 1024) fail('SAMPLER_ARGUMENTS');
  const start = performance.now(), deadline = start + durationMs, samples = [];
  let encodedBytes = 0, clipKey;
  const bounded = async work => {
    const remaining = Math.floor(deadline - performance.now()); if (remaining < 1) fail('CAPTURE_DEADLINE');
    const controller = new AbortController(); let timer;
    try { return await Promise.race([Promise.resolve().then(() => work(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(safeError('CAPTURE_DEADLINE')); }, remaining); })]);
    } finally { clearTimeout(timer); controller.abort(); }
  };
  const requireFence = async () => {
    const f = await bounded(signal => readFence(phase, signal)), c = f?.clip;
    if (f?.admitted !== true || !c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || c.x < 0 || c.y < 0 || c.width !== 1 || c.height !== 1 || !Number.isFinite(c.scale) || c.scale <= 0 || c.scale > 8) fail('PAINT_FENCE');
    const key = JSON.stringify([c.x, c.y, c.width, c.height, c.scale]);
    if (clipKey && clipKey !== key) fail('PAINT_GEOMETRY_CHANGED');
    clipKey = key; return { x: c.x, y: c.y, width: 1, height: 1, scale: c.scale };
  };
  try {
    for (let i = 0; i < maxSamples && performance.now() < deadline; i++) {
      const desired = start + i * durationMs / maxSamples;
      if (desired > performance.now()) await new Promise(r => setTimeout(r, Math.min(desired - performance.now(), Math.max(0, deadline - performance.now()))));
      const clip = await requireFence();
      if (performance.now() >= deadline) break;
      if (budget.sampleCount >= 12) fail('CAPTURE_SAMPLE_BUDGET');
      budget.sampleCount++;
      // Root adapter must enforce its protocol timeout and return only this crop.
      let png = await bounded(signal => capture({ format: 'png', clip, captureBeyondViewport: false, signal, timeoutMs: Math.max(1, Math.floor(deadline - performance.now())), maxEncodedBytes: 8 * 1024 * 1024 - budget.encodedBytes }));
      if (!Buffer.isBuffer(png)) fail('CAPTURE_BUFFER_REQUIRED');
      encodedBytes += png.length; budget.encodedBytes += png.length; if (budget.encodedBytes > 8 * 1024 * 1024) fail('CAPTURE_BYTE_BUDGET');
      await requireFence();
      if (performance.now() > deadline) fail('CAPTURE_DEADLINE');
      const paintedPixelSha256 = pixelHash(png), pngSha256 = hash(png); png = null;
      samples.push({ elapsedMs: Math.round(performance.now() - start), pngSha256, paintedPixelSha256 });
    }
    if (samples.length < 2) fail('PAINT_SAMPLES_INSUFFICIENT');
    const distinct = new Set(samples.map(s => s.paintedPixelSha256)).size;
    return { phase, samples, encodedBytes, distinctPaintedPixels: distinct, observedChangingPixel: distinct > 1,
      observedStablePixel: distinct === 1, preciseDelayProven: false, fullLoopProven: false, alphaPreservationProven: false,
      originalByteIdentityProven: false, foregroundOwnerFencesPassed: true, rawPixelsExported: false };
  } catch (e) { throw Error(e?.safeImageSampler === true ? e.message : 'SAMPLER_OPERATION_FAILED'); }
  finally { /* Bounded calls clear timers and abort their callback signal. Root owns the session. */ }
}
module.exports = { samplePainted, pixelHash };
