'use strict';
// Offline adoption of bounded, immutable observations. No browser/provider actions.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = __dirname;
const sourceCommit = '5174485b3c17d047259701bbdd889f9b0740f555';
const version = '1.22.0-rc.33';
const inputs = [
  ['q3-cua1-pc-attempt2-functional-safe.json', '6a90f514b20ed878719a82caa109d901a58e8e5c2f92ce37e9516b005c5dc9b0'],
  ['q3-cua1-pc-active-cancel-safe.json', '4a22ae2de5c082addc4778a42790085e09e4cd21aa0e8ff1012c32a1a2860dd0'],
];
const assert = (yes, reason) => { if (!yes) throw Error(reason); };
const receipts = inputs.map(([file, sha256]) => {
  const bytes = fs.readFileSync(path.join(dir, file));
  assert(crypto.createHash('sha256').update(bytes).digest('hex') === sha256, 'IMMUTABLE_RECEIPT_DRIFT');
  const r = JSON.parse(bytes);
  assert(r.schema === 'drive-original.q3-actual-observation/1' && r.version === version && r.sourceCommit === sourceCommit, 'SOURCE_BINDING');
  assert(r.rawIdentifiersExported === false && r.observerOnly === true && r.complete === false, 'EXPLICIT_PARTIAL_SCOPE');
  assert(r.closedOwnership === true && r.latest.playerClosed === true && r.latest.q0Closed === true && r.latest.q1Closed === true && r.latest.retirementSettled === true && r.latest.selected === false, 'CLOSED_OWNERSHIP');
  assert(r.nativeRejectionObserved === true && r.explicitChoiceObserved === true, 'OBSERVED_ROUTE_ADMISSION');
  assert(r.nativeErrors.some(e => e.code === 4 && ['trusted', 'nativeOwner', 'nativePinSame', 'sourceSame', 'accountSame', 'targetSame', 'transportVerified'].every(k => e[k] === true)), 'TRUSTED_NATIVE_REJECTION');
  assert(r.choices.some(e => ['trusted', 'choiceCurrent', 'explicitLossyChoice', 'sourceSame', 'accountSame', 'targetSame'].every(k => e[k] === true)), 'TRUSTED_EXPLICIT_CHOICE');
  for (const label of ['before', 'after']) {
    assert(r.metadataResults.some(m => m.label === label && m.status === 200 && ['accountSame', 'canDownload', 'freshRevisionChecksumSame', 'notTrashed', 'sameExactTarget', 'sourceSame', 'stableMetadataSame'].every(k => m[k] === true)), 'FRESH_METADATA_' + label.toUpperCase());
  }
  assert(r.phases.every(p => p.fenceFailure === false), 'NO_FENCE_FAILURE');
  return r;
});
const [seekReceipt, cancelReceipt] = receipts;
const phase = (r, label) => { const p = r.phases.find(p => p.label === label); assert(p, 'PHASE_' + label); return p; };
const frame = (r, label, target) => {
  const p = phase(r, label), f = p.firstTargetFrame;
  assert(f && f.route === 'Q3' && f.width === 640 && f.height === 360 && f.sourceClockShift === 0, 'QUALIFIED_CURRENT_FRAME_' + label);
  if (target !== null) assert(Math.abs(f.sourceTime - target) <= 0.75 && f.distanceSeconds <= 0.75, 'SEEK_TARGET_' + label);
  return { label, sourceTime: f.sourceTime, elapsedMs: f.elapsedMs, generation: f.generation, sourceGeneration: f.sourceGeneration, width: f.width, height: f.height };
};
const frames = [frame(seekReceipt, 'startup', null), frame(seekReceipt, 'seek50', 90), frame(seekReceipt, 'seek90', 162)];
assert(frames[1].generation > frames[0].generation && frames[2].generation > frames[1].generation, 'ADVANCED_SEEK_GENERATIONS');
const cancel = phase(cancelReceipt, 'cancel');
assert(cancel.streamActiveAtArm === true && cancel.firstTargetFrame?.route === 'Q3', 'ACTIVE_CANCEL_AT_ARM');
assert(cancelReceipt.observerCleanup?.removed === true && cancelReceipt.observerCleanup?.disposed === true && cancelReceipt.observerCleanup?.frameCallbackRemoved === true && cancelReceipt.observerCleanup?.mediaListenersRemoved === true, 'OBSERVER_CLEANUP');
assert(cancelReceipt.closedMetrics?.ownerOverflow === false && cancelReceipt.closedMetrics?.owners.length > 0 && cancelReceipt.closedMetrics.owners.every(o => o.disposed === true && o.currentOwner === false), 'RETIRED_OWNER_DISPOSAL');
const out = {
  schema: 'drive-original.q3-finite-pc-qualification/1', recordedAt: new Date().toISOString(), sourceCommit, version,
  inputs: inputs.map(([file, sha256]) => ({ file, sha256 })),
  adoptedFiniteFunctionalClauses: ['actual native rejection and explicit lossy choice', '640x360 current-generation presentation', '50% and 90% source-clock seek targets', 'active conversion cancellation', 'closed source/player/worker ownership and observer cleanup'],
  frames, cancelStartup: frame(cancelReceipt, 'startup', null), activeCancelAtArm: true,
  originalBasis: { Q06: 570, MEDIA04: '970-983', TR08: 893, CORE06: 663, FM04: 1715 },
  joinScope: 'One exact disposable fixture/account/revision and immutable runtime; fresh metadata before/after each lifetime. Original criteria permit reuse across independently fenced lifetimes.',
  preservedFailures: ['attempt2 observer TOTAL_BOUND; save failed OBSERVER_ALREADY_STOPPED', 'attempt2 inactive close is not active cancellation', 'attempt1 hidden-detail label observer defect; first resource pathname-owner defect'],
  wholeObserverComplete: false, wholePlanComplete: false, performanceAcceptance: 'NOT_QUALIFIED',
  limitations: ['No 10% Q3 seek, full 180s EOF or complete derived-output quality claim', 'No audio, additional tracks, subtitles, HDR, rotation or VFR qualification', '52.012s startup includes main-label visibility delay; not exact earliest frame latency', 'Aggregate Chrome counters do not establish Q3 GPU/encoder peak, temperature or sustained throughput', 'Physical Android Q3 remains unqualified', 'Disposed public-stat owner exposes no retained native heap proof'],
  originalMediaMutated: false, directQaProviderWritesDuringReplay: 0, appAccountStateProviderWrites: 'NOT_MEASURED', rawIdentifiersExported: false,
};
fs.writeFileSync(path.join(dir, 'q3-cua1-pc-finite-qualification-safe.json'), JSON.stringify(out, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ finiteFunctionalQualified: true, wholePlanComplete: false, inputs: inputs.length, activeCancellation: true }));
