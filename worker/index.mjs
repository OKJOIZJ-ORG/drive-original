import { AuthError, ERROR_STATUS, SESSION_ABSOLUTE_MS, opaqueId } from '../auth/session-owner.mjs';
import { createAuthHandler, PREAUTH_COOKIE, SESSION_COOKIE } from '../auth/routes.mjs';
import { createAuthCrypto } from './crypto.mjs';
import { buildGoogleAuthorizationUrl, exchangeGoogleAuthorizationCode } from './google.mjs';
import { AuthObject } from './durable-object.mjs';

export { AuthObject };

const CALLBACK_PATH = '/auth/google/callback';
const START_PATH = '/auth/google/start';
const CALLBACK_RECOVERY_ERRORS = new Set(['transaction_invalid', 'auth_unavailable']);
const SESSION_MAX_AGE = Math.floor(SESSION_ABSOLUTE_MS / 1000);
const cookie = (name, value, maxAge) => `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const expire = name => cookie(name, '', 0);
const encoder = new TextEncoder();

function noStoreHeaders(extra = {}) {
  return new Headers({
    'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin', ...extra,
  });
}

function errorResponse(code, cookies = []) {
  const normalized = Object.hasOwn(ERROR_STATUS, code) ? code : 'auth_unavailable';
  const headers = noStoreHeaders({ 'Content-Type': 'application/json; charset=utf-8' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify({ error: { code: normalized, retryable: normalized === 'auth_unavailable' } }), {
    status: ERROR_STATUS[normalized], headers,
  });
}

function redirect(location, cookies = []) {
  const headers = noStoreHeaders({ Location: location });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function readCookie(request, name) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,256}$/u.test(value) ? value : null;
}

function config(env) {
  const origin = env?.PUBLIC_ORIGIN;
  if (env?.AUTH_ENABLED !== 'true' || typeof origin !== 'string' || !origin.startsWith('https://') || new URL(origin).origin !== origin ||
    typeof env.GOOGLE_CLIENT_ID !== 'string' || !env.GOOGLE_CLIENT_ID || typeof env.GOOGLE_CLIENT_SECRET !== 'string' || !env.GOOGLE_CLIENT_SECRET ||
    !env.AUTH_OBJECTS?.idFromName || !env.AUTH_OBJECTS?.get) throw new AuthError('auth_unavailable');
  return { origin, redirectUri: `${origin}${CALLBACK_PATH}`, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export async function callAuthObject(env, name, payload) {
  const id = env.AUTH_OBJECTS.idFromName(name);
  const stub = env.AUTH_OBJECTS.get(id);
  const response = await stub.fetch('https://auth-object.internal/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  let body;
  try { body = await response.json(); } catch { throw new AuthError('auth_unavailable'); }
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) throw new AuthError('auth_unavailable');
  if (body.ok === false && typeof body.errorCode === 'string' && Object.hasOwn(ERROR_STATUS, body.errorCode) &&
    Object.keys(body).sort().join(',') === 'errorCode,ok') throw new AuthError(body.errorCode);
  if (body.ok !== true || Object.keys(body).sort().join(',') !== 'ok,value') throw new AuthError('auth_unavailable');
  return body.value;
}

function callbackState(url) {
  const values = url.searchParams.getAll('state');
  const state = values.length === 1 ? values[0] : null;
  if (!state || !/^[A-Za-z0-9_-]{43,128}$/u.test(state)) throw new AuthError('transaction_invalid');
  return state;
}

function exactCallbackParameters(url, state) {
  if (url.search.length > 8192 || url.searchParams.getAll('code').length > 1 || url.searchParams.getAll('error').length > 1) {
    throw new AuthError('bad_request');
  }
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if ((code == null) === (error == null) || (code != null && (!code || code.length > 2048)) ||
    (error != null && (!error || error.length > 256))) throw new AuthError('bad_request');
  return { state, code, error };
}

function sameOriginStart(request, origin) {
  if (request.headers.get('Sec-Fetch-Site') === 'same-origin') return true;
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try { return new URL(referer).origin === origin; } catch { return false; }
}

function returnPathOf(url, origin) {
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => key !== 'returnTo') || url.searchParams.getAll('returnTo').length > 1) throw new AuthError('bad_request');
  const returnTo = url.searchParams.get('returnTo') ?? '/';
  let parsed;
  try { parsed = new URL(returnTo, origin); } catch { throw new AuthError('bad_request'); }
  if (parsed.origin !== origin || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new AuthError('bad_request');
  return '/';
}

export function createWorkerHandler(env, {
  fetchImpl = fetch, clock = Date.now, random = opaqueId,
  callObject = (name, payload) => callAuthObject(env, name, payload),
} = {}) {
  const object = (name, payload) => callObject(name, payload);

  async function start(request, settings, crypt) {
    if (!sameOriginStart(request, settings.origin)) throw new AuthError('forbidden');
    const returnPath = returnPathOf(new URL(request.url), settings.origin);
    const state = random();
    const preauth = random();
    const transaction = await object(`transaction:${state}`, {
      kind: 'transaction', operation: 'create', args: { state, cookieDigest: await crypt.digestCookie(preauth), returnPath },
    });
    let authorizationUrl;
    try {
      authorizationUrl = await buildGoogleAuthorizationUrl({ clientId: settings.clientId, redirectUri: settings.redirectUri, transaction });
    } catch {
      await object(`transaction:${state}`, {
        kind: 'transaction', operation: 'consume', args: { state, cookieDigest: transaction.cookieDigest },
      }).catch(() => {});
      throw new AuthError('auth_unavailable');
    }
    return redirect(authorizationUrl, [cookie(PREAUTH_COOKIE, preauth, 600)]);
  }

  async function callback(request, settings, crypt) {
    const url = new URL(request.url);
    const state = callbackState(url);
    const preauth = readCookie(request, PREAUTH_COOKIE);
    const transaction = await object(`transaction:${state}`, {
      kind: 'transaction', operation: 'consume',
      args: { state, cookieDigest: preauth ? await crypt.digestCookie(preauth) : null },
    });
    const { code, error } = exactCallbackParameters(url, state);
    if (error) throw new AuthError('transaction_invalid');
    const verified = await exchangeGoogleAuthorizationCode({
      code, transaction, clientId: settings.clientId, clientSecret: settings.clientSecret,
      redirectUri: settings.redirectUri, fetchImpl, clock,
    });
    const account = await crypt.deriveAccountKey(verified.iss, verified.sub);
    const established = await object(`account:${account}`, {
      kind: 'account', operation: 'establish', args: {
        account,
        verified: { account, accessToken: verified.accessToken, expiresAt: verified.expiresAt, refreshToken: verified.refreshToken },
      },
    });
    try {
      const sessionIndex = await crypt.sessionIndexKey(established.sessionId);
      await object(`session:${sessionIndex}`, {
        kind: 'session-index', operation: 'set', args: { accountKey: account, expiresAt: clock() + SESSION_ABSOLUTE_MS },
      });
    } catch {
      await object(`account:${account}`, {
        kind: 'account', operation: 'logout', args: { account, input: { sessionId: established.sessionId } },
      }).catch(() => {});
      throw new AuthError('auth_unavailable');
    }
    return redirect(transaction.returnPath, [expire(PREAUTH_COOKIE), cookie(SESSION_COOKIE, established.sessionId, SESSION_MAX_AGE)]);
  }

  async function sessionHandler(request, settings, crypt) {
    const handler = createAuthHandler({
      origin: settings.origin,
      resolveSession: async sessionId => {
        const indexKey = await crypt.sessionIndexKey(sessionId);
        const route = await object(`session:${indexKey}`, { kind: 'session-index', operation: 'get', args: {} });
        if (!route?.accountKey || !/^[A-Za-z0-9_-]{43}$/u.test(route.accountKey)) return null;
        const invoke = (operation, input) => object(`account:${route.accountKey}`, {
          kind: 'account', operation, args: { account: route.accountKey, input },
        });
        const removeIndex = () => object(`session:${indexKey}`, { kind: 'session-index', operation: 'delete', args: {} }).catch(() => {});
        return {
          credential: input => invoke('credential', input),
          logout: async input => { const result = await invoke('logout', input); await removeIndex(); return result; },
          disconnect: async input => { const result = await invoke('disconnect', input); await removeIndex(); return result; },
        };
      },
    });
    return handler(request);
  }

  return async function handle(request) {
    const url = new URL(request.url);
    if (![START_PATH, CALLBACK_PATH].includes(url.pathname) && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const callbackRequest = url.pathname === CALLBACK_PATH;
    let callbackRecoveryOrigin = null;
    try {
      const settings = config(env);
      if (url.origin !== settings.origin) throw new AuthError('forbidden');
      const crypt = createAuthCrypto(env);
      await crypt.ready();
      if (callbackRequest) callbackRecoveryOrigin = settings.origin;
      if (url.pathname === START_PATH) {
        if (request.method !== 'GET') throw new AuthError('bad_request');
        return await start(request, settings, crypt);
      }
      if (url.pathname === CALLBACK_PATH) {
        if (request.method !== 'GET') throw new AuthError('bad_request');
        return await callback(request, settings, crypt);
      }
      if (!['/api/session/credential', '/api/session/logout', '/api/account/disconnect'].includes(url.pathname)) throw new AuthError('not_found');
      return await sessionHandler(request, settings, crypt);
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'auth_unavailable';
      if (callbackRequest && callbackRecoveryOrigin && CALLBACK_RECOVERY_ERRORS.has(code)) {
        const target = new URL('/', callbackRecoveryOrigin);
        target.searchParams.set('authError', code);
        return redirect(target.href, [expire(PREAUTH_COOKIE)]);
      }
      return errorResponse(code, callbackRequest ? [expire(PREAUTH_COOKIE)] : []);
    }
  };
}

export default { fetch(request, env) { return createWorkerHandler(env)(request); } };
