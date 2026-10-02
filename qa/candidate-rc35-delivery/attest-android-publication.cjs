'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs');
guard.assertSource();const deployment=guard.requireDeployment();
const names={sourceReadiness:'source-readiness.json',deployment:'deployment.json',control:'redacted-readback.json',publicAudit:'results.json'};
const records=Object.fromEntries(Object.entries(names).map(([kind,name])=>[kind,JSON.parse(fs.readFileSync(path.join(__dirname,name)))]));
const {sourceReadiness:ready,control,publicAudit:audit}=records;
assert(ready.passed&&audit.passed&&deployment.passed&&deployment.stable);
assert.equal(ready.sourceCommit,guard.SOURCE);assert.equal(ready.version,guard.VERSION);
assert.equal(ready.workerVersion,deployment.workerVersion);assert.equal(control.workerVersion,deployment.workerVersion);
assert.equal(control.source,guard.SOURCE);assert.equal(audit.source,guard.SOURCE);assert.equal(audit.version,guard.VERSION);assert.equal(audit.base,guard.BASE);
assert.deepEqual(control.publicFlags,{AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'});
assert.equal(deployment.workerVersion,'5976c3f9-ba4f-47a1-955a-06d9748f6302');
assert.equal(audit.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'resume-delivery-audit-second.cjs'))));
assert.equal(audit.assets.length,64);assert.equal(audit.cached.length,49);assert.equal(audit.privateRoutes.length,6);
assert(audit.assets.every(row=>row.gitEqual)&&audit.cached.every(row=>row.gitEqual)&&audit.privateRoutes.every(row=>row.status===404));
assert(audit.cold.controlled&&audit.offline.controlled&&audit.cold.writes===false&&audit.cold.accountPresent===false&&audit.pageErrors===0);
for(const receipt of ready.evidence){const bytes=fs.readFileSync(path.join(guard.root,receipt.path));assert.equal(guard.sha(bytes),receipt.sha256);}
const proof={schema:'drive-original.root-verified-publication/1',sourceCommit:guard.SOURCE,version:guard.VERSION,
 verifiedByRoot:true,origin:new URL(guard.BASE).origin,worker:deployment.workerVersion,
 flags:{authEnabled:true,diagnosticsEnabled:true,generalWritesAllowed:false,freeOnly:true},
 receipts:Object.entries(names).map(([kind,name])=>{const bytes=fs.readFileSync(path.join(__dirname,name));return{kind,file:'qa/candidate-rc35-delivery/'+name,bytes:bytes.length,sha256:guard.sha(bytes)};}),
 producerSha256:guard.sha(fs.readFileSync(__filename)),scope:'Root verified same free-candidate cut and delivery; physical device and real-account acceptance remain separate'};
const binding=require('../player-track-selection/android-binding.cjs');binding.verifyPublication(proof,guard.SOURCE);
const target=path.join(guard.root,'qa/player-track-selection/android-publication-proof.json');
assert(!fs.existsSync(target),'Fresh publication attestation required');fs.writeFileSync(target,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({attested:true,source:guard.SOURCE,worker:deployment.workerVersion,receiptCount:4}));
