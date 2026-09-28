import { REQUESTED_GOOGLE_SCOPES } from '../auth/scope-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountCredentialOwner, DAY, RECOVERY_GRACE_MS, AuthError } from '../auth/session-owner.mjs';
import { PreAuthTransactionOwner, TRANSACTION_TTL_MS } from '../auth/transaction-owner.mjs';
import { createAuthHandler, SESSION_COOKIE, PREAUTH_COOKIE } from '../auth/routes.mjs';

// Fixture models serializable persisted state shared by independent owners. It
// rolls back throwing callbacks and returns detached snapshots like a DO adapter.
class AtomicFixture {
  state = {};
  tail = Promise.resolve();
  transaction(fn) {
    const result = this.tail.then(() => {
      const next = structuredClone(this.state);
      const result = fn(next);
      assert.equal(result instanceof Promise, false, 'transactions contain no external I/O');
      this.state = next;
      return structuredClone(result);
    });
    this.tail = result.catch(() => {});
    return result;
  }
}
function setup(overrides = {}) {
  let now = 1_000_000;
  let count = 0;
  let refreshCount = 0;
  let revokeCount = 0;
  const storage = new AtomicFixture();
  const alarms = [];
  const options = {
    storage, account: 'opaque-account-A', clock: () => now,
    random: () => (++count).toString(16).padStart(64, '0'),
    hash: async s => `hash:${s}`,
    sleep: async ms => { now += ms; await new Promise(resolve => setImmediate(resolve)); },
    scheduleAlarm: async at => { alarms.push(at); },
    encrypt: async s => `encrypted:${s}`, decrypt: async s => s.slice('encrypted:'.length),
    refresh: async () => { refreshCount++; return { accessToken: 'access', expiresAt: now + 3600_000 }; },
    revoke: async () => { revokeCount++; return true; },
    ...overrides,
  };
  const owner = new AccountCredentialOwner(options);
  return { owner, storage, options, alarms, now: () => now, advance: ms => { now += ms; },
    refreshCount: () => refreshCount, revokeCount: () => revokeCount,
    establish: (extra = {}) => owner.establishVerifiedSession({ account: options.account, accessToken: 'access', expiresAt: now + 3600_000, refreshToken: 'refresh-secret', grantedScopes: REQUESTED_GOOGLE_SCOPES, ...extra }),
  };
}
const code = expected => error => error instanceof AuthError && error.code === expected;

test('20 callers across two owners share exactly one persisted refresh and revision', async () => {
  const f = setup();
  const { sessionId, credential } = await f.establish();
  const owner2 = new AccountCredentialOwner(f.options);
  f.advance(3600_000);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? f.owner : owner2).credential({ sessionId, expectedAccount: credential.account, rejectedRevision: credential.revision })));
  assert.equal(f.refreshCount(), 1);
  assert.equal(new Set(results.map(r => r.revision)).size, 1);
  assert.equal(results[0].revision, credential.revision + 1);
  assert.equal(results[0].accessToken, credential.accessToken, 'same token string still gets a new revision');
  assert.deepEqual(Object.keys(results[0]).sort(), ['accessToken', 'account', 'capabilities', 'expiresAt', 'revision']);
});

test('restart waits for persisted dead lease then recovers; late revision cannot replace current', async () => {
  const f = setup();
  const { sessionId, credential } = await f.establish();
  f.advance(3600_000);
  await f.storage.transaction(s => { s.lease = { id: 'dead', revision: s.revision, expiresAt: f.now() + 30_000 }; });
  const restarted = new AccountCredentialOwner(f.options);
  const result = await restarted.credential({ sessionId });
  assert.equal(result.revision, credential.revision + 1);
  assert.equal(f.refreshCount(), 1);
  await restarted.performRefresh({ lease: { id: 'dead', revision: credential.revision }, encryptedRefresh: 'encrypted:old' });
  assert.equal(f.storage.state.revision, result.revision);
});

test('older rejected revision reuses current credential; future revision and other account are fenced', async () => {
  const f = setup();
  const { sessionId, credential } = await f.establish();
  const fresh = await f.owner.credential({ sessionId, rejectedRevision: credential.revision });
  assert.equal(f.refreshCount(), 1);
  assert.deepEqual(await f.owner.credential({ sessionId, rejectedRevision: credential.revision }), fresh);
  assert.equal(f.refreshCount(), 1);
  await assert.rejects(f.owner.credential({ sessionId, rejectedRevision: fresh.revision + 1 }), code('stale_revision'));
  await assert.rejects(f.owner.credential({ sessionId, expectedAccount: 'other-account' }), code('account_mismatch'));
});

test('missing refresh field preserves encrypted secret on refresh and verified exchange', async () => {
  const f = setup();
  const { sessionId, credential } = await f.establish();
  await f.owner.credential({ sessionId, rejectedRevision: credential.revision });
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
  await f.establish({ refreshToken: undefined });
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
  const empty = setup();
  await assert.rejects(empty.establish({ refreshToken: undefined }), code('reauthorization_required'));
  assert.equal(empty.storage.state.encryptedRefresh, undefined);
});

test('replacement refresh credential commits atomically with revision', async () => {
  const f = setup({ refresh: async () => ({ accessToken: 'new', expiresAt: 9_000_000, refreshToken: 'replacement' }) });
  const { sessionId, credential } = await f.establish();
  const next = await f.owner.credential({ sessionId, rejectedRevision: credential.revision });
  assert.equal(next.revision, credential.revision + 1);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:replacement');
});

test('invalid_grant closes refresh loop and preserves unrelated product state', async () => {
  let calls = 0;
  const f = setup({ refresh: async () => { calls++; return { error: 'invalid_grant' }; } });
  const { sessionId, credential } = await f.establish();
  const productState = { likes: ['file-a'], viewed: ['file-b'] };
  await f.storage.transaction(s => { s.fixtureProductState = productState; });
  await assert.rejects(f.owner.credential({ sessionId, rejectedRevision: credential.revision }), code('reconnect_required'));
  await assert.rejects(f.owner.credential({ sessionId }), code('reconnect_required'));
  assert.equal(calls, 1);
  assert.deepEqual(f.storage.state.fixtureProductState, productState);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
  await assert.rejects(
    f.establish({ accessToken: 'reauthorized-access', refreshToken: undefined }),
    code('reauthorization_required')
  );
  const reauthorized = await f.establish({ accessToken: 'reauthorized-access', refreshToken: 'fresh-refresh' });
  assert.equal(reauthorized.credential.revision, credential.revision + 2);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:fresh-refresh');
  assert.equal(f.storage.state.reconnect, false);
});

test('network error preserves credentials and persisted cooldown bounds concurrent retry', async () => {
  let calls = 0;
  const f = setup({ refresh: async () => { calls++; throw new Error('upstream secret details'); } });
  const { sessionId, credential } = await f.establish();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.owner.credential({ sessionId, rejectedRevision: credential.revision })));
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.code === 'auth_unavailable'));
  assert.equal(calls, 1);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
  assert.equal(f.storage.state.revision, credential.revision);
});

test('logout ends one session; disconnect removes all sessions/secrets and reports inconclusive revoke', async () => {
  const f = setup({ revoke: async () => { throw new Error('network'); } });
  const first = await f.establish();
  const second = await f.establish();
  await f.owner.logout({ sessionId: first.sessionId });
  await assert.rejects(f.owner.credential({ sessionId: first.sessionId }), code('unauthorized'));
  await f.owner.credential({ sessionId: second.sessionId });
  assert.ok(f.storage.state.encryptedRefresh);
  assert.equal(f.storage.state.recoveryAt, undefined);
  const result = await f.owner.disconnect({ sessionId: second.sessionId, expectedAccount: f.options.account });
  assert.equal(result.revocation, 'inconclusive');
  assert.equal(result.manualRevocationUrl, 'https://myaccount.google.com/permissions');
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.deepEqual(f.storage.state.sessions, {});
  await assert.rejects(f.owner.credential({ sessionId: second.sessionId }), code('unauthorized'));
});

test('disconnect fences refresh already in flight and never restores deleted secret', async () => {
  let release;
  let started;
  const start = new Promise(resolve => { started = resolve; });
  const f = setup({ refresh: async () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const { sessionId, credential } = await f.establish();
  const pending = f.owner.credential({ sessionId, rejectedRevision: credential.revision });
  const rejected = assert.rejects(pending, code('unauthorized'));
  await start;
  await f.owner.disconnect({ sessionId, expectedAccount: f.options.account });
  release({ accessToken: 'late', expiresAt: 9_000_000, refreshToken: 'late-secret' });
  await rejected;
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.equal(f.storage.state.access, undefined);
});

test('a delayed stale alarm write repairs to the latest durable deadline', async () => {
  let releaseStale;
  let staleStarted;
  let firstNull = true;
  let scheduled = 'unset';
  const started = new Promise(resolve => { staleStarted = resolve; });
  const gate = new Promise(resolve => { releaseStale = resolve; });
  const f = setup({
    scheduleAlarm: async at => {
      if (at === null && firstNull) {
        firstNull = false;
        staleStarted();
        await gate;
      }
      scheduled = at;
    }
  });
  const stale = f.owner.alarm();
  await started;
  const establishing = f.establish();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.storage.state.nextAlarmAt > f.now());
  releaseStale();
  await Promise.all([stale, establishing]);
  assert.equal(scheduled, f.storage.state.nextAlarmAt);
});

test('alarm cancellation failure cannot suppress committed disconnect or revoke result', async () => {
  let failCancel = false;
  let revokeCalls = 0;
  const f = setup({
    scheduleAlarm: async at => { if (failCancel && at === null) throw new Error('alarm unavailable'); },
    revoke: async () => { revokeCalls++; return true; }
  });
  const { sessionId } = await f.establish();
  failCancel = true;
  const result = await f.owner.disconnect({ sessionId, expectedAccount: f.options.account });
  assert.deepEqual(result, { disconnected: true, revocation: 'confirmed' });
  assert.equal(revokeCalls, 1);
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.deepEqual(f.storage.state.sessions, {});
});

test('contested alarm reconciliation falls back to an early repair wake-up, never stale null', async () => {
  let fixture;
  let adversarial = false;
  let changes = 0;
  const writes = [];
  const f = setup({
    scheduleAlarm: async at => {
      writes.push(at);
      if (adversarial && changes < 4) {
        changes++;
        await fixture.storage.transaction(s => { s.nextAlarmAt += 1; });
      }
    }
  });
  fixture = f;
  await f.establish();
  writes.length = 0;
  adversarial = true;
  const reconciled = await f.owner.reconcileAlarm(f.storage.state.nextAlarmAt);
  assert.equal(reconciled, false);
  assert.equal(writes.at(-1), f.now() + 1_000);
  assert.ok(writes.at(-1) < f.storage.state.nextAlarmAt);
  adversarial = false;
  f.advance(1_000);
  await f.owner.alarm();
  assert.equal(writes.at(-1), f.storage.state.nextAlarmAt);
});

test('session establishment fails closed when no retention alarm can be installed', async () => {
  let attempts = 0;
  const f = setup({ scheduleAlarm: async () => { attempts++; throw new Error('alarm unavailable'); } });
  await assert.rejects(f.establish(), code('auth_unavailable'));
  assert.ok(attempts >= 4);
  assert.deepEqual(f.storage.state.sessions, {});
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.equal(f.storage.state.access, undefined);
  assert.equal(f.storage.state.nextAlarmAt, null);
  assert.equal(f.storage.state.reconnect, true);
});

test('failed additional establishment removes only its session and keeps the prior one usable', async () => {
  let failSchedule = false;
  const f = setup({ scheduleAlarm: async () => {
    if (failSchedule) throw new Error('alarm unavailable');
  } });
  const first = await f.establish();
  failSchedule = true;
  await assert.rejects(
    f.establish({ accessToken: 'replacement-access', refreshToken: 'replacement-refresh' }),
    code('auth_unavailable')
  );
  failSchedule = false;
  const retained = await f.owner.credential({ sessionId: first.sessionId });
  assert.equal(retained.accessToken, first.credential.accessToken);
  assert.ok(retained.revision > first.credential.revision);
  assert.deepEqual(Object.keys(f.storage.state.sessions), [`hash:${first.sessionId}`]);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
});

test('simultaneous failed establishments each remove their own session and final credential', async () => {
  let arrivals = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = setup({ scheduleAlarm: async () => {
    arrivals++;
    if (arrivals <= 2) {
      if (arrivals === 2) release();
      await gate;
    }
    throw new Error('alarm unavailable');
  } });
  const other = new AccountCredentialOwner(f.options);
  const results = await Promise.allSettled([
    f.establish({ accessToken: 'first-access', refreshToken: 'first-refresh' }),
    other.establishVerifiedSession({
      account: f.options.account,
      accessToken: 'second-access',
      expiresAt: f.now() + 3600_000,
      refreshToken: 'second-refresh', grantedScopes: REQUESTED_GOOGLE_SCOPES,
    }),
  ]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'auth_unavailable'));
  assert.deepEqual(f.storage.state.sessions, {});
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.equal(f.storage.state.access, undefined);
  assert.equal(f.storage.state.nextAlarmAt, null);
});

test('final logout drops the credential early when its seven-day alarm cannot be installed', async () => {
  let failSchedule = false;
  const f = setup({ scheduleAlarm: async () => {
    if (failSchedule) throw new Error('alarm unavailable');
  } });
  const { sessionId } = await f.establish();
  failSchedule = true;
  assert.deepEqual(await f.owner.logout({ sessionId }), { loggedOut: true });
  assert.deepEqual(f.storage.state.sessions, {});
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.equal(f.storage.state.access, undefined);
  assert.equal(f.storage.state.recoveryAt, undefined);
  assert.equal(f.storage.state.nextAlarmAt, null);
});

test('alarm rearm failure propagates to the host retry path', async () => {
  let failSchedule = false;
  const f = setup({ scheduleAlarm: async () => {
    if (failSchedule) throw new Error('alarm unavailable');
  } });
  await f.establish();
  failSchedule = true;
  await assert.rejects(f.owner.alarm(), code('auth_unavailable'));
  assert.ok(f.storage.state.nextAlarmAt > f.now());
});

test('last logout starts seven-day retention; verified re-entry cancels deletion', async () => {
  const f = setup();
  const { sessionId } = await f.establish();
  await f.owner.logout({ sessionId });
  assert.equal(f.storage.state.recoveryAt, f.now() + RECOVERY_GRACE_MS);
  f.advance(RECOVERY_GRACE_MS - 1);
  await f.owner.alarm();
  assert.ok(f.storage.state.encryptedRefresh);
  await f.establish({ refreshToken: undefined });
  f.advance(1);
  await f.owner.alarm();
  assert.ok(f.storage.state.encryptedRefresh);
  assert.equal(f.storage.state.recoveryAt, undefined);
});

test('expiry retention uses actual expiration time even if alarm wakes late; absolute limit caps rolling session', async () => {
  const f = setup();
  await f.establish();
  f.advance(37 * DAY);
  await f.owner.alarm();
  assert.equal(f.storage.state.encryptedRefresh, undefined);
  assert.equal(f.storage.state.nextAlarmAt, null);
  const g = setup();
  const { sessionId } = await g.establish();
  for (let i = 0; i < 4; i++) { g.advance(20 * DAY); await g.owner.credential({ sessionId }); }
  g.advance(10 * DAY);
  await assert.rejects(g.owner.credential({ sessionId }), code('unauthorized'));
  assert.equal(g.storage.state.recoveryAt, g.now() + RECOVERY_GRACE_MS);
  g.advance(RECOVERY_GRACE_MS);
  await g.owner.alarm();
  assert.equal(g.storage.state.encryptedRefresh, undefined);
});

function transactionFixture() {
  let now = 1000;
  let count = 0;
  const storage = new AtomicFixture();
  const alarms = [];
  const owner = new PreAuthTransactionOwner({ storage, clock: () => now, random: () => (++count).toString(16).padStart(64, '0'), scheduleAlarm: async at => { alarms.push(at); } });
  return { owner, storage, alarms, advance: ms => { now += ms; } };
}
test('pre-auth transaction atomically consumes once across concurrent replay', async () => {
  const f = transactionFixture();
  const record = await f.owner.create({ cookieDigest: 'keyed-cookie-digest' });
  assert.equal(record.expiresAt - record.createdAt, TRANSACTION_TTL_MS);
  assert.notEqual(record.state, record.pkceVerifier);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.owner.consume({ state: record.state, cookieDigest: record.cookieDigest })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.deepEqual(f.storage.state, {});
  assert.equal(f.alarms.at(-1), null);
});
test('consumed pre-auth state stays terminal when alarm cancellation is unavailable', async () => {
  let failCancel = false;
  const storage = new AtomicFixture();
  const owner = new PreAuthTransactionOwner({
    storage,
    random: () => 'a'.repeat(64),
    scheduleAlarm: async at => { if (failCancel && at === null) throw new Error('alarm unavailable'); }
  });
  const record = await owner.create({ cookieDigest: 'keyed-cookie-digest' });
  failCancel = true;
  assert.deepEqual(await owner.consume({ state: record.state, cookieDigest: record.cookieDigest }), record);
  assert.deepEqual(storage.state, {});
  await assert.rejects(owner.consume({ state: record.state, cookieDigest: record.cookieDigest }), code('transaction_invalid'));
});
test('wrong cookie, wrong state, expiry and abandoned-flow alarm delete transaction secrets', async () => {
  for (const mode of ['cookie', 'state', 'expired', 'alarm']) {
    const f = transactionFixture();
    const record = await f.owner.create({ cookieDigest: 'keyed-cookie-digest' });
    if (mode === 'expired' || mode === 'alarm') f.advance(TRANSACTION_TTL_MS);
    if (mode === 'alarm') await f.owner.alarm();
    else await assert.rejects(f.owner.consume({ state: mode === 'state' ? 'wrong' : record.state, cookieDigest: mode === 'cookie' ? 'wrong' : record.cookieDigest }), code('transaction_invalid'));
    assert.deepEqual(f.storage.state, {}, mode);
  }
});

const origin = 'https://auth.example';
function request(path, sessionId, body = {}, headers = {}) {
  return new Request(`${origin}${path}`, { method: 'POST', headers: {
    Origin: origin, 'X-Drive-Original-CSRF': '1', 'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Content-Type': 'application/json',
    ...(sessionId ? { Cookie: `${SESSION_COOKIE}=${sessionId}` } : {}), ...headers,
  }, body: JSON.stringify(body) });
}
test('routes require exact origin, CSRF and Fetch Metadata and return no-store redacted failures', async () => {
  const f = setup();
  const { sessionId } = await f.establish();
  const handler = createAuthHandler({ origin, resolveSession: async () => f.owner });
  const good = await handler(request('/api/session/credential', sessionId, { expectedAccount: f.options.account }));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Object.keys(await good.json()).sort(), ['accessToken', 'account', 'capabilities', 'expiresAt', 'revision']);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: `${origin}/` }, { 'X-Drive-Original-CSRF': '' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Mode': 'navigate' }, { 'Sec-Fetch-Dest': 'document' }]) {
    const response = await handler(request('/api/session/credential', sessionId, {}, headers));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: { code: 'forbidden', retryable: false } });
  }
  const failed = createAuthHandler({ origin, resolveSession: async () => { throw new Error('refresh-secret private-details'); } });
  const response = await failed(request('/api/session/credential', sessionId));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'auth_unavailable', retryable: true } });
});
test('routes reject secret-bearing/unknown fields, malformed JSON, oversized bodies and media paths', async () => {
  const f = setup();
  const { sessionId } = await f.establish();
  const handler = createAuthHandler({ origin, resolveSession: async () => f.owner });
  for (const [path, body, status] of [
    ['/api/session/credential', { refreshToken: 'secret' }, 400],
    ['/api/session/credential', { expectedAccount: 'a'.repeat(5000) }, 400],
    ['/media', {}, 404],
    ['/api/session/credential?token=secret', {}, 400],
  ]) assert.equal((await handler(request(path, sessionId, body))).status, status);
  const malformed = request('/api/session/credential', sessionId);
  const invalidJson = new Request(malformed.url, { method: 'POST', headers: malformed.headers, body: '{' });
  assert.equal((await handler(invalidJson)).status, 400);
  const logout = await handler(request('/api/session/logout', sessionId));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=0/);
  assert.equal((await handler(request('/api/session/credential', sessionId))).status, 401);
});
test('transaction route exposes no PKCE verifier and deletes record before a failed exchange', async () => {
  const f = transactionFixture();
  const preauth = 'a'.repeat(64);
  const handler = createAuthHandler({ origin, transactions: f.owner, random: () => preauth,
    digestCookie: async c => `keyed:${c}`,
    buildAuthorizationUrl: async r => `https://accounts.google.com/o/oauth2/v2/auth?state=${r.state}`,
    exchangeVerified: async () => { assert.deepEqual(f.storage.state, {}); throw new Error('google-secret'); },
  });
  const created = await handler(request('/api/auth/transaction/create'));
  assert.equal(created.status, 200);
  const payload = await created.json();
  assert.deepEqual(Object.keys(payload), ['authorizationUrl']);
  assert.match(created.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600/);
  const state = new URL(payload.authorizationUrl).searchParams.get('state');
  const consumed = await handler(request('/api/auth/transaction/consume', null, { state, code: 'test-code' }, { Cookie: `${PREAUTH_COOKIE}=${preauth}` }));
  assert.equal(consumed.status, 503);
  assert.deepEqual(await consumed.json(), { error: { code: 'auth_unavailable', retryable: true } });
  assert.match(consumed.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.deepEqual(f.storage.state, {});
  const replay = await handler(request('/api/auth/transaction/consume', null, { state, code: 'test-code' }, { Cookie: `${PREAUTH_COOKIE}=${preauth}` }));
  assert.equal(replay.status, 400);
});

test('transaction callback cleanup also covers unknown input and unavailable exchange adapter', async () => {
  for (const extra of [{ unknown: true }, {}]) {
    const f = transactionFixture();
    const record = await f.owner.create({ cookieDigest: 'keyed-cookie' });
    const handler = createAuthHandler({ origin, transactions: f.owner, digestCookie: async () => 'keyed-cookie' });
    const result = await handler(request('/api/auth/transaction/consume', null, { state: record.state, code: 'code', ...extra }, { Cookie: `${PREAUTH_COOKIE}=${'a'.repeat(64)}` }));
    assert.ok([400, 503].includes(result.status));
    assert.deepEqual(f.storage.state, {});
    assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
  }
});


test('partial grants survive refresh omission and explicit reductions replace authority', async () => {
  let next;
  const f = setup({ refresh: async () => next });
  const { sessionId } = await f.establish({ grantedScopes: ['openid', 'https://www.googleapis.com/auth/drive.readonly'] });
  assert.deepEqual((await f.owner.credential({ sessionId })).capabilities,
    { version: 1, driveRead: true, driveWrite: false, appData: false });
  f.advance(3600_000);
  next = { accessToken: 'renewed', expiresAt: f.now() + 3600_000 };
  assert.equal((await f.owner.credential({ sessionId })).capabilities.driveRead, true);
  f.advance(3600_000);
  next = { accessToken: 'reduced', expiresAt: f.now() + 3600_000, grantedScopes: ['openid', 'https://www.googleapis.com/auth/drive.appdata'] };
  assert.deepEqual((await f.owner.credential({ sessionId })).capabilities,
    { version: 1, driveRead: false, driveWrite: false, appData: true });
  f.advance(3600_000);
  next = { accessToken: 'invalid', expiresAt: f.now() + 3600_000, grantedScopes: null };
  await assert.rejects(f.owner.credential({ sessionId }), code('auth_unavailable'));
  assert.equal(f.storage.state.access.accessToken, 'reduced');
});

test('legacy all-scope durable access migrates explicitly and unknown scope versions fail closed', async () => {
  const f = setup();
  const { sessionId } = await f.establish();
  delete f.storage.state.scopePolicyVersion;
  delete f.storage.state.access.scopeVersion;
  delete f.storage.state.access.grantedScopes;
  assert.equal((await f.owner.credential({ sessionId })).capabilities.appData, true);
  assert.equal(f.storage.state.access.scopeVersion, 1);
  f.storage.state.access.scopeVersion = 9;
  await assert.rejects(f.owner.credential({ sessionId }), code('auth_unavailable'));
});


test('partial credentials require capability-aware clients and reject unknown protocols', async () => {
  const f = setup();
  const { sessionId } = await f.establish({ grantedScopes: ['openid', 'https://www.googleapis.com/auth/drive'] });
  const handler = createAuthHandler({ origin, resolveSession: async () => f.owner });
  for (const credentialProtocol of [undefined, 1, 3]) {
    const response = await handler(request('/api/session/credential', sessionId, { credentialProtocol }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: { code: 'client_update_required', retryable: false } });
  }
  const response = await handler(request('/api/session/credential', sessionId, { credentialProtocol: 2 }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).capabilities.appData, false);
  // An old Worker overwriting only access cannot re-enable the legacy migration.
  f.storage.state.access = { accessToken: 'old-worker-result', expiresAt: f.now() + 3600_000 };
  await assert.rejects(f.owner.credential({ sessionId }), code('auth_unavailable'));
});


test('a new verified grant repairs an old-Worker overwrite without authorizing ordinary access', async () => {
  const f = setup();
  const first = await f.establish({ grantedScopes: ['openid', 'https://www.googleapis.com/auth/drive.readonly'] });
  f.storage.state.access = { accessToken: 'old-worker', expiresAt: f.now() + 3600_000 };
  await assert.rejects(f.owner.credential({ sessionId: first.sessionId }), code('auth_unavailable'));
  await assert.rejects(f.establish({ grantedScopes: undefined }), code('bad_request'));
  assert.equal(f.storage.state.access.accessToken, 'old-worker');
  const replacement = await f.establish({ refreshToken: undefined, accessToken: 'fresh-verified', grantedScopes: ['openid', 'https://www.googleapis.com/auth/drive.appdata'] });
  assert.ok(replacement.credential.revision > first.credential.revision);
  assert.equal(f.storage.state.encryptedRefresh, 'encrypted:refresh-secret');
  assert.deepEqual((await f.owner.credential({ sessionId: first.sessionId })).capabilities,
    {version:1,driveRead:false,driveWrite:false,appData:true});
  assert.equal((await f.owner.credential({sessionId:replacement.sessionId})).accessToken, 'fresh-verified');
});
