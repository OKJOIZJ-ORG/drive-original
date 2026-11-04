import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AuthError } from '../auth/session-owner.mjs';
import { ALARM_SUBREQUEST_BUDGET, DRIVE_API, DriveJobOwner, MAX_ATTEMPTS, MAX_CHUNK_FILES } from '../worker/drive-jobs.mjs';

const JOB = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '22222222-2222-4222-8222-222222222222';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Durable Object SQL surface over real SQLite, so statements run for real.
function sqliteStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    sql: { exec(query, ...bindings) {
      const statement = db.prepare(query);
      if (/^\s*(SELECT)/iu.test(query)) { const rows = statement.all(...bindings); return { toArray: () => rows.map(row => ({ ...row })) }; }
      statement.run(...bindings);
      return { toArray: () => [] };
    } },
    transaction(callback) {
      db.exec('BEGIN');
      try { const result = callback(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

function driveFixture(files, { failNext = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const id = decodeURIComponent(parsed.pathname.split('/').pop());
    const method = options.method || 'GET';
    calls.push({ method, id, addParents: parsed.searchParams.get('addParents'), removeParents: parsed.searchParams.get('removeParents'), auth: options.headers.Authorization });
    const failure = failNext[method]?.shift();
    if (failure === 'network') throw new TypeError('network');
    if (failure === 'lost-response') { apply(id, parsed, options); throw new TypeError('network'); }
    if (failure) return failure();
    const file = files.get(id);
    if (!file) return Response.json({ error: { code: 404 } }, { status: 404 });
    if (method === 'PATCH') apply(id, parsed, options);
    return Response.json(file);
  };
  function apply(id, parsed, options) {
    const file = files.get(id);
    if (options.body === '{"trashed":true}') file.trashed = true;
    const add = parsed.searchParams.get('addParents');
    if (add) file.parents = [add];
    file.version = String(Number(file.version) + 1);
  }
  return { calls, fetchImpl };
}

const file = (id, extra = {}) => ({ id, parents: ['inbox'], trashed: false, version: '5', mimeType: 'video/mp4',
  capabilities: { canTrash: true, canMoveItemWithinDrive: true, canMoveItemOutOfDrive: true }, ...extra });
const folder = (id, extra = {}) => ({ id, parents: ['root-id'], trashed: false, version: '1', mimeType: FOLDER_MIME,
  capabilities: { canAddChildren: true }, ...extra });
const wanted = (id, extra = {}) => ({ id, parents: ['inbox'], version: '5', ...extra });

function fixture(initial, { failNext, access } = {}) {
  const storage = sqliteStorage();
  const files = new Map(initial.map(item => [item.id, item]));
  const drive = driveFixture(files, { failNext });
  let now = 1_800_000_000_000;
  const owner = new DriveJobOwner({
    sql: storage.sql, transaction: storage.transaction, fetchImpl: drive.fetchImpl, clock: () => now,
    access: access || (async () => ({ accessToken: 'token', revision: 3 })),
  });
  return { owner, files, drive, storage, advance: ms => { now += ms; }, get now() { return now; } };
}

async function drain(owner, advance, limit = 40) {
  for (let i = 0; i < limit && owner.hasWork(); i++) {
    await owner.runBatch();
    if (owner.hasWork()) advance(Math.max(0, owner.nextRunAt() - owner.clock()));
  }
}

test('a trash job confirms each file by an independent read after the single PATCH', async () => {
  const f = fixture([file('aaaaa'), file('bbbbb')]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa'), wanted('bbbbb')] });
  await f.owner.runBatch();
  assert.equal(f.owner.hasWork(), false);
  assert.equal(f.files.get('aaaaa').trashed, true);
  const a = f.drive.calls.filter(call => call.id === 'aaaaa').map(call => call.method);
  assert.deepEqual(a, ['GET', 'PATCH', 'GET']);
  const status = f.owner.status();
  assert.equal(status.jobs[0].confirmed, 2);
  assert.equal(status.jobs[0].pending, 0);
  assert.deepEqual(status.results.map(row => [row.fileId, row.state]).sort(), [['aaaaa', 'confirmed'], ['bbbbb', 'confirmed']]);
});

test('a move replaces the parents and reports the confirmed location', async () => {
  const f = fixture([file('aaaaa'), folder('memories')]);
  f.owner.enqueue({ jobId: JOB, action: 'move', chunk: 0, target: { id: 'memories', name: '추억' }, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  const patch = f.drive.calls.find(call => call.method === 'PATCH');
  assert.equal(patch.addParents, 'memories');
  assert.equal(patch.removeParents, 'inbox');
  const { jobs, results } = f.owner.status();
  assert.equal(jobs[0].targetName, '추억');
  assert.deepEqual(results[0].parents, ['memories']);
  assert.equal(results[0].state, 'confirmed');
});

test('one alarm stays inside the Workers Free subrequest limit and continues in the next alarm', async () => {
  const ids = Array.from({ length: 40 }, (_, index) => `file-${index}`);
  const f = fixture([...ids.map(id => file(id)), folder('memories')]);
  f.owner.enqueue({ jobId: JOB, action: 'move', chunk: 0, target: { id: 'memories' }, files: ids.map(id => wanted(id)) });
  await f.owner.runBatch();
  assert.ok(f.drive.calls.length <= 50, `used ${f.drive.calls.length}`);
  assert.ok(ALARM_SUBREQUEST_BUDGET < 50);
  assert.equal(f.owner.hasWork(), true);
  assert.ok(f.owner.nextRunAt() >= f.now);
  await drain(f.owner, f.advance);
  assert.equal(f.owner.hasWork(), false);
  assert.ok([...f.files.values()].filter(item => item.id !== 'memories').every(item => item.parents[0] === 'memories'));
});

test('a file changed since the list was read is a conflict and is never sent', async () => {
  const f = fixture([file('aaaaa', { version: '6' }), file('bbbbb', { parents: ['elsewhere'] })]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa'), wanted('bbbbb')] });
  await f.owner.runBatch();
  assert.equal(f.drive.calls.some(call => call.method === 'PATCH'), false);
  assert.deepEqual(f.owner.status().results.map(row => row.state), ['conflict', 'conflict']);
  assert.equal(f.owner.status().jobs[0].failed, 2);
});

test('an already finished file is skipped, and missing permission is refused without a send', async () => {
  const f = fixture([file('aaaaa', { trashed: true }), file('bbbbb', { capabilities: { canTrash: false } })]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa'), wanted('bbbbb')] });
  await f.owner.runBatch();
  assert.equal(f.drive.calls.some(call => call.method === 'PATCH'), false);
  assert.deepEqual(f.owner.status().results.map(row => [row.state, row.status]).sort(), [['failed', 403], ['skipped', 0]]);
});

test('a move into a trashed folder is refused', async () => {
  const f = fixture([file('aaaaa'), folder('memories', { trashed: true })]);
  f.owner.enqueue({ jobId: JOB, action: 'move', chunk: 0, target: { id: 'memories' }, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.drive.calls.some(call => call.method === 'PATCH'), false);
  assert.equal(f.owner.status().results[0].status, 403);
});

test('a lost PATCH response is settled by the read, and an unknown send is not repeated', async () => {
  const f = fixture([file('aaaaa'), file('bbbbb')], { failNext: { PATCH: ['lost-response', 'network'] } });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.owner.status().results[0].state, 'confirmed');
  f.owner.enqueue({ jobId: JOB_2, action: 'trash', chunk: 0, files: [wanted('bbbbb')] });
  await f.owner.runBatch();
  assert.equal(f.owner.status().results.at(-1).state, 'uncertain');
  assert.equal(f.drive.calls.filter(call => call.id === 'bbbbb' && call.method === 'PATCH').length, 1);
});

test('an instance that died around the send only verifies on restart', async () => {
  const f = fixture([file('aaaaa')]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  f.storage.sql.exec(`UPDATE drive_job_items SET state = 'submitted', before_json = ?`, JSON.stringify({ id: 'aaaaa', parents: ['inbox'], trashed: false, version: '5', driveId: null }));
  await f.owner.runBatch();
  assert.deepEqual(f.drive.calls.map(call => call.method), ['GET']);
  assert.equal(f.owner.status().results[0].state, 'uncertain');

  const g = fixture([file('bbbbb', { trashed: true })]);
  g.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('bbbbb')] });
  g.storage.sql.exec(`UPDATE drive_job_items SET state = 'submitted', before_json = ?`, JSON.stringify({ id: 'bbbbb', parents: ['inbox'], trashed: false, version: '5', driveId: null }));
  await g.owner.runBatch();
  assert.equal(g.owner.status().results[0].state, 'confirmed');
});

test('a rate-limited send that Drive refused waits and goes out again', async () => {
  const limited = () => Response.json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, { status: 403 });
  const f = fixture([file('aaaaa')], { failNext: { PATCH: [limited] } });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.owner.hasWork(), true);
  assert.ok(f.owner.nextRunAt() >= f.now + 30_000);
  await drain(f.owner, f.advance);
  assert.equal(f.owner.status().results[0].state, 'confirmed');
  assert.equal(f.drive.calls.filter(call => call.method === 'PATCH').length, 2);
});

test('repeated Drive outages give up after the attempt limit instead of looping forever', async () => {
  const outage = () => new Response('down', { status: 503 });
  const f = fixture([file('aaaaa')], { failNext: { GET: Array(20).fill(outage) } });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await drain(f.owner, f.advance);
  assert.equal(f.drive.calls.length, MAX_ATTEMPTS);
  assert.deepEqual(f.owner.status().results.map(row => [row.state, row.status]), [['failed', 503]]);
});

test('a rejected token is refreshed for the next alarm without losing the file', async () => {
  const revisions = [];
  const unauthorized = () => new Response('no', { status: 401 });
  const f = fixture([file('aaaaa')], {
    failNext: { GET: [unauthorized] },
    access: async rejected => { revisions.push(rejected); return { accessToken: `token-${revisions.length}`, revision: 3 + revisions.length }; },
  });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.owner.hasWork(), true);
  await f.owner.runBatch();
  assert.deepEqual(revisions, [null, 4]);
  assert.equal(f.owner.status().results[0].state, 'confirmed');
});

test('a revoked account ends every file instead of retrying forever', async () => {
  const f = fixture([file('aaaaa')], { access: async () => { throw new AuthError('reconnect_required'); } });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.owner.hasWork(), false);
  assert.deepEqual(f.owner.status().results.map(row => [row.state, row.status]), [['failed', 401]]);
});

test('a temporary auth outage and a storage failure only delay the queue', async () => {
  const f = fixture([file('aaaaa')], { access: async () => { throw new AuthError('auth_unavailable'); } });
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.owner.hasWork(), true);
  assert.equal(f.owner.nextRunAt(), f.now + 60_000);

  const g = fixture([file('bbbbb')]);
  g.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('bbbbb')] });
  const exec = g.storage.sql.exec;
  g.storage.sql.exec = (query, ...rest) => { if (/^UPDATE|^DELETE/u.test(query)) throw new Error('row limit'); return exec(query, ...rest); };
  await g.owner.runBatch();
  g.storage.sql.exec = exec;
  assert.equal(g.owner.nextRunAt(), g.now + 3_600_000);
  assert.equal(g.owner.hasWork(), true);
});

test('cancelling takes back only unsent files and returns them as cancelled', async () => {
  const f = fixture([file('aaaaa'), file('bbbbb')]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa'), wanted('bbbbb')] });
  f.storage.sql.exec(`UPDATE drive_job_items SET state = 'submitted', before_json = '{}' WHERE file_id = 'aaaaa'`);
  assert.deepEqual(f.owner.cancel({ jobId: JOB }), { cancelled: 1 });
  const { results, jobs } = f.owner.status();
  assert.deepEqual(results.map(row => [row.fileId, row.state]), [['bbbbb', 'cancelled']]);
  assert.equal(jobs[0].pending, 1);
  assert.equal(f.owner.status({ includePending: true }).pendingFiles[0].fileId, 'aaaaa');
});

test('a file cancelled during its pre-read is not sent', async () => {
  const f = fixture([file('aaaaa')]);
  const original = f.drive.fetchImpl;
  f.owner.fetchImpl = async (...args) => { f.owner.cancel(); return original(...args); };
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  await f.owner.runBatch();
  assert.equal(f.drive.calls.some(call => call.method === 'PATCH'), false);
  assert.equal(f.files.get('aaaaa').trashed, false);
});

test('chunks append in order and a resent chunk adds nothing', () => {
  const f = fixture([]);
  const first = { jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] };
  assert.deepEqual(f.owner.enqueue(first), { accepted: 1 });
  assert.deepEqual(f.owner.enqueue(first), { accepted: 0 });
  assert.deepEqual(f.owner.enqueue({ ...first, chunk: 1, files: [wanted('bbbbb')] }), { accepted: 1 });
  assert.throws(() => f.owner.enqueue({ ...first, chunk: 3 }), AuthError);
  assert.throws(() => f.owner.enqueue({ ...first, chunk: 2, action: 'move', target: { id: 'memories' } }), AuthError);
  assert.equal(f.owner.status().jobs[0].total, 2);
});

test('browser input cannot reach anything but listed file IDs and actions', () => {
  const f = fixture([]);
  const base = { jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] };
  for (const bad of [
    { ...base, action: 'delete' }, { ...base, jobId: '../x' }, { ...base, files: [] },
    { ...base, files: [{ id: 'a/../b' }] }, { ...base, files: [wanted('aaaaa'), wanted('aaaaa')] },
    { ...base, target: { id: 'memories' } }, { ...base, action: 'move' },
    { ...base, files: Array.from({ length: MAX_CHUNK_FILES + 1 }, (_, i) => wanted(`file-${i}`)) },
  ]) assert.throws(() => f.owner.enqueue(bad), AuthError);
  assert.equal(f.owner.status().jobs.length, 0);
});

test('results page by sequence, and old finished rows are pruned without resetting it', async () => {
  const f = fixture([file('aaaaa'), file('bbbbb'), file('ccccc')]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa'), wanted('bbbbb')] });
  await f.owner.runBatch();
  const first = f.owner.status();
  const last = first.results.at(-1).seq;
  assert.equal(f.owner.status({ after: last }).results.length, 0);
  f.advance(2 * 86_400_000);
  f.owner.enqueue({ jobId: JOB_2, action: 'trash', chunk: 0, files: [wanted('ccccc')] });
  await f.owner.runBatch();
  const later = f.owner.status({ after: last });
  assert.deepEqual(later.results.map(row => row.fileId), ['ccccc']);
  assert.deepEqual(later.jobs.map(job => job.id), [JOB_2]);
  assert.ok(later.results[0].seq > last);
  f.owner.clear();
  assert.equal(f.owner.status().jobs.length, 0);
  assert.equal(f.owner.status().results.length, 0);
});

test('Drive is only called on the files API with the account token', async () => {
  const f = fixture([file('aaaaa')]);
  f.owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
  const seen = [];
  const original = f.owner.fetchImpl;
  f.owner.fetchImpl = (url, options) => { seen.push(url); return original(url, options); };
  await f.owner.runBatch();
  assert.ok(seen.every(url => url.startsWith(`${DRIVE_API}/files/aaaaa?`)));
  assert.ok(f.drive.calls.every(call => call.auth === 'Bearer token'));
});

test('the default fetch is not called as a method, which Workers rejects with Illegal invocation', async () => {
  const storage = sqliteStorage();
  const files = new Map([['aaaaa', file('aaaaa')]]);
  const drive = driveFixture(files);
  const original = globalThis.fetch;
  globalThis.fetch = function strictFetch(url, options) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return drive.fetchImpl(url, options);
  };
  try {
    const owner = new DriveJobOwner({ sql: storage.sql, transaction: storage.transaction, access: async () => ({ accessToken: 'token', revision: 1 }) });
    owner.enqueue({ jobId: JOB, action: 'trash', chunk: 0, files: [wanted('aaaaa')] });
    await owner.runBatch();
    assert.equal(owner.status().results[0].state, 'confirmed');
  } finally { globalThis.fetch = original; }
});
