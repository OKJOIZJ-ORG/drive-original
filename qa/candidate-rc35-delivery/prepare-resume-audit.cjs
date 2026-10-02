'use strict';
// Reuse the fixed original producer and a pinned successful HTTP prefix.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs');
guard.assertSource();guard.requireDeployment();
for(const [from,to] of [['results.json','results-second-partial.json'],['audit-output.log','audit-output-second-partial.log'],['audit-memory-guard.json','audit-memory-guard-second.json']]){
 const saved=path.join(__dirname,to);if(!fs.existsSync(saved))fs.copyFileSync(path.join(__dirname,from),saved);
}
const priorPath=path.join(__dirname,'results-second-partial.json');
const priorBytes=fs.readFileSync(priorPath),prior=JSON.parse(priorBytes);
const priorSha='a1fe26f4b4bbfd2d5a4f5c563e5439a3bd13b9318212f022d9bd39d14e36a2ac';
assert.equal(guard.sha(priorBytes),priorSha);
assert.equal(prior.source,guard.SOURCE);assert.equal(prior.version,guard.VERSION);
assert.equal(prior.base,guard.BASE);assert.equal(prior.assets.length,59);
assert.equal(prior.privateRoutes.length,0);assert.equal(prior.passed,false);
assert.equal(prior.currentStep,'public:licenses/audio-source-v1.tar.gz.part004');
assert.equal(prior.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'resume-delivery-audit.cjs'))));
assert.equal(prior.reusedPublicPrefix.sha256,'9148bff5627c150c908f112aa80baf98a6ba88012e99dd00d68cfaf3e83a9394');
prior.assets.forEach((row,i)=>{assert.equal(row.file,guard.files[i]);assert.equal(row.gitEqual,true);assert.equal(row.bytes,guard.blob(row.file).length);});
let producer=guard.blob('qa/candidate-delivery-audit.cjs').toString();
assert(fs.readFileSync(path.join(guard.root,'qa/candidate-delivery-audit.cjs')).equals(Buffer.from(producer)));
producer=producer.replace(/\r\n/g,'\n');
const replace=(from,to)=>{from=from.replace(/\r\n/g,'\n');assert.equal(producer.split(from).length,2,'Replacement must be unique');producer=producer.replace(from,to);};
replace("const root=path.resolve(__dirname,'..'),source=process.argv[2];","const guard=require('./delivery-guard.cjs'),{verifiedDownload}=require('./verified-download.cjs');\nguard.assertSource();guard.requireDeployment();\nconst root=path.resolve(__dirname,'../..'),source=process.argv[2];\nassert.equal(source,guard.SOURCE);");
replace("const out=path.join(__dirname,outputName),result={source,version,base,passed:false,assets:[],privateRoutes:[],",`const out=__dirname,priorBytes=fs.readFileSync(path.join(out,'results-second-partial.json')),prior=JSON.parse(priorBytes);
assert.equal(guard.sha(priorBytes),'${priorSha}');
assert.equal(prior.source,source);assert.equal(prior.version,version);assert.equal(prior.base,base);
assert.equal(prior.passed,false);assert.equal(prior.assets.length,59);assert.equal(prior.privateRoutes.length,0);
prior.assets.forEach((row,i)=>{assert.equal(row.file,files[i]);assert.equal(row.gitEqual,true);assert.equal(row.bytes,git(row.file).length);});
const result={source,version,base,passed:false,assets:prior.assets.map(row=>({...row,reused:true})),privateRoutes:[],
  producerSha256:guard.sha(fs.readFileSync(__filename)),downloadProducerSha256:guard.sha(fs.readFileSync(path.join(out,'verified-download.cjs'))),
  reusedPublicPrefix:{path:'qa/candidate-rc35-delivery/results-second-partial.json',sha256:guard.sha(priorBytes),count:59,previousResumeProducerSha256:prior.producerSha256,previousPrefix:prior.reusedPublicPrefix,originalProducerSha256:guard.sha(git('qa/candidate-delivery-audit.cjs'))},`);
replace("for(const file of [...files,'.nojekyll']){","for(const file of [...files,'.nojekyll'].slice(prior.assets.length)){");
replace("    const response=await fetch(`${base}${file}?verify=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});\r\n    assert.equal(response.status,200,file);\r\n    const bytes=Buffer.from(await response.arrayBuffer());\r\n    assert(bytes.equals(file==='.nojekyll'?Buffer.alloc(0):git(file)),`Git byte mismatch: ${file}`);\r\n    result.assets.push({file,bytes:bytes.length,gitEqual:true});",`    const expected=file==='.nojekyll'?Buffer.alloc(0):git(file);
    let metrics;try{metrics=await verifiedDownload(base+file+'?verify='+Date.now(),expected,{totalMs:expected.length>=8388608?240000:120000});}
    catch(error){result.downloadFailure=error.delivery;throw error;}
    result.assets.push({file,...metrics,gitEqual:true});
    console.log(JSON.stringify({step:'verified-public',file,bytes:metrics.bytes,elapsedMs:metrics.elapsedMs}));`);
replace("assert.deepEqual(errors,[]);result.pageErrors=0;result.passed=true;","assert.deepEqual(errors,[]);guard.assertSource();result.pageErrors=0;result.passed=true;");
const target=path.join(__dirname,'resume-delivery-audit-second.cjs');
if(fs.existsSync(target))assert.equal(fs.readFileSync(target,'utf8'),producer,'Existing resume producer differs');
else fs.writeFileSync(target,producer);
let wrapper=fs.readFileSync(path.join(__dirname,'audit-with-memory-guard.cjs'),'utf8');
assert.equal(wrapper.split("['qa/candidate-delivery-audit.cjs',guard.SOURCE").length,2);
wrapper=wrapper.replace("['qa/candidate-delivery-audit.cjs',guard.SOURCE","['qa/candidate-rc35-delivery/resume-delivery-audit-second.cjs',guard.SOURCE");
fs.writeFileSync(path.join(__dirname,'resume-audit-with-memory-guard-second.cjs'),wrapper);
const failure={passed:false,classification:'QA_SHELL_QUOTING_PREPARATION_FAILURE',productMutation:false,auditStarted:false,
  stages:['POWERSHELL_PARSE_ERROR','MISSING_RESUME_MODULE_SYNTAX','MISSING_RESUME_MODULE_RUN','QA_NEWLINE_MATCH_PREPARATION'],correction:'Literal file patch, normalized producer newline matching and checked preparation before dependent execution'};
fs.writeFileSync(path.join(__dirname,'resume-preparation-first-tool-failure.json'),JSON.stringify(failure,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'pc-update-preflight-first-tool-failure.json'),JSON.stringify({stage:'read-only-before-update',
 classification:'QA_REFERENCE_TO_FUTURE_TRACKS_GLOBAL',missingGlobal:'playerTracksOwner',connectionResponded:true,
 correctedWithTypeof:true,mutation:false,tabVersion:'1.22.0-rc.34'},null,2)+'\n');
const checkpoint=path.join(guard.root,'memory/CHECKPOINT.md'),archive=path.join(guard.root,'memory/checkpoints/20261002-1439-rc35-delivery.md');
if(!fs.existsSync(archive))fs.copyFileSync(checkpoint,archive);
fs.writeFileSync(checkpoint,`# Checkpoint — ACTIVE D074 — 2026-10-02 rc35 delivery in progress

## The story so far

Approved full queue ACTIVE on codex/v2-kickoff-diagnostics, immutable source ${guard.SOURCE}. Verified bounded audio/subtitle selection, selected Q2, terminal seek recovery and retained failures are committed; 220 focused app/static/routing/track checks and 17 endpoint checks passed. RC35 owner is memory/CANDIDATE-RC35-20261002.md. Exact metadata/AVC/YUV is preserved, while undeclared-color canvas difference remains UNKNOWN/failed strict oracle. No broad corpus scan.

One free rc35 candidate deployment and control-plane readback passed, Worker5976c3f9-ba4f-47a1-955a-06d9748f6302. Package64 entries equals Git. Public audit first verified48 then resumed to59 Git-equal entries. Archive part004 made6984064/8388608B progress but reached120s; rejected cancellation was mislabeled unsettled. Both prefixes/failures retained; corrected real HTTP abort plus4 original checks pass. Remaining5-entry resume extends only large-file total cap to240s, keeping15s no-progress and byte bounds. No browser was launched yet. Android runner is frozen,15local tests/7syntax pass, physical playback not started. PC tab275140556 responds onrc34/idle. Original69 adoption, affected physicalAndroid/currentPC update and qualified performance adjudication remain; unmapped historical MOV90% timeout stays.

## Decided

- D050/D074 permit exact disposable fixture, real PC/Android, local commits/free candidate; production/main/push/new grants/permanent deletion separate. iOS deferred; automation PAUSED.
- Reuse valid unchanged receipts. Tool-only changes do not trigger product deployment or whole suite. Caption/track failures remain explicit; no guessed color matrix.

## Waiting on the user

None.

## Next first action

Run node --check on qa/candidate-rc35-delivery/resume-delivery-audit-second.cjs and resume-audit-with-memory-guard-second.cjs, then execute the latter with --execute only if both checks pass; focus on that audit through final source-readiness adjudication.

## Tried

- First delivery audit timed out on licenses/video-q3-source.tgz after48 successful Git-equal entries; prefix and raw failure retained, browser never launched.
- First resume reached59 successes then part004 total120s at6.98MB; cleanup rejected because its HTTP stream was aborted. Preserve primary deadline, accept settled rejection/release reader; actual HTTP abort regression passes. Large-file cap240s is based on observed progress, not an identical retry.
- Inline PowerShell/Node quoting failed to create resume files; dependent module calls also failed without an audit start. Replaced with literal patched preparation and checked sequential execution.
- rc34 read-only preflight referenced rc35-only playerTracksOwner; typeof guard fixed QA, no product mutation.
- Earlier native→Q1 null-owner, retry-picker identity, pendingcue gate and terminal-frame gap defects were fixed and validated in the committed unit. Strict undeclared-color RGBA identity is not claimed.
`);
console.log(JSON.stringify({prepared:true,reused:59,remaining:guard.files.length+1-59,producerSha256:guard.sha(Buffer.from(producer))}));
