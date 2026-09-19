import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AuthError } from '../auth/session-owner.mjs';
import { base64urlEncode, createAuthCrypto, sha256Base64url } from '../worker/crypto.mjs';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT, GOOGLE_JWKS_ENDPOINT, GOOGLE_TOKEN_ENDPOINT, REQUIRED_GOOGLE_SCOPES,
  buildGoogleAuthorizationUrl, exchangeGoogleAuthorizationCode, verifyGoogleIdToken,
} from '../worker/google.mjs';
import { AuthObject, CloudflareSqliteState } from '../worker/durable-object.mjs';
import { createWorkerHandler } from '../worker/index.mjs';

const origin = 'https://candidate.example';
const fixedNow = 1_800_000_000_000;
const key = byte => base64urlEncode(new Uint8Array(32).fill(byte));
const env = {
  AUTH_ENABLED: 'true', CANDIDATE_DRIVE_WRITES_ENABLED: 'false',
  PUBLIC_ORIGIN: origin,
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'not-a-live-secret',
  AUTH_HMAC_KEY: key(1), ACCOUNT_KEY: key(2), CREDENTIAL_ENCRYPTION_KEY_V1: key(3),
  ASSETS: { fetch: async () => new Response('asset') },
  AUTH_OBJECTS: { idFromName() {}, get() {} },
};

test('checked-in candidate binds the exact public origin while auth and Drive writes remain disabled', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.vars.AUTH_ENABLED, 'false');
  assert.equal(config.vars.CANDIDATE_DRIVE_WRITES_ENABLED, 'false');
  assert.equal(config.vars.PUBLIC_ORIGIN, 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev');
  assert.match(config.vars.GOOGLE_CLIENT_ID, /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/u);
  assert.equal(config.preview_urls, false);
});

test('AES-GCM refresh envelope is versioned, account-bound and tamper-evident', async () => {
  const crypt = createAuthCrypto(env);
  const account = await crypt.deriveAccountKey('https://accounts.google.com', 'subject');
  const other = await crypt.deriveAccountKey('https://accounts.google.com', 'other');
  const envelope = await crypt.encryptRefresh('refresh-credential', account);
  assert.deepEqual(Object.keys(envelope).sort(), ['alg', 'ciphertext', 'iv', 'v']);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.alg, 'A256GCM');
  assert.equal(await crypt.decryptRefresh(envelope, account), 'refresh-credential');
  await assert.rejects(crypt.decryptRefresh(envelope, other));
  const replacement = envelope.ciphertext.at(-1) === 'A' ? 'B' : 'A';
  await assert.rejects(crypt.decryptRefresh({ ...envelope, ciphertext: envelope.ciphertext.slice(0, -1) + replacement }, account));
  await assert.rejects(crypt.decryptRefresh({ ...envelope, v: 2 }, account));
});

test('authorization URL uses exact redirect, PKCE S256, nonce, offline access and minimum scopes', async () => {
  const transaction = { state: 's'.repeat(64), pkceVerifier: 'v'.repeat(64), nonce: 'n'.repeat(64) };
  const target = new URL(await buildGoogleAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${origin}/auth/google/callback`, transaction,
  }));
  assert.equal(target.origin + target.pathname, GOOGLE_AUTHORIZATION_ENDPOINT);
  assert.equal(target.searchParams.get('redirect_uri'), `${origin}/auth/google/callback`);
  assert.equal(target.searchParams.get('code_challenge'), await sha256Base64url(transaction.pkceVerifier));
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('nonce'), transaction.nonce);
  assert.equal(target.searchParams.get('state'), transaction.state);
  assert.equal(target.searchParams.get('access_type'), 'offline');
  assert.equal(target.searchParams.get('prompt'), 'consent');
  assert.deepEqual(new Set(target.searchParams.get('scope').split(' ')), new Set(REQUIRED_GOOGLE_SCOPES));
});

async function signingFixture(overrides = {}) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const now = Math.floor(fixedNow / 1000);
  const claims = {
    iss: 'accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: now + 3600, iat: now,
    nonce: 'n'.repeat(64), sub: 'google-subject', ...overrides,
  };
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })));
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return { token: `${header}.${payload}.${base64urlEncode(signature)}`, jwks: { keys: [jwk] }, claims };
}

test('Google ID token verifies signature and every identity/time/nonce claim, canonicalizing issuer', async () => {
  const fixture = await signingFixture();
  assert.deepEqual(await verifyGoogleIdToken({
    idToken: fixture.token, clientId: env.GOOGLE_CLIENT_ID, nonce: fixture.claims.nonce,
    clock: () => fixedNow, jwks: fixture.jwks,
  }), { iss: 'https://accounts.google.com', sub: fixture.claims.sub });

  for (const overrides of [
    { iss: 'https://evil.example' }, { aud: 'other-client' },
    { azp: 'other-client' }, { exp: Math.floor(fixedNow / 1000) }, { iat: Math.floor(fixedNow / 1000) + 61 },
    { iat: Math.floor(fixedNow / 1000) - 661 }, { nonce: 'wrong' }, { sub: '' }, { sub: '유니코드-subject' },
  ]) {
    const invalid = await signingFixture(overrides);
    await assert.rejects(verifyGoogleIdToken({
      idToken: invalid.token, clientId: env.GOOGLE_CLIENT_ID, nonce: 'n'.repeat(64),
      clock: () => fixedNow, jwks: invalid.jwks,
    }), error => error.code === 'auth_unavailable');
  }
  const corrupted = fixture.token.slice(0, -1) + (fixture.token.endsWith('A') ? 'B' : 'A');
  await assert.rejects(verifyGoogleIdToken({
    idToken: corrupted, clientId: env.GOOGLE_CLIENT_ID, nonce: fixture.claims.nonce,
    clock: () => fixedNow, jwks: fixture.jwks,
  }), error => error.code === 'auth_unavailable');
});

test('code exchange sends verifier and rejects a token response missing any granted scope', async () => {
  const fixture = await signingFixture();
  const transaction = { state: 's'.repeat(64), pkceVerifier: 'v'.repeat(64), nonce: fixture.claims.nonce };
  let tokenRequests = 0;
  const fetchImpl = async (url, options) => {
    if (url === GOOGLE_TOKEN_ENDPOINT) {
      tokenRequests++;
      assert.equal(options.body.get('code_verifier'), transaction.pkceVerifier);
      return Response.json({
        access_token: 'access', expires_in: 3600, refresh_token: 'refresh', token_type: 'Bearer',
        scope: REQUIRED_GOOGLE_SCOPES.join(' '), id_token: fixture.token,
      });
    }
    if (url === GOOGLE_JWKS_ENDPOINT) return Response.json(fixture.jwks);
    throw new Error('unexpected URL');
  };
  const result = await exchangeGoogleAuthorizationCode({
    code: 'code', transaction, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${origin}/auth/google/callback`, fetchImpl, clock: () => fixedNow,
  });
  assert.equal(result.refreshToken, 'refresh');
  assert.equal(result.expiresAt, fixedNow + 3600_000);
  assert.equal(tokenRequests, 1);

  await assert.rejects(exchangeGoogleAuthorizationCode({
    code: 'code', transaction, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${origin}/auth/google/callback`, clock: () => fixedNow, jwks: fixture.jwks,
    fetchImpl: async () => Response.json({
      access_token: 'access', expires_in: 3600, refresh_token: 'refresh', token_type: 'Bearer',
      scope: REQUIRED_GOOGLE_SCOPES.slice(0, -1).join(' '), id_token: fixture.token,
    }),
  }), error => error.code === 'auth_unavailable');
});

class FakeCursor {
  constructor(rows = []) { this.rows = rows; }
  toArray() { return structuredClone(this.rows); }
}
class FakeStorage {
  constructor() {
    this.rows = new Map();
    this.alarmAt = null;
    this.sql = { exec: (query, ...bindings) => {
      if (query.startsWith('CREATE TABLE')) return new FakeCursor();
      if (query.startsWith('SELECT json')) return new FakeCursor(this.rows.has(bindings[0]) ? [{ json: this.rows.get(bindings[0]) }] : []);
      if (query.startsWith('INSERT INTO')) { this.rows.set(bindings[0], bindings[1]); return new FakeCursor(); }
      throw new Error(`Unexpected SQL: ${query}`);
    } };
  }
  transactionSync(callback) {
    const before = structuredClone(this.rows);
    try { return callback(); } catch (error) { this.rows = before; throw error; }
  }
  async setAlarm(at) { this.alarmAt = at; }
  async deleteAlarm() { this.alarmAt = null; }
}
class FakeContext {
  constructor() { this.storage = new FakeStorage(); }
  blockConcurrencyWhile(callback) { return Promise.resolve().then(callback); }
}
const internal = payload => new Request('https://auth-object.internal/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

test('SQLite adapter commits atomically and rolls back thrown mutations', async () => {
  const storage = new FakeStorage();
  const adapter = new CloudflareSqliteState(storage);
  adapter.initialize();
  await adapter.transaction(state => { state.count = 1; return 'committed'; });
  await assert.rejects(adapter.transaction(state => { state.count = 2; throw new Error('stop'); }));
  assert.equal(await adapter.transaction(state => state.count), 1);
  await assert.rejects(adapter.transaction(async state => { state.count = 3; }));
  assert.equal(await adapter.transaction(state => state.count), 1);
});

test('one SQLite AuthObject provides one-use transaction and alarm-backed opaque locator owners', async () => {
  const ctx = new FakeContext();
  const object = new AuthObject(ctx, env);
  const state = 's'.repeat(64);
  const created = await (await object.fetch(internal({
    kind: 'transaction', operation: 'create', args: { state, cookieDigest: 'digest', returnPath: '/' },
  }))).json();
  assert.equal(created.ok, true);
  assert.equal(created.value.state, state);
  assert.ok(ctx.storage.alarmAt > Date.now());
  const consumed = await (await object.fetch(internal({
    kind: 'transaction', operation: 'consume', args: { state, cookieDigest: 'digest' },
  }))).json();
  assert.equal(consumed.ok, true);
  const replay = await (await object.fetch(internal({
    kind: 'transaction', operation: 'consume', args: { state, cookieDigest: 'digest' },
  }))).json();
  assert.deepEqual(replay, { ok: false, errorCode: 'transaction_invalid' });

  const locatorCtx = new FakeContext();
  const locator = new AuthObject(locatorCtx, env);
  const accountKey = 'a'.repeat(43);
  const set = await (await locator.fetch(internal({
    kind: 'session-index', operation: 'set', args: { accountKey, expiresAt: Date.now() + 60_000 },
  }))).json();
  assert.deepEqual(set, { ok: true, value: { indexed: true } });
  const found = await (await locator.fetch(internal({ kind: 'session-index', operation: 'get', args: {} }))).json();
  assert.equal(found.value.accountKey, accountKey);
  await locator.alarm();
  const gone = await (await locator.fetch(internal({ kind: 'session-index', operation: 'get', args: {} }))).json();
  assert.deepEqual(gone, { ok: true, value: null });
});

function responseCookies(response) {
  return typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('Set-Cookie')];
}

async function workerFlowFixture({ failLocator = false } = {}) {
  const jwt = await signingFixture();
  const state = '1'.repeat(64);
  const preauth = '2'.repeat(64);
  const sessionId = '3'.repeat(64);
  const calls = [];
  let transaction;
  let locator;
  const callObject = async (name, payload) => {
    calls.push({ name, payload: structuredClone(payload) });
    if (payload.kind === 'transaction' && payload.operation === 'create') {
      transaction = { state: payload.args.state, pkceVerifier: 'v'.repeat(64), nonce: jwt.claims.nonce,
        cookieDigest: payload.args.cookieDigest, returnPath: payload.args.returnPath, createdAt: fixedNow, expiresAt: fixedNow + 600_000 };
      return transaction;
    }
    if (payload.kind === 'transaction' && payload.operation === 'consume') {
      assert.equal(payload.args.state, transaction.state);
      assert.equal(payload.args.cookieDigest, transaction.cookieDigest);
      return transaction;
    }
    if (payload.kind === 'account' && payload.operation === 'establish') return { sessionId, credential: { revision: 1 } };
    if (payload.kind === 'session-index' && payload.operation === 'set') {
      if (failLocator) throw new AuthError('auth_unavailable');
      locator = payload.args;
      return { indexed: true };
    }
    if (payload.kind === 'session-index' && payload.operation === 'get') return locator;
    if (payload.kind === 'session-index' && payload.operation === 'delete') { locator = null; return { deleted: true }; }
    if (payload.kind === 'account' && payload.operation === 'logout') return { loggedOut: true };
    if (payload.kind === 'account' && payload.operation === 'credential') {
      if (payload.args.input.expectedAccount !== payload.args.account) throw new AuthError('account_mismatch');
      return { accessToken: 'short', expiresAt: fixedNow + 3600_000, account: payload.args.account, revision: 1 };
    }
    throw new Error(`Unexpected operation ${payload.kind}/${payload.operation}`);
  };
  const fetchImpl = async url => {
    if (url === GOOGLE_TOKEN_ENDPOINT) return Response.json({
      access_token: 'access', expires_in: 3600, refresh_token: 'refresh', token_type: 'Bearer',
      scope: REQUIRED_GOOGLE_SCOPES.join(' '), id_token: jwt.token,
    });
    if (url === GOOGLE_JWKS_ENDPOINT) return Response.json(jwt.jwks);
    throw new Error(`Unexpected fetch ${url}`);
  };
  const randomValues = [state, preauth];
  const handler = createWorkerHandler(env, { fetchImpl, clock: () => fixedNow, random: () => randomValues.shift(), callObject });
  return { handler, calls, state, preauth, sessionId };
}

test('exact GET start/callback flow sets hardened cookies and locator routing ignores browser account IDs', async () => {
  const fixture = await workerFlowFixture();
  const start = await fixture.handler(new Request(`${origin}/auth/google/start?returnTo=%2F`, {
    headers: { 'Sec-Fetch-Site': 'same-origin' },
  }));
  assert.equal(start.status, 303);
  assert.equal(start.headers.get('Cache-Control'), 'no-store');
  assert.match(responseCookies(start).join('\n'), /__Host-drive_original_oauth=.*Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600/);
  const google = new URL(start.headers.get('Location'));
  assert.equal(google.searchParams.get('state'), fixture.state);

  const callback = await fixture.handler(new Request(`${origin}/auth/google/callback?code=code&state=${fixture.state}&scope=x&authuser=0&prompt=consent&future_parameter=ignored`, {
    headers: { Cookie: `__Host-drive_original_oauth=${fixture.preauth}` },
  }));
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('Location'), '/');
  const callbackCookies = responseCookies(callback).join('\n');
  assert.match(callbackCookies, /__Host-drive_original_oauth=;.*Max-Age=0/);
  assert.match(callbackCookies, /__Host-drive_original_session=.*Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=7776000/);

  const crypt = createAuthCrypto(env);
  const account = await crypt.deriveAccountKey('https://accounts.google.com', 'google-subject');
  const credentialRequest = expectedAccount => new Request(`${origin}/api/session/credential`, {
    method: 'POST', headers: {
      Origin: origin, 'X-Drive-Original-CSRF': '1', 'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Content-Type': 'application/json',
      Cookie: `__Host-drive_original_session=${fixture.sessionId}`,
    }, body: JSON.stringify({ expectedAccount }),
  });
  const credential = await fixture.handler(credentialRequest(account));
  assert.equal(credential.status, 200);
  assert.equal((await credential.json()).account, account);
  const wrong = await fixture.handler(credentialRequest('browser-supplied-account'));
  assert.equal(wrong.status, 409);
  const accountCalls = fixture.calls.filter(call => call.payload.kind === 'account' && call.payload.operation === 'credential');
  assert.equal(new Set(accountCalls.map(call => call.name)).size, 1);
  assert.equal(accountCalls[0].name, `account:${account}`);

  const fixtureRoute = await fixture.handler(new Request(`${origin}/api/auth/transaction/create`, { method: 'POST' }));
  assert.equal(fixtureRoute.status, 404);
});

test('failed session-locator creation rolls account establishment back before any session cookie escapes', async () => {
  const fixture = await workerFlowFixture({ failLocator: true });
  await fixture.handler(new Request(`${origin}/auth/google/start`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  const callback = await fixture.handler(new Request(`${origin}/auth/google/callback?code=code&state=${fixture.state}`, {
    headers: { Cookie: `__Host-drive_original_oauth=${fixture.preauth}` },
  }));
  assert.equal(callback.status, 503);
  assert.doesNotMatch(responseCookies(callback).join('\n'), /__Host-drive_original_session=[^;]/);
  assert.ok(fixture.calls.some(call => call.payload.kind === 'account' && call.payload.operation === 'logout'));
});

test('auth surface rejects non-allowlisted return targets and static files stay on the same Worker origin', async () => {
  const fixture = await workerFlowFixture();
  const external = await fixture.handler(new Request(`${origin}/auth/google/start?returnTo=https%3A%2F%2Fevil.example`, {
    headers: { 'Sec-Fetch-Site': 'same-origin' },
  }));
  assert.equal(external.status, 400);
  const asset = await fixture.handler(new Request(`${origin}/styles.css`));
  assert.equal(await asset.text(), 'asset');
});

test('checked-in auth kill switch fails closed without blocking same-origin static assets', async () => {
  const disabled = createWorkerHandler({ ...env, AUTH_ENABLED: 'false' });
  const auth = await disabled(new Request(`${origin}/auth/google/start`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  assert.equal(auth.status, 503);
  assert.equal(auth.headers.get('Cache-Control'), 'no-store');
  const asset = await disabled(new Request(`${origin}/index.html`));
  assert.equal(await asset.text(), 'asset');
});
