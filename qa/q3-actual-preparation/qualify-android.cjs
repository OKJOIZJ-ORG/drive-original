'use strict';
// Offline adoption only. Exact actual receipts remain immutable, with limited scope.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = __dirname, sourceCommit = '5174485b3c17d047259701bbdd889f9b0740f555', version = '1.22.0-rc.33';
const inputs = [
  ['actual-android-q3-actor-cua5-safe.json', '01ddf65886b1de0fceaba0e14733c4b4bf6694d96a587632607bf6645447ed65'],
  ['actual-android-q3-actor-receipt-cua5-safe.json', '6388493220d3ff0ca2c99060a00ea459adc77187e9b0db8355dea06809b9a7fc'],
];
const check = (yes, reason) => { if (!yes) throw Error(reason); };
const [report, r] = inputs.map(([file, sha256]) => {
  const bytes = fs.readFileSync(path.join(dir, file));
  check(crypto.createHash('sha256').update(bytes).digest('hex') === sha256, 'IMMUTABLE_RECEIPT_DRIFT');
  return JSON.parse(bytes);
});
check(report.completed === true && report.actorFunctionalComplete === true && report.ownedForwardRemoved === true, 'ACTUAL_ACTOR_AND_TRANSPORT_COMPLETE');
check(report.model === 'SM-X800' && report.android === '16', 'PHYSICAL_DEVICE_IDENTITY');
check(report.steps.some(s => s.name === 'actor-cleanup' && s.confirmed === true && s.failures.length === 0), 'ACTUAL_CLEANUP');
check(r.schema === 'drive-original.q3-actual-observation/1' && r.version === version && r.sourceCommit === sourceCommit, 'SOURCE_BINDING');
check(r.complete === true && r.rawIdentifiersExported === false && r.observerOnly === true && r.performanceAcceptance === 'NOT_QUALIFIED', 'FINITE_SCOPE');
check(r.nativeRejectionObserved === true && r.explicitChoiceObserved === true, 'OBSERVED_ROUTE_ADMISSION');
check(r.nativeErrors.some(e => e.code === 4 && ['trusted','nativeOwner','nativePinSame','sourceSame','accountSame','targetSame','transportVerified'].every(k => e[k] === true)), 'TRUSTED_NATIVE_REJECTION');
check(r.choices.some(e => ['trusted','choiceCurrent','explicitLossyChoice','sourceSame','accountSame','targetSame'].every(k => e[k] === true)), 'TRUSTED_EXPLICIT_CHOICE');
for (const label of ['before','after']) check(r.metadataResults.some(m => m.label === label && m.status === 200 && ['accountSame','canDownload','freshRevisionChecksumSame','notTrashed','sameExactTarget','sourceSame','stableMetadataSame'].every(k => m[k] === true)), 'FRESH_METADATA_' + label.toUpperCase());
check(r.phases.length === 5 && r.phases.every(p => p.fenceFailure === false), 'BOUNDED_PHASES_AND_FENCES');
const frames = ['startup','seek50','seek90'].map((label, i) => {
  const f = r.phases.find(p => p.label === label)?.firstTargetFrame;
  check(f && f.route === 'Q3' && f.width === 640 && f.height === 360 && f.sourceClockShift === 0, 'CURRENT_FRAME_' + label);
  if (i) check(f.sourceTime === [0,90,162][i] && f.distanceSeconds === 0, 'EXACT_TARGET_' + label);
  return { label, ...f };
});
check(frames[1].generation > frames[0].generation && frames[2].generation > frames[1].generation && frames[1].sourceGeneration > frames[0].sourceGeneration && frames[2].sourceGeneration > frames[1].sourceGeneration, 'ADVANCED_GENERATIONS');
check(r.phases.find(p => p.label === 'cancel')?.streamActiveAtArm === true, 'ACTIVE_CONVERSION_CANCEL');
check(r.closedOwnership === true && ['playerClosed','q0Closed','q1Closed','retirementSettled'].every(k => r.latest[k] === true) && r.latest.selected === false, 'CLOSED_OWNERSHIP');
check(r.observerCleanup?.disposed === true && r.observerCleanup?.removed === true && r.observerCleanup?.frameCallbackRemoved === true && r.observerCleanup?.mediaListenersRemoved === true, 'OBSERVER_CLEANUP');
check(r.closedMetrics?.ownerOverflow === false && r.closedMetrics.owners.length === 3 && r.closedMetrics.owners.every(o => o.disposed === true && o.currentOwner === false), 'RETIRED_OWNERS');
const out = {
  schema: 'drive-original.q3-finite-android-qualification/1', recordedAt: new Date().toISOString(), sourceCommit, version,
  inputs: inputs.map(([file, sha256]) => ({file, sha256})), device: {model: report.model, android: report.android},
  adoptedFiniteFunctionalClauses: ['actual native rejection and trusted explicit lossy choice','640x360 current-generation presentation with visible lossy label','50% and 90% exact source-clock seeks','active conversion cancellation','fresh exact target/account/revision/source fences before and after','closed player/source/worker ownership, observer and owned transport cleanup'],
  frames, activeCancelAtArm: true, wholeObserverComplete: true, wholePlanComplete: false, performanceAcceptance: 'NOT_QUALIFIED',
  originalBasis: {Q06:570, MEDIA04:'970-983', TR08:893, CORE06:663, FM04:1715},
  preservedFailures: ['cua4 sole paused 90s frame did not qualify because transition observation gates failed; original failure retained','Earlier manual/tool failures remain unqualified'],
  changedCondition: 'Native controls maintained through Q2_GENERAL to Q3 transition before the sole paused presented frame; observer gates unchanged',
  limitations: ['Only the exact silent MPEG4SP/640x360/CFR/BT709-limited fixture and physical device','No 10% Q3 seek, full180s EOF or full-output quality claim','No audio/additional tracks/subtitles/HDR/rotation/VFR qualification','Finite timings are observations, not failure-inclusive performance distribution or thermal/GPU/retained-heap proof'],
  originalMediaMutated: false, directQaProviderWritesDuringReplay: 0, appAccountStateProviderWrites:'NOT_MEASURED', rawIdentifiersExported:false,
};
fs.writeFileSync(path.join(dir,'q3-cua5-android-finite-qualification-safe.json'), JSON.stringify(out,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({finiteFunctionalQualified:true,wholePlanComplete:false,activeCancellation:true,inputs:inputs.length}));
