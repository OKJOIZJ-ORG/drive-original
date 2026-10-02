'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audit=require('./audit.cjs'),guard=require('./delivery-guard.cjs'),copy=x=>JSON.parse(JSON.stringify(x));
const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'audit-attempt1-unnecessary-archive/results.json'))),proof=JSON.parse(fs.readFileSync(path.join(__dirname,'audit-attempt1-unnecessary-archive/preservation.json')));
const expected={source:guard.SOURCE,version:guard.VERSION,base:guard.BASE,workerVersion:prior.workerVersion,downloadProducerSha256:prior.downloadProducerSha256,assets:prior.inputAssets};
test('rc36 file bindings and historical path bindings both qualify only exact matching bytes',()=>{
 const row={file:'media/test.wasm',bytes:10,sha256:'a'},old={...row,gitEqual:true};
 for(const key of ['file','path'])audit.validateUnchangedAsset(row,old,{[key]:row.file,sha256:'a'},'a');
 for(const patch of [{file:'other',sha256:'a'},{file:row.file,sha256:'b'},{}])assert.throws(()=>audit.validateUnchangedAsset(row,old,patch,'a'));
});
test('external interruption reuses only exact completed prefix and observed process cleanup',()=>{
 assert.equal(audit.validateExternalPrefix(prior,proof,expected).length,57);
 for(const change of [r=>r.source='wrong',r=>r.workerVersion='wrong',r=>r.assets[0].sha256='wrong',r=>r.assets.reverse(),r=>r.assets.pop(),r=>r.cached.push({}),r=>r.passed=true]){const p=copy(prior);change(p);assert.throws(()=>audit.validateExternalPrefix(p,proof,expected));}
 for(const change of [p=>p.externalCleanup.ownedProcessGone=false,p=>p.externalCleanup.ownedLocalSockets=1,p=>p.externalCleanup.ownedChildProcesses=1,p=>p.externalCleanup.browserLaunchNeverReached=false,p=>p.failure='other']){const p=copy(proof);change(p);assert.throws(()=>audit.validateExternalPrefix(prior,p,expected));}
});
test('current committed delivery has all60 unchanged bindings before any remaining network request',()=>{
 guard.assertSource();const result=audit.unchangedDelivery(guard.verifySite(),guard.requireDeployment());assert.equal(result.rows.length,60);
 assert.equal(result.rows.filter(r=>/\.wasm$|\.tgz$|\.tar\.gz\.part\d+$/.test(r.file)).length,11);
});
