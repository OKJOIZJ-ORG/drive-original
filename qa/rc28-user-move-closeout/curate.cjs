'use strict';
// Offline evidence curation only. Never opens a browser/device or runs producers.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const here = 'qa/rc28-user-move-closeout';
const source = '944f00607cf05e586b1c88e2876dd796ce114e82';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const bytes = p => fs.readFileSync(path.join(root,p));
const json = p => JSON.parse(bytes(p));
const gitBlob = (rev,p) => cp.execFileSync('git',['show',`${rev}:${p}`],{cwd:root,maxBuffer:64*1024*1024});
const checked = [];
const owned = new Set();
function add(p) {
  assert(!path.isAbsolute(p) && !p.split('/').includes('..'), `unsafe path ${p}`);
  assert(!/private|\.zip$|\.log$/.test(p), `excluded artifact ${p}`);
  assert(fs.statSync(path.join(root,p)).isFile(),p);
  owned.add(p);
}
function verifyFile(p,sha,size) {
  const b=bytes(p); assert.equal(hash(b),sha,p); if(size!==undefined) assert.equal(b.length,size,p);
  checked.push(p);
}
function verifyRefs(evidence) {
  for(const v of Object.values(evidence)) if(v && typeof v==='object' && v.path && v.sha256) verifyFile(v.path,v.sha256);
}
const commonDelivery = ['audit-with-memory-guard.cjs','audit-memory-guard.json','build-release.py',
  'deploy-candidate.cjs','deployment.json','finalize-source-readiness.py','package.json',
  'product-tests.json','product-integration.json','readback-candidate.cjs','redact-readback.cjs',
  'redacted-readback.json','results.json','run-product-tests.cjs','source-readiness.json'];
for (const n of [27,28]) {
  const leaf=`qa/candidate-rc${n}-delivery`;
  for(const p of commonDelivery) add(`${leaf}/${p}`);
  const d=json(`${leaf}/deployment.json`), r=json(`${leaf}/results.json`), ready=json(`${leaf}/source-readiness.json`);
  const control=json(`${leaf}/redacted-readback.json`), pack=json(`${leaf}/package.json`), tests=json(`${leaf}/product-tests.json`);
  assert(d.passed&&d.stable&&r.passed&&ready.passed&&pack.passed&&tests.passed&&tests.stable);
  assert.equal(r.source,d.source); assert.equal(ready.sourceCommit,d.source); assert.equal(control.source,d.source);
  assert.equal(ready.workerVersion,d.workerVersion); assert.equal(control.workerVersion,d.workerVersion);
  assert.equal(d.assets.length,52); assert.equal(r.assets.length,52); assert(r.assets.every(x=>x.gitEqual));
  assert.equal(r.cached.length,40); assert(r.cached.every(x=>x.gitEqual));
  assert.equal(r.privateRoutes.length,6); assert(r.privateRoutes.every(x=>x.status===404));
  assert.equal(r.uncachedSourceDownloads.length,8); assert(r.uncachedSourceDownloads.every(x=>x.cached===false));
  assert.equal(r.pageErrors,0); assert(r.cold.controlled&&r.offline.controlled); assert.equal(r.cold.accountPresent,false);
  assert.equal(control.bindings.length,11);
  assert.deepEqual(control.publicFlags,{AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'});
  assert.equal(ready.preferredSourceHashesChecked,26); assert.equal(ready.currentReadableAdaptations,6);
  verifyRefs(ready.distributionEvidence);
  assert.equal(pack.entries,52); assert.equal(pack.extraPrivateEntries,0);
  assert(pack.everyPublicEntryEqualsGitBlob&&pack.localGenerationByteEqual); assert.equal(pack.sourceCommit,d.source);
  const zip=fs.readFileSync(path.join(root,'..',pack.packagePath)); assert.equal(zip.length,pack.bytes); assert.equal(hash(zip),pack.sha256);
  verifyFile(`${leaf}/build-release.py`,pack.producerSha256);
  assert.equal(tests.counts.pass,n===27?665:20); assert.equal(tests.counts.tests,tests.counts.pass);
  for(const k of ['fail','cancelled','skipped','todo']) assert.equal(tests.counts[k],0);
  assert.deepEqual(tests.before,tests.after);
  verifyFile(`${leaf}/run-product-tests.cjs`,tests.producerSha256);
  for(const a of d.assets) {
    const fixed=gitBlob(d.source,a.file); assert.equal(hash(fixed),a.sha256,a.file); assert.equal(fixed.length,a.bytes);
    if(n===28) assert.equal(hash(bytes(a.file)),a.sha256,`current public ${a.file}`);
  }
}
add('qa/candidate-rc27-delivery/preparation.json');
add('qa/candidate-rc27-delivery/materialize-v1-invocation-failure.json');
add('qa/candidate-rc28-delivery/deploy-v1-link-guard-failure.json');
for(const leaf of ['rc28-corpus-content-continuity','rc28-performance-preparation']) {
  const prefix=`qa/${leaf}`; const m=json(`${prefix}/curated-savepoint.json`);
  for(const p of m.exactOwnedFiles) {assert(p.startsWith(`${prefix}/`));add(p);}
  const v=json(`${prefix}/local-verification.json`); assert.equal(v.actualExecution,false);
  for(const [p,sha] of Object.entries(v.files||{})) verifyFile(`${prefix}/${p}`,sha);
  const prov=json(`${prefix}/provenance.json`); assert.equal(prov.binding.sourceCommit,source); assert.equal(prov.actualExecution,false);
  for(const [p,sha] of Object.entries(prov.producerSHA256||{})) verifyFile(path.posix.normalize(`${prefix}/${p}`),sha);
}
const saved='qa/rc27-saved-contract-reconciliation/staging-manifest.json';
for(const f of json(saved).files) {verifyFile(f.path,f.sha256,f.bytes);add(f.path);} add(saved);
const android='qa/rc21-android-night/143-rc28-safe-stage-delta-manifest.json';
verifyFile(android,'637093035eb75116d36ce8f624ed0cfd4e331355cca803ba0127d9a5af9afdd4');
for(const f of json(android).files) {verifyFile(f.path,f.sha256,f.bytes);add(f.path);}
add(android);add('qa/rc21-android-night/143-rc28-safe-stage-delta-manifest.cjs');
verifyFile('qa/rc21-android-night/143-rc28-safe-stage-delta-manifest.cjs','7abdfb50b112b76d8bffcee103948897347ba15c454511a998dacdb62182fbc9');
const pc='qa/rc27-28-pc-update-qualification';
for(const p of ['journal.function.js','reader.function.js','cache-reader.function.js','cleanup.function.js',
  'bind.cjs','check.cjs','binding.json','init.expression.js','late-attach.expression.js','protocol-requests.json',
  'local-checks.json','actual-safe-journal.json','actual-normal-update-and-cleanup.json',
  'post-force27-cache-check-interleaved-28.json','README.md']) add(`${pc}/${p}`);
verifyFile(`${pc}/late-attach.expression.js`,'46ae588566530d952df6ceb426db6603906dfae19c4037540faf5fcd0bc3ee65',20408);
verifyFile(`${pc}/binding.json`,'5b1ca45925a797d67d5c3392c566b896f620bb75cfc1b7aeed83ee98babb5c06',13400);
const journal=json(`${pc}/actual-safe-journal.json`), actual=json(`${pc}/actual-normal-update-and-cleanup.json`);
assert.equal(journal.rows.length,16);assert.equal(hash(Buffer.from(JSON.stringify(journal.rows))),journal.fullSafeRowsSHA256);
assert.equal(actual.journal.fullSafeRowsSHA256,journal.fullSafeRowsSHA256);assert.equal(actual.source28,source);
assert(actual.accountSame&&actual.writerSame&&actual.allProjectionRecordsPreserved);
assert.equal(actual.cache.matched,40);assert.equal(actual.normalBannerTrusted,1);assert.equal(actual.cleanup.listenersAfter,0);
assert(actual.cleanup.observerReleased&&actual.cleanup.ownStorageKeysRemoved&&actual.cleanup.ownGlobalsRemoved&&actual.cleanup.inputRemoved);
assert(actual.actualForce28Pending&&actual.reopenPlaybackPending);assert.equal(actual.wholeSwRowPromoted,false);
assert.equal(actual.force27.post27CacheParityQualified,false);
const build=json('media/audio-codec-build.json'), oldBuild=JSON.parse(gitBlob(source,'media/audio-codec-build.json'));
assert.deepEqual(build.distributionEvidence,json('qa/candidate-rc28-delivery/source-readiness.json').distributionEvidence);
verifyRefs(build.distributionEvidence);delete build.distributionEvidence;delete oldBuild.distributionEvidence;assert.deepEqual(build,oldBuild);
for(const p of ['.gitattributes','media/audio-codec-build.json','memory/00-INDEX.md','memory/SESSION-LOG.md',
  'memory/DECISIONS.md','memory/CHECKPOINT.md','memory/HANDOFF.md','memory/CANDIDATE-RC28-20261001.md',
  'memory/goal/commercial-player-stability.md','memory/checkpoints/20261001-0715-user-move-wait.md']) add(p);
assert(bytes('memory/CHECKPOINT.md').toString().includes('WAIT for user resume'));
assert(bytes('memory/goal/commercial-player-stability.md').toString().includes('WAIT under D067'));
for(const p of ['inspect.cjs','append-session.cjs','curate.cjs','stage-verify.cjs','README.md']) add(`${here}/${p}`);
const files=[...owned].sort().map(p=>({path:p,bytes:bytes(p).length,sha256:hash(bytes(p))}));
const report={schema:'drive-original.user-move-closeout/1',recordedAt:new Date().toISOString(),sourceCommit:source,
  executionState:'WAIT-D067',passed:true,public52Fixed:true,publicProductChanges:false,
  priorFrozenBindingsChecked:checked.length,files,manifestPath:`${here}/manifest.json`,
  excluded:['private raw readbacks/logs/account baselines','ZIP bytes','unlisted ignored files','all new browser/device/product executions'],
  wholeGoalComplete:false,actualForce28AndReopenPending:true};
fs.writeFileSync(path.join(root,report.manifestPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,exactPaths:files.length+1,bytes:files.reduce((s,f)=>s+f.bytes,0),bindings:checked.length,state:report.executionState}));
