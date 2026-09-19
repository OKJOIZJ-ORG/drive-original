import { AuthError, AccountCredentialOwner, SESSION_ABSOLUTE_MS } from '../auth/session-owner.mjs';
import { PreAuthTransactionOwner } from '../auth/transaction-owner.mjs';
import { createAuthCrypto } from './crypto.mjs';
import { refreshGoogleAccess, revokeGoogleRefresh } from './google.mjs';

const STATE_SLOT = 'core';
const encoder = new TextEncoder();

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

export class CloudflareSqliteState {
  constructor(storage) { this.storage = storage; }
  initialize() {
    this.storage.sql.exec('CREATE TABLE IF NOT EXISTS auth_state (slot TEXT PRIMARY KEY, json TEXT NOT NULL)');
  }
  async transaction(callback) {
    return this.storage.transactionSync(() => {
      const rows = this.storage.sql.exec('SELECT json FROM auth_state WHERE slot = ?', STATE_SLOT).toArray();
      const state = rows.length ? JSON.parse(rows[0].json) : {};
      const result = callback(state);
      if (result && typeof result.then === 'function') throw new TypeError('Durable transaction callback must be synchronous');
      const serialized = JSON.stringify(state);
      if (encoder.encode(serialized).byteLength > 512_000) throw new TypeError('Durable state exceeds adapter bound');
      this.storage.sql.exec(
        'INSERT INTO auth_state (slot, json) VALUES (?, ?) ON CONFLICT(slot) DO UPDATE SET json = excluded.json',
        STATE_SLOT, serialized,
      );
      return clone(result);
    });
  }
}

async function readJson(request) {
  if (request.method !== 'POST' || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new AuthError('bad_request');
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > 16_384) throw new AuthError('bad_request');
  const text = await request.text();
  if (encoder.encode(text).byteLength > 16_384) throw new AuthError('bad_request');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AuthError('bad_request'); }
}

function response(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export class AuthObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = new CloudflareSqliteState(ctx.storage);
    const initialize = () => this.state.initialize();
    this.ready = ctx.blockConcurrencyWhile ? ctx.blockConcurrencyWhile(initialize) : Promise.resolve(initialize());
  }

  scheduleAlarm = async at => {
    if (at == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  };

  accountOwner(account) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(account)) throw new AuthError('bad_request');
    const crypt = createAuthCrypto(this.env);
    return new AccountCredentialOwner({
      storage: this.state, account,
      refresh: input => refreshGoogleAccess({ ...input, clientId: this.env.GOOGLE_CLIENT_ID, clientSecret: this.env.GOOGLE_CLIENT_SECRET }),
      revoke: input => revokeGoogleRefresh(input),
      encrypt: value => crypt.encryptRefresh(value, account),
      decrypt: value => crypt.decryptRefresh(value, account),
      scheduleAlarm: this.scheduleAlarm,
    });
  }

  transactionOwner(state) {
    if (!/^[A-Za-z0-9_-]{43,128}$/u.test(state)) throw new AuthError('bad_request');
    return new PreAuthTransactionOwner({ storage: this.state, state, scheduleAlarm: this.scheduleAlarm, allowedReturnPaths: ['/'] });
  }

  async sessionIndex(operation, args = {}) {
    if (operation === 'set') {
      if (!/^[A-Za-z0-9_-]{43}$/u.test(args.accountKey) || !Number.isFinite(args.expiresAt) ||
        args.expiresAt <= Date.now() || args.expiresAt > Date.now() + SESSION_ABSOLUTE_MS + 60_000) throw new AuthError('bad_request');
      await this.state.transaction(state => { state.index = { accountKey: args.accountKey, expiresAt: args.expiresAt }; });
      try { await this.scheduleAlarm(args.expiresAt); }
      catch {
        await this.state.transaction(state => { delete state.index; });
        throw new AuthError('auth_unavailable');
      }
      return { indexed: true };
    }
    if (operation === 'get') {
      const result = await this.state.transaction(state => {
        if (!state.index || state.index.expiresAt <= Date.now()) { delete state.index; return null; }
        return clone(state.index);
      });
      if (!result) await this.scheduleAlarm(null);
      return result;
    }
    if (operation === 'delete') {
      await this.state.transaction(state => { delete state.index; });
      await this.scheduleAlarm(null);
      return { deleted: true };
    }
    throw new AuthError('bad_request');
  }

  async fetch(request) {
    await this.ready;
    try {
      const body = await readJson(request);
      if (body.kind === 'transaction') {
        const owner = this.transactionOwner(body.args?.state);
        if (body.operation === 'create') return response({ ok: true, value: await owner.create({ cookieDigest: body.args.cookieDigest, returnPath: body.args.returnPath }) });
        if (body.operation === 'consume') return response({ ok: true, value: await owner.consume({ state: body.args.state, cookieDigest: body.args.cookieDigest }) });
      } else if (body.kind === 'account') {
        const owner = this.accountOwner(body.args?.account);
        if (body.operation === 'establish') return response({ ok: true, value: await owner.establishVerifiedSession(body.args.verified) });
        if (body.operation === 'credential') return response({ ok: true, value: await owner.credential(body.args.input) });
        if (body.operation === 'logout') return response({ ok: true, value: await owner.logout(body.args.input) });
        if (body.operation === 'disconnect') return response({ ok: true, value: await owner.disconnect(body.args.input) });
      } else if (body.kind === 'session-index') {
        return response({ ok: true, value: await this.sessionIndex(body.operation, body.args) });
      }
      throw new AuthError('bad_request');
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'auth_unavailable';
      const allowed = new Set(['bad_request', 'unauthorized', 'account_mismatch', 'stale_revision', 'reconnect_required', 'reauthorization_required', 'transaction_invalid', 'auth_unavailable']);
      return response({ ok: false, errorCode: allowed.has(code) ? code : 'auth_unavailable' });
    }
  }

  async alarm() {
    await this.ready;
    const kind = await this.state.transaction(state => state.record ? 'transaction' : state.index ? 'session-index' : state.account ? 'account' : 'empty');
    if (kind === 'transaction') {
      const state = await this.state.transaction(current => current.record?.state);
      if (state) await this.transactionOwner(state).alarm(true);
    } else if (kind === 'session-index') {
      await this.state.transaction(state => { delete state.index; });
      await this.scheduleAlarm(null);
    } else if (kind === 'account') {
      const account = await this.state.transaction(state => state.account);
      await this.accountOwner(account).alarm();
    } else await this.scheduleAlarm(null);
  }
}
