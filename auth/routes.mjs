import { AuthError, ERROR_STATUS, fail, opaqueId } from './session-owner.mjs';

export const SESSION_COOKIE = '__Host-drive_original_session';
export const PREAUTH_COOKIE = '__Host-drive_original_oauth';
const cookie = (name, value, maxAge) => `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const expire = name => cookie(name, '', 0);
function readCookie(request, name) {
  const found = (request.headers.get('Cookie') || '').split(';').map(p => p.trim()).filter(p => p.startsWith(`${name}=`));
  if (found.length !== 1) return null;
  const value = found[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null;
}
function json(value, status = 200, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
}
async function bodyOf(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail('bad_request');
  // Read incrementally; Content-Length is attacker-controlled and request.text()
  // would allocate the entire body before checking its size.
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); fail('bad_request'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('bad_request');
    return body;
  } catch (error) { throw error instanceof AuthError ? error : new AuthError('bad_request'); }
  finally { reader.releaseLock(); }
}
function fields(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('bad_request');
}

// No default live provider is supplied. resolveSession must route an opaque
// application session to its account owner without trusting request account IDs.
// transactions routes random state IDs to isolated transaction owners. Its
// create/consume methods return server-only records, never browser payloads.
// digestCookie MUST be a keyed digest. buildAuthorizationUrl applies approved
// client/redirect/scopes and PKCE S256. exchangeVerified verifies code + Google
// signature/iss/aud/exp/iat/nonce/sub/scopes BEFORE establishing a session.
export function createAuthHandler({ origin, resolveSession, transactions,
  digestCookie, buildAuthorizationUrl, exchangeVerified, random = opaqueId }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new TypeError('Exact HTTPS origin required');
  return async function handle(request) {
    let clearPreauth = false;
    try {
      const url = new URL(request.url);
      if (url.origin !== origin || request.headers.get('Origin') !== origin ||
        request.headers.get('X-Drive-Original-CSRF') !== '1' ||
        request.headers.get('Sec-Fetch-Site') !== 'same-origin' ||
        !['cors', 'same-origin'].includes(request.headers.get('Sec-Fetch-Mode')) ||
        request.headers.get('Sec-Fetch-Dest') !== 'empty') fail('forbidden');
      if (request.method !== 'POST' || url.search) fail('bad_request');
      if (!['/api/session/credential', '/api/session/logout', '/api/account/disconnect', '/api/auth/transaction/create', '/api/auth/transaction/consume'].includes(url.pathname)) fail('not_found');
      // These POST transaction endpoints are local contract fixtures, not the
      // cross-site Google GET callback. A production GET adapter must enforce
      // exact callback URL and state/cookie binding instead of this fetch gate.
      clearPreauth = url.pathname === '/api/auth/transaction/consume';
      const body = await bodyOf(request);
      if (url.pathname === '/api/auth/transaction/create') {
        fields(body, ['returnPath']);
        if (!transactions || !digestCookie || !buildAuthorizationUrl) fail('auth_unavailable');
        const preauth = random();
        const record = await transactions.create({ cookieDigest: await digestCookie(preauth), returnPath: body.returnPath });
        try {
          const authorizationUrl = await buildAuthorizationUrl(record);
          const target = new URL(authorizationUrl);
          if (target.origin !== 'https://accounts.google.com' || target.protocol !== 'https:') fail('auth_unavailable');
          return json({ authorizationUrl }, 200, [cookie(PREAUTH_COOKIE, preauth, 600)]);
        } catch {
          await transactions.consume({ state: record.state, cookieDigest: record.cookieDigest });
          fail('auth_unavailable');
        }
      }
      if (url.pathname === '/api/auth/transaction/consume') {
        if (!transactions || !digestCookie) fail('auth_unavailable');
        const preauth = readCookie(request, PREAUTH_COOKIE);
        // Consume even with a missing cookie so this attempted flow is terminal.
        const record = await transactions.consume({ state: body.state, cookieDigest: preauth ? await digestCookie(preauth) : null });
        fields(body, ['state', 'code']);
        if (!exchangeVerified) fail('auth_unavailable');
        if (typeof body.code !== 'string' || !body.code || body.code.length > 2048) fail('bad_request');
        const result = await exchangeVerified({ code: body.code, transaction: record });
        if (!/^[A-Za-z0-9_-]{32,256}$/.test(result?.sessionId) || typeof result?.account !== 'string' || !result.account) fail('auth_unavailable');
        return json({ authenticated: true, account: result.account }, 200, [expire(PREAUTH_COOKIE), cookie(SESSION_COOKIE, result.sessionId, 90 * 86400)]);
      }
      fields(body, url.pathname === '/api/session/credential' ? ['expectedAccount', 'rejectedRevision'] : url.pathname === '/api/account/disconnect' ? ['expectedAccount'] : []);
      const sessionId = readCookie(request, SESSION_COOKIE);
      if (!sessionId) fail('unauthorized');
      const owner = await resolveSession(sessionId);
      if (!owner) fail('unauthorized');
      if (url.pathname === '/api/session/credential') return json(await owner.credential({ sessionId, expectedAccount: body.expectedAccount, rejectedRevision: body.rejectedRevision }));
      if (url.pathname === '/api/session/logout') return json(await owner.logout({ sessionId }), 200, [expire(SESSION_COOKIE)]);
      return json(await owner.disconnect({ sessionId, expectedAccount: body.expectedAccount }), 200, [expire(SESSION_COOKIE)]);
    } catch (error) {
      const code = error instanceof AuthError && Object.hasOwn(ERROR_STATUS, error.code) ? error.code : 'auth_unavailable';
      return json({ error: { code, retryable: code === 'auth_unavailable' } }, ERROR_STATUS[code], clearPreauth ? [expire(PREAUTH_COOKIE)] : []);
    }
  };
}
