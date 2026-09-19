import { AuthError, fail, opaqueId } from './session-owner.mjs';

export const TRANSACTION_TTL_MS = 600_000;
export class PreAuthTransactionOwner {
  #alarmChain = Promise.resolve();
  constructor({ storage, state, clock = Date.now, random = opaqueId, scheduleAlarm = async () => {}, allowedReturnPaths = ['/'] }) {
    if (state != null && !/^[A-Za-z0-9_-]{43,128}$/.test(state)) throw new TypeError('Opaque transaction state required');
    Object.assign(this, { storage, state, clock, random, scheduleAlarm, allowedReturnPaths });
  }
  async transact(fn) {
    try { return await this.storage.transaction(fn); }
    catch (error) { throw error instanceof AuthError ? error : new AuthError('auth_unavailable'); }
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
      try { await this.scheduleAlarm(this.clock() + 1_000); }
      catch { /* The durable nextAlarmAt remains the recovery source. */ }
      return false;
    };
    const queued = this.#alarmChain.then(run, run);
    this.#alarmChain = queued.then(() => undefined, () => undefined);
    return queued;
  }
  async create({ cookieDigest, returnPath = '/' }) {
    if (typeof cookieDigest !== 'string' || !cookieDigest || !this.allowedReturnPaths.includes(returnPath) || !returnPath.startsWith('/') || returnPath.startsWith('//')) fail('bad_request');
    const now = this.clock();
    const record = { state: this.state ?? this.random(), pkceVerifier: this.random(), nonce: this.random(), cookieDigest, returnPath, createdAt: now, expiresAt: now + TRANSACTION_TTL_MS };
    await this.transact(s => {
      if (s.record && s.record.expiresAt > now) fail('transaction_invalid');
      s.record = record;
      s.nextAlarmAt = record.expiresAt;
    });
    if (!await this.reconcileAlarm(record.expiresAt)) {
      await this.transact(s => { for (const key of Object.keys(s)) delete s[key]; });
      await this.reconcileAlarm(null);
      fail('auth_unavailable');
    }
    // Server-only return: a route must never serialize this secret-bearing record.
    return record;
  }
  async consume({ state, cookieDigest }) {
    const record = await this.transact(s => {
      const record = s.record;
      for (const key of Object.keys(s)) delete s[key];
      if (!record || record.expiresAt <= this.clock() || record.state !== state || record.cookieDigest !== cookieDigest) return null;
      return record;
    });
    await this.reconcileAlarm(null);
    if (!record) fail('transaction_invalid');
    return record;
  }
  async alarm(force = false) {
    const next = await this.transact(s => {
      if (force || !s.record || s.record.expiresAt <= this.clock()) {
        for (const key of Object.keys(s)) delete s[key];
        return null;
      }
      return s.record.expiresAt;
    });
    if (!await this.reconcileAlarm(next)) fail('auth_unavailable');
  }
}
