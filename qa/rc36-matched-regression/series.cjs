'use strict';

// QA only. No runner import: importing it would execute its preparation mode.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const CANDIDATE = '051dc3456f5000b958a18593848769b3687991e5';
const BASELINE = '2c2b1244bee0f1a5e500318c83c6e126c5124e34';
const PILOT = 'actual-pair-2026-10-02T155324878Z-22080-d5efaf.json';
const PINS = Object.freeze({
  pilot: '602eaeb8534ba4ab43cb2ce67db9a165514bad49e2db659bc6c13fb7b1c2a8d2',
  runner: 'dc113aaf9b00cf4e1793a6e25e3e809be07e73ca786bd7ab4c3b8ff558701772',
  preparation: 'b283a465f47e9a0ce5214b9e21e5c591d673e7a30cd0324d6575fe9998555084',
  fixture: 'd9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037',
  playwright: '8bc2ddebe8d9b051b9ecb87d62c6c63877e59d08617f32c3215681ca8bb70998',
  playwrightCore: 'f061c58427e47e843e26d201f0a57076c734e57c734ecbbd87d4a23b7a20db9b',
});
const PHASES = Object.freeze(['cold app and Q0 first native frame',
  'normal track menu, AAC 2 selection, and current Q1 frame', 'Q1 seek to 2 seconds',
  'Q1 seek to terminal frame near 6 seconds']);
const TOTAL = 20, NEW_PAIRS = 19, OUTER_MS = 80000, OUTPUT_BYTES = 16384;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const LIMITATIONS = [
  'Finite generated six-second AVC/AAC/subtitle fixture and synthetic read-only provider only; no real Drive/account, physical device, production, strict RGBA, broad color, broad goal, or population p95 guarantee.',
  'Fixed rc35-before-rc37 order is unchanged; order bias, process scheduling and thermal drift are uncontrolled. Historical pilot predates the 19 new pairs.',
  'Each release has a fresh-context cold cache. Seeks reuse that current context and are warm session seeks, not broad warm-resume evidence.',
  'Qualified-sample empirical median/p95 are descriptive. Failed and timeout attempts remain in counts and records; they are not silently removed or replaced.',
  'Bootstrap intervals condition on observed qualified pairs and an IID resampling assumption that fixed order, drift and the historical pilot may violate; they do not establish statistical certainty.',
];
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function binding(file, expected) {
  const bytes = fs.readFileSync(file), sha256 = hash(bytes);
  assert.equal(sha256, expected, `SHA binding mismatch: ${file}`);
  return { file, bytes: bytes.length, sha256 };
}
function reserve(dir, prefix) {
  for (;;) {
    const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}.json`;
    const file = path.join(dir, name);
    try { const fd = fs.openSync(file, 'wx'); fs.closeSync(fd); return file; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}
function persist(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function qualify(r, prep) {
  assert.equal(r.schema, 'drive-original.matched-regression-actual-pair/2');
  assert.equal(r.candidateRef, CANDIDATE);
  assert.equal(r.driverBinding?.sha256, PINS.runner);
  assert.equal(r.dependencyBinding?.sha256, PINS.playwright);
  assert.equal(r.fixture?.sha256, PINS.fixture);
  assert.equal(r.browserVersion, '154.0.8037.59');
  for (const key of ['actualAccount', 'physicalDevice', 'normalChromeProfile', 'production']) assert.equal(r[key], false);
  assert.equal(r.status, 'COMPLETE_SCOPED');
  assert(!r.failure && !r.totalPairTimeout);
  assert.equal(r.browserClosed, true);
  assert.equal(r.ownedBrowserProcessExited, true);
  assert.equal(r.adjudication?.baselineAdmitted, true);
  assert.equal(r.adjudication?.candidateAdmitted, true);
  assert.equal(r.adjudication?.scopedPair, 'PASS_SCOPED_COLOR_TUPLE_AND_SEEK_ONLY');
  for (const key of ['sameFixtureSha', 'sameBrowser', 'sameSyntheticMetadata', 'sameActionSequence',
    'bothCacheCold', 'sameQ0Target', 'candidateQ0Q1SameMappedTarget', 'sameQ0NativeTupleAcrossReleases', 'candidateMatchesBaselineQ0Tuple']) assert.equal(r.comparison?.[key], true);
  assert.equal(r.releases?.length, 2);
  r.releases.forEach((release, index) => {
    const expected = prep.releases[index];
    assert.equal(release.commit, index === 0 ? BASELINE : CANDIDATE);
    assert.equal(release.version, expected.version);
    assert.equal(release.release, expected.label);
    assert.equal(release.browserVersion, r.browserVersion);
    assert.equal(release.cacheMode, 'fresh-context-cold');
    assert.equal(release.fixture?.sha256, PINS.fixture);
    assert.equal(release.status, 'CLOSED');
    assert(!release.failure && !release.unexpectedMutation && !release.budgetExceeded);
    assert.equal(release.noPageErrors, true);
    assert.equal(release.contextClosed, true);
    assert.equal(release.server?.closed, true);
    assert.equal(release.server?.assetHashesMatched, true);
    const cleanup = release.cleanup;
    assert(cleanup && !cleanup.failure);
    for (const key of ['q0Owner', 'q1Owner', 'tracksOwner', 'sourceAttached']) assert.equal(cleanup[key], false);
    assert.equal(cleanup.q1Settled, true); assert.equal(cleanup.tracksSettled, true);
    assert.equal(cleanup.activeOwnedWorkers, 0);
    assert.equal(cleanup.totalWorkersCreated, cleanup.terminateCalls);
    assert.equal(release.phases?.length, PHASES.length);
    release.phases.forEach((phase, p) => {
      assert.equal(phase.name, PHASES[p]); assert.equal(phase.passed, true);
      assert.equal(phase.appVersionBefore, expected.version); assert.equal(phase.appVersionAfter, expected.version);
      assert(Number.isFinite(phase.elapsedMs) && phase.elapsedMs >= 0);
    });
  });
  return r.releases.map(release => release.phases.map(phase => phase.elapsedMs));
}
function checkBindings() {
  const bindings = {
    pilot: binding(path.join(__dirname, PILOT), PINS.pilot),
    runner: binding(path.join(__dirname, 'runner.cjs'), PINS.runner),
    preparation: binding(path.join(__dirname, 'preparation-result.json'), PINS.preparation),
    fixture: binding(path.join(root, 'qa/fm05-controlled-diagnostic/subtitle.mp4'), PINS.fixture),
    playwright: binding(require.resolve('playwright/package.json'), PINS.playwright),
    playwrightCore: binding(require.resolve('playwright-core/package.json'), PINS.playwrightCore),
  };
  const prep = readJson(bindings.preparation.file), pilot = readJson(bindings.pilot.file);
  assert.equal(prep.actualExecuted, false); assert.equal(prep.browserLaunched, false);
  assert.equal(prep.candidateRef, CANDIDATE); assert.equal(prep.driverBinding.sha256, PINS.runner);
  assert.equal(prep.dependencyBinding.sha256, PINS.playwright);
  assert.deepEqual(prep.releases.map(r => r.commit), [BASELINE, CANDIDATE]);
  // Prove source identity and fixture equality without executing runtime code.
  for (const release of prep.releases) {
    for (const asset of release.assets) {
      const body = cp.execFileSync('git', ['-C', root, 'show', `${release.commit}:${asset.file}`], { maxBuffer: 64 * 1024 * 1024 });
      assert.equal(hash(body), asset.sha256, `Pinned asset mismatch: ${release.commit}:${asset.file}`);
    }
    const fixture = cp.execFileSync('git', ['-C', root, 'show', `${release.commit}:qa/fm05-controlled-diagnostic/subtitle.mp4`], { maxBuffer: 1024 * 1024 });
    assert.equal(hash(fixture), PINS.fixture);
  }
  qualify(pilot, prep);
  bindings.series = { file: __filename, sha256: hash(fs.readFileSync(__filename)) };
  return { bindings, prep, pilot };
}
function prepare() {
  const checked = checkBindings();
  const file = reserve(__dirname, 'series-preparation');
  const result = { schema: 'drive-original.matched-series-preparation/1', preparedAt: new Date().toISOString(),
    actualExecuted: false, browserLaunched: false, accountOrDeviceUsed: false,
    bindings: checked.bindings, targetAttempts: TOTAL, preservedPilot: PILOT, newPairs: NEW_PAIRS,
    exactChildCommand: [process.execPath, 'runner.cjs', '--run', '--candidate', CANDIDATE],
    limits: { outerPairMs: OUTER_MS, runnerPairMs: 60000, stdoutAndStderrBytes: OUTPUT_BYTES,
      maximumSerialRuntimeMs: NEW_PAIRS * (OUTER_MS + 2000), simultaneousChildren: 1,
      serialBudgetMeaning: 'Sum of child deadline and reap budgets only; excludes synchronous statistics, binding checks and I/O overhead. This is not an absolute wrapper watchdog guarantee.' },
    stopRule: 'Stop on the first timeout, nonzero exit, missing/ambiguous receipt, failed qualification or unconfirmed cleanup. Never retry or replace; remaining attempts are unattempted.',
    limitations: LIMITATIONS, verification: 'Fixed binding and pilot qualification PASS; no Chrome launch or new actual pair.' };
  persist(file, result); return { file, sha256: hash(fs.readFileSync(file)), result };
}
function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (q === .5) { const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}
function bootstrap(deltas) {
  if (deltas.length < 2) return null;
  let seed = 0x50305;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const means = [], medians = [];
  for (let b = 0; b < 5000; b++) {
    const sample = deltas.map(() => deltas[Math.floor(random() * deltas.length)]);
    means.push(sample.reduce((a, x) => a + x, 0) / sample.length); medians.push(quantile(sample, .5));
  }
  return { method: 'Deterministic paired bootstrap percentile 2.5%–97.5%; 5000 resamples, xorshift32 seed 0x50305; conditional IID sensitivity only.',
    meanDeltaMs: [quantile(means, .025), quantile(means, .975)], medianDeltaMs: [quantile(medians, .025), quantile(medians, .975)] };
}
function statistics(attempts) {
  const qualified = attempts.filter(a => a.state === 'QUALIFIED');
  const terminal = attempts.filter(a => ['QUALIFIED', 'FAILED_OR_UNQUALIFIED', 'SPAWN_FAILED', 'OUTER_TIMEOUT'].includes(a.state));
  const unknownCount = terminal.length - qualified.length;
  const counts = { target: TOTAL, attempted: attempts.filter(a => a.state !== 'UNATTEMPTED').length,
    qualified: qualified.length, failedOrUnqualified: attempts.filter(a => ['FAILED_OR_UNQUALIFIED', 'SPAWN_FAILED'].includes(a.state)).length,
    timeouts: attempts.filter(a => a.state === 'OUTER_TIMEOUT').length,
    inProgress: attempts.filter(a => a.state === 'STARTED').length, unattempted: attempts.filter(a => a.state === 'UNATTEMPTED').length };
  return { counts, quantileMethod: 'Empirical p95: nearest rank ceil(0.95*n); median: middle or mean of two middle values. Qualified pairs only; counts include failures/timeouts.',
    phases: PHASES.map((name, index) => {
      const baseline = qualified.map(a => a.phaseElapsedMs[0][index]);
      const candidate = qualified.map(a => a.phaseElapsedMs[1][index]);
      const deltas = candidate.map((value, i) => value - baseline[i]);
      const describe = values => ({ n: values.length, medianMs: quantile(values, .5), empiricalP95Ms: quantile(values, .95) });
      const bounds = values => {
        const low = [...values, ...Array(unknownCount).fill(0)];
        const high = [...values, ...Array(unknownCount).fill(Infinity)];
        const bound = q => {
          const lower = quantile(low, q), upper = quantile(high, q);
          return { lowerMs: lower, upperMs: Number.isFinite(upper) ? upper : null,
            upperStatus: !terminal.length ? 'NOT_ESTIMABLE' : Number.isFinite(upper) ? 'FINITE' : 'UNBOUNDED' };
        };
        return { median: bound(.5), empiricalP95: bound(.95) };
      };
      return { name, baseline: describe(baseline), candidate: describe(candidate),
        failureInclusive: { terminalAttemptedPairs: terminal.length, admittedFinitePairs: qualified.length,
          unknownOrCensoredPairs: unknownCount, excludedUnattemptedPairs: counts.unattempted,
          excludedStartedPairs: counts.inProgress,
          method: 'Sensitivity/gate quantile bounds over all terminal attempted pairs: admitted pair supplies measured duration; each failed/unqualified/spawn/timeout pair supplies unknown/censored duration, bounded by 0 and +Infinity. These endpoints are not physical latency imputations. Any measured partial phase in an unqualified pair remains unadmitted. Same empirical median/p95 definition as qualified descriptions.',
          baseline: bounds(baseline), candidate: bounds(candidate) },
        pairedDelta: { direction: 'candidate minus baseline', observationsMs: deltas,
          meanMs: deltas.length ? deltas.reduce((a, x) => a + x, 0) / deltas.length : null,
          medianMs: quantile(deltas, .5), interval: bootstrap(deltas) } };
    }) };
}
function collectReceipts(dir, pid, before) {
  return fs.readdirSync(dir).filter(name => !before.has(name) && name.startsWith('actual-pair-')
    && name.includes(`-${pid}-`) && name.endsWith('.json')).map(name => {
    const file = path.join(dir, name), bytes = fs.readFileSync(file);
    let receipt, parseError;
    try { receipt = JSON.parse(bytes); } catch (error) { parseError = error.message; }
    return { file: name, sha256: hash(bytes), receipt, parseError };
  });
}
async function executeChild(attempt, save, options = {}) {
  const dir = options.dir || __dirname, spawn = options.spawn || cp.spawn;
  const before = new Set(fs.readdirSync(dir)), started = Date.now();
  const child = spawn(process.execPath, [path.join(__dirname, 'runner.cjs'), '--run', '--candidate', CANDIDATE],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  attempt.childPid = child.pid ?? null; attempt.childCommand = [process.execPath, 'runner.cjs', '--run', '--candidate', CANDIDATE];
  save();
  return new Promise(resolve => {
    let settled = false, bytes = 0, output = Buffer.alloc(0), outerTimer, reapTimer;
    const finish = (code, signal, error, timeout = false) => {
      if (settled) return; settled = true; clearTimeout(outerTimer); clearTimeout(reapTimer);
      attempt.elapsedMs = Date.now() - started; attempt.exitCode = code; attempt.signal = signal;
      attempt.output = output.toString('utf8'); attempt.outputTruncated = bytes > OUTPUT_BYTES;
      attempt.outputBytesObserved = bytes;
      if (error) attempt.processError = error.message;
      attempt.outerTimeout = timeout || attempt.outerTimeout === true;
      attempt.childExitObserved = code !== null || signal !== null;
      attempt.cleanupConfirmed = false;
      if (attempt.outerTimeout) {
        attempt.state = 'OUTER_TIMEOUT';
        attempt.censoring = { kind: 'right-censored outer pair duration', lowerBoundMs: options.timeoutMs || OUTER_MS,
          phaseDurations: 'Unknown for incomplete phases; do not impute or treat as zero.' };
        attempt.cleanupUncertainty = 'Killing this exact child Node PID does not prove Chrome/server teardown. Root-owned exact process evidence is required before any further pair.';
      } else attempt.state = error ? 'SPAWN_FAILED' : 'FAILED_OR_UNQUALIFIED';
      try { attempt.receiptReferences = collectReceipts(dir, child.pid, before); }
      catch (error) { attempt.receiptReadError = error.message; attempt.receiptReferences = []; }
      const records = attempt.receiptReferences;
      if (records.length === 1) {
        const r = records[0].receipt;
        attempt.runnerStatus = r?.status; attempt.runnerFailure = r?.failure ?? null;
        // A partial timeout receipt is referenced but cannot qualify even if later rewritten.
        if (!attempt.outerTimeout && !error && code === 0) {
          try { attempt.phaseElapsedMs = qualify(r, options.prep); attempt.state = 'QUALIFIED'; attempt.cleanupConfirmed = true; }
          catch (error) { attempt.qualificationFailure = error.message; }
        }
      } else attempt.qualificationFailure = `Expected exactly one PID-bound new receipt; observed ${records.length}`;
      attempt.receiptReferences = records.map(({ receipt, ...reference }) => reference);
      save(); resolve(attempt);
    };
    const receive = data => { const buffer = Buffer.from(data); bytes += buffer.length;
      if (output.length < OUTPUT_BYTES) output = Buffer.concat([output, buffer.subarray(0, OUTPUT_BYTES - output.length)]); };
    child.stdout?.on('data', receive); child.stderr?.on('data', receive);
    child.on('error', error => finish(null, null, error));
    child.on('exit', (code, signal) => finish(code, signal));
    outerTimer = setTimeout(() => {
      attempt.outerTimeout = true; attempt.exactChildNodeKillRequested = true;
      attempt.killRequestedAt = new Date().toISOString();
      try { attempt.killRequestAccepted = child.kill('SIGKILL'); } catch (error) { attempt.killFailure = error.message; }
      save(); reapTimer = setTimeout(() => finish(null, null, null, true), options.reapMs || 2000);
    }, options.timeoutMs || OUTER_MS);
  });
}
async function runSeries(options = {}) {
  const checked = options.checked || checkBindings(), dir = options.dir || __dirname;
  const lock = path.join(dir, 'series-active.lock');
  const lockFd = fs.openSync(lock, 'wx');
  let file, result;
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ wrapperPid: process.pid, startedAt: new Date().toISOString(),
      recovery: 'Never remove an uncertain-cleanup lock without exact root-owned process evidence.' }));
    file = reserve(dir, 'series-result');
    result = { schema: 'drive-original.matched-series/1', status: 'RESERVED_BEFORE_CHILD_LAUNCH',
      startedAt: new Date().toISOString(), bindings: checked.bindings, targetAttempts: TOTAL,
      limitations: LIMITATIONS, attempts: Array.from({ length: TOTAL }, (_, i) => ({ number: i + 1, state: 'UNATTEMPTED' })) };
    const save = () => { result.statistics = statistics(result.attempts); persist(file, result); };
    const pilot = result.attempts[0];
    Object.assign(pilot, { state: 'QUALIFIED', historicalPilot: true, cleanupConfirmed: true,
      receiptReferences: [{ file: PILOT, sha256: PINS.pilot }], phaseElapsedMs: qualify(checked.pilot, checked.prep),
      startedAt: checked.pilot.startedAt, elapsedMs: checked.pilot.elapsedMs });
    save(); // Unique result, pilot and all unattempted slots persisted before spawn.
    for (let i = 1; i < TOTAL; i++) {
      const attempt = result.attempts[i]; attempt.state = 'STARTED'; attempt.startedAt = new Date().toISOString();
      result.status = 'RUNNING_SERIAL'; save();
      try { await (options.execute || executeChild)(attempt, save, { dir, prep: checked.prep }); }
      catch (error) { attempt.state = 'FAILED_OR_UNQUALIFIED'; attempt.failure = error.message; attempt.cleanupConfirmed = false; save(); }
      if (attempt.state !== 'QUALIFIED' || attempt.cleanupConfirmed !== true) {
        result.status = 'STOPPED_ON_FIRST_FAILURE_OR_UNCERTAINTY'; result.stopAtAttempt = attempt.number; break;
      }
    }
    if (result.attempts.every(a => a.state === 'QUALIFIED')) result.status = 'COMPLETE_CONTROLLED_DISTRIBUTION';
    result.completedAt = new Date().toISOString(); save();
    return { file, result };
  } finally {
    fs.closeSync(lockFd);
    // Preserve the lock on timeout/unconfirmed cleanup or unexpected wrapper failure.
    if (result && result.attempts.filter(a => a.state !== 'UNATTEMPTED').every(a => a.cleanupConfirmed === true)) fs.unlinkSync(lock);
  }
}
module.exports = { PINS, PILOT, PHASES, CANDIDATE, checkBindings, prepare, qualify, quantile, statistics, executeChild, runSeries };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--prepare', '--run'].includes(arg)) || (args.includes('--prepare') && args.includes('--run'))) {
    console.error('Use no arguments/--prepare, or explicitly --run; identities and n=20 are fixed.'); process.exitCode = 1;
  } else if (args.includes('--run')) runSeries().then(({ file, result }) => {
    console.log(`${result.status} ${file}`); if (result.status !== 'COMPLETE_CONTROLLED_DISTRIBUTION') process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
  else { const result = prepare(); console.log(`PREPARED_NO_RUNTIME ${result.file} SHA256 ${result.sha256}`); }
}
