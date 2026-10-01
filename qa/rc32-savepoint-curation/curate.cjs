'use strict';
// Exact allowlist only. This script never executes a QA producer or stages files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const sourceCommit = '1d79897fd32c569137cab079bfd93107be2ee33f';
const version = '1.22.0-rc.32';
const leaves = {
  'candidate-rc32-delivery': ['audit-memory-guard.json','audit-with-memory-guard.cjs','bind-source.cjs','binding.json','build-release.py','delivery-guard.cjs','DELIVERY-PREPARATION.md','deploy-candidate.cjs','finalize-source-readiness.py','local-delivery-preparation.json','materialization.json','materialize-candidate.cjs','package.json','readback-candidate.cjs','redact-readback.cjs','redacted-readback.json','results.json','root-guard-attempts.json','SHA256SUMS.json','source-readiness.json'],
  'rc32-resume-20261001': ['android-binding-verification.json','android-binding.json','android-normal-update-source-cache-result.json','android-normal-update-source-cache.cjs','android-ui-common-rc32.cjs','build-android-binding.cjs','build-source-proof.cjs','pc-update-baseline.expression.js','preparation-first-failure.json','preparation-manifest.json','rc32-pc-normal-update-safe.json','source-binding-verification.json','source-proof.expression.js','sourcebinding.json','verify-android-binding.cjs','verify-source-binding.cjs'],
  'rc32-ts-device-replay': ['actual-android-rc32-ts-replay-result.json','android-common.cjs','android-replay.cjs','bind.cjs','binding-gate.cjs','binding.json','binding.test.cjs','bound-manifest.json','cache-files.json','local-result.json','manifest.json','native-action.test.cjs','native-folder-target.function.js','native-ui-target-v3.function.js','observer.expression.js','observer.function.js','observer.test.cjs','preparation-manifest.json','provenance.json','rc32-pc-ts-replay-attempt1b-safe.json','README.md','source-proof.expression.js','source-proof.function.js','source-proof.test.cjs','verify.cjs'],
  'rc32-format-acceptance': ['binding.json','build.mjs','curated-savepoint.json','deeper.expression.js','derive-context.expression.js','freeze.json','image-observer.function.js','inputs.json','local-verification.json','provenance.json','rc32-pc-deeper-cohort2-safe.json','README.md','sw-proof.expression.js','verify.mjs'],
  'rc32-acceptance-reconciliation': ['freeze.json','README.md','reconciliation.json'],
  'rc32-savepoint-curation': ['curate.cjs','README.md','CANDIDATE-RC32-DRAFT.md'],
};
const exactPaths = Object.entries(leaves).flatMap(([leaf, files]) => files.map(file => `qa/${leaf}/${file}`)).sort();
const permitted = new Set(exactPaths);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => {
  if (!permitted.has(relative)) throw Error(`UNLISTED_PATH: ${relative}`);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep) || fs.lstatSync(absolute).isSymbolicLink()) throw Error('UNSAFE_PATH');
  return fs.readFileSync(absolute);
};
const json = relative => JSON.parse(read(relative));
const assert = (value, label) => { if (!value) throw Error(label); };
const frozenMembers = new Set();
let frozenComparisons = 0;
function checkFrozen(relative, field = 'files') {
  const record = json(relative);
  const base = path.posix.dirname(relative);
  const members = record[field];
  assert(members && typeof members === 'object', `MISSING_FREEZE: ${relative}`);
  const entries = Array.isArray(members) ? members.map(x => [x.file, x]) : Object.entries(members).map(([file, sha256]) => [file, {sha256}]);
  for (const [file, member] of entries) {
    const target = file.startsWith('qa/') ? file : `${base}/${file}`;
    const bytes = read(target);
    assert(hash(bytes) === member.sha256, `FROZEN_HASH_MISMATCH: ${target}`);
    if (member.bytes !== undefined) assert(bytes.length === member.bytes, `FROZEN_BYTES_MISMATCH: ${target}`);
    frozenMembers.add(target); frozenComparisons++;
  }
}
checkFrozen('qa/candidate-rc32-delivery/SHA256SUMS.json');
checkFrozen('qa/candidate-rc32-delivery/binding.json','scripts');
checkFrozen('qa/rc32-resume-20261001/preparation-manifest.json');
checkFrozen('qa/rc32-ts-device-replay/preparation-manifest.json');
checkFrozen('qa/rc32-ts-device-replay/bound-manifest.json');
checkFrozen('qa/rc32-ts-device-replay/manifest.json');
checkFrozen('qa/rc32-format-acceptance/freeze.json');
checkFrozen('qa/rc32-acceptance-reconciliation/freeze.json');
const receiptPins = {
  'qa/rc32-ts-device-replay/actual-android-rc32-ts-replay-result.json': '9af6452d6f51cbe46e2c78e93e4a9e9fb1966e9b774e0a741cb6466ef7ed2ee6',
  'qa/rc32-ts-device-replay/rc32-pc-ts-replay-attempt1b-safe.json': '45421ed9b4647fbb053d2103d3434dcbb673bd176995bf5e28fd05f6c6b06747',
  'qa/rc32-format-acceptance/rc32-pc-deeper-cohort2-safe.json': '4df987beef6d100402bb8a343aef2ac07085375970c40913a14c9c68fcd253e4',
};
for (const [file, sha256] of Object.entries(receiptPins)) assert(hash(read(file)) === sha256, `RECEIPT_PIN_MISMATCH: ${file}`);
const android = json(Object.keys(receiptPins)[0]);
assert(android.sourceCommit === sourceCommit && android.completed === true && android.cleanupComplete === true && android.rawIdentifiersExported === false, 'ANDROID_RECEIPT_CONTRACT');
const journal = android.steps.find(x => Array.isArray(x.phases));
const expectedPhases = {startup:18338,seek50:19307,seek90:11565,nearEOF:6258,reopen:13912};
for (const [label, elapsedMs] of Object.entries(expectedPhases)) assert(journal.phases.find(x => x.label === label)?.firstTargetFrame?.elapsedMs === elapsedMs, `ANDROID_PHASE: ${label}`);
const tail = android.steps.find(x => x.tailBoundMs);
assert(tail.nativeEndAndCurrentPipelineEnd === true && tail.actual.eof.currentOwnerQualified === true && tail.actual.eof.nativeEnded === true && tail.actual.eof.workerFinished === true, 'ANDROID_TAIL_CONTRACT');
assert(tail.exactFinalOriginalFrame === 'UNKNOWN' && tail.actual.eof.audioFidelity === 'NOT_TESTED', 'ANDROID_LIMITS_CONTRACT');
const pc = json(Object.keys(receiptPins)[1]);
assert(pc.completed === false && pc.failure === 'TOTAL_OBSERVER_TIMEOUT_DURING_ROOT_PACING' && pc.playerClosed === true && pc.ownerRetired === true && pc.cleanup.disposed === true && pc.cleanup.removed === true, 'PC_FAILURE_CONTRACT');
const deeper = json(Object.keys(receiptPins)[2]);
assert(deeper.summary.wholeCorpusComplete === false && deeper.summary.complete === false && deeper.summary.failure === 'CLEANUP_FAILED' && deeper.summary.metadataDiagnostic.lastFailure.code === 'OWNER_CHANGED' && deeper.summary.released === true, 'DEEPER_FAILURE_CONTRACT');
const reconciliation = json('qa/rc32-acceptance-reconciliation/reconciliation.json');
assert(reconciliation.wholeGoalPassed === false && reconciliation.wholeRowPromotions === 0 && Object.values(reconciliation.counts).reduce((a,b)=>a+b,0) === 69, 'RECONCILIATION_NOT_ACCEPTANCE');
let jsonParsed = 0, javascriptSyntaxChecked = 0, fragmentsParsed = 0;
const files = exactPaths.map(relative => {
  const bytes = read(relative), text = bytes.toString('utf8');
  // Credential values, rather than legitimate token/account identifiers in source.
  assert(!/(?:ya29\.[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{30,}|Bearer\s+[A-Za-z0-9._~-]{24,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/.test(text), `CREDENTIAL_VALUE_MARKER: ${relative}`);
  if (relative.endsWith('.json')) { JSON.parse(text); jsonParsed++; }
  if (/\.(?:js|cjs|mjs)$/.test(relative)) {
    if (relative.endsWith('.function.js')) { new vm.Script(`(${text.trim().replace(/;$/, '')})`); fragmentsParsed++; }
    else cp.execFileSync(process.execPath, ['--check', path.resolve(root, relative)], {stdio:'pipe'});
    javascriptSyntaxChecked++;
  }
  return {path:relative, role:relative.includes('reconciliation')?'acceptance-proposal':relative.includes('savepoint-curation')?'curation-metadata':receiptPins[relative]?'actual-safe-receipt':/result|safe\.json|readback|materialization|package|readiness/.test(relative)?'safe-evidence-or-producer':'preparation', bytes:bytes.length, sha256:hash(bytes)};
});
const manifest = {
  schema:'drive-original.rc32-exact-safe-savepoint/1', sourceCommit, version,
  actualExecutionByCuration:false, gitMutations:false, privateInputsRead:false,
  validation:{files:files.length,totalBytes:files.reduce((n,x)=>n+x.bytes,0),jsonParsed,javascriptSyntaxChecked,functionFragmentsParsed:fragmentsParsed,frozenOutputHashesVerified:frozenMembers.size,frozenComparisons,approvedReceiptPinsVerified:Object.keys(receiptPins).length,credentialValueMarkersAbsent:true,productMediaSuitesRerun:false,oldFreezesRewritten:false},
  scope:'Exact publicsafe delivery/preparation and root-approved safe receipts only. Historical freeze input references are not read. Manifest is the unhashed envelope; root owns staging/adoption.',
  limitations:['Android one exact TS replay; first two diagnostic15s misses; no p95/audio-fidelity/exact-final-frame claim','PC attempt1b failed observer bound; later root PC retry is deliberately absent','Deeper cohort2 OWNER_CHANGED then CLEANUP_FAILED; released handles do not prove generic upstream cleanup','Original69 reconciliation is a proposal, not whole-goal or whole-row acceptance','Historical unbound delivery-preparation statements describe preparation time and are not overwritten'],
  excluded:['protected-state-recovery-inputs','private-output-logs-and-readbacks','deployment.json','credentials-and-private-account-media-identifiers','original-media-bytes','screenshots-and-binaries','zip-files','temporary-or-unlisted-files','root-active-PC-retry','canonical-memory','production-provider-Android-actions','Git-staging-or-commit'],
  files,
};
const output = path.join(__dirname,'manifest.json');
if (process.argv.includes('--verify')) {
  assert(fs.readFileSync(output,'utf8') === JSON.stringify(manifest,null,2)+'\n','CURATION_MANIFEST_DRIFT');
} else fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({mode:process.argv.includes('--verify')?'verified':'curated',...manifest.validation,manifestSha256:hash(fs.readFileSync(output))},null,2));
