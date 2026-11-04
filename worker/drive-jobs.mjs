import { AuthError, fail } from '../auth/session-owner.mjs';

// Server-side trash/move queue (D139). The page only submits file IDs; this
// owner keeps running from Durable Object alarms after the page closes.
// One file is the same contract as the browser path: read before, one PATCH,
// independent read after. An interrupted send is only ever re-read, never re-sent.
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_FIELDS = 'id,parents,trashed,version,driveId,mimeType,resourceKey,capabilities(canTrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren)';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ID_PATTERN = /^[A-Za-z0-9_-]{4,200}$/u;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DAY = 86_400_000;

// Workers Free allows 50 subrequests per alarm invocation; one file costs three.
export const ALARM_SUBREQUEST_BUDGET = 46;
const FILE_SUBREQUESTS = 3;
const BATCH_FILES = Math.floor(ALARM_SUBREQUEST_BUDGET / FILE_SUBREQUESTS);
const CONCURRENCY = 4; // Same as the browser's BULK_ACTION_CONCURRENCY.
const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_ATTEMPTS = 8;
export const MAX_CHUNK_FILES = 500;
const MAX_PENDING_FILES = 50_000;
const RESULT_PAGE = 500;
const NEXT_BATCH_MS = 100;
const RATE_LIMIT_DELAY_MS = 30_000;
const TRANSIENT_DELAY_MS = 15_000;
const AUTH_DELAY_MS = 60_000;
// Cloudflare fails storage writes for the rest of the UTC day once the free row
// limit is exhausted; there is no paid overflow, so the queue waits instead.
const STORAGE_FAILURE_DELAY_MS = 3_600_000;
const RETAIN_FINISHED_MS = DAY;
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
const RESULT_COLUMN = { confirmed: 'confirmed', skipped: 'skipped' };

class DriveReadFailure extends Error {
  constructor(kind, status) { super(kind); this.kind = kind; this.status = status; }
}

function validId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
function optionalKey(value) { return value == null || (typeof value === 'string' && value.length <= 256); }

function normalizeFile(file) {
  if (!file || typeof file !== 'object' || !validId(file.id) || !optionalKey(file.resourceKey)
    || !optionalKey(file.version) || (file.parents != null && (!Array.isArray(file.parents) || file.parents.length > 16
      || !file.parents.every(validId)))) fail('bad_request');
  return { id: file.id, parents: file.parents ? [...file.parents].sort() : null,
    version: file.version ?? null, resourceKey: file.resourceKey ?? null };
}

function metadata(value, id) {
  if (!value || (value.id !== id && id !== 'root') || typeof value.trashed !== 'boolean') throw new DriveReadFailure('uncertain', 0);
  const parents = value.parents ?? (value.mimeType === FOLDER_MIME ? [] : null);
  if (!Array.isArray(parents)) throw new DriveReadFailure('uncertain', 0);
  return { id: value.id, parents: [...parents].sort(), trashed: value.trashed, version: value.version ?? null,
    driveId: value.driveId || null, mimeType: value.mimeType || '', resourceKey: value.resourceKey || null,
    capabilities: value.capabilities || {} };
}

function matches(job, after) {
  if (job.action === 'trash') return after.trashed === true;
  return !after.trashed && after.parents.length === 1 && after.parents[0] === job.resolved_target_id;
}

function sameState(before, after) {
  return before.trashed === after.trashed && before.driveId === after.driveId
    && JSON.stringify(before.parents) === JSON.stringify(after.parents)
    && (before.version == null || before.version === after.version);
}

async function rateLimited(response) {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().json();
    return (body?.error?.errors || []).some(item => RATE_LIMIT_REASONS.has(item?.reason));
  } catch { return false; }
}

export class DriveJobOwner {
  // access(rejectedRevision) returns { accessToken, revision } or throws AuthError.
  // Workers rejects fetch called as a method (Illegal invocation), so the default stays a plain call.
  constructor({ sql, transaction, access, fetchImpl = (...args) => fetch(...args), clock = Date.now }) {
    Object.assign(this, { sql, transaction, access, fetchImpl, clock, retryAt: 0, rejectedRevision: null, lastFailure: null });
    sql.exec(`CREATE TABLE IF NOT EXISTS drive_jobs (id TEXT PRIMARY KEY, action TEXT NOT NULL, target_id TEXT,
      target_name TEXT, target_resource_key TEXT, chunks INTEGER NOT NULL, total INTEGER NOT NULL,
      confirmed INTEGER NOT NULL, skipped INTEGER NOT NULL, failed INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS drive_job_items (seq INTEGER PRIMARY KEY, job_id TEXT NOT NULL,
      file_id TEXT NOT NULL, parents TEXT, version TEXT, resource_key TEXT, state TEXT NOT NULL,
      attempts INTEGER NOT NULL, before_json TEXT)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS drive_job_results (seq INTEGER PRIMARY KEY, job_id TEXT NOT NULL,
      file_id TEXT NOT NULL, state TEXT NOT NULL, status INTEGER NOT NULL, parents TEXT, finished_at INTEGER NOT NULL)`);
  }

  rows(query, ...bindings) { return this.sql.exec(query, ...bindings).toArray(); }
  count(query, ...bindings) { return Number(this.rows(query, ...bindings)[0]?.value ?? 0); }
  hasWork() { return this.rows('SELECT seq FROM drive_job_items LIMIT 1').length > 0; }
  nextRunAt() { return this.hasWork() ? Math.max(this.clock(), this.retryAt) : null; }

  enqueue({ jobId, action, chunk, target, files } = {}) {
    if (!JOB_ID_PATTERN.test(jobId || '') || !['trash', 'move'].includes(action) || !Number.isSafeInteger(chunk) || chunk < 0
      || !Array.isArray(files) || !files.length || files.length > MAX_CHUNK_FILES) fail('bad_request');
    if (action === 'move' ? (!target || !validId(target.id) || !optionalKey(target.name) || !optionalKey(target.resourceKey)) : target != null) fail('bad_request');
    const normalized = files.map(normalizeFile);
    if (new Set(normalized.map(file => file.id)).size !== normalized.length) fail('bad_request');
    if (this.count('SELECT COUNT(*) AS value FROM drive_job_items') + normalized.length > MAX_PENDING_FILES) fail('bad_request');
    const now = this.clock();
    return this.transaction(() => {
      const [job] = this.rows('SELECT action, target_id, chunks FROM drive_jobs WHERE id = ?', jobId);
      if (job && (job.action !== action || job.target_id !== (target?.id ?? null))) fail('bad_request');
      // A resent chunk is the retry of a lost response.
      if (job && chunk < job.chunks) return { accepted: 0 };
      if ((job?.chunks ?? 0) !== chunk) fail('bad_request');
      if (job) this.sql.exec('UPDATE drive_jobs SET chunks = chunks + 1, total = total + ?, updated_at = ? WHERE id = ?', normalized.length, now, jobId);
      else {
        this.sql.exec(`INSERT INTO drive_jobs (id, action, target_id, target_name, target_resource_key, chunks, total,
          confirmed, skipped, failed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, 0, 0, 0, ?, ?)`,
        jobId, action, target?.id ?? null, target?.name ?? null, target?.resourceKey ?? null, normalized.length, now, now);
      }
      for (const file of normalized) {
        this.sql.exec(`INSERT INTO drive_job_items (job_id, file_id, parents, version, resource_key, state, attempts)
          VALUES (?, ?, ?, ?, ?, 'pending', 0)`, jobId, file.id, file.parents ? JSON.stringify(file.parents) : null, file.version, file.resourceKey);
      }
      return { accepted: normalized.length };
    });
  }

  status({ after = 0, includePending = false } = {}) {
    if (!Number.isSafeInteger(after) || after < 0 || typeof includePending !== 'boolean') fail('bad_request');
    const jobs = this.rows('SELECT * FROM drive_jobs ORDER BY created_at').map(job => ({
      id: job.id, action: job.action, targetId: job.target_id, targetName: job.target_name, total: job.total,
      confirmed: job.confirmed, skipped: job.skipped, failed: job.failed, updatedAt: job.updated_at,
      pending: job.total - job.confirmed - job.skipped - job.failed,
    }));
    const results = this.rows('SELECT * FROM drive_job_results WHERE seq > ? ORDER BY seq LIMIT ?', after, RESULT_PAGE).map(row => ({
      seq: row.seq, jobId: row.job_id, fileId: row.file_id, state: row.state, status: row.status,
      parents: row.parents ? JSON.parse(row.parents) : null,
    }));
    const value = { jobs, results, moreResults: results.length === RESULT_PAGE, lastFailure: this.lastFailure };
    if (includePending) {
      value.pendingFiles = this.rows('SELECT job_id, file_id FROM drive_job_items ORDER BY seq')
        .map(row => ({ jobId: row.job_id, fileId: row.file_id }));
    }
    return value;
  }

  // Only files that were not sent yet can be taken back.
  cancel({ jobId = null } = {}) {
    if (jobId !== null && !JOB_ID_PATTERN.test(jobId)) fail('bad_request');
    const now = this.clock();
    const scope = jobId === null ? '' : ' AND job_id = ?';
    const bindings = jobId === null ? [] : [jobId];
    return this.transaction(() => {
      const pending = this.rows(`SELECT job_id, COUNT(*) AS value FROM drive_job_items WHERE state = 'pending'${scope} GROUP BY job_id`, ...bindings);
      this.sql.exec(`INSERT INTO drive_job_results (job_id, file_id, state, status, finished_at)
        SELECT job_id, file_id, 'cancelled', 0, ? FROM drive_job_items WHERE state = 'pending'${scope}`, now, ...bindings);
      this.sql.exec(`DELETE FROM drive_job_items WHERE state = 'pending'${scope}`, ...bindings);
      let cancelled = 0;
      for (const row of pending) {
        cancelled += row.value;
        this.sql.exec('UPDATE drive_jobs SET failed = failed + ?, updated_at = ? WHERE id = ?', row.value, now, row.job_id);
      }
      return { cancelled };
    });
  }

  clear() {
    this.transaction(() => {
      this.sql.exec('DELETE FROM drive_job_items');
      this.sql.exec('DELETE FROM drive_job_results');
      this.sql.exec('DELETE FROM drive_jobs');
    });
    this.retryAt = 0;
  }

  finish(item, state, status = 0, parents = null) {
    const now = this.clock();
    this.transaction(() => {
      this.sql.exec('DELETE FROM drive_job_items WHERE seq = ?', item.seq);
      this.sql.exec('INSERT INTO drive_job_results (job_id, file_id, state, status, parents, finished_at) VALUES (?, ?, ?, ?, ?, ?)',
        item.job_id, item.file_id, state, status, parents ? JSON.stringify(parents) : null, now);
      const column = RESULT_COLUMN[state] || 'failed';
      this.sql.exec(`UPDATE drive_jobs SET ${column} = ${column} + 1, updated_at = ? WHERE id = ?`, now, item.job_id);
    });
  }

  failAll(status) {
    for (const item of this.rows('SELECT * FROM drive_job_items ORDER BY seq')) {
      this.finish(item, item.state === 'submitted' ? 'uncertain' : 'failed', status);
    }
  }

  prune() {
    const cutoff = this.clock() - RETAIN_FINISHED_MS;
    this.transaction(() => {
      this.sql.exec(`DELETE FROM drive_jobs WHERE updated_at < ? AND id NOT IN (SELECT job_id FROM drive_job_items)`, cutoff);
      // The newest row stays so sequence numbers keep rising for open pages.
      this.sql.exec('DELETE FROM drive_job_results WHERE finished_at < ? AND seq < (SELECT MAX(seq) FROM drive_job_results)', cutoff);
    });
  }

  async request(path, token, { method = 'GET', body, resourceKeys } = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (resourceKeys) headers['X-Goog-Drive-Resource-Keys'] = resourceKeys;
    return this.fetchImpl(`${DRIVE_API}/files/${path}`, {
      method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async read(id, token, resourceKey) {
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_FIELDS });
    let response;
    try {
      response = await this.request(`${encodeURIComponent(id)}?${params}`, token,
        { resourceKeys: resourceKey ? `${id}/${resourceKey}` : '' });
    } catch (error) {
      this.lastFailure = `drive read: ${error?.name}: ${error?.message}`;
      throw new DriveReadFailure('transient', 0);
    }
    if (response.ok) {
      try { return metadata(await response.json(), id); } catch { throw new DriveReadFailure('transient', 0); }
    }
    if (response.status === 401) throw new DriveReadFailure('auth', 401);
    if (await rateLimited(response)) throw new DriveReadFailure('rate', response.status);
    this.lastFailure = `drive read ${response.status}`;
    if (response.status >= 500) throw new DriveReadFailure('transient', response.status);
    throw new DriveReadFailure('rejected', response.status);
  }

  async patch(item, job, before, token) {
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id' });
    if (job.action === 'move') {
      params.set('addParents', job.resolved_target_id);
      if (before.parents.length) params.set('removeParents', before.parents.join(','));
    }
    const keys = [before.resourceKey ? `${before.id}/${before.resourceKey}` : '',
      job.target_resource_key ? `${job.resolved_target_id}/${job.target_resource_key}` : ''].filter(Boolean).join(',');
    try {
      const response = await this.request(`${encodeURIComponent(item.file_id)}?${params}`, token,
        { method: 'PATCH', body: job.action === 'trash' ? '{"trashed":true}' : '{}', resourceKeys: keys });
      if (response.ok) return { status: 0, rateLimited: false };
      return { status: response.status, rateLimited: await rateLimited(response) };
    } catch { return { status: 0, rateLimited: false }; }
  }

  // Delays the whole queue. Drive's limits are per account, so other files would hit the same one.
  hold(run, delay) {
    run.halted = true;
    run.delay = Math.max(run.delay, delay);
  }

  deferItem(item, run, failure) {
    if (failure.kind === 'auth') {
      this.rejectedRevision = run.credential.revision;
      this.hold(run, 0);
      return;
    }
    const attempts = item.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.finish(item, item.state === 'submitted' ? 'uncertain' : 'failed', failure.status || 503);
      return;
    }
    this.sql.exec('UPDATE drive_job_items SET attempts = ? WHERE seq = ?', attempts, item.seq);
    this.hold(run, failure.kind === 'rate' ? RATE_LIMIT_DELAY_MS : TRANSIENT_DELAY_MS);
  }

  async verify(item, job, before, patch, run) {
    const after = await this.read(item.file_id, run.credential.accessToken, item.resource_key || before.resourceKey);
    if (matches(job, after)) return this.finish(item, 'confirmed', 0, after.parents);
    if (!sameState(before, after)) return this.finish(item, 'conflict', 0);
    if (patch?.rateLimited && item.attempts + 1 < MAX_ATTEMPTS) {
      // Drive refused the send and the file is unchanged, so this one is not a resend of an unknown result.
      this.sql.exec(`UPDATE drive_job_items SET state = 'pending', attempts = attempts + 1, before_json = NULL WHERE seq = ?`, item.seq);
      return this.hold(run, RATE_LIMIT_DELAY_MS);
    }
    return this.finish(item, patch?.status ? 'failed' : 'uncertain', patch?.status || 0);
  }

  async process(item, job, run) {
    const token = run.credential.accessToken;
    if (job.action === 'move') job.resolved_target_id ??= (await run.target(job)).id;
    if (item.state === 'submitted') {
      // The instance died around the send: read only.
      await this.verify(item, job, JSON.parse(item.before_json), null, run);
      return;
    }
    const before = await this.read(item.file_id, token, item.resource_key);
    const expected = item.parents ? JSON.parse(item.parents) : null;
    if ((item.version && item.version !== before.version)
      || (expected && JSON.stringify(expected) !== JSON.stringify(before.parents))) {
      this.finish(item, 'conflict');
      return;
    }
    if (job.action === 'move') {
      const target = await run.target(job);
      if (target.mimeType !== FOLDER_MIME || target.trashed || target.capabilities.canAddChildren !== true || before.trashed) {
        this.finish(item, 'failed', 403);
        return;
      }
      if (matches(job, before)) { this.finish(item, 'skipped', 0, before.parents); return; }
      const capability = (before.driveId || 'my-drive') === (target.driveId || 'my-drive') ? 'canMoveItemWithinDrive' : 'canMoveItemOutOfDrive';
      if (before.capabilities[capability] !== true) { this.finish(item, 'failed', 403); return; }
    } else {
      if (matches(job, before)) { this.finish(item, 'skipped'); return; }
      if (before.capabilities.canTrash !== true) { this.finish(item, 'failed', 403); return; }
    }
    // Written before the send, so a dead instance can only ever verify it.
    const claimed = this.transaction(() => {
      if (!this.rows(`SELECT seq FROM drive_job_items WHERE seq = ? AND state = 'pending'`, item.seq).length) return false;
      this.sql.exec(`UPDATE drive_job_items SET state = 'submitted', before_json = ? WHERE seq = ?`, JSON.stringify(before), item.seq);
      return true;
    });
    if (!claimed) return; // Cancelled while it was being read.
    item.state = 'submitted';
    await this.verify(item, job, before, await this.patch(item, job, before, token), run);
  }

  // One alarm's worth of files. Throws nothing: every failure becomes a delay or a result.
  async runBatch() {
    try {
      this.retryAt = 0;
      const items = this.rows('SELECT * FROM drive_job_items ORDER BY seq LIMIT ?', BATCH_FILES);
      if (!items.length) { this.prune(); return; }
      let credential;
      try {
        credential = await this.access(this.rejectedRevision);
        this.rejectedRevision = null;
      } catch (error) {
        this.lastFailure = `access: ${error?.code || error?.message}`;
        if (error instanceof AuthError && ['reconnect_required', 'reauthorization_required'].includes(error.code)) this.failAll(401);
        else this.retryAt = this.clock() + AUTH_DELAY_MS;
        return;
      }
      const jobs = new Map(this.rows('SELECT * FROM drive_jobs').map(job => [job.id, job]));
      let budget = ALARM_SUBREQUEST_BUDGET;
      const targets = new Map();
      const run = {
        credential, halted: false, delay: 0,
        target: job => {
          if (!targets.has(job.target_id)) {
            budget -= 1;
            targets.set(job.target_id, this.read(job.target_id, credential.accessToken, job.target_resource_key));
          }
          return targets.get(job.target_id);
        },
      };
      const queue = [...items];
      const worker = async () => {
        while (queue.length && !run.halted && budget >= FILE_SUBREQUESTS) {
          const item = queue.shift();
          budget -= FILE_SUBREQUESTS;
          try { await this.process(item, jobs.get(item.job_id), run); }
          catch (error) {
            if (!(error instanceof DriveReadFailure)) throw error;
            if (error.kind === 'rejected') this.finish(item, item.state === 'submitted' ? 'uncertain' : 'failed', error.status);
            else this.deferItem(item, run, error);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (!this.hasWork()) this.prune();
      this.retryAt = this.clock() + Math.max(run.delay, NEXT_BATCH_MS);
    } catch (error) {
      this.lastFailure = `batch: ${error?.name}: ${error?.message}`;
      this.retryAt = this.clock() + STORAGE_FAILURE_DELAY_MS;
    }
  }
}
