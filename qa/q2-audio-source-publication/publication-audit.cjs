'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),licenses=path.join(root,'licenses');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(licenses,'audio-source-manifest.json')));
const publicFiles=['licenses/audio-source-NOTICE.md','licenses/audio-source-manifest.json','licenses/audio-source-reconstruct.cjs',...manifest.parts.map(p=>'licenses/'+p.path)];
for(const p of publicFiles)assert(fs.statSync(path.join(root,p)).size<=8*1024*1024,p);
for(const p of manifest.parts){const b=fs.readFileSync(path.join(licenses,p.path));assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256);}
const inputs=JSON.parse(fs.readFileSync(path.join(__dirname,'curated-inputs.json')));
assert(!inputs.some(i=>/(?:fixture|browser-|account|configure-attempt|\.log$|audio-general|pipeline\.mjs|\.mp4$)/i.test(i.source)));
const workInputs=inputs.filter(i=>i.source.includes('/work/')).map(i=>i.archivePath).sort();
assert.deepEqual(workInputs,['configuration/avconfig.h','configuration/ffversion.h','toolchain/emscripten-releases-tags.json','toolchain/emsdk_manifest.json']);
for(const i of inputs){
 const b=fs.readFileSync(path.join(root,i.source));assert.equal(sha(b),i.sha256);
 if(/\.(?:json|md|cjs|mjs|js|sh|py|h|c|mak|txt)$/.test(i.source)){
  assert(!/[A-Z]:[\\/]Users[\\/]|Bearer\s+[A-Za-z0-9._-]{16,}|ya29\.[A-Za-z0-9_-]+|GOCSPX-[A-Za-z0-9_-]+/i.test(b.toString('utf8')),i.source);
 }
}
let run=cp.spawnSync(process.execPath,[path.join(root,'scripts/package-audio-source.cjs')],{cwd:root,encoding:'utf8'});
assert.equal(run.status,0,run.stderr);const again=JSON.parse(fs.readFileSync(path.join(licenses,'audio-source-manifest.json')));
assert.equal(again.sha256,manifest.sha256,'deterministic package');assert.deepEqual(again,manifest);
run=cp.spawnSync(process.execPath,[path.join(licenses,'audio-source-reconstruct.cjs')],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
const reconstructed=path.join(licenses,'audio-source-v1.tar.gz'),reconstructedLocal=path.join(__dirname,'reconstructed-audio-source-v1.tar.gz');
assert.equal(sha(fs.readFileSync(reconstructed)),manifest.sha256);
fs.copyFileSync(reconstructed,reconstructedLocal);fs.unlinkSync(reconstructed);
run=cp.spawnSync(process.execPath,['verify.cjs','output/codec.wasm'],{cwd:path.join(__dirname,'audio-source'),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
const build=JSON.parse(fs.readFileSync(path.join(root,'media/audio-codec-build.json')));
const historicalManifestPaths=['qa/q2-audio-compatibility/sourcebuilt-evidence-manifest.json','qa/q2-audio-compatibility/eac3-source-build/evidence-manifest.json'];
const historicalManifests=historicalManifestPaths.map(p=>({path:p,bytes:fs.statSync(path.join(root,p)).size,sha256:sha(fs.readFileSync(path.join(root,p)))}));
assert.equal(historicalManifests[1].sha256,build.preferredSource.find(p=>p.path===historicalManifestPaths[1]).sha256);
const report={sourcePackage:{bytes:manifest.bytes,sha256:manifest.sha256,parts:manifest.parts.length,partLimitBytes:manifest.partLimitBytes,materialFiles:manifest.files.length},
 deterministicRegeneration:true,reconstructedArchiveHash:true,extractedInventoryVerified:true,exactRelinkedWasmVerified:true,
 publicFiles:publicFiles.map(p=>({path:p,bytes:fs.statSync(path.join(root,p)).size,sha256:sha(fs.readFileSync(path.join(root,p)))})),
 explicitInputSelection:true,privateCredentialPatternMatches:0,allowedBuildTreeInputs:workInputs,historicalManifests,
 upstreamEmsdkManifestsMatchFullPinnedArchive:true,distributionReadyUnchanged:build.distributionReady===false,
 scope:'No public access/deployment, browser/device or patent clearance claim. Audit does not change product logic or allowlists.'};
assert(report.distributionReadyUnchanged);fs.writeFileSync(path.join(__dirname,'publication-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sourcePackage:report.sourcePackage,checks:'passed',publicAssets:publicFiles.length}));
