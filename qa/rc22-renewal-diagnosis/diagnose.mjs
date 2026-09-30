import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { AccountCredentialOwner, AuthError, ERROR_STATUS } from '../../auth/session-owner.mjs';
import { REQUESTED_GOOGLE_SCOPES } from '../../auth/scope-policy.mjs';

// Local discriminant: actual page auth functions + actual durable auth owner.
// All account/token/session strings are synthetic. No browser/network/device I/O.
const appSource = execFileSync('git', ['show', 'eb11d66:app.js'], {
  cwd: new URL('../..', import.meta.url), encoding: 'utf8', maxBuffer: 2_000_000
});
class AtomicFixture {
  state = {}; tail = Promise.resolve();
  transaction(fn) {
    const operation = this.tail.then(() => {
      const next = structuredClone(this.state);
      const result = fn(next);
      assert.equal(result instanceof Promise, false);
      this.state = next;
      return structuredClone(result);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
async function fixture({ failures = 0, responseDelay = 0, prototype = false, skipScheduled = false } = {}) {
  let now = 1_000_000, nextTimer = 0, refreshes = 0, random = 0;
  const timers = new Map(), calls = [], storage = new AtomicFixture();
  const options = {
    storage, account: 'fixture-account', clock: () => now,
    random: () => (++random).toString(16).padStart(64, '0'),
    hash: async value => `hash:${value}`, encrypt: async value => `encrypted:${value}`,
    decrypt: async value => value.slice(10), scheduleAlarm: async () => {}, revoke: async () => true,
    sleep: async delay => { now += delay; },
    refresh: async () => {
      refreshes++;
      now += responseDelay;
      if (refreshes <= failures) throw new AuthError('auth_unavailable');
      return { accessToken: `fixture-new-${refreshes}`, expiresAt: now + 3_600_000 };
    }
  };
  const owner = new AccountCredentialOwner(options);
  const established = await owner.establishVerifiedSession({ account: options.account,
    accessToken: 'fixture-old', expiresAt: now + 60_000, refreshToken: 'fixture-refresh',
    grantedScopes: REQUESTED_GOOGLE_SCOPES });
  const oldExpiry = established.credential.expiresAt;
  class ClockDate extends Date { static now() { return now; } }
  const context = {
    AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL,
    URLSearchParams, Date: ClockDate, console, performance, queueMicrotask,
    setTimeout(callback, delay = 0) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    history: { replaceState() {} }, navigator: { onLine: true },
    location: { hash: '', href: 'https://example.test/', origin: 'https://example.test',
      pathname: '/', protocol: 'https:', search: '' },
    localStorage: { getItem() { return null; }, removeItem() {}, setItem() {} },
    document: { visibilityState: 'visible', addEventListener() {}, querySelectorAll() { return []; } },
    __DRIVE_ORIGINAL_RUNTIME__: { candidate: true, driveMutationsEnabled: false }
  };
  context.window = { addEventListener() {}, removeEventListener() {}, isSecureContext: true,
    location: context.location, matchMedia() { return { matches: false }; } };
  context.matchMedia = context.window.matchMedia;
  context.fetch = async (url, init) => {
    assert.equal(String(url), 'https://example.test/api/session/credential');
    const request = JSON.parse(init.body);
    const record = { atBeforeExpiry: now - oldExpiry, rejectedRevision: request.rejectedRevision };
    calls.push(record);
    try {
      const credential = await owner.credential({ sessionId: established.sessionId, ...request });
      record.status = 200; record.revision = credential.revision;
      return new Response(JSON.stringify(credential), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      record.status = ERROR_STATUS[error.code];
      return new Response(JSON.stringify({ error: { code: error.code } }),
        { status: record.status, headers: { 'Content-Type': 'application/json' } });
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../../media/revision-pin.js', import.meta.url), 'utf8'), context);
  // Memory-only prototype forces monotonic progress for scheduled renewal.
  let source = prototype ? appSource.replaceAll(
    'requestSessionCredential({ background: true, force: true });',
    'requestSessionCredential({ background: true, force: true, rejectedRevision: state.tokenRevision });') : appSource;
  if (prototype === 'resilient') {
    source = source.replace(
      'await fetch(new URL(AUTH_CREDENTIAL_PATH, location.origin), {',
      'await fetchCredentialWithRetry(new URL(AUTH_CREDENTIAL_PATH, location.origin), {');
    source = source.replace(
      'if (!force && hasUsableToken()) return Promise.resolve(true);\n  if (!navigator.onLine) {',
      'if (!force && hasUsableToken()) return Promise.resolve(true);\n  if (!navigator.onLine) { credentialRenewalRetryable=true;');
  }
  vm.runInContext(source, context);
  if (prototype === 'resilient') vm.runInContext(fs.readFileSync(
    new URL('./policy-prototype.js', import.meta.url), 'utf8'), context);
  const run = expression => vm.runInContext(expression, context);
  run(`resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};clearAuthError=()=>{};updateConnectionBadge=()=>{};
    state.authGeneration=1;state.driveSessionGeneration=1;state.mediaSession=7;mediaSourceGeneration=5;
    state.selected={id:'fixture-file'};state.mediaAttempt='q1-playback';
    globalThis.fixtureController={};navigator.serviceWorker={controller:fixtureController};
    q1Playback={controller:new AbortController(),swController:fixtureController};`);
  context.initial = established.credential;
  assert.equal(run('installSessionCredential(initial,{generation:1})'), true);
  if (skipScheduled) run('clearTimeout(tokenRenewalTimer);tokenRenewalTimer=null');
  async function flush() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }
  async function advanceTo(target) {
    let steps = 0;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
        .sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++steps < 100, 'unexpected timer loop');
      timers.delete(next[0]); now = Math.max(now, next[1].at);
      // Async page timer jobs are deliberately independent like browser tasks.
      Promise.resolve(next[1].callback()).catch(error => { throw error; });
      await flush();
    }
    now = Math.max(now, target); await flush();
  }
  async function tokenReply({ retire = false } = {}) {
    let reply;
    context.event = { source: context.fixtureController,
      data: { type: 'TOKEN_REQUEST', requestId: 'fixture-request', forceRefresh: false,
        accountGeneration: 1, expectedAccount: options.account, requireCurrentMedia: true,
        fileId: 'fixture-file', mediaSession: '7', sourceGeneration: 5 },
      ports: [{ postMessage(value) { reply = value; }, close() {} }] };
    const result = run('handleWorkerMessage(event)');
    if (retire) run('q1Playback.controller.abort()');
    await result;
    return { current: reply.requestCurrent, tokenPresent: Boolean(reply.token), revision: reply.revision };
  }
  return { oldExpiry, calls, run, advanceTo, tokenReply, owner, options, context, flush,
    refreshes: () => refreshes, timers: () => timers.size,
    scheduled: () => [...timers.entries()], now: () => now,
    revision: () => run('state.tokenRevision'),
    accountRetained: () => run('state.authAccountKey') === options.account };
}
const output = [];
for (const scenario of [
  { name: 'baseline cached-before-skew success', failures: 0 },
  { name: 'baseline two temporary failures abandon timer', failures: 2, responseDelay: 1_904 },
  { name: 'prototype renewal requires newer revision', failures: 0, prototype: true },
  { name: 'prototype first failure recovers on second attempt', failures: 1, responseDelay: 1_904, prototype: true },
  { name: 'resilient prototype retries two503s inside shared flight', failures: 2, responseDelay: 1_904, prototype: 'resilient' },
  { name: 'resilient prototype returns to scheduler after full failed flight', failures: 4, responseDelay: 1_904, prototype: 'resilient' }
]) {
  const f = await fixture(scenario);
  await f.advanceTo(f.oldExpiry + 5_000);
  const beforeManual = { revision: f.revision(), timers: f.timers(), refreshes: f.refreshes(),
    authStatus: f.run('state.authStatus'), usable: f.run('hasUsableToken()') };
  if (scenario.failures === 2 && !scenario.prototype) {
    assert.equal(beforeManual.revision, 1);
    assert.equal(beforeManual.timers, 0);
    assert.equal(beforeManual.usable, false);
    assert.equal(f.accountRetained(), true);
    assert.equal(await f.run('requestSessionCredential({background:true,force:true})'), true);
    assert.equal(f.revision(), 2);
  } else assert.equal(beforeManual.revision, 2);
  output.push({ scenario: scenario.name, calls: f.calls, beforeManual,
    afterManualRevision: f.revision() });
}
// One shared current-owner failure produces a negative route credential reply.
const failedRoute = await fixture({ failures: 1, responseDelay: 1_904 });
await failedRoute.advanceTo(failedRoute.oldExpiry - 30_001);
// Advance one millisecond into the strict unusable window without firing renewal.
await failedRoute.advanceTo(failedRoute.oldExpiry - 30_000);
const negative = await failedRoute.tokenReply();
assert.deepEqual(negative, { current: true, tokenPresent: false, revision: 0 });
output.push({ scenario: 'current active Q1 lease gets no credential after transient failure',
  calls: failedRoute.calls, reply: negative, accountRetained: failedRoute.accountRetained() });
// Atomic same-account owner still supplies one revision to concurrent clients.
const atomic = await fixture();
const secondOwner = new AccountCredentialOwner(atomic.options);
await atomic.advanceTo(atomic.oldExpiry - 35_001);
const sameSession = Object.keys(atomic.owner.storage.state.sessions)[0].slice(5);
const concurrent = await Promise.all([atomic.owner, secondOwner].map(owner => owner.credential({
  sessionId: sameSession, expectedAccount: atomic.options.account, rejectedRevision: 1 })));
assert.equal(atomic.refreshes(), 1); assert.equal(concurrent[0].revision, 2);
assert.equal(concurrent[1].revision, 2);
output.push({ scenario: 'two independent owners preserve atomic forced-refresh revision',
  refreshes: atomic.refreshes(), revisions: concurrent.map(value => value.revision) });
// An active route joins real temporary failures after the strict usable boundary.
for (const retire of [false, true]) {
  const retryRoute = await fixture({ failures: 2, responseDelay: 1_904,
    prototype: 'resilient', skipScheduled: true });
  await retryRoute.advanceTo(retryRoute.oldExpiry - 30_000);
  const retryReply = retryRoute.tokenReply({ retire });
  await retryRoute.flush();
  await retryRoute.advanceTo(retryRoute.now() + 15_000);
  assert.deepEqual(await retryReply, { current: !retire, tokenPresent: !retire, revision: retire ? 0 : 2 });
  assert.equal(retryRoute.calls.length, 3);
  assert.equal(retryRoute.revision(), 2, 'auth renewal survives one retiring media consumer');
  output.push({ scenario: `resilient prototype Q1 lease ${retire ? 'retired while waiting' : 'shares two503 recovery'}`,
    calls: retryRoute.calls, reply: await retryReply });
}
for (const code of ['reconnect_required', 'client_update_required', 'forbidden', 'stale_revision']) {
  const terminal = await fixture({ prototype: 'resilient' });
  let calls = 0;
  terminal.context.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code } }),
      { status: ERROR_STATUS[code], headers: { 'Content-Type': 'application/json' } });
  };
  await terminal.advanceTo(terminal.oldExpiry + 5_000);
  assert.equal(calls, 1); assert.equal(terminal.timers(), 0);
  output.push({ scenario: `resilient prototype terminal ${code} stops`, calls, timers: terminal.timers() });
}
const cleared = await fixture({ prototype: 'resilient', failures: 100, responseDelay: 1_904 });
await cleared.advanceTo(cleared.oldExpiry - 55_000);
cleared.run('clearToken(false,{preserveAccount:true})');
const callsBeforeClear = cleared.calls.length;
await cleared.advanceTo(cleared.oldExpiry + 120_000);
assert.equal(cleared.calls.length, callsBeforeClear); assert.equal(cleared.timers(), 0);
output.push({ scenario: 'resilient prototype generation change aborts pending retry owner',
  callsBeforeClear, callsAfterClear: cleared.calls.length, timers: cleared.timers() });
const deadline = await fixture({ prototype: 'resilient', skipScheduled: true });
let deadlineCalls = 0;
deadline.context.fetch = (_, { signal }) => {
  deadlineCalls++;
  return new Promise((resolve, reject) => signal.addEventListener('abort',
    () => reject(signal.reason), { once: true }));
};
const deadlineStart = deadline.now();
const deadlineResult = deadline.run('requestSessionCredential({background:true,force:true})');
await deadline.flush(); await deadline.advanceTo(deadlineStart + 55_000);
assert.equal(await deadlineResult, false); assert.equal(deadlineCalls, 1); assert.equal(deadline.timers(), 0);
output.push({ scenario: 'resilient prototype original55s total deadline releases hanging fetch',
  elapsed: deadline.now() - deadlineStart, calls: deadlineCalls, timers: deadline.timers() });
for (const condition of ['offline', 'hidden']) {
  const gated = await fixture({ prototype: 'resilient', failures: 100, responseDelay: 1_904 });
  await gated.advanceTo(gated.oldExpiry - 45_000);
  assert.equal(gated.timers(), 1, 'one rate-bounded successor exists');
  gated.run(condition === 'offline' ? 'navigator.onLine=false' : "document.visibilityState='hidden'");
  const prior = gated.calls.length;
  await gated.advanceTo(gated.oldExpiry + 5_000);
  assert.equal(gated.calls.length, prior); assert.equal(gated.timers(), 0);
  output.push({ scenario: `resilient prototype later retry idles ${condition}`,
    callsBefore: prior, callsAfter: gated.calls.length, timers: gated.timers() });
}
const stale = await fixture({ prototype: 'resilient' });
const oldCallback = stale.scheduled()[0][1].callback;
stale.run('scheduleTokenRenewal()');
const replacementTimer = stale.run('tokenRenewalTimer');
await oldCallback(); await stale.flush();
assert.equal(stale.run('tokenRenewalTimer'), replacementTimer);
assert.equal(stale.calls.length, 0); assert.equal(stale.timers(), 1);
output.push({ scenario: 'resilient prototype stale queued callback cannot mutate new timer owner',
  calls: stale.calls.length, timers: stale.timers(), retainedReplacement: true });
console.log(JSON.stringify(output, null, 2));
