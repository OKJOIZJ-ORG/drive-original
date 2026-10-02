'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs');guard.assertSource();
const load=file=>JSON.parse(fs.readFileSync(path.join(__dirname,file)));
assert(load('source-readiness.json').passed&&load('results.json').passed);
assert(load('pc-normal-update-source-cache-result.json').passed&&load('pc-normal-update-cleanup.json').passed);
let old=fs.readFileSync(path.join(__dirname,'verified-download.cjs'),'utf8')
 .replace('let total=0,reader,timer,primaryError;','let total=0,reader,timer;')
 .replace('}catch(error){primaryError=error;error.delivery=','}catch(error){error.delivery=');
const begin=old.indexOf('  if(reader){let cleanupTimer'),end=old.indexOf('\n }\n}',begin);
assert(begin>0&&end>begin);
old=old.slice(0,begin)+`  if(reader){let cleanupTimer,settled=false;try{await Promise.race([reader.cancel().then(()=>{settled=true;},()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,5000);})]);}
   finally{clearTimeout(cleanupTimer);}if(!settled){const error=Error('DELIVERY_CLEANUP_UNSETTLED');error.delivery={bytesRead:total,expectedBytes:expected.length,elapsedMs:Date.now()-started};throw error;}}
`+old.slice(end+1);
const phaseHash=load('results-second-partial.json').downloadProducerSha256;
const variants=[old.replace(/\r\n/g,'\n'),old.replace(/\r?\n/g,'\r\n')];
const recovered=variants.find(value=>guard.sha(Buffer.from(value))===phaseHash);
assert(recovered,'Original failed download producer must be exactly recoverable');
fs.writeFileSync(path.join(__dirname,'verified-download-first-phase.cjs'),recovered);
const names=[
 'attest-android-publication.cjs','audit-memory-guard-first.json','audit-memory-guard-second.json','audit-memory-guard.json',
 'audit-output-first-partial.log','audit-output-second-partial.log','audit-output.log','audit-progress.json','audit-with-memory-guard.cjs',
 'build-release.py','delivery-guard.cjs','deploy-candidate.cjs','deployment.json','finalize-source-readiness.cjs',
 'materialization.json','materialize-candidate.cjs','package.json','pc-normal-update-cleanup.json','pc-normal-update-source-cache-result.json',
 'pc-source-binding.json','pc-source-proof.expression.js','pc-update-baseline-actual.json','pc-update-baseline.expression.js',
 'pc-update-preflight-first-tool-failure.json','prepare-pc-update.cjs','prepare-resume-audit.cjs','readback-candidate.cjs','redact-readback.cjs',
 'redacted-readback.json','results-first-partial.json','results-second-partial.json','results.json',
 'resume-audit-with-memory-guard-second.cjs','resume-audit-with-memory-guard.cjs','resume-delivery-audit-second.cjs','resume-delivery-audit.cjs',
 'resume-preparation-first-tool-failure.json','source-readiness.json','verified-download.cjs','verified-download-first-phase.cjs',
 'verified-download.test.cjs','curate-delivery-savepoint.cjs','stage-delivery-savepoint.cjs','stage-savepoint-tool-failures.json'
];
assert.equal(names.length,new Set(names).size);
const owned=names.map(name=>'qa/candidate-rc35-delivery/'+name);
owned.push('memory/CANDIDATE-RC35-20261002.md','memory/CHECKPOINT.md','memory/goal/commercial-player-stability.md','memory/checkpoints/20261002-1439-rc35-delivery.md');
const sensitive=new Set();
function collect(value,key=''){
 if(typeof value==='string'&&/^(?:id|fileId|name|accountId|accountKey|authAccountKey|email|token|access_token|refresh_token)$/i.test(key)&&value.length>=8)sensitive.add(value);
 else if(Array.isArray(value))value.forEach(item=>collect(item,key));
 else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>collect(v,k));
}
for(const name of ['q3-target-cua1-1-private.json','q3-ledger-final-rc34-cleanup-private.json','q3-ledger-cua1-1-private.json']){
 const p=path.join(guard.root,'qa/v2-state-recovery-backup',name);if(fs.existsSync(p))collect(JSON.parse(fs.readFileSync(p)));
}
assert(sensitive.size>0,'Existing private curation reference required');
const rows=owned.map(file=>{const p=path.join(guard.root,file),stat=fs.lstatSync(p);assert(stat.isFile()&&!stat.isSymbolicLink());
 const bytes=fs.readFileSync(p),body=bytes.toString();for(const value of sensitive)assert(!body.includes(value),'Private reference found in '+file);
 assert(!/Bearer\s+[A-Za-z0-9._-]{20,}|ya29\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(body),'Credential content in '+file);
 return{file,bytes:bytes.length,sha256:guard.sha(bytes)};
});
const report={sourceCommit:guard.SOURCE,version:guard.VERSION,worker:guard.requireDeployment().workerVersion,
 publicScopeUnchanged:true,passingDelivery:true,passingNormalPCUpdate:true,privateReferenceCount:sensitive.size,privateReferenceMatches:0,
 privateExcluded:['deployment-private.log','version-readback-private.json','version-readback-error-private.log'],
 failedDownloadProducerRecoveredExactly:true,files:rows,producerSha256:guard.sha(fs.readFileSync(__filename)),
 scope:'Exact passing delivery and normal PC update savepoint; affected Android/player/color/performance/whole-goal proof remains separate'};
fs.writeFileSync(path.join(__dirname,'curation-manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({curated:true,files:rows.length,privateReferenceMatches:0,failedPhaseRecovered:true}));
