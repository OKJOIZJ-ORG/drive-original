'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const driver = require('./android-audio-seek-supplement.cjs'), gate = require('./binding-gate.cjs');
test('import is preparation only and exact frozen source32/supplement producers are admitted', () => {
  assert.equal(typeof driver.execute, 'function');
  const binding = gate.verifyBound();
  assert.equal(binding.sourceCommit, '1d79897fd32c569137cab079bfd93107be2ee33f');
  const bytes = fs.readFileSync(path.join(__dirname, 'audio-seek-supplement.expression.js'));
  assert.equal(gate.sha(bytes), driver.SUPPLEMENT_SHA);
});
test('native physical geometry includes Android browser viewport top offset and rejects unsupported geometry', () => {
  assert.deepEqual(driver.physicalPoint({ available: true, x: 50.4, y: 100.2, dpr: 2, viewportHeight: 700 }, 1600), [101, 400]);
  for (const geometry of [{ available: false }, { available: true, x: NaN, y: 1, dpr: 2, viewportHeight: 500 },
    { available: true, x: 1, y: 1, dpr: 0, viewportHeight: 500 }]) assert.throws(() => driver.physicalPoint(geometry, 1600), /NATIVE_GEOMETRY_INVALID/);
});
test('each exact metadata source/account/version/permission fence is mandatory', () => {
  const valid = { status: 200, sameExactTarget: true, stableMetadataSame: true, freshRevisionChecksumSame: true,
    accountSame: true, sourceSame: true, notTrashed: true, canDownload: true };
  assert.equal(driver.metadataQualified(valid), true);
  for (const field of Object.keys(valid)) assert.equal(driver.metadataQualified({ ...valid, [field]: field === 'status' ? 403 : false }), false, field);
});
test('result output remains confined to this QA directory and never permits private-path overwrite', () => {
  assert.equal(driver.resultPath('actual-android-supplement-once.json'), path.join(__dirname, 'actual-android-supplement-once.json'));
  for (const value of ['../private.json', 'C:\\private.json', 'raw.log', 'UPPER.json', 'foo/bar.json'])
    assert.throws(() => driver.resultPath(value), /RESULT_NAME_INVALID/);
});
test('supplement stop requires disposed and exactly its five actual cleanup booleans', () => {
  const valid = { disposed: true, cleanup: { tracksStopped: true, nodesDisconnected: true, contextClosed: true,
    frameCancelled: true, timersCleared: true } };
  assert.equal(driver.supplementCleanupQualified(valid), true);
  for (const field of Object.keys(valid.cleanup)) assert.equal(driver.supplementCleanupQualified({ ...valid,
    cleanup: { ...valid.cleanup, [field]: false } }), false, field);
  assert.equal(driver.supplementCleanupQualified({ ...valid, disposed: false }), false);
  assert.equal(driver.supplementCleanupQualified({ ...valid, cleanup: { ...valid.cleanup, unrelated: true } }), false);
  assert.equal(driver.supplementCleanupQualified({ disposed: true, cleanup: {} }), false);
});
