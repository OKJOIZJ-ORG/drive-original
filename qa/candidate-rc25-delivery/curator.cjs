'use strict';
// Fixed25 savepoint curation only; pending26 public worktree paths are excluded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..'),here=__dirname;
const source='7ba8e654fa38def8c8e00efcbf1600a4c8730c53',worker='ef1d3975-4530-4721-acc1-a2be201afc1b';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(root,p)),load=p=>JSON.parse(read(p));
const prefix='qa/candidate-rc25-delivery/',get=n=>load(prefix+n);
const mcp=get('mcp-reuse-audit-manifest.json'),delivery=get('results.json'),deployment=get('deployment.json'),control=get('redacted-readback.json'),pkg=get('package.json'),ready=get('source-readiness.json'),tests=get('product-tests.json');
assert.equal(mcp.source,source);assert.equal(delivery.source,source);assert.equal(deployment.source,source);assert.equal(control.source,source);assert.equal(pkg.sourceCommit,source);assert.equal(ready.sourceCommit,source);
assert(deployment.passed&&deployment.stable&&deployment.workerVersion===worker&&control.workerVersion===worker&&ready.workerVersion===worker);
assert.equal(delivery.assets.length,52);assert(delivery.assets.every(x=>x.gitEqual));assert.equal(delivery.cached.length,40);assert(delivery.cached.every(x=>x.gitEqual));
assert.equal(delivery.uncachedSourceDownloads.length,8);assert(delivery.uncachedSourceDownloads.every(x=>!x.cached));assert.equal(delivery.privateRoutes.length,6);assert(delivery.privateRoutes.every(x=>x.status===404));
assert.deepEqual(control.publicFlags,{AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'});assert.equal(control.bindings.length,11);
assert(delivery.passed&&delivery.pageErrors===0&&delivery.freshContextProved===false&&delivery.preNavigationStorageInspectionExecuted===false);
assert(delivery.offline.networkBlockedReload&&delivery.offline.navigatorOnlineReliableForEmulatedReload===false&&delivery.cleanup.online&&delivery.cleanup.temporaryGlobalsRemoved);
assert(tests.passed&&tests.stable&&tests.exitCode===0);assert.equal(tests.counts.tests,650);assert.equal(tests.counts.pass,650);assert.equal(tests.counts.fail,0);assert.deepEqual(tests.before,tests.after);
assert.equal(tests.producerSha256,hash(read(prefix+'run-product-tests.cjs')));
assert(pkg.passed&&pkg.bytes===54782271&&pkg.entries===52&&pkg.everyPublicEntryEqualsGitBlob&&pkg.extraPrivateEntries===0&&pkg.localGenerationByteEqual);
assert.equal(pkg.sha256,'0e7562058f536d4d5216ca6f20c2373fa85706055656931a3a1fe934b830f564');assert.equal(hash(fs.readFileSync(path.join(root,'..',pkg.packagePath))),pkg.sha256);
assert(ready.passed&&ready.preferredSourceHashesChecked===26&&ready.currentReadableAdaptations===6&&ready.publicAssets===52&&ready.cacheAssets===40&&ready.uncachedSourceArchives===8);
assert.equal(ready.distributionEvidence.deliveryReport.sha256,hash(read(prefix+'results.json')));assert.equal(ready.distributionEvidence.auditProducer.path,prefix+'mcp-reuse-audit-merge.cjs');assert.equal(ready.distributionEvidence.auditProducer.sha256,hash(read(prefix+'mcp-reuse-audit-merge.cjs')));
assert.equal(ready.producerSha256,hash(read(prefix+'finalize-source-readiness.py')));assert.equal(ready.buildRecordSha256,hash(read('media/audio-codec-build.json')));
const build=load('media/audio-codec-build.json');assert(build.distributionReady&&build.blockingDistributionRequirements.length===0);assert.deepEqual(build.distributionEvidence,ready.distributionEvidence);
for(const row of ready.fixedSourceAssetBindings){const bytes=row.path==='.nojekyll'?Buffer.alloc(0):execFileSync('git',['show',`${source}:${row.path}`],{cwd:root,maxBuffer:12*1024**2});assert.equal(hash(bytes),row.sha256,row.path);}
assert.equal(ready.fixedSourceAssetBindings.length,52);
const fixedBaseline=['prepare-delivery.cjs','preparation.json','build-release.py','package.json','deploy-candidate.cjs','deployment.json','readback-candidate.cjs','redact-readback.cjs','redacted-readback.json','audit-with-memory-guard.cjs','audit-memory-guard.json','run-product-tests.cjs','product-tests.json','finalize-source-readiness.py','source-readiness.json','deployment-v1-preflight-failure.json','deployment-v2-preflight-failure.json','source-readiness-v1-failure.json'];
const external=['scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs','qa/night-environment-20260930/preflight.cjs','media/audio-codec-build.json','memory/CANDIDATE-RC25-20261001.md','qa/rc25-pc-update-qualification/normal-update-v1-result.json'];
const selected=[...new Set([...fixedBaseline.map(n=>prefix+n),...mcp.files.map(x=>x.path),prefix+'mcp-reuse-audit-manifest.json',prefix+'curator.cjs',...external])];
for(const row of mcp.files){assert.equal(hash(read(row.path)),row.sha256,row.path);assert.equal(read(row.path).length,row.bytes,row.path);}
const guard=get('audit-memory-guard.json');assert(guard.memory.existingLaunchFloorPassed===false&&guard.memory.freeVirtualKiB===748084&&guard.memory.virtualFloorKiBExclusive===1572864);
for(const p of selected){assert(!/private|\.log$|\.zip$/i.test(p),'Unsafe filename excluded: '+p);assert(!p.includes('normal-update-server'));assert(fs.statSync(path.join(root,p)).isFile());}
const originalFailure=external.at(-1);assert.equal(hash(read(originalFailure)),'1695c837cba7a502ed0c6a5e7b544b6d1d3ff4bff380626f0900d2502e311326');
const memory=read('memory/CANDIDATE-RC25-20261001.md').toString();for(const literal of [source,worker,'650/650','52 public','40 shell-cache','fresh context','26','six readable','GENERAL_OUTPUT_FRAGMENT','54782271',pkg.sha256,'remain active'])assert(memory.includes(literal),'Candidate record missing supported bound: '+literal);
const android105Path='qa/rc21-android-night/105-rc25-native-synthetic-q2-420s-result.json',android107Path='qa/rc21-android-night/107-rc25-native-fragment-discriminator-result.json';
const android105=load(android105Path),android107=load(android107Path),failed105=android105.steps.filter(x=>x.failure==='GENERAL_OUTPUT_FRAGMENT').at(-1),failed107=android107.steps.find(x=>x.nativeSeekPercent===95);
assert(failed105&&failed105.ended===false&&failed105.pruningCount===19&&failed105.maxFrameGapMs===171&&failed105.presented.at(-1).presentedFrames===4832&&failed105.presented.at(-1).time===404.166666);
assert(failed107.failure==='GENERAL_OUTPUT_FRAGMENT'&&failed107.fullDurationCompletionClaim===false&&failed107.expectedFailureDiagnostic===true);
const fragment=failed107.fragmentMetadata.at(-1),last=fragment.fragments.at(-1);assert(fragment.parseCode===0&&last.containsVideo===false&&last.followingMdatBytes===3675&&last.trafs.every(t=>fragment.tracks.some(k=>k.trackId===t.trackId&&k.handlerCode===1936684398)));
const summary={passed:true,source,worker,checks:{publicFixedGit:52,cache:40,uncachedArchives:8,private404:6,bindings:11,localTests:650,preferredSourceHashes:26,readableAdaptations:6,packageBytes:54782271,packageSHA256:pkg.sha256},
 metadataReview:{candidateRecordScopeConsistent:true,wholeGoalClaimedComplete:false,androidEndedClaimed:false,sourceReadinessTechnicalScopeOnly:true,freshContextProved:false,preNavigationInspectionExecuted:false,navigatorOnlineLimitationPreserved:true,originalNormalPCUpdateFailurePreserved:true},
 excluded:['all *private* files','all raw .log files and product TAP body','release ZIP bytes','all active normal-update local server records/producers','pending26 public/code/test edits'],
 reviewedExternalEvidence:[{path:android105Path,sha256:hash(read(android105Path)),scope:'synthetic native Android4832frames/19removals/404.166666finalframe; endedfalse'}, {path:android107Path,sha256:hash(read(android107Path)),scope:'native95percent fragment discriminator; finalknownaudio-only moof/mdat, completionfalse'}],
 errors:[],scope:'Independent saved metadata/evidence consistency review; no browser/deploy/current pending26 behavioral verification',producerSha256:hash(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(here,'metadata-review-summary.json'),JSON.stringify(summary,null,2)+'\n');selected.push(prefix+'metadata-review-summary.json');
const manifest={schema:'drive-original.fixed25-safe-savepoint-curation/1',source,worker,files:selected.sort().map(p=>({path:p,sha256:hash(read(p)),bytes:read(p).length})),
 exactPathsForStaging:[...selected,prefix+'curated-savepoint.json'].sort(),excluded:summary.excluded,packageReferenceOnly:{path:pkg.packagePath,bytes:pkg.bytes,sha256:pkg.sha256},currentProductWorktreeComparedToFixed25:false,
 pending26ProductPathsPreserved:true,activeLocalServerExcluded:true,originalNormalPCFailurePreserved:true,metadataReview:prefix+'metadata-review-summary.json'};
fs.writeFileSync(path.join(here,'curated-savepoint.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({passed:true,safeFiles:manifest.files.length,source,worker,errors:[]}));
