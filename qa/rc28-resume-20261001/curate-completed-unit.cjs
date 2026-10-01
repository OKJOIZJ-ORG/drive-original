const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(read(p));
const finite=json('qa/rc28-finite-acceptance-matrix/review.json');
const client=finite.migrationRoute.localClientBinding;
for(const row of client.sourceHashes)if(sha(read(row.path))!==row.sha256)throw Error('client source changed');
for(const key of ['configuredClientPresent','legacyDefaultClientPresent','configuredEqualsLegacyDefault','configuredClientFlowsToVerifiedExchange','serverAudienceAndAuthorizedPartyBound','serverRedirectBoundToConfiguredOrigin'])if(client[key]!==true)throw Error('client binding missing');
const actual=json('qa/rc28-resume-20261001/actual-state-current-safe.json');
if(!Object.values(actual.comparison).every(x=>x===true))throw Error('state raw comparison');
const fresh=actual.stages.find(x=>x.stage==='fresh-attempt-2').result;
if(!fresh.passed||fresh.documents!==10||fresh.sourceHash!=='2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377'||fresh.writes!==0||!fresh.actualCacheUnchanged||!fresh.actualWriterUnchanged)throw Error('fresh reconstruction');
const sink=actual.stages.find(x=>x.stage==='private-disk-reread');
if(!sink.result.passed||!sink.result.rereadEquivalent||!sink.restrictedAclVerified)throw Error('reread');
const binding={schema:'drive-original.rc28-root-state-binding/1',recordedAt:new Date().toISOString(),source:actual.source,version:actual.version,localClientBinding:{...client,runtimeProjectClientBindingVerified:true,scope:'Root combines unchanged reused-client/OIDC origin source checks with actual candidate canonical current full10-doc appData namespace, preserved legacy/writer/tombstones, private disk reread and exact-current-app empty-cache reconstruction/fullraw recapture equality.'},actualStateReport:{path:'qa/rc28-resume-20261001/actual-state-current-safe.json',sha256:sha(read('qa/rc28-resume-20261001/actual-state-current-safe.json'))},rootAcceptedClauses:['QA-AU-10','QA-SL-07'],pointInTimeCompletedSnapshots:true,subsequentHumanPlaybackChangedOwner:true,priorFailuresPreserved:true,newClient:false,newGrant:false,canonicalWrites:0,wholeGoalPassed:false};
const bindingPath='qa/rc28-resume-20261001/root-state-binding.json';if(fs.existsSync(path.join(root,bindingPath)))throw Error('binding already saved');fs.writeFileSync(path.join(root,bindingPath),JSON.stringify(binding,null,2)+'\n');
let paths=[
 'qa/rc28-resume-20261001/actual-corpus-safe.json','qa/rc28-resume-20261001/actual-pc-natural-safe.json','qa/rc28-resume-20261001/actual-pc-postrenewal-safe.json','qa/rc28-resume-20261001/actual-state-current-safe.json',bindingPath,
 'qa/rc28-resume-20261001/derive-pc-natural.cjs','qa/rc28-resume-20261001/pc-natural.expression.js','qa/rc28-resume-20261001/pc-natural-derivation.json',
 'qa/rc28-resume-20261001/post-renewal-seek.expression.js','qa/rc28-resume-20261001/post-renewal-seek-v2.expression.js','qa/rc28-resume-20261001/post-renewal-seek-v3.expression.js',
 'qa/rc28-resume-20261001/build-state-install.cjs','qa/rc28-resume-20261001/state-install.expression.js','qa/rc28-resume-20261001/state-install-build.json',
 'qa/rc28-resume-20261001/build-state-diagnostic.cjs','qa/rc28-resume-20261001/state-capture-diagnostic.expression.js','qa/rc28-resume-20261001/build-fresh-diagnostic.cjs','qa/rc28-resume-20261001/state-fresh-diagnostic.expression.js',
 'qa/rc28-resume-20261001/curate-completed-unit.cjs'
];
const children=['qa/rc21-android-night/162-exact66-natural-safe-stage-manifest.json','qa/rc28-resource-retirement-local/staging-manifest.json','qa/rc28-disposable-comparison-preparation/staging-manifest.json'];
for(const p of children){const m=json(p);for(const row of m.files){if(sha(read(row.path))!==row.sha256)throw Error('child hash '+row.path);paths.push(row.path);}paths.push(p);}
const deeper=json('qa/rc28-deeper-format-preparation/curated-savepoint.json');paths.push(...deeper.exactOwnedFiles);
const provenance=json('qa/rc28-deeper-format-preparation/provenance.json');
for(const row of provenance.outputs||[]){const p=row.path.startsWith('qa/')?row.path:'qa/rc28-deeper-format-preparation/'+row.path;if(row.sha256&&sha(read(p))!==row.sha256)throw Error('deeper output hash');}
paths=[...new Set(paths)].sort();
if(paths.some(p=>!p.startsWith('qa/')||p.includes('/private/')||/private|screenshot|\.png$|stdout/.test(path.basename(p))))throw Error('unsafe stage path');
const files=paths.map(p=>({path:p,bytes:read(p).length,sha256:sha(read(p))}));
const record={schema:'drive-original.rc28-root-resumed-completed-unit/1',source:actual.source,recordedAt:new Date().toISOString(),actualNaturalAndState:true,rootAcceptedStateClauses:binding.rootAcceptedClauses,files,fileCount:files.length,scope:'Explicit safe completedQA only; local29 product/UI/delivery/private originals/credentials excluded. Frozen unused deeper modeprobe bug retained for new derivative, not actual qualification.'};
const manifest='qa/rc28-resume-20261001/completed-unit-manifest.json';if(fs.existsSync(path.join(root,manifest)))throw Error('manifest already saved');fs.writeFileSync(path.join(root,manifest),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'completed-unit-stage-paths.json'),JSON.stringify([...paths,manifest,'qa/rc28-resume-20261001/completed-unit-stage-paths.json'],null,2)+'\n');
console.log(JSON.stringify({files:files.length,bytes:files.reduce((n,r)=>n+r.bytes,0),childHashesVerified:true,sourceBindingAccepted:true,noStaging:true}));
