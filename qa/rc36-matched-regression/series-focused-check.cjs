'use strict';

// Local deterministic mocks only. Never runs runner.cjs or starts Chrome.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const series = require('./series.cjs');
const pilot = JSON.parse(fs.readFileSync(path.join(__dirname, series.PILOT)));
const prep = JSON.parse(fs.readFileSync(path.join(__dirname, 'preparation-result.json')));
const clone = value => JSON.parse(JSON.stringify(value));
async function main() {
  const dir = fs.mkdtempSync(path.join(__dirname, 'series-mock-'));
  let checks = 0;
  try {
    assert.throws(() => series.qualify({ ...clone(pilot), ownedBrowserProcessExited: false }, prep)); checks++;
    const bad = clone(pilot); bad.releases[1].cleanup.activeOwnedWorkers = 1;
    assert.throws(() => series.qualify(bad, prep)); checks++;
    function mockSpawn({ code = 0, timeout = false, receipt = pilot, oversized = false } = {}) {
      return (command, args, options) => {
        assert.equal(command, process.execPath);
        assert.deepEqual(args.slice(1), ['--run', '--candidate', series.CANDIDATE]);
        assert.equal(options.stdio[0], 'ignore');
        const child = new EventEmitter(); child.pid = 424242;
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.kill = () => { setImmediate(() => child.emit('exit', null, 'SIGKILL')); return true; };
        setImmediate(() => {
          if (receipt) fs.writeFileSync(path.join(dir, `actual-pair-mock-${child.pid}-test.json`), JSON.stringify(receipt));
          child.stdout.emit('data', Buffer.alloc(oversized ? 32768 : 8, 65));
          if (!timeout) child.emit('exit', code, null);
        });
        return child;
      };
    }
    async function attempt(config) {
      const file = path.join(dir, 'actual-pair-mock-424242-test.json');
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const row = { state: 'STARTED' }; let saves = 0;
      await series.executeChild(row, () => saves++, { dir, prep, spawn: mockSpawn(config), timeoutMs: 15, reapMs: 10 });
      assert(saves >= 2); return row;
    }
    const pass = await attempt({ oversized: true });
    assert.equal(pass.state, 'QUALIFIED'); assert.equal(pass.cleanupConfirmed, true);
    assert.equal(Buffer.byteLength(pass.output), 16384); assert.equal(pass.outputTruncated, true);
    assert.match(pass.receiptReferences[0].sha256, /^[a-f0-9]{64}$/); checks++;
    const nonzero = await attempt({ code: 1 });
    assert.equal(nonzero.state, 'FAILED_OR_UNQUALIFIED'); assert.equal(nonzero.exitCode, 1); checks++;
    const timeout = await attempt({ timeout: true, receipt: { status: 'RESERVED_BEFORE_BROWSER_LAUNCH' } });
    assert.equal(timeout.state, 'OUTER_TIMEOUT'); assert.equal(timeout.cleanupConfirmed, false);
    assert.equal(timeout.childExitObserved, true); assert.equal(timeout.childPid, 424242);
    assert.equal(timeout.censoring.lowerBoundMs, 15); assert.match(timeout.cleanupUncertainty, /does not prove Chrome/); checks++;
    let launches = 0, active = 0, maximum = 0;
    const checked = { bindings: { mocked: true }, pilot, prep };
    const success = await series.runSeries({ dir, checked, execute: async (row, save) => {
      launches++; active++; maximum = Math.max(maximum, active);
      Object.assign(row, { state: 'QUALIFIED', cleanupConfirmed: true, phaseElapsedMs: series.qualify(pilot, prep) });
      await new Promise(resolve => setImmediate(resolve)); active--; save();
    } });
    assert.equal(launches, 19); assert.equal(maximum, 1);
    assert.equal(success.result.statistics.counts.qualified, 20);
    assert.equal(success.result.attempts[0].receiptReferences[0].sha256, series.PINS.pilot);
    assert.equal(success.result.statistics.phases[0].pairedDelta.interval.meanDeltaMs.length, 2); checks++;
    for (const phase of success.result.statistics.phases) {
      assert.equal(phase.failureInclusive.terminalAttemptedPairs, 20);
      assert.equal(phase.failureInclusive.unknownOrCensoredPairs, 0);
      for (const release of ['baseline', 'candidate']) {
        const inclusive = phase.failureInclusive[release];
        assert.equal(inclusive.median.lowerMs, phase[release].medianMs);
        assert.equal(inclusive.median.upperMs, phase[release].medianMs);
        assert.equal(inclusive.empiricalP95.lowerMs, phase[release].empiricalP95Ms);
        assert.equal(inclusive.empiricalP95.upperMs, phase[release].empiricalP95Ms);
        assert.equal(inclusive.empiricalP95.upperStatus, 'FINITE');
      }
    } checks++;
    const mixed = series.statistics([{ state: 'QUALIFIED', phaseElapsedMs: [[10, 10, 10, 10], [20, 20, 20, 20]] },
      { state: 'FAILED_OR_UNQUALIFIED' }, { state: 'SPAWN_FAILED' }, { state: 'OUTER_TIMEOUT' },
      { state: 'STARTED' }, { state: 'UNATTEMPTED' }]).phases[0].failureInclusive;
    assert.equal(mixed.terminalAttemptedPairs, 4); assert.equal(mixed.unknownOrCensoredPairs, 3);
    assert.equal(mixed.excludedStartedPairs, 1); assert.equal(mixed.excludedUnattemptedPairs, 1);
    assert.deepEqual(mixed.baseline.median, { lowerMs: 0, upperMs: null, upperStatus: 'UNBOUNDED' });
    assert.deepEqual(mixed.baseline.empiricalP95, { lowerMs: 10, upperMs: null, upperStatus: 'UNBOUNDED' });
    assert.deepEqual(mixed.candidate.empiricalP95, { lowerMs: 20, upperMs: null, upperStatus: 'UNBOUNDED' }); checks++;
    const stop = await series.runSeries({ dir, checked, execute: async (row, save) => {
      Object.assign(row, { ...timeout, number: row.number }); save();
    } });
    assert.equal(stop.result.stopAtAttempt, 2);
    assert.deepEqual(stop.result.statistics.counts, { target: 20, attempted: 2, qualified: 1,
      failedOrUnqualified: 0, timeouts: 1, inProgress: 0, unattempted: 18 });
    assert(fs.existsSync(path.join(dir, 'series-active.lock')));
    await assert.rejects(series.runSeries({ dir, checked, execute: () => assert.fail('must not spawn while locked') }), /EEXIST/); checks++;
    assert.equal(series.quantile(Array.from({ length: 20 }, (_, i) => i + 1), .95), 19);
    assert.equal(series.quantile([1, 2, 3, 4], .5), 2.5); checks++;
    console.log(JSON.stringify({ checks, actualNewPairs: 0, browserLaunched: false,
      status: 'PASS_LOCAL_MOCKS_ONLY' }, null, 2));
  } finally {
    // This exact newly-created mock directory contains only deterministic mock receipts.
    assert(path.dirname(dir) === __dirname && path.basename(dir).startsWith('series-mock-'));
    fs.rmSync(dir, { recursive: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
