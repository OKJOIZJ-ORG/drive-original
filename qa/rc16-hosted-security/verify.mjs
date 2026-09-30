import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const leaf=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const live=JSON.parse(await readFile(new URL('live-results.json',leaf))),settings=JSON.parse(await readFile(new URL('settings.json',leaf)));
assert.equal(live.complete,true);assert.equal(live.versionStable,true);assert.equal(live.versionBefore,'1.22.0-rc.16');assert.equal(live.versionAfter,'1.22.0-rc.16');assert.equal(live.cases.length,12);assert.ok(live.cases.every(x=>x.passed));assert.equal(live.requests,16);assert.ok(live.responseBytes<=65536);
assert.equal(hash(await readFile(new URL('probe-executed.mjs',leaf))),live.producerSHA256);
assert.equal(settings.checkedIn.observabilityEnabled,false);assert.equal(settings.retainedDeployedMetadata.observabilityFieldsPresent,false);assert.equal(settings.retainedDeployedMetadata.enabled,null);assert.equal(settings.hostedLogsRead,false);assert.ok(settings.sourceFiles.every(x=>x.sourceContentMatchedIgnoringCRLF));
for(const x of settings.sourceFiles)assert.equal(hash(await readFile(new URL('../../'+x.path,leaf))),x.sha256);
let captured=null;const server=createServer((req,res)=>{captured=req.headers['sec-fetch-mode'];res.end('{}');});
try{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const r=await fetch('http://127.0.0.1:'+server.address().port,{headers:{'Sec-Fetch-Mode':'navigate'},signal:AbortSignal.timeout(5000)});await r.text();assert.equal(captured,'cors');}finally{await new Promise(resolve=>server.close(resolve));}
await writeFile(new URL('local-transport-verification.json',leaf),JSON.stringify({schema:'drive-original.rc16-hosted-security-transport/1',node:process.version,loopbackOnly:true,requestedFetchMode:'navigate',observedFetchMode:captured,passed:true,hostedRequests:0},null,2)+'\n');
const files=['README.md','probe-executed.mjs','probe.mjs','settings.json','live-results.json','verify.mjs','local-transport-verification.json'];
const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(new URL(p,leaf)))])));
await writeFile(new URL('local-verification.json',leaf),JSON.stringify({schema:'drive-original.rc16-hosted-security-local-verification/1',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:hashes,liveCases:12,sourceHashesStable:true,localTransportPassed:true,existingFullSuiteReused:true,hostedRequests:0,settingsWrites:0},null,2)+'\n');
await writeFile(new URL('curated-savepoint.json',leaf),JSON.stringify({schema:'drive-original.rc16-hosted-security-curation/1',exactOwnedFiles:[...files,'local-verification.json','curated-savepoint.json'].map(p=>'qa/rc16-hosted-security/'+p),excluded:['private version readback','raw response bodies/provider errors','customer IDs/account secrets','originals','product/global settings','prior source/evidence leaves'],commitOwner:'root'},null,2)+'\n');
console.log(JSON.stringify({localVerified:true,liveCases:12,localTransportPassed:true,curatedFiles:9,hostedRequests:0}));
