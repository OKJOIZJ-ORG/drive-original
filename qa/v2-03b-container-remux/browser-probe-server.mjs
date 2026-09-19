#!/usr/bin/env node
/**
 * Local-only browser media probe.  This process reads one explicitly supplied
 * file and never exposes its filesystem location or a content fingerprint.
 */
import { createReadStream, promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTENT_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.ogg', 'video/ogg'],
  ['.ogv', 'video/ogg'],
  ['.mov', 'video/quicktime'],
  ['.mkv', 'video/x-matroska'],
  ['.ts', 'video/mp2t'],
  ['.mpeg', 'video/mpeg']
]);

export const PROBE_VERSION = 'v2-03b.2';

export function createCapability() {
  return randomBytes(32).toString('base64url');
}

function assertCapability(capability) {
  if (typeof capability !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(capability)) {
    throw new TypeError('capability must be a URL-safe opaque value');
  }
}

export function guessContentType(mediaPath) {
  return CONTENT_TYPES.get(path.extname(mediaPath).toLowerCase()) || 'application/octet-stream';
}

/**
 * Parse exactly one RFC 9110 byte range.  A caller must still use the returned
 * byte positions only for an already-authorized local file.
 */
export function parseSingleRange(rangeHeader, totalSize) {
  if (rangeHeader == null || rangeHeader === '') return { kind: 'full' };
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    throw new TypeError('totalSize must be a non-negative safe integer');
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2]) || totalSize === 0) {
    return { kind: 'unsatisfiable' };
  }

  const [, first, last] = match;
  if (!first) {
    const suffixLength = Number(last);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: 'unsatisfiable' };
    const start = Math.max(0, totalSize - suffixLength);
    return { kind: 'partial', start, end: totalSize - 1 };
  }

  const start = Number(first);
  if (!Number.isSafeInteger(start) || start >= totalSize) return { kind: 'unsatisfiable' };
  if (!last) return { kind: 'partial', start, end: totalSize - 1 };

  const requestedEnd = Number(last);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end: Math.min(requestedEnd, totalSize - 1) };
}

export function createRedactedRequestSummary(requests) {
  const statuses = {};
  const rangeValidity = { none: 0, valid: 0, invalid: 0 };
  for (const request of requests) {
    statuses[String(request.status)] = (statuses[String(request.status)] || 0) + 1;
    rangeValidity[request.rangeValidity] = (rangeValidity[request.rangeValidity] || 0) + 1;
  }
  return { requestCount: requests.length, statuses, rangeValidity };
}

export function isExpectedLoopbackHost(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isSameOrigin(value, host) {
  try { return new URL(value).origin === `http://${host}`; }
  catch { return false; }
}

export function isProbePageReferer(value, host, capability) {
  try {
    const referer = new URL(value);
    return referer.origin === `http://${host}` && referer.pathname === `/${capability}/`;
  } catch { return false; }
}

export function renderProbePage() {
  // This intentionally contains no input path, token, content length, or hash.
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Local media container probe</title>
<style>body{font:14px system-ui;margin:2rem;max-width:56rem}video{display:block;max-width:100%;margin:1rem 0}button{font:inherit;padding:.55rem .8rem}pre{white-space:pre-wrap;background:#f4f4f4;padding:1rem;border-radius:.5rem}</style>
<h1>Local media container probe</h1>
<p>This page reads the media supplied when this local server was started.</p>
<button id="run" type="button">Run metadata and frame probe</button>
<video id="media" controls preload="metadata"></video><pre id="result" aria-live="polite">Ready.</pre>
<script type="module">
const probeVersion = ${JSON.stringify(PROBE_VERSION)};
const video = document.querySelector('#media');
const run = document.querySelector('#run');
const result = document.querySelector('#result');
const waitFor = (target, event) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(event + ' timed out')), 12000);
  target.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true });
  target.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('media error')); }, { once: true });
});
const frameSnapshot = () => ({
  readyState: video.readyState,
  width: video.videoWidth,
  height: video.videoHeight,
  presentedFrames: typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality().totalVideoFrames : null,
  decodedFrames: Number.isFinite(video.webkitDecodedFrameCount) ? video.webkitDecodedFrameCount : null
});
const audioDecoded = () => Number.isFinite(video.webkitAudioDecodedByteCount) ? video.webkitAudioDecodedByteCount : null;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const nextFrame = () => new Promise((resolve) => {
  if (typeof video.requestVideoFrameCallback !== 'function') return resolve({ supported: false, callbackSuccess: false, timedOut: false, mediaTime: null, ...frameSnapshot() });
  const timeout = setTimeout(() => resolve({ supported: true, callbackSuccess: false, timedOut: true, mediaTime: null, ...frameSnapshot() }), 3000);
  video.requestVideoFrameCallback((_now, metadata) => { clearTimeout(timeout); resolve({ supported: true, callbackSuccess: true, timedOut: false, mediaTime: metadata.mediaTime, ...frameSnapshot(), presentedFrames: metadata.presentedFrames }); });
});
const seekAndSample = async (label, time) => {
  if (Math.abs(video.currentTime - time) > .005) {
    const seeked = waitFor(video, 'seeked');
    video.currentTime = time;
    await seeked;
  }
  const frame = await nextFrame();
  // Keep playback moving after an actual presentation so Chromium's audio
  // decode counters have a bounded opportunity to advance before the next seek.
  if (frame.callbackSuccess) await delay(500);
  return { label, time, ...frame };
};
run.addEventListener('click', async () => {
  run.disabled = true;
  result.textContent = 'Running…';
  try {
    video.src = new URL('media', window.location.href).href;
    video.load();
    await waitFor(video, 'loadedmetadata');
    const stream = typeof video.captureStream === 'function' ? video.captureStream() : null;
    const audioTrackCount = stream ? stream.getAudioTracks().length : null;
    const audioBefore = audioDecoded();
    await video.play();
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const first = Math.min(.25, duration * .02);
    const nearEnd = Math.max(0, duration - Math.min(2, duration * .02));
    const samples = [
      await seekAndSample('first', first),
      await seekAndSample('middle', duration / 2),
      await seekAndSample('near-end', nearEnd)
    ];
    video.pause();
    const audioAfter = audioDecoded();
    const requests = await fetch(new URL('requests', window.location.href), { cache: 'no-store' }).then((response) => response.json());
    result.textContent = JSON.stringify({
      probeVersion,
      metadata: { readyState: video.readyState, width: video.videoWidth, height: video.videoHeight },
      samples,
      captureStream: { audioTrackCount, audioDecodedDelta: audioBefore === null || audioAfter === null ? null : audioAfter - audioBefore },
      requests
    }, null, 2);
  } catch (error) {
    result.textContent = JSON.stringify({ error: 'probe failed', message: error instanceof Error ? error.message : 'unknown error' }, null, 2);
  } finally { run.disabled = false; }
});
</script></html>`;
}

function writeJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function writeMediaHeaders(response, status, size, contentType, range) {
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Cache-Control': 'no-store' };
  if (range) {
    headers['Content-Length'] = String(range.end - range.start + 1);
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  } else {
    headers['Content-Length'] = String(size);
  }
  response.writeHead(status, headers);
}

export async function createProbeServer({ mediaPath, capability = createCapability() }) {
  assertCapability(capability);
  const mediaStats = await fs.stat(mediaPath);
  if (!mediaStats.isFile()) throw new TypeError('media must be an existing regular file');
  const size = mediaStats.size;
  const contentType = guessContentType(mediaPath);
  const requests = [];

  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : null;
    const host = request.headers.host;
    if (!Number.isInteger(port) || !isExpectedLoopbackHost(host, port)) {
      return writeJson(response, 400, { error: 'invalid request' });
    }
    if (request.headers.origin && !isSameOrigin(request.headers.origin, host)) {
      return writeJson(response, 403, { error: 'forbidden' });
    }

    const pagePath = `/${capability}/`;
    const mediaPathname = `${pagePath}media`;
    const requestsPathname = `${pagePath}requests`;
    if (url.pathname === pagePath) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return writeJson(response, 405, { error: 'method not allowed' });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' });
      return response.end(request.method === 'HEAD' ? '' : renderProbePage());
    }
    if (url.pathname === requestsPathname) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return writeJson(response, 405, { error: 'method not allowed' });
      if (!isProbePageReferer(request.headers.referer, host, capability)) return writeJson(response, 403, { error: 'forbidden' });
      const body = createRedactedRequestSummary(requests);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(request.method === 'HEAD' ? '' : JSON.stringify(body));
    }
    if (url.pathname !== mediaPathname) return writeJson(response, 404, { error: 'not found' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return writeJson(response, 405, { error: 'method not allowed' });
    if (!isProbePageReferer(request.headers.referer, host, capability)) return writeJson(response, 403, { error: 'forbidden' });

    const range = parseSingleRange(request.headers.range, size);
    const rangeValidity = range.kind === 'full' ? 'none' : range.kind === 'partial' ? 'valid' : 'invalid';
    if (range.kind === 'unsatisfiable') {
      requests.push({ status: 416, rangeValidity });
      response.writeHead(416, { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store' });
      return response.end();
    }

    const status = range.kind === 'partial' ? 206 : 200;
    requests.push({ status, rangeValidity });
    writeMediaHeaders(response, status, size, contentType, range.kind === 'partial' ? range : null);
    if (request.method === 'HEAD') return response.end();
    const stream = range.kind === 'partial'
      ? createReadStream(mediaPath, { start: range.start, end: range.end })
      : createReadStream(mediaPath);
    stream.on('error', () => { if (!response.headersSent) writeJson(response, 500, { error: 'media read failed' }); else response.destroy(); });
    stream.pipe(response);
  });

  return { server, capability, getRequestSummary: () => createRedactedRequestSummary(requests) };
}

export function listenProbeServer(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

export function parseCliArgs(argv, cwd = process.cwd()) {
  let media;
  let port = 8123;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--media') media = argv[++index];
    else if (argument === '--port') port = Number(argv[++index]);
    else throw new TypeError('usage: --media FILE [--port PORT]');
  }
  if (!media) throw new TypeError('usage: --media FILE [--port PORT]');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('port must be an integer from 1 to 65535');
  return { mediaPath: path.resolve(cwd, media), port };
}

export async function main(argv = process.argv.slice(2)) {
  const { mediaPath, port } = parseCliArgs(argv);
  let probe;
  try { probe = await createProbeServer({ mediaPath }); }
  catch { throw new Error('media must be an existing regular file'); }
  const address = await listenProbeServer(probe.server, port);
  // Deliberately report only the one-time capability URL, never the selected media path.
  process.stdout.write(`http://127.0.0.1:${address.port}/${probe.capability}/\n`);
  return probe;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
