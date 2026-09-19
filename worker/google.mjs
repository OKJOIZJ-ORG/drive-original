import { AuthError } from '../auth/session-owner.mjs';
import { base64urlDecode, sha256Base64url } from './crypto.mjs';

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
export const REQUIRED_GOOGLE_SCOPES = Object.freeze([
  'openid',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.appdata',
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = code => { throw new AuthError(code); };
const report = (diagnostic, stage) => {
  if (typeof diagnostic !== 'function') return;
  try { diagnostic(stage); } catch {}
};

function tokenRejectionStage(body) {
  if (body?.error === 'invalid_grant') return 'google_token_invalid_grant';
  if (['invalid_client', 'unauthorized_client', 'deleted_client'].includes(body?.error)) return 'google_token_invalid_client';
  return 'google_token_rejected';
}

async function readBoundedJson(response, maximum = 32_768) {
  const reader = response.body?.getReader();
  if (!reader) fail('auth_unavailable');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); fail('auth_unavailable'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = JSON.parse(decoder.decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('auth_unavailable');
    return parsed;
  } catch (error) { throw error instanceof AuthError ? error : new AuthError('auth_unavailable'); }
  finally { reader.releaseLock(); }
}

function parseJwtPart(value) {
  try {
    const parsed = JSON.parse(decoder.decode(base64urlDecode(value, { min: 2, max: 16_384 })));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('auth_unavailable');
    return parsed;
  } catch (error) { throw error instanceof AuthError ? error : new AuthError('auth_unavailable'); }
}

function safeTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

async function loadJwks(fetchImpl, signal) {
  let response;
  try { response = await fetchImpl(GOOGLE_JWKS_ENDPOINT, { method: 'GET', signal, redirect: 'error', headers: { Accept: 'application/json' } }); }
  catch { fail('auth_unavailable'); }
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail('auth_unavailable');
  const body = await readBoundedJson(response, 64_000);
  if (!Array.isArray(body.keys) || body.keys.length > 20) fail('auth_unavailable');
  return body;
}

export async function verifyGoogleIdToken({ idToken, clientId, nonce, fetchImpl = fetch, clock = Date.now, jwks, signal }) {
  if (typeof idToken !== 'string' || idToken.length > 16_384) fail('auth_unavailable');
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) fail('auth_unavailable');
  const header = parseJwtPart(parts[0]);
  const claims = parseJwtPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/u.test(header.kid)) fail('auth_unavailable');
  const keySet = jwks ?? await loadJwks(fetchImpl, signal);
  const matches = keySet.keys.filter(key => key?.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
  if (matches.length !== 1) fail('auth_unavailable');
  let key;
  let signature;
  try {
    key = await crypto.subtle.importKey('jwk', matches[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    signature = base64urlDecode(parts[2], { min: 64, max: 1024 });
  } catch { fail('auth_unavailable'); }
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, encoder.encode(`${parts[0]}.${parts[1]}`))) fail('auth_unavailable');

  const now = Math.floor(clock() / 1000);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== clientId ||
    (claims.azp != null && claims.azp !== clientId) ||
    !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
    !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 || claims.iat < now - 660 ||
    !safeTextEqual(claims.nonce, nonce) || typeof claims.sub !== 'string' || !/^[\x20-\x7e]{1,255}$/u.test(claims.sub)) {
    fail('auth_unavailable');
  }
  // Google documents both issuer spellings. Canonicalize them before deriving
  // the account key so one subject cannot split into two account owners.
  return { iss: 'https://accounts.google.com', sub: claims.sub };
}

export async function buildGoogleAuthorizationUrl({ clientId, redirectUri, transaction }) {
  if (typeof clientId !== 'string' || !clientId || typeof redirectUri !== 'string' ||
    !transaction || typeof transaction.state !== 'string' || typeof transaction.pkceVerifier !== 'string' || typeof transaction.nonce !== 'string') {
    throw new TypeError('Invalid Google authorization input');
  }
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: REQUIRED_GOOGLE_SCOPES.join(' '),
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await sha256Base64url(transaction.pkceVerifier),
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  }).toString();
  return url.toString();
}

function validateTokenResponse(body, clock) {
  const granted = typeof body.scope === 'string' ? new Set(body.scope.split(/\s+/u).filter(Boolean)) : new Set();
  if (!REQUIRED_GOOGLE_SCOPES.every(scope => granted.has(scope)) || body.token_type !== 'Bearer' ||
    typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 8192 ||
    !Number.isSafeInteger(body.expires_in) || body.expires_in < 60 || body.expires_in > 86_400 ||
    typeof body.id_token !== 'string' || !body.id_token ||
    (body.refresh_token != null && (typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 8192))) {
    fail('auth_unavailable');
  }
  return {
    accessToken: body.access_token,
    expiresAt: clock() + body.expires_in * 1000,
    refreshToken: body.refresh_token,
    idToken: body.id_token,
  };
}

export async function exchangeGoogleAuthorizationCode({
  code, transaction, clientId, clientSecret, redirectUri,
  fetchImpl = fetch, clock = Date.now, jwks, diagnostic,
}) {
  if (typeof code !== 'string' || !code || code.length > 2048 || typeof clientSecret !== 'string' || !clientSecret) fail('bad_request');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let response;
    try {
      response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
          grant_type: 'authorization_code', code_verifier: transaction.pkceVerifier,
        }),
      });
    } catch {
      report(diagnostic, 'google_token_fetch_failed');
      fail('auth_unavailable');
    }
    if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      report(diagnostic, 'google_token_response_invalid');
      fail('auth_unavailable');
    }
    let body;
    try { body = await readBoundedJson(response); }
    catch (error) {
      report(diagnostic, 'google_token_response_invalid');
      throw error;
    }
    if (!response.ok) {
      report(diagnostic, tokenRejectionStage(body));
      fail('auth_unavailable');
    }
    let tokens;
    try { tokens = validateTokenResponse(body, clock); }
    catch (error) {
      report(diagnostic, 'google_token_payload_invalid');
      throw error;
    }
    let identity;
    try {
      identity = await verifyGoogleIdToken({
        idToken: tokens.idToken, clientId, nonce: transaction.nonce, fetchImpl, clock, jwks, signal: controller.signal,
      });
    } catch (error) {
      report(diagnostic, 'google_id_token_invalid');
      throw error;
    }
    return { ...identity, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, refreshToken: tokens.refreshToken };
  } finally { clearTimeout(timer); }
}

export async function refreshGoogleAccess({ refreshToken, clientId, clientSecret, signal, fetchImpl = fetch, clock = Date.now }) {
  let response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
  } catch { fail('auth_unavailable'); }
  if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail('auth_unavailable');
  const body = await readBoundedJson(response);
  if (!response.ok) return body.error === 'invalid_grant' ? { error: 'invalid_grant' } : fail('auth_unavailable');
  const granted = body.scope == null ? null : typeof body.scope === 'string' ? new Set(body.scope.split(/\s+/u).filter(Boolean)) : new Set();
  if (body.token_type !== 'Bearer' || typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 8192 ||
    !Number.isSafeInteger(body.expires_in) || body.expires_in < 60 || body.expires_in > 86_400 ||
    (granted && !REQUIRED_GOOGLE_SCOPES.every(scope => granted.has(scope))) ||
    (body.refresh_token != null && (typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 8192))) fail('auth_unavailable');
  return { accessToken: body.access_token, expiresAt: clock() + body.expires_in * 1000, refreshToken: body.refresh_token };
}

export async function revokeGoogleRefresh({ refreshToken, signal, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ token: refreshToken }),
    });
    return response.ok;
  } catch { return false; }
}
