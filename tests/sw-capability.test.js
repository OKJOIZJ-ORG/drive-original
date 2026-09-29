'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
const PROTOCOL = 'drive-original-q0-revision-pin-v1';

async function probe({ client, controlled, request = {}, sourceId = 'client-A', failLookup = false } = {}) {
  const listeners = new Map();
  const operations = [];
  const requests = [];
  const lookupCalls = [];
  const defaultClient = { id: 'client-A', type: 'window', url: 'https://app.test/drive/index.html' };
  const context = {
    URL, Map, Date, Number, TextDecoder, Uint8Array, AbortController, DOMException,
    setTimeout, clearTimeout,
    importScripts(name) {
      assert.equal(name, './media/revision-pin.js');
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../media/revision-pin.js'), 'utf8'), context);
    },
    fetch() { requests.push('provider'); throw new Error('Capability must not access provider'); },
    self: {
      location: { origin: 'https://app.test', href: 'https://app.test/drive/sw.js' },
      registration: { scope: 'https://app.test/drive/' },
      addEventListener(type, handler) { listeners.set(type, handler); },
      clients: {
        async get(id) {
          lookupCalls.push(['get', id]);
          if (failLookup) throw new Error('Client disappeared');
          return client === undefined ? defaultClient : client;
        },
        async matchAll(options) {
          lookupCalls.push(['matchAll', { ...options }]);
          return controlled === undefined ? [defaultClient] : controlled;
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'sw.js' });
  const replies = [];
  const port = { closed: false, postMessage(reply) { replies.push({ ...reply }); }, close() { this.closed = true; } };
  listeners.get('message')({ source: sourceId ? { id: sourceId } : null,
    data: { type: 'Q0_CAPABILITY_REQUEST', protocol: PROTOCOL, requestId: 'probe-123', ...request },
    ports: [port], waitUntil(operation) { operations.push(operation); } });
  assert.equal(operations.length, 1, 'message lifetime joins the lookup and reply');
  await operations[0];
  assert.equal(requests.length, 0);
  assert.equal(vm.runInContext('clientCredentials.size + tokenRequests.size + q0Pins.size + q0Acquisitions.size', context), 0);
  assert.equal(port.closed, true);
  assert.equal(replies.length, 1);
  return { reply: replies[0], lookupCalls };
}

test('Q0 capability authorizes only the correlated controlled in-scope window without auth/provider reads', async () => {
  const { reply, lookupCalls } = await probe();
  assert.deepEqual(reply, { type: 'Q0_CAPABILITY_RESPONSE', protocol: PROTOCOL, requestId: 'probe-123', capable: true });
  assert.deepEqual(lookupCalls, [['get', 'client-A'], ['matchAll', { type: 'window', includeUncontrolled: false }]]);
});

test('Q0 capability rejects an uncontrolled, disappeared or replaced client', async () => {
  for (const fixture of [
    { controlled: [] }, { client: null }, { failLookup: true },
    { controlled: [{ id: 'client-B', type: 'window', url: 'https://app.test/drive/' }] }
  ]) assert.equal((await probe(fixture)).reply.capable, false);
});

test('Q0 capability rejects cross-origin, out-of-scope, credentialed and non-window clients', async () => {
  for (const override of [
    { url: 'https://other.test/drive/' }, { url: 'https://app.test/drive-other/' },
    { url: 'https://user:secret@app.test/drive/' }, { url: 'not a URL' }, { type: 'worker' },
    { id: 'client-B' }
  ]) {
    const client = { id: 'client-A', type: 'window', url: 'https://app.test/drive/', ...override };
    const result = await probe({ client, controlled: [client] });
    assert.equal(result.reply.capable, false);
    assert.equal(result.lookupCalls.length, 1, 'invalid client never enumerates windows');
  }
});

test('Q0 capability rejects invalid protocol and nonce before client lookup; bounded reply omits malformed nonce', async () => {
  for (const fixture of [
    { request: { protocol: 'older-protocol' } }, { request: { requestId: '' } },
    { request: { requestId: 'x'.repeat(81) } }, { request: { requestId: 'bad\nnonce' } },
    { sourceId: null }, { sourceId: 'x'.repeat(129) }
  ]) {
    const result = await probe(fixture);
    assert.equal(result.reply.capable, false);
    assert.equal(result.lookupCalls.length, 0);
    assert.ok(result.reply.requestId === null || result.reply.requestId === 'probe-123');
  }
});
