'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), folder = 'qa/color-path-discriminator/';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => JSON.parse(bytes(folder + file));
const entry = file => { const b = bytes(file); return {file, bytes: b.length, sha256: sha(b)}; };
function verifyEntry(e) { const actual = entry(e.file.replaceAll('\\', '/')); assert.equal(actual.bytes, e.bytes); assert.equal(actual.sha256, e.sha256); }
const pc = read('interpretation-player-result.json'), packets = read('interpretation-packet-oracle-result.json');
assert.equal(pc.interpretationPassed, true); assert.equal(pc.strictRGBAParityPassed, false);
assert.deepEqual(pc.runs.map(r => r.stats.generation), [1, 2, 3]);
assert.ok(pc.runs.every(r => !r.stats.failure && r.stats.pipeline.encodersCreated === 0));
assert.ok(Object.values(pc.cleanup).every(v => v === true || v?.settled === true));
assert.equal(packets.encodedPacketsExact, true); assert.equal(packets.lastDecodedYUV420P.exact, true);
assert.equal(packets.strictRGBAParityPassed, false);
for (const producer of pc.binding.producers) {
  const file = producer.path === '/runner.js' ? folder + 'interpretation-player.function.js' : producer.path.slice(1);
  assert.equal(sha(bytes(file)), producer.sha256, file);
}
assert.equal(sha(bytes(folder + 'interpretation-output.mp4')), packets.outputSHA256);
const android = read('android-tuple-adjudication.json'), rawAndroid = read('android-tuple-actual-result.json');
verifyEntry(android.receipt);
assert.equal(android.qualified, 'PASS_SCOPED_TUPLE_PROPAGATION_AND_SERIAL_SEEK_ONLY');
assert.deepEqual(android.phases.map(r => r.generation), [1, 2]);
assert.ok(android.phases.every(r => r.passed && r.previousOwnersRetired && r.targetDistanceMs <= 15));
assert.equal(android.strictDiagnostics.strictRGBA, 'FAILED');
assert.equal(android.strictDiagnostics.crossFormatVisibleYUV, 'UNKNOWN');
assert.ok(Object.values(android.cleanup).every(v => v === true));
assert.equal(rawAndroid.loadedProducerBindingStable, true);
const submanifests = ['android-color-savepoint-manifest.json', 'android-tuple-savepoint-manifest.json'];
const androidFiles = [];
for (const file of submanifests) {
  const m = read(file); m.files.forEach(verifyEntry); verifyEntry(m.fixtureDependency || m.generatedFixtureDependency);
  for (const p of m.loadedMediaBuffers) assert.equal(sha(bytes(p.path.slice(1))), p.sha256, p.path);
  for (const e of m.files) {
    const name = e.file.replaceAll('\\', '/');
    assert.ok(name.startsWith(folder + 'android-') && !name.includes('..'));
    androidFiles.push(name.slice(folder.length));
  }
  androidFiles.push(file);
}
const historicalAndroid = read('android-color-actual-result.json');
assert.equal(historicalAndroid.completed, false);
assert.equal(historicalAndroid.failure, 'COLOR_INTERPRETATION_UNQUALIFIED');
assert.equal(historicalAndroid.strictRgbaPass, false);
const normalized = read('normalized-resource-result.json');
const comparison = (a, b) => normalized.comparisons.find(c => c.a === a && c.b === b);
assert.equal(comparison('file-video', 'mse-video').exact, false);
assert.equal(comparison('file-normalized', 'mse-normalized').exact, true);
assert.equal(comparison('file-video', 'file-normalized').exact, false);
const currentUpdate = read('android-update-current-readonly.json');
assert.equal(currentUpdate.readOnly, true);
const facts = {
  schema: 'observed-native-color-local-unit/1',
  source: entry('qa/fm05-controlled-diagnostic/subtitle.mp4'),
  finalNativeColorHelper: entry('media/native-color.mjs'),
  productChangedLocally: true, deployed: false, version: 'published rc35 remains unchanged',
  scopedLocalUnit: 'qualified for a local commit and validation-candidate delivery; original broad color/HDR/device fidelity remains unqualified',
  confirmedCause: 'Exact copied AVC and decoded visible NV12; unspecified source is interpreted smpte170m by native file and bt709 by MSE in observed Chrome154.',
  intervention: 'Use a complete same-lifetime native 8-bit YUV SDR observation only for an entirely undeclared source. Preserve original config/packets and attach a separate derived output config.',
  sourceIntendedColor: 'UNKNOWN',
  managedPC: {receipt: entry(folder + 'interpretation-player-result.json'),
    generations: pc.runs.map(r => ({label: r.label, generation: r.stats.generation, elapsedMs: r.elapsedMs})),
    copiedPacketsAndClocks: 'EXACT', lastDecodedYUV: 'EXACT', sameLastNativeNV12AndTuple: 'EXACT',
    middleSeekPixelReference: 'NOT_ESTABLISHED', strictRGBA: 'FAILED_RETAINED'},
  residual: {receipt: entry(folder + 'normalized-resource-result.json'),
    originalResources: comparison('file-video', 'mse-video'),
    commonResourceDiagnostic: comparison('file-normalized', 'mse-normalized'),
    interpretation: 'Residual located at browser resource presentation. The particular GPU/shader/padding mechanism is UNKNOWN. Normalized resources differ greatly from originals and are not a product renderer or fidelity proof.'},
  physicalAndroid: {receipt: entry(folder + 'android-tuple-actual-result.json'),
    phases: android.phases.map(p => ({label: p.label, generation: p.generation, elapsedMs: p.elapsedMs, targetDistanceMs: p.targetDistanceMs})),
    observedTuplePropagationAndSerialSeek: 'PASS_SCOPED', pixelFidelity: 'NOT_QUALIFIED', strictRGBA: 'FAILED_RETAINED', visibleYUV: 'UNKNOWN_I420_VS_RGBA',
    priorFailedReceipt: entry(folder + 'android-color-actual-result.json'), priorFailedPredicate: 'UNCHANGED_NOT_QUALIFIED'},
  currentAndroidUpdate: {receipt: entry(folder + 'android-update-current-readonly.json'),
    candidateVersion: '1.22.0-rc.35', pending: false, bannerVisible: false, readOnly: true},
  checks: [
    {command: 'node --test tests/app.test.js tests/static.test.js tests/general-app-routing.test.js', passed: 214, owner: 'root', log: folder + 'app-static-checks.txt'},
    {command: 'node --test tests/general-q1.test.mjs tests/general-retention.test.mjs tests/general-q2-end.test.mjs tests/general-source-policy.test.mjs tests/general-selected-audio.test.mjs tests/general-audio-probe.test.mjs tests/audio-compat-general.mjs tests/audio-compat-lifecycle.mjs', passed: 83, owner: 'delegated pipeline owner report; no root rerun'},
    {command: 'node --test tests/native-color.test.mjs tests/player-tracks-app.test.js', passed: 22, owner: 'root before additive Q3 negative-gate test', log: folder + 'final-color-checks.txt'},
    {command: 'node --test tests/video-q3.test.mjs tests/video-q3-app.test.js', passed: 23, owner: 'root', log: folder + 'q3-related-checks.txt'},
    {command: "node --test --test-name-pattern='Q3 worker accepts shared identity' tests/native-color.test.mjs", passed: 1, owner: 'root; actual Node Q3 worker unsupported-capability/cleanup gate, not browser playback', log: folder + 'q3-shared-worker-check.txt'}
  ],
  preservedFailures: ['Exclusive EOS observer timeout and MCP filePath denial before execution',
    'AAC3 was subtitle3: GENERAL_AUDIO_SELECTION_MISSING; corrected input AAC2, no retro pass',
    'Strict PC RGBA failure after propagation remains; old strict oracle rejected a missing pass field after payload checks',
    'Android unlike-frame YUV predicate NOT_QUALIFIED and strict RGBA failure remain unchanged',
    'Savepoint collector first run stopped before writing: Android color and tuple manifests use different fixture field names; explicit field mapping corrected without product rerun'],
  cleanup: {allOwnedPlayersReadersWorkersCallbacksTimersSourcesSettled: true,
    rootOwnedMcpPages4to8Closed: true, rootOriginalPage3Preserved: true,
    rootServers24580_17588_26080_29040_6156_16864_9204StoppedAfterExactOwnerChecks: true,
    androidOwnedTabsForwardReverseServerClosed: true, originalAccountCandidateTabsUnchanged: true},
  acceptance: {wholeGoalPassed: false, productionPassed: false, FM06_HDR: 'UNKNOWN',
    performanceDistribution: 'OPEN; historical failures retained, no p95 assertion',
    limitations: ['Generated fixture only; actual account/app UI color switching not established',
      'Only same-lifetime supported native YUV SDR capture; no metadata guess, converted-RGB, high-bit or HDR fallback',
      'Historical server snapshots are not replay commands; only final receipts have current producer equality',
      'No new runtime deployment/account/media write, grant, automation or production change']}
};
const factsFile = folder + 'final-adjudication.json';
fs.writeFileSync(path.join(root, factsFile), JSON.stringify(facts, null, 2) + '\n');
const rootFiles = [
  'savepoint.cjs', 'final-adjudication.json', 'adjudication.json', 'browser.function.js', 'server.cjs',
  'actual-result.json', 'original-file.png', 'copied-remux-file.png',
  'mse-only-v1.function.js', 'mse-server-v1.cjs', 'mse-only-result.json',
  'mse-only.function.js', 'mse-server.cjs', 'mse-only-attempt2-result.json', 'mse-only.png',
  'observed-player.function.js', 'observed-player-attempt1.function.js', 'observed-player-attempt1-server.cjs', 'observed-player-attempt1-result.json',
  'observed-player-attempt2.function.js', 'observed-player-attempt2-server.cjs', 'observed-player-attempt2-result.json',
  'observed-packet-oracle-strict-v1.cjs', 'observed-packet-oracle.cjs', 'observed-packet-oracle-result.json',
  'observed-output.mp4', 'observed-native.png', 'observed-last-frame.png', 'observed-residual-rgba-result.json',
  'normalized-resource.function.js', 'normalized-resource-server.cjs', 'normalized-resource-result.json',
  'resource-file-video.png', 'resource-file-frame.png', 'resource-file-normalized.png',
  'resource-mse-video.png', 'resource-mse-frame.png', 'resource-mse-normalized.png',
  'interpretation-player.function.js', 'interpretation-player-server.cjs', 'interpretation-player-result.json',
  'interpretation-packet-oracle.cjs', 'interpretation-packet-oracle-result.json', 'interpretation-output.mp4',
  'interpretation-native.png', 'interpretation-last-frame.png', 'interpretation-back-seek.png', 'interpretation-last-frame-return.png',
  'app-static-checks.txt', 'final-color-checks.txt', 'q3-related-checks.txt', 'q3-shared-worker-check.txt',
  'android-update-current-readonly.json'
];
const files = [...new Set([...rootFiles, ...androidFiles])].map(f => entry(folder + f));
const manifest = {schema: 'observed-native-color-savepoint/1', files, fileCount: files.length,
  totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  dependencies: [entry('qa/fm05-controlled-diagnostic/subtitle.mp4'), entry('qa/player-track-endpoint/fixed-q1-output.mp4')],
  currentProducerBindingsVerified: {managedPC: pc.binding.producers.length, physicalAndroid: rawAndroid.binding.producers.length},
  fullGoalPassed: false, productionPassed: false};
fs.writeFileSync(path.join(root, folder + 'savepoint-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({files: files.length, bytes: manifest.totalBytes, actualAndroidTupleOnly: true,
  strictRGBAStillFailed: true, allCleanup: true, currentProducerChecks: manifest.currentProducerBindingsVerified}));
