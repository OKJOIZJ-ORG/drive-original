'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const driver = require('./android-audio-seek-remaining.cjs'), gate = require('./binding-gate.cjs');
const source = fs.readFileSync(path.join(__dirname, 'android-audio-seek-remaining.cjs'), 'utf8');
const cleanup = { tracksStopped: true, nodesDisconnected: true, contextClosed: true,
  frameCancelled: true, timersCleared: true, listenersRemoved: true };
function validReceipt(fraction = .5) {
  return { schema: 'drive-original.rc32-audio-seek-remaining/1', sourceCommit: gate.COMMIT, version: gate.VERSION,
    qualified: true, disposed: true, cleanup: { ...cleanup }, rawIdentifiersExported: false, rawPcmExported: false,
    seek: { fraction, passed: true, nativeInputObserved: true },
    audio: { passed: true, nativeUserActivationAtAdmission: true, nonzeroWindows: 3, videoFrames: 2,
      videoTimeAdvanced: true, sampleTimeAdvanced: true, nativeTimeAdvanced: true,
      maxNativeFrameDistanceSeconds: .1, maxNativeAudioClockDifferenceSeconds: .1 },
    metadata: ['before', 'after'].map(label => ({ label, qualified: true, timeBracketed: true })) };
}
test('inert driver import, exact helpers and original10 freeze; fractions remain explicitly bounded', () => {
  assert.equal(typeof driver.execute, 'function');
  assert.equal(driver.verifyHelpers().sourceFrozen, true);
  assert.equal(driver.FROZEN_HELPERS['audio-seek-supplement.expression.js'], '41305a9e20b7329cb9f46055e3b0d256848373f19211655c7fd0f15a1bd42967');
  assert.deepEqual(driver.fractions(), [.5, .9]); assert.deepEqual(driver.fractions('.5'), [.5]); assert.deepEqual(driver.fractions('.9'), [.9]);
  for (const value of [.1, .50001, 50, 90, '50', '0.9', [], null]) assert.throws(() => driver.fractions(value), /REMAINING_FRACTION_REQUIRED/);
  assert(!/userGesture\s*:\s*true|\.currentTime\s*=|\.play\(|\.pause\(|spawnOwnedAdb\(/.test(source));
});
test('601s slider uses physical pixels and refuses >.75s rounding error', () => {
  const g = { available: true, left: 12.25, width: 500, dpr: 2, viewportHeight: 700, x: 262.25, y: 600 };
  const p = driver.quantizedSeek(g, 1600, 601, .5);
  assert.deepEqual(p.point, [525, 1400]); assert.equal(p.targetSeconds, 300.5);
  assert(p.distanceSeconds <= .75);
  const near90 = { ...g, x: g.left + g.width * .9 };
  assert(driver.quantizedSeek(near90, 1600, 601, .9).distanceSeconds <= .75);
  assert.throws(() => driver.quantizedSeek({ ...g, x: 13, width: .2 }, 1600, 601, .5), /NATIVE_SEEK_QUANTIZATION_BOUND/);
  assert.throws(() => driver.quantizedSeek({ ...g, available: false }, 1600, 601, .5), /NATIVE_GEOMETRY_INVALID/);
});
test('LIVE qualification cannot mix fractions or accept missing metadata/activation/clocks/cleanup', () => {
  assert.equal(driver.liveQualified(validReceipt(.5), .5), true);
  assert.equal(driver.liveQualified(validReceipt(.9), .9), true);
  assert.equal(driver.liveQualified(validReceipt(.5), .9), false);
  assert.equal(driver.liveQualified(validReceipt(), .1), false);
  for (const field of ['nativeUserActivationAtAdmission', 'videoTimeAdvanced', 'sampleTimeAdvanced', 'nativeTimeAdvanced']) {
    const r = validReceipt(); r.audio[field] = false; assert.equal(driver.liveQualified(r, .5), false, field);
  }
  for (const field of ['maxNativeFrameDistanceSeconds', 'maxNativeAudioClockDifferenceSeconds']) {
    const r = validReceipt(); r.audio[field] = .751; assert.equal(driver.liveQualified(r, .5), false, field);
  }
  for (const field of Object.keys(cleanup)) {
    const r = validReceipt(); r.cleanup[field] = false; assert.equal(driver.liveQualified(r, .5), false, field);
  }
  const r = validReceipt(); r.metadata[1] = { ...r.metadata[0] }; assert.equal(driver.liveQualified(r, .5), false);
  const postClose = validReceipt(); postClose.qualified = false;
  assert.equal(driver.liveQualified(postClose, .5), false);
  assert.equal(driver.liveQualified(validReceipt(), .5), true, 'saved LIVE receipt remains independently qualified');
});
test('attempt path and existing-output refusal happen before any private input read or device work', async () => {
  const name = 'actual-android-rc32-audio-seek-remaining-guard-' + process.pid + '-safe.json';
  const file = driver.resultPath(name), original = '{"localFixture":true}\n';
  fs.writeFileSync(file, original, { flag: 'wx' });
  try {
    await assert.rejects(driver.execute('THIS_PROTECTED_PATH_MUST_NOT_BE_READ', name, .5), /RESULT_ALREADY_EXISTS/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { fs.unlinkSync(file); }
  for (const value of ['../raw.json', 'C:\\private.json', 'raw.log', 'actual-android-rc32-audio-seek-remaining-x.json'])
    assert.throws(() => driver.resultPath(value), /RESULT_NAME_INVALID/);
});
test('changed frozen helper fails admission without private input or native transport', () => {
  const base = fs.mkdtempSync(path.join(__dirname, '.remaining-driver-guard-'));
  try {
    for (const file of Object.keys(driver.FROZEN_HELPERS)) fs.copyFileSync(path.join(__dirname, file), path.join(base, file));
    assert.equal(driver.verifyHelpers(base).sourceFrozen, true);
    fs.appendFileSync(path.join(base, 'android-common.cjs'), '\n// drift\n');
    assert.throws(() => driver.verifyHelpers(base), /REMAINING_HELPER_SOURCE_DRIFT/);
  } finally {
    assert(path.resolve(base).startsWith(path.resolve(__dirname) + path.sep + '.remaining-driver-guard-'));
    fs.rmSync(base, { recursive: true, force: true });
  }
});
test('post-seek hidden resume control is revealed normally before coordinates, and failed exposure is recorded', async () => {
  const order = [], records = []; let exposed = false;
  const geometry = async key => { order.push(key); return { available: exposed, controlsIdle: !exposed, x: exposed ? 20 : null }; };
  const target = await driver.reacquireResumeTarget(async () => { order.push('normal-controls'); exposed = true; }, geometry,
    (name, data) => records.push({ name, data }));
  assert.deepEqual(order, ['normal-controls', 'ctrlPlayPause']); assert.equal(target.available, true);
  assert.equal(records[0].data.controlsReacquired, true);
  const failed = [];
  await assert.rejects(driver.reacquireResumeTarget(async () => {}, async () => ({ available: false, controlsIdle: true }),
    (name, data) => failed.push(data)), /NATIVE_RESUME_TARGET_UNAVAILABLE/);
  assert.equal(failed[0].available, false); assert.equal(failed[0].controlsIdle, true);
});
