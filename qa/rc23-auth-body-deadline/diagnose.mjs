import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const revision = '7591044adc1149391265b0e56a93a47252088a47';
const source = execFileSync('git', ['show', `${revision}:app.js`], {
  cwd: new URL('../..', import.meta.url), encoding: 'utf8', maxBuffer: 2_000_000
});
const sha256 = value => createHash('sha256').update(value).digest('hex');
const results = [];

async function scenario({ name, status = 200, body = 'hang', cancel = null, markDeadline = false }) {
  let now = 1_000_000, nextTimer = 0, calls = 0, bodyAborts = 0;
  const timers = new Map(), captured = [];
  class ClockDate extends Date { static now() { return now; } }
  const context = {
    AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL,
    URLSearchParams, ReadableStream, Date: ClockDate, console, performance, queueMicrotask,
    setTimeout(callback, delay = 0) {
      const timer = { id: ++nextTimer, callback, at: now + delay, delay };
      timers.set(timer.id, timer); captured.push(timer); return timer.id;
    },
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
  context.fetch = async (url, { signal }) => {
    assert.equal(String(url), 'https://example.test/api/session/credential');
    calls++;
    if (body === 'headers-hang') {
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
    const fresh = { capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true },
      account: 'fixture-account', accessToken: 'fixture-new', revision: 2, expiresAt: now + 3_600_000 };
    const bytes = new TextEncoder().encode(body === 'invalid-json' ? '{"accessToken":'
      : body === 'terminal-json' ? JSON.stringify({ error: { code: 'client_update_required' } })
        : JSON.stringify(fresh));
    const stream = new ReadableStream({ start(controller) {
      let finished = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const onAbort = () => { if (finished) return; finished = true; bodyAborts++; cleanup(); controller.error(signal.reason); };
      signal.addEventListener('abort', onAbort, { once: true });
      if (body === 'hang') return;
      const finish = () => {
        if (finished) return; finished = true; cleanup();
        if (body === 'transport-error') controller.error(new TypeError('synthetic body transport failure'));
        else { controller.enqueue(bytes); controller.close(); }
      };
      if (body === 'valid-delayed' || body === 'transport-error') context.setTimeout(finish, body === 'valid-delayed' ? 40_000 : 5_000);
      else finish();
    } });
    return new Response(stream, { status, headers: { 'Content-Type': 'application/json' } });
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../../media/revision-pin.js', import.meta.url), 'utf8'), context);
  // Optional discriminant changes only the VM's deadline outcome assignment.
  const app = markDeadline ? source.replace(
    'const timeout = setTimeout(() => controller.abort(), AUTH_CREDENTIAL_TIMEOUT_MS);',
    'const timeout = setTimeout(() => { outcome.retryable=true;controller.abort(); }, AUTH_CREDENTIAL_TIMEOUT_MS);') : source;
  if (markDeadline) assert.notEqual(app, source);
  vm.runInContext(app, context);
  const run = expression => vm.runInContext(expression, context);
  run(`resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};clearAuthError=()=>{};updateConnectionBadge=()=>{};
    state.authGeneration=1;state.authAccountKey='fixture-account';state.token='fixture-old';state.tokenRevision=1;
    state.expiresAt=Date.now()+120000;state.authStatus='online';scheduleTokenRenewal();`);
  async function flush() { for (let attempt = 0; attempt < 12; attempt++) await new Promise(resolve => setImmediate(resolve)); }
  async function advanceTo(target) {
    while (true) {
      const next = [...timers.values()].filter(timer => timer.at <= target).sort((a,b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      timers.delete(next.id); now = Math.max(now, next.at);
      void Promise.resolve(next.callback()); await flush();
    }
    now = Math.max(now, target); await flush();
  }
  const snapshot = () => ({
    elapsed: now - 1_000_000, calls, bodyAborts, revision: run('state.tokenRevision'),
    authGeneration: run('state.authGeneration'), accountRetained: run("state.authAccountKey==='fixture-account'"),
    tokenPresent: run('Boolean(state.token)'), usable: run('hasUsableToken()'), authStatus: run('state.authStatus'),
    retryable: run('credentialRequestOutcome?.retryable ?? null'),
    pending: run('Boolean(credentialRequestPromise)'),
    timers: [...timers.values()].map(timer => ({ delay: timer.delay, remaining: timer.at - now }))
  });
  await advanceTo(1_030_000);
  const headers = snapshot();
  if (cancel) {
    await advanceTo(1_035_000);
    run(cancel === 'clear' ? 'clearToken(false,{preserveAccount:true})'
      : 'state.authGeneration++;credentialRequestAbortController.abort()');
    await flush();
  }
  await advanceTo(1_085_000);
  const deadline = snapshot();
  if (body === 'hang' && !cancel) {
    assert.equal(deadline.calls, 1); assert.equal(deadline.bodyAborts, 1); assert.equal(deadline.pending, false);
    assert.equal(deadline.revision, 1); assert.equal(deadline.retryable, status === 503 || markDeadline);
    assert.equal(deadline.timers.length, status === 503 || markDeadline ? 1 : 0);
    if (deadline.timers.length) assert.equal(deadline.timers[0].delay, 15000);
  }
  if (cancel) { assert.equal(deadline.timers.length, 0); assert.equal(deadline.authGeneration, 2); }
  if (body === 'invalid-json' || body === 'terminal-json' || body === 'transport-error') {
    assert.equal(deadline.retryable, false); assert.equal(deadline.timers.length, 0);
  }
  if (body === 'valid' || body === 'valid-delayed') {
    assert.equal(deadline.revision, 2); assert.equal(deadline.authStatus, 'online'); assert.equal(deadline.timers.length, 1);
  }
  if (body === 'headers-hang') { assert.equal(deadline.retryable, true); assert.equal(deadline.timers.length, 1); }
  // Discard only VM-owned fake timers. No real clock/browser/process is changed.
  timers.clear();
  results.push({ name, status, body, markDeadline, headers, deadline });
}

for (const item of [
  { name: 'HTTP200 body stalls until existing deadline' },
  { name: 'HTTP200 valid JSON completes', body: 'valid' },
  { name: 'HTTP200 valid JSON body40s delay completes before deadline', body: 'valid-delayed' },
  { name: 'HTTP200 completed malformed JSON remains terminal', body: 'invalid-json' },
  { name: 'HTTP409 completed terminal JSON remains terminal', status: 409, body: 'terminal-json' },
  { name: 'HTTP503 completed terminal JSON remains terminal', status: 503, body: 'terminal-json' },
  { name: 'HTTP200 body cancellation via clearToken remains stopped', cancel: 'clear' },
  { name: 'HTTP200 body cancellation via generation change remains stopped', cancel: 'generation' },
  { name: 'HTTP503 clone body stalls until existing deadline', status: 503 },
  { name: 'HTTP503 clone body cancellation via clearToken remains stopped', status: 503, cancel: 'clear' },
  { name: 'Fetch headers stall until existing deadline retains recovery', body: 'headers-hang' },
  { name: 'HTTP200 body transport error before deadline shares invalid-json result', body: 'transport-error' },
  { name: 'VM deadline-mark proposal retains HTTP200 timeout recovery', markDeadline: true },
  { name: 'VM deadline-mark proposal still stops completed malformed JSON', body: 'invalid-json', markDeadline: true },
  { name: 'VM deadline-mark proposal still stops explicit generation clear', cancel: 'clear', markDeadline: true }
]) await scenario(item);

const report = { passed: true, syntheticOnly: true, revision, appSha256: sha256(source),
  driverSha256: sha256(fs.readFileSync(new URL('./diagnose.mjs', import.meta.url))),
  scope: 'Actual fixed23 page auth functions plus controlled Response stream and clock. No product/browser/account mutation.', results };
fs.writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, cases: results.length,
  causal200: results[0].deadline, contrast503: results[8].deadline, proposal200: results[12].deadline }, null, 2));
