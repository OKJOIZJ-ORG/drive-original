'use strict';
// Bind current wrappers to this delivery without rewriting historical build records.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const guard=require('./delivery-guard.cjs');
guard.assertSource();const deployment=guard.requireDeployment();
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name)));
const audit=load('results.json'),control=load('redacted-readback.json'),pack=load('package.json');
assert(audit.passed&&pack.passed&&deployment.stable);
assert.equal(audit.source,guard.SOURCE);assert.equal(control.source,guard.SOURCE);assert.equal(pack.sourceCommit,guard.SOURCE);
assert.equal(audit.version,guard.VERSION);assert.equal(pack.version,guard.VERSION);assert.equal(audit.base,guard.BASE);
assert.equal(control.workerVersion,deployment.workerVersion);
assert.deepEqual(control.publicFlags,{AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'});
assert.equal(control.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'redact-readback.cjs'))));
assert.equal(deployment.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'deploy-candidate.cjs'))));
const expected=[...guard.files,'.nojekyll'],delivered=new Map(audit.assets.map(row=>[row.file,row]));
assert.equal(delivered.size,expected.length);assert.equal(deployment.assets.length,expected.length);assert.equal(pack.entries,expected.length);
assert(audit.assets.every(row=>row.gitEqual));
const cacheLiteral=guard.blob('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1];
const cacheFiles=vm.runInNewContext(cacheLiteral,{}, {timeout:1000}).filter(file=>file!=='./').map(file=>file.slice(2));
assert.equal(audit.cached.length,cacheFiles.length);assert(audit.cached.every(row=>row.gitEqual));
assert.equal(audit.uncachedSourceDownloads.length,9);assert(audit.uncachedSourceDownloads.every(row=>!row.cached));
assert.equal(audit.privateRoutes.length,6);assert(audit.privateRoutes.every(row=>row.status===404));
assert(audit.cold.controlled&&audit.offline.controlled&&audit.cold.accountPresent===false&&audit.cold.writes===false&&audit.pageErrors===0);
const fixedSourceAssetBindings=deployment.assets.map(row=>{
 const bytes=row.file==='.nojekyll'?Buffer.alloc(0):guard.blob(row.file);
 assert.equal(row.bytes,bytes.length);assert.equal(delivered.get(row.file)?.bytes,bytes.length);assert.equal(row.sha256,guard.sha(bytes));
 return {path:row.file,sha256:row.sha256};
});
assert(pack.everyPublicEntryEqualsGitBlob&&pack.extraPrivateEntries===0);
assert.equal(guard.sha(fs.readFileSync(path.join(path.dirname(guard.root),pack.packagePath))),pack.sha256);
const buildName='media/audio-codec-build.json',buildBytes=guard.blob(buildName),build=JSON.parse(buildBytes);
assert(fs.readFileSync(path.join(guard.root,buildName)).equals(buildBytes));
assert(build.distributionReady===true&&build.blockingDistributionRequirements.length===0);
const currentWrapperPaths=new Set(['media/audio-general-pipeline.mjs','media/audio-general-worker.mjs']);
const currentAdaptationsSupersedingHistoricalBuildSnapshot=[];
const snapshotRows=[...build.preferredSource,...build.artifacts,...build.correspondingSource.readableCurrentAdaptations,build.correspondingSource.archiveManifest];
for(const row of snapshotRows){
 const working=fs.readFileSync(path.join(guard.root,row.path)),current=guard.sha(working);
 if(current!==row.sha256){
  assert(currentWrapperPaths.has(row.path),'Unexpected historical build drift: '+row.path);
  assert(delivered.get(row.path)?.gitEqual);assert(working.equals(guard.blob(row.path)));
  if(!currentAdaptationsSupersedingHistoricalBuildSnapshot.some(item=>item.path===row.path))
   currentAdaptationsSupersedingHistoricalBuildSnapshot.push({path:row.path,historicalBuildSha256:row.sha256,currentGitSha256:current,currentDeliveryGitEqual:true});
 }
}
for(const row of [...build.artifacts,...build.correspondingSource.readableCurrentAdaptations,build.correspondingSource.archiveManifest]){
 assert(delivered.get(row.path)?.gitEqual);const current=guard.sha(guard.blob(row.path));
 assert(current===row.sha256||currentWrapperPaths.has(row.path));
}
guard.assertSource();guard.verifySite();
const evidenceNames=['results.json','deployment.json','redacted-readback.json','package.json'];
const report={passed:true,version:guard.VERSION,sourceCommit:guard.SOURCE,workerVersion:deployment.workerVersion,
 publicAssets:expected.length,cacheAssets:cacheFiles.length,uncachedSourceArchives:9,private404:6,
 preferredSourceHashesChecked:build.preferredSource.length,currentReadableAdaptations:build.correspondingSource.readableCurrentAdaptations.length,
 buildRecordSha256:guard.sha(buildBytes),canonicalBuildMetadataWritten:false,currentAdaptationsSupersedingHistoricalBuildSnapshot,
 fixedSourceAssetBindings,evidence:evidenceNames.map(name=>({path:'qa/candidate-rc35-delivery/'+name,sha256:guard.sha(fs.readFileSync(path.join(__dirname,name)))})),
 producerSha256:guard.sha(fs.readFileSync(__filename)),
 scope:'Technical same-candidate runtime/notice/corresponding-source/current-wrapper delivery only. Historical build evidence retained; no production/device/patent/broad format/color qualification.'};
fs.writeFileSync(path.join(__dirname,'source-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,source:guard.SOURCE,assets:expected.length,cache:cacheFiles.length,sourceArchives:9,currentWrapperBindings:currentAdaptationsSupersedingHistoricalBuildSnapshot.length}));
