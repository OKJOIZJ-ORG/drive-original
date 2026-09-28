import { REQUESTED_GOOGLE_SCOPES, normalizeGrantedScopes, capabilitiesForScopes } from './scope-policy.mjs';
// Local B-auth contract. The host must supply durable, serializable transactions;
// an eventually consistent KV or a per-process mutex is not a valid adapter.
export const DAY = 86_400_000;
export const SESSION_IDLE_MS = 30 * DAY;
export const SESSION_ABSOLUTE_MS = 90 * DAY;
export const RECOVERY_GRACE_MS = 7 * DAY;
export const ERROR_STATUS = Object.freeze({
  bad_request: 400, forbidden: 403, unauthorized: 401, account_mismatch: 409,
  stale_revision: 409, reconnect_required: 401, reauthorization_required: 401,
  client_update_required: 409, transaction_invalid: 400, auth_unavailable: 503, not_found: 404,
});
export class AuthError extends Error {
  constructor(code) {
    super(Object.hasOwn(ERROR_STATUS, code) ? code : 'auth_unavailable');
    this.name = 'AuthError';
    this.code = this.message;
  }
}
export function fail(code) { throw new AuthError(code); }
export function opaqueId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));
const sessionEnd = s => Math.min(s.createdAt + SESSION_ABSOLUTE_MS, s.lastSeenAt + SESSION_IDLE_MS);
const publicCredential = s => ({ accessToken: s.access.accessToken, expiresAt: s.access.expiresAt, account: s.account, revision: s.revision, capabilities: capabilitiesForScopes(s.access.grantedScopes) });

export class AccountCredentialOwner {
  #flight = null;
  #alarmChain = Promise.resolve();
  constructor({ storage, account, refresh, revoke, encrypt, decrypt, clock = Date.now,
    random = opaqueId, sleep = sleepDefault, hash = digest, scheduleAlarm = async () => {},
    leaseMs = 30_000, refreshTimeoutMs = 20_000, skewMs = 30_000, retryDelayMs = 1_000 }) {
    if (!storage?.transaction || !account || !refresh || !revoke || !encrypt || !decrypt || refreshTimeoutMs >= leaseMs) throw new TypeError('Missing auth adapters or invalid lease');
    Object.assign(this, { storage, account, refresh, revoke, encrypt, decrypt, clock, random, sleep, hash, scheduleAlarm, leaseMs, refreshTimeoutMs, skewMs, retryDelayMs });
  }
  // transaction(fn): atomically reads one mutable state object, commits changes
  // only if fn returns, and returns a detached fn result. fn is synchronous.
  async transact(fn, { verifiedAccessReplacement = false } = {}) {
    try {
      const result = await this.storage.transaction(s => {
        s.account ??= this.account;
        if (s.account !== this.account) fail('account_mismatch');
        s.revision ??= 0;
        s.sessions ??= {};
        // Only a newly verified exchange may repair an old Worker overwrite.
        // Discard the unusable access snapshot, preserving account/revision and
        // encrypted-refresh ownership. Ordinary credentials never take this path.
        if (verifiedAccessReplacement && s.scopePolicyVersion === 1 && s.access
          && s.access.scopeVersion === undefined
          && Object.keys(s.access).sort().join(',') === 'accessToken,expiresAt') delete s.access;
        // v1 durable records were admitted only by the mandatory all-scope validator.
        // Migrate that exact legacy shape once; unknown/new shapes fail closed.
        if (s.access && s.access.scopeVersion === undefined) {
          if (s.scopePolicyVersion !== undefined || Object.keys(s.access).sort().join(',') !== 'accessToken,expiresAt'
            || !s.encryptedRefresh || !Number.isSafeInteger(s.revision) || s.revision < 1) fail('auth_unavailable');
          s.access = { ...s.access, scopeVersion: 1, grantedScopes: [...REQUESTED_GOOGLE_SCOPES] };
        }
        if (s.scopePolicyVersion !== undefined && s.scopePolicyVersion !== 1) fail('auth_unavailable');
        s.scopePolicyVersion = 1;
        if (s.access) {
          if (s.access.scopeVersion !== 1) fail('auth_unavailable');
          s.access.grantedScopes = normalizeGrantedScopes(s.access.grantedScopes);
        }
        return fn(s);
      });
      return result;
    } catch (error) { throw error instanceof AuthError ? error : new AuthError('auth_unavailable'); }
  }
  async reconcileAlarm(candidate) {
    const run = async () => {
      let target = candidate ?? null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try { await this.scheduleAlarm(target); }
        catch { continue; }
        let current;
        try { current = await this.transact(s => s.nextAlarmAt ?? null); }
        catch { return false; }
        if (current === target) return true;
        target = current;
      }
      // Never finish a contested reconciliation with an unchecked stale target:
      // a short, conservative wake-up is safe for every retention state and
      // gives alarm() another chance to install the exact durable deadline.
      try { await this.scheduleAlarm(this.clock() + 1_000); }
      catch { /* The durable nextAlarmAt remains the recovery source. */ }
      return false;
    };
    const queued = this.#alarmChain.then(run, run);
    this.#alarmChain = queued.then(() => undefined, () => undefined);
    return queued;
  }
  prune(s, now) {
    let latestEnd = 0;
    for (const [id, session] of Object.entries(s.sessions)) {
      if (sessionEnd(session) <= now) { latestEnd = Math.max(latestEnd, sessionEnd(session)); delete s.sessions[id]; }
    }
    if (!Object.keys(s.sessions).length && s.encryptedRefresh && s.recoveryAt == null) s.recoveryAt = (latestEnd || now) + RECOVERY_GRACE_MS;
    if (!Object.keys(s.sessions).length && s.recoveryAt != null && s.recoveryAt <= now) {
      delete s.encryptedRefresh; delete s.access; delete s.lease; delete s.recoveryAt;
      s.reconnect = true;
      s.revision++;
    }
    const deadlines = Object.values(s.sessions).map(sessionEnd);
    if (s.recoveryAt != null) deadlines.push(s.recoveryAt);
    s.nextAlarmAt = deadlines.length ? Math.min(...deadlines) : null;
  }
  async alarm() {
    const next = await this.transact(s => { this.prune(s, this.clock()); return s.nextAlarmAt; });
    if (!await this.reconcileAlarm(next)) fail('auth_unavailable');
  }
  // Called only after the host has verified Google's signed OIDC identity,
  // nonce and granted scopes. Browser input must never call this directly.
  async establishVerifiedSession({ account, accessToken, expiresAt, refreshToken, grantedScopes }) {
    if (account !== this.account) fail('account_mismatch');
    if (typeof accessToken !== 'string' || !accessToken || !Number.isFinite(expiresAt) || expiresAt <= this.clock()) fail('bad_request');
    if (refreshToken != null && (typeof refreshToken !== 'string' || !refreshToken)) fail('bad_request');
    try { grantedScopes = normalizeGrantedScopes(grantedScopes); } catch { fail('bad_request'); }
    const encrypted = refreshToken == null ? undefined : await this.encrypt(refreshToken);
    const sessionId = this.random();
    const key = await this.hash(sessionId);
    const now = this.clock();
    const result = await this.transact(s => {
      this.prune(s, now);
      if (encrypted === undefined && (!s.encryptedRefresh || s.reconnect)) fail('reauthorization_required');
      const previous = {
        encryptedRefresh: s.encryptedRefresh,
        access: s.access,
        reconnect: s.reconnect,
        failureUntil: s.failureUntil,
      };
      if (encrypted !== undefined) s.encryptedRefresh = encrypted;
      s.revision++;
      s.access = { accessToken, expiresAt, scopeVersion: 1, grantedScopes };
      s.reconnect = false;
      delete s.lease; delete s.failureUntil; delete s.recoveryAt;
      s.sessions[key] = { createdAt: now, lastSeenAt: now };
      this.prune(s, now);
      return {
        credential: publicCredential(s),
        establishedRevision: s.revision,
        nextAlarmAt: s.nextAlarmAt,
        previous,
      };
    }, { verifiedAccessReplacement: true });
    if (!await this.reconcileAlarm(result.nextAlarmAt)) {
      // A session is not usable until its retention alarm is installed. Undo
      // this establishment's own session even if a newer establishment already
      // advanced the credential revision. Never restore a session map or
      // decrement a revision, because a concurrent logout may already have
      // changed the current set without changing the revision.
      const rollback = await this.transact(s => {
        if (!s.sessions[key]) {
          return { nextAlarmAt: s.nextAlarmAt ?? null };
        }
        delete s.sessions[key];
        const ownsCredentialState = s.revision === result.establishedRevision;
        if (!Object.keys(s.sessions).length) {
          // Alarm service failure shortens recovery rather than silently
          // extending retention with no scheduled cleanup.
          s.revision++;
          delete s.encryptedRefresh; delete s.access; delete s.lease;
          delete s.failureUntil; delete s.recoveryAt;
          s.reconnect = true;
          s.nextAlarmAt = null;
        } else if (ownsCredentialState) {
          s.revision++;
          delete s.lease;
          const restore = (name, value) => {
            if (value === undefined) delete s[name];
            else s[name] = value;
          };
          restore('encryptedRefresh', result.previous.encryptedRefresh);
          restore('access', result.previous.access);
          restore('reconnect', result.previous.reconnect);
          restore('failureUntil', result.previous.failureUntil);
          delete s.recoveryAt;
          this.prune(s, now);
        } else {
          this.prune(s, now);
        }
        return { nextAlarmAt: s.nextAlarmAt ?? null };
      });
      // Existing sessions retain their already-installed earlier alarm. This
      // best-effort reconciliation repairs the exact deadline when possible.
      await this.reconcileAlarm(rollback.nextAlarmAt);
      fail('auth_unavailable');
    }
    return { sessionId, credential: result.credential };
  }
  async credential({ sessionId, expectedAccount, rejectedRevision = null }) {
    if (typeof sessionId !== 'string' || !sessionId) fail('unauthorized');
    if (expectedAccount != null && expectedAccount !== this.account) fail('account_mismatch');
    if (rejectedRevision != null && (!Number.isSafeInteger(rejectedRevision) || rejectedRevision < 0)) fail('bad_request');
    const key = await this.hash(sessionId);
    // Bounded waiting also covers a dead instance's persisted lease.
    const deadline = this.clock() + this.leaseMs * 2;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const now = this.clock();
      const action = await this.transact(s => {
        this.prune(s, now);
        if (!s.sessions[key]) return { error: 'unauthorized', alarm: s.nextAlarmAt };
        if (rejectedRevision != null && rejectedRevision > s.revision) return { error: 'stale_revision' };
        s.sessions[key].lastSeenAt = now;
        this.prune(s, now);
        if (s.reconnect || !s.encryptedRefresh) return { error: 'reconnect_required' };
        if (s.access?.expiresAt > now + this.skewMs && rejectedRevision !== s.revision) return { credential: publicCredential(s) };
        if (s.failureUntil > now) return { error: 'auth_unavailable' };
        if (s.lease?.expiresAt > now) return { wait: Math.min(50, s.lease.expiresAt - now) };
        const lease = { id: this.random(), revision: s.revision, expiresAt: now + this.leaseMs };
        s.lease = lease;
        return { lease, encryptedRefresh: s.encryptedRefresh, grantedScopes: s.access?.grantedScopes };
      });
      if (action.alarm !== undefined) await this.reconcileAlarm(action.alarm);
      if (action.error) fail(action.error);
      if (action.credential) return action.credential;
      if (this.clock() >= deadline) fail('auth_unavailable');
      if (action.wait) {
        if (this.#flight) await this.#flight;
        else await this.sleep(action.wait);
        continue;
      }
      const flight = this.performRefresh(action);
      this.#flight = flight;
      try { await flight; } finally { if (this.#flight === flight) this.#flight = null; }
    }
    fail('auth_unavailable');
  }
  async performRefresh({ lease, encryptedRefresh, grantedScopes }) {
    const abort = new AbortController();
    let timer;
    let response;
    let encrypted;
    let errorCode;
    try {
      // refresh must honor AbortSignal; the host adapter must cap upstream I/O
      // below leaseMs. A revision fence still rejects a late upstream result.
      response = await Promise.race([
        (async () => {
          const refreshToken = await this.decrypt(encryptedRefresh);
          if (abort.signal.aborted) fail('auth_unavailable');
          return this.refresh({ refreshToken, signal: abort.signal });
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new AuthError('auth_unavailable')); }, this.refreshTimeoutMs); }),
      ]);
      if (response?.error === 'invalid_grant') fail('reconnect_required');
      if (!response || typeof response.accessToken !== 'string' || !response.accessToken || !Number.isFinite(response.expiresAt) || response.expiresAt <= this.clock() + this.skewMs) fail('auth_unavailable');
      grantedScopes = normalizeGrantedScopes(Object.hasOwn(response, 'grantedScopes') ? response.grantedScopes : grantedScopes);
      if (response.refreshToken != null) {
        if (typeof response.refreshToken !== 'string' || !response.refreshToken) fail('auth_unavailable');
        encrypted = await this.encrypt(response.refreshToken);
      }
    } catch (error) { errorCode = error?.code === 'invalid_grant' || error?.code === 'reconnect_required' ? 'reconnect_required' : 'auth_unavailable'; }
    finally { clearTimeout(timer); }
    await this.transact(s => {
      if (s.lease?.id !== lease.id || s.revision !== lease.revision) return;
      delete s.lease;
      if (errorCode) {
        if (errorCode === 'reconnect_required') { s.reconnect = true; delete s.access; s.revision++; }
        else s.failureUntil = this.clock() + this.retryDelayMs;
        return;
      }
      if (encrypted !== undefined) s.encryptedRefresh = encrypted;
      s.access = { accessToken: response.accessToken, expiresAt: response.expiresAt, scopeVersion: 1, grantedScopes };
      s.revision++;
      delete s.failureUntil;
    });
  }
  async logout({ sessionId }) {
    if (typeof sessionId !== 'string' || !sessionId) fail('unauthorized');
    const key = await this.hash(sessionId);
    const next = await this.transact(s => {
      this.prune(s, this.clock());
      if (!s.sessions[key]) return s.nextAlarmAt;
      delete s.sessions[key];
      this.prune(s, this.clock());
      return s.nextAlarmAt;
    });
    if (!await this.reconcileAlarm(next)) {
      // Removing the final session can move cleanup from the old 30-day idle
      // alarm to a seven-day grace deadline. If that earlier alarm cannot be
      // installed, discard the credential now rather than retain it too long.
      const fallback = await this.transact(s => {
        this.prune(s, this.clock());
        if (!Object.keys(s.sessions).length && s.encryptedRefresh) {
          delete s.encryptedRefresh; delete s.access; delete s.lease;
          delete s.failureUntil; delete s.recoveryAt;
          s.reconnect = true;
          s.revision++;
          s.nextAlarmAt = null;
        }
        return s.nextAlarmAt ?? null;
      });
      await this.reconcileAlarm(fallback);
    }
    return { loggedOut: true };
  }
  async disconnect({ sessionId, expectedAccount }) {
    if (expectedAccount !== this.account) fail('account_mismatch');
    if (typeof sessionId !== 'string' || !sessionId) fail('unauthorized');
    const key = await this.hash(sessionId);
    const result = await this.transact(s => {
      this.prune(s, this.clock());
      if (!s.sessions[key]) return { error: 'unauthorized' };
      const encryptedRefresh = s.encryptedRefresh;
      s.sessions = {}; s.revision++; s.reconnect = true; s.nextAlarmAt = null;
      delete s.encryptedRefresh; delete s.access; delete s.lease; delete s.recoveryAt; delete s.failureUntil;
      return { encryptedRefresh };
    });
    if (result.error) fail(result.error);
    await this.reconcileAlarm(null);
    let revoked = false;
    const abort = new AbortController();
    let timer;
    try {
      if (result.encryptedRefresh) revoked = await Promise.race([
        (async () => {
          const refreshToken = await this.decrypt(result.encryptedRefresh);
          if (abort.signal.aborted) return false;
          return (await this.revoke({ refreshToken, signal: abort.signal })) === true;
        })(),
        new Promise(resolve => { timer = setTimeout(() => { abort.abort(); resolve(false); }, this.refreshTimeoutMs); }),
      ]);
    } catch { /* No secret retained for retry. */ }
    finally { clearTimeout(timer); }
    return { disconnected: true, revocation: revoked ? 'confirmed' : 'inconclusive', ...(revoked ? {} : { manualRevocationUrl: 'https://myaccount.google.com/permissions' }) };
  }
}
