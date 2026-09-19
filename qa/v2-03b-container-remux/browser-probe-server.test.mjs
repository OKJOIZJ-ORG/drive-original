import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProbeServer, createRedactedRequestSummary, listenProbeServer, parseSingleRange, PROBE_VERSION, renderProbePage } from './browser-probe-server.mjs';

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'drive-original-v2-03b-'));
const fixturePath = path.join(fixtureDirectory, 'fixture.mp4');
await writeFile(fixturePath, Buffer.from('0123456789'));

async function withServer(run) {
  const probe = await createProbeServer({ mediaPath: fixturePath, capability: 'fixed-test-capability' });
  const address = await listenProbeServer(probe.server, 0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { return await run(baseUrl, probe, `${baseUrl}/${probe.capability}/`); }
  finally { probe.server.close(); await once(probe.server, 'close'); }
}

function probeHeaders(pageUrl, extra = {}) {
  return { Referer: pageUrl, ...extra };
}

function rawRequest(url, { method = 'GET', headers = {} } = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.once('error', reject);
    request.end();
  });
}

test.after(async () => { await rm(fixtureDirectory, { recursive: true, force: true }); });

test('range parser covers no-range, open-ended, suffix, and unsatisfiable inputs', () => {
  assert.deepEqual(parseSingleRange(undefined, 10), { kind: 'full' });
  assert.deepEqual(parseSingleRange('bytes=3-', 10), { kind: 'partial', start: 3, end: 9 });
  assert.deepEqual(parseSingleRange('bytes=-3', 10), { kind: 'partial', start: 7, end: 9 });
  assert.deepEqual(parseSingleRange('bytes=50-60', 10), { kind: 'unsatisfiable' });
  assert.deepEqual(parseSingleRange('bytes=6-4', 10), { kind: 'unsatisfiable' });
  assert.deepEqual(parseSingleRange('bytes=0-1,3-4', 10), { kind: 'unsatisfiable' });
});

test('capability page plus GET and HEAD return the complete media without a range', async () => {
  await withServer(async (_baseUrl, probe, pageUrl) => {
    const page = await fetch(pageUrl);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('referrer-policy'), 'same-origin');
    assert.equal((await page.text()).includes(probe.capability), false);
    const get = await fetch(`${pageUrl}media`, { headers: probeHeaders(pageUrl) });
    assert.equal(get.status, 200);
    assert.equal(await get.text(), '0123456789');
    assert.equal(get.headers.get('accept-ranges'), 'bytes');
    const head = await fetch(`${pageUrl}media`, { method: 'HEAD', headers: probeHeaders(pageUrl) });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
  });
});

test('single, open-ended, and suffix ranges have correct 206 bodies', async () => {
  await withServer(async (_baseUrl, _probe, pageUrl) => {
    for (const [range, expected] of [['bytes=2-5', '2345'], ['bytes=8-', '89'], ['bytes=-4', '6789']]) {
      const response = await fetch(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Range: range }) });
      assert.equal(response.status, 206);
      assert.equal(await response.text(), expected);
      assert.match(response.headers.get('content-range'), /^bytes \d+-\d+\/10$/);
    }
  });
});

test('invalid and unsatisfiable ranges return 416 without a body', async () => {
  await withServer(async (_baseUrl, _probe, pageUrl) => {
    for (const range of ['bytes=20-', 'bytes=4-2', 'bytes=0-1,3-4']) {
      const response = await fetch(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Range: range }) });
      assert.equal(response.status, 416);
      assert.equal(await response.text(), '');
    }
  });
});

test('request summaries redact offsets, size, media path, and range header values', async () => {
  await withServer(async (_baseUrl, probe, pageUrl) => {
    await fetch(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Range: 'bytes=3-7' }) });
    await fetch(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Range: 'bytes=99-' }) });
    const response = await fetch(`${pageUrl}requests`, { headers: probeHeaders(pageUrl) });
    const summary = await response.json();
    assert.deepEqual(summary, { requestCount: 2, statuses: { '206': 1, '416': 1 }, rangeValidity: { none: 0, valid: 1, invalid: 1 } });
    assert.deepEqual(probe.getRequestSummary(), summary);
    const serialized = JSON.stringify(summary);
    for (const forbidden of ['3-7', '99-', '10', fixturePath]) assert.equal(serialized.includes(forbidden), false);
  });
});

test('summary helper exposes only counts, status, and range validity', () => {
  assert.deepEqual(createRedactedRequestSummary([
    { status: 200, rangeValidity: 'none' },
    { status: 206, rangeValidity: 'valid' },
    { status: 416, rangeValidity: 'invalid' }
  ]), { requestCount: 3, statuses: { '200': 1, '206': 1, '416': 1 }, rangeValidity: { none: 1, valid: 1, invalid: 1 } });
});

test('probe page preserves the bounded three-seek and frame/audio telemetry protocol', () => {
  const page = renderProbePage();
  assert.match(page, /const first = Math\.min\(\.25, duration \* \.02\)/);
  assert.match(page, /const nearEnd = Math\.max\(0, duration - Math\.min\(2, duration \* \.02\)\)/);
  assert.match(page, /callbackSuccess: true, timedOut: false, mediaTime: metadata\.mediaTime/);
  assert.match(page, /if \(frame\.callbackSuccess\) await delay\(500\)/);
  assert.match(page, /audioTrackCount, audioDecodedDelta/);
});

test('fixed probe version is exported and included in browser results', () => {
  assert.equal(PROBE_VERSION, 'v2-03b.2');
  const page = renderProbePage();
  assert.match(page, /const probeVersion = "v2-03b\.2";/);
  assert.match(page, /probeVersion,\n      metadata:/);
});

test('server rejects hostile hosts, wrong capabilities, and cross-site media requests', async () => {
  await withServer(async (baseUrl, probe, pageUrl) => {
    const hostileHost = await rawRequest(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Host: 'attacker.example:443' }) });
    assert.equal(hostileHost.status, 400);
    assert.equal(hostileHost.body.includes(probe.capability), false);

    const wrongCapability = await rawRequest(`${baseUrl}/wrong-capability/media`, { headers: probeHeaders(pageUrl) });
    assert.equal(wrongCapability.status, 404);
    assert.equal(wrongCapability.body.includes(probe.capability), false);

    const foreignOrigin = await rawRequest(`${pageUrl}media`, { headers: probeHeaders(pageUrl, { Origin: 'https://attacker.example' }) });
    assert.equal(foreignOrigin.status, 403);

    const missingReferer = await rawRequest(`${pageUrl}media`);
    assert.equal(missingReferer.status, 403);
    const foreignReferer = await rawRequest(`${pageUrl}media`, { headers: { Referer: 'https://attacker.example/' } });
    assert.equal(foreignReferer.status, 403);
    const requestsWithoutReferer = await rawRequest(`${pageUrl}requests`);
    assert.equal(requestsWithoutReferer.status, 403);
  });
});
