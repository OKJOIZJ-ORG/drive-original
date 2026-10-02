'use strict';
// Explicit candidate-only actions. One action per invocation; no automatic retry.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),guard=require('./delivery-guard.cjs');
const action=process.argv[2],external=['deploy','readback'].includes(action);
if(!['materialize','deploy','readback','finalize'].includes(action)||process.argv.slice(3).join(' ')!==(external?'--execute':''))throw Error('DELIVERY_ACTION_ARGUMENTS_REQUIRED');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
const safeFailure=error=>/^[A-Z0-9_]+$/.test(error.message)?error.message:error.code||'DELIVERY_ACTION_FAILED';
function materialize(){
 const parent=path.dirname(guard.site);if(fs.realpathSync(parent)!==parent||!fs.lstatSync(parent).isDirectory())throw Error('RELEASE_DIRECTORY_REQUIRED');
 const blobs=new Map(guard.files.map(file=>[file,guard.blob(file)]));blobs.set('.nojekyll',Buffer.alloc(0));
 if(!fs.existsSync(guard.site)){fs.mkdirSync(guard.site);for(const[file,bytes]of blobs){const target=path.join(guard.site,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}}
 const assets=guard.verifySite();guard.assertSource();guard.save('materialization.json',{...guard.assertSource(),passed:true,materializedPath:guard.site,assets,everyPublicAssetEqualsGit:true,oldSiteUntouched:true,actualDeployment:false});
 return{passed:true,assets:assets.length,source:guard.SOURCE};
}
function deploy(){
 guard.requireExecute();if(fs.existsSync(path.join(__dirname,'deployment-attempt.json'))||fs.existsSync(path.join(__dirname,'deployment-private.log')))throw Error('RETAINED_DEPLOYMENT_ATTEMPT_EXISTS');
 const assets=guard.verifySite(),startedAt=new Date().toISOString();
 guard.save('deployment-attempt.json',{source:guard.SOURCE,version:guard.VERSION,candidateUrl:guard.BASE,startedAt,producerSha256:guard.sha(fs.readFileSync(__filename)),completed:false,noAutomaticRetry:true});
 const run=cp.spawnSync(process.execPath,[path.join(guard.worker,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config','wrangler.jsonc','--assets',guard.site],{cwd:guard.worker,env:guard.cliEnv,encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024,windowsHide:true});
 const raw=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(__dirname,'deployment-private.log'),raw,{flag:'wx'});
 const workerVersion=/Current Version ID:\s*([a-f0-9-]{36})/i.exec(raw)?.[1]||null;
 let stable=false;try{guard.assertSource();stable=JSON.stringify(assets)===JSON.stringify(guard.verifySite());}catch{}
 const record={source:guard.SOURCE,version:guard.VERSION,startedAt,finishedAt:new Date().toISOString(),exitCode:run.status,signal:run.signal,errorCode:run.error?.code||null,passed:run.status===0&&!run.signal&&!run.error&&stable&&Boolean(workerVersion),workerVersion,stable,candidateUrl:guard.BASE,assetsPath:guard.site,assets,rawLogSha256:guard.sha(Buffer.from(raw)),producerSha256:guard.sha(fs.readFileSync(__filename)),scope:'Reviewed free rc38 candidate only; no production/main/push/automation/grants/media or general Drive writes'};
 guard.save('deployment.json',record);if(!record.passed)throw Error('CANDIDATE_DEPLOYMENT_FAILED');return{passed:true,source:guard.SOURCE,workerVersion,stable};
}
function readback(){
 guard.requireExecute();const deployment=guard.requireDeployment();if(fs.existsSync(path.join(__dirname,'readback-attempt.json'))||fs.existsSync(path.join(__dirname,'version-readback-private.json')))throw Error('RETAINED_READBACK_ATTEMPT_EXISTS');
 guard.save('readback-attempt.json',{source:guard.SOURCE,workerVersion:deployment.workerVersion,startedAt:new Date().toISOString(),completed:false,noAutomaticRetry:true});
 const run=cp.spawnSync(process.execPath,[path.join(guard.worker,'node_modules/wrangler/bin/wrangler.js'),'versions','view',deployment.workerVersion,'--json','--config','wrangler.jsonc'],{cwd:guard.worker,env:guard.cliEnv,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,windowsHide:true});
 fs.writeFileSync(path.join(__dirname,'version-readback-private.json'),run.stdout||'',{flag:'wx'});fs.writeFileSync(path.join(__dirname,'version-readback-error-private.log'),run.stderr||'',{flag:'wx'});
 if(run.status!==0||run.error||run.signal)throw Error('VERSION_READBACK_FAILED');
 const raw=Buffer.from(run.stdout),record=JSON.parse(run.stdout);assert.equal(record.id,deployment.workerVersion);
 const expectedTypes={ACCOUNT_KEY:'secret_text',ASSETS:'assets',AUTH_DIAGNOSTICS:'plain_text',AUTH_ENABLED:'plain_text',AUTH_HMAC_KEY:'secret_text',AUTH_OBJECTS:'durable_object_namespace',CANDIDATE_DRIVE_WRITES_ENABLED:'plain_text',CREDENTIAL_ENCRYPTION_KEY_V1:'secret_text',GOOGLE_CLIENT_ID:'plain_text',GOOGLE_CLIENT_SECRET:'secret_text',PUBLIC_ORIGIN:'plain_text'};
 const flags={AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'};
 assert.deepEqual(record.resources.bindings.map(b=>b.name).sort(),Object.keys(expectedTypes).sort());
 const bindings=Object.entries(expectedTypes).map(([name,type])=>{const rows=record.resources.bindings.filter(b=>b.name===name);assert.equal(rows.length,1);assert.equal(rows[0].type,type);if(name in flags)assert.equal(rows[0].text,flags[name]);if(name==='PUBLIC_ORIGIN')assert.equal(rows[0].text,new URL(guard.BASE).origin);return{name,type,...(type==='secret_text'?{secretConfigured:true}:{})};});
 guard.assertSource();guard.save('redacted-readback.json',{source:guard.SOURCE,workerVersion:record.id,publicFlags:flags,bindings,rawInputSha256:guard.sha(raw),producerSha256:guard.sha(fs.readFileSync(__filename)),omitted:['account/namespace IDs','client ID','secret values','raw CLI/author metadata'],hostedLogContentsRead:false});
 return{passed:true,source:guard.SOURCE,workerVersion:record.id,bindings:bindings.length,publicFlags:flags};
}
function finalize(){
 const deployment=guard.requireDeployment(),audit=load('results.json'),control=load('redacted-readback.json'),pack=load('package.json');
 for(const receipt of[audit,control])assert.equal(receipt.source,guard.SOURCE);assert.equal(pack.sourceCommit,guard.SOURCE);
 assert(audit.passed&&pack.passed&&deployment.stable&&audit.cleanup?.passed);assert.equal(audit.version,guard.VERSION);assert.equal(audit.base,guard.BASE);assert.equal(pack.version,guard.VERSION);assert.equal(control.workerVersion,deployment.workerVersion);assert.equal(audit.workerVersion,deployment.workerVersion);
 assert.deepEqual(control.publicFlags,{AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'});
 for(const receipt of[control,deployment])assert.equal(receipt.producerSha256,guard.sha(fs.readFileSync(__filename)));
 assert.equal(audit.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'audit.cjs'))));assert.equal(audit.downloadProducerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'verified-download.cjs'))));assert.equal(pack.producerSha256,guard.sha(fs.readFileSync(path.join(__dirname,'build-release.py'))));
 const expected=[...guard.files,'.nojekyll'],delivered=new Map(audit.assets.map(row=>[row.file,row])),cached=guard.shellFiles(),archives=guard.files.filter(file=>/\.tgz$|\.tar\.gz\.part\d+$/.test(file));
 assert.equal(delivered.size,expected.length);assert.equal(deployment.assets.length,expected.length);assert.equal(pack.entries,expected.length);
 const fixedSourceAssetBindings=guard.verifySite();assert.deepEqual(fixedSourceAssetBindings,deployment.assets);
 for(const row of fixedSourceAssetBindings){const received=delivered.get(row.file);assert(received?.gitEqual);assert.equal(received.bytes,row.bytes);assert.equal(received.sha256,row.sha256);}
 assert.deepEqual(audit.cached.map(row=>row.file),cached);assert(audit.cached.every(row=>row.gitEqual&&row.sha256===guard.sha(guard.blob(row.file))));
 assert.deepEqual(audit.uncachedSourceDownloads.map(row=>row.file),archives);assert(audit.uncachedSourceDownloads.every(row=>!row.cached));assert.equal(audit.privateRoutes.length,6);assert(audit.privateRoutes.every(row=>row.status===404));
 assert(audit.cold.controlled&&audit.offline.controlled&&audit.cold.accountPresent===false&&audit.cold.writes===false&&audit.cold.candidate===true&&audit.cold.accountStateWritesEnabled===true&&audit.offline.accountPresent===false&&audit.offline.writes===false&&audit.pageErrors===0);assert.equal(audit.cold.version,guard.VERSION);assert.equal(audit.offline.version,guard.VERSION);assert(audit.rootCacheAlias.gitEqual&&audit.rootCacheAlias.sha256===guard.sha(guard.blob('index.html')));
 const packagePath=path.resolve(path.dirname(guard.root),pack.packagePath);assert.equal(packagePath,path.join(path.dirname(guard.site),`Drive-Original-${guard.VERSION}-${guard.SOURCE.slice(0,7)}.zip`));assert.equal(guard.sha(fs.readFileSync(packagePath)),pack.sha256);assert(pack.everyPublicEntryEqualsGitBlob&&pack.extraPrivateEntries===0);
 const buildName='media/audio-codec-build.json',buildBytes=guard.blob(buildName),build=JSON.parse(buildBytes);assert(fs.readFileSync(path.join(guard.root,buildName)).equals(buildBytes));
 // This fresh preparation record stays false; delivery readiness is owned here.
 assert.equal(build.distributionReady,false);assert.deepEqual(build.blockingDistributionRequirements,['Verify same-candidate public source, runtime and notice delivery before asserting distribution readiness.']);
 const currentRows=[...build.preferredSource,...build.artifacts,...build.correspondingSource.readableCurrentAdaptations,build.correspondingSource.archiveManifest];
 for(const row of currentRows){const absolute=path.resolve(guard.root,row.path);assert(absolute.startsWith(guard.root+path.sep));assert.equal(guard.sha(fs.readFileSync(absolute)),row.sha256,'Fresh current build hash mismatch');if(guard.files.includes(row.path))assert.equal(guard.sha(guard.blob(row.path)),row.sha256);}
 for(const row of[...build.artifacts,...build.correspondingSource.readableCurrentAdaptations,build.correspondingSource.archiveManifest])assert(delivered.get(row.path)?.gitEqual);
 assert(build.correspondingSource.readableCurrentAdaptations.some(row=>row.path==='media/native-color.mjs'));
 const changed=['media/native-color.mjs','media/general-owner.mjs','media/general-player.mjs','media/general-worker.mjs','media/general-pipeline.mjs','media/audio-general-pipeline.mjs','media/audio-general-worker.mjs'];
 assert(changed.every(file=>delivered.get(file)?.gitEqual&&audit.cached.some(row=>row.file===file&&row.gitEqual)));
 const rights=['media/audio-codec.LICENSE.txt','media/video-q3-codec.LICENSE.txt','media/mediabunny-q1.LICENSE','media/mediabunny-q1-NOTICE.md','licenses/audio-source-NOTICE.md','licenses/video-q3-source-NOTICE.md','licenses/mediabunny-q1-preferred-source.tgz',...archives];
 assert(rights.every(file=>delivered.get(file)?.gitEqual));
 const buildMetadata=['media/audio-codec-build.json','media/mediabunny-q1-build.json','media/build.json'].map(file=>({file,sha256:guard.sha(guard.blob(file))}));
 guard.assertSource();const evidence=['results.json','deployment.json','redacted-readback.json','package.json'];
 guard.save('source-readiness.json',{passed:true,sourceCommit:guard.SOURCE,version:guard.VERSION,workerVersion:deployment.workerVersion,publicAssets:expected.length,cacheAssets:cached.length,uncachedSourceArchives:archives.length,private404:6,buildRecordSha256:guard.sha(buildBytes),buildMetadata,canonicalBuildDistributionReady:false,canonicalBuildMetadataWritten:false,currentBuildHashesChecked:currentRows.length,fixedSourceAssetBindings,evidence:evidence.map(name=>({path:'qa/candidate-rc38-delivery/'+name,sha256:guard.sha(fs.readFileSync(path.join(__dirname,name)))})),producerSha256:guard.sha(fs.readFileSync(__filename)),scope:'Same-candidate runtime/notice/source/current-wrapper technical delivery only; no whole-format/color/HDR/device/production/patent qualification'});
 return{passed:true,source:guard.SOURCE,assets:expected.length,cache:cached.length,sourceArchives:archives.length};
}
try{guard.assertSource();if(fs.existsSync(path.join(__dirname,action+'-failure.json')))throw Error('RETAINED_FAILED_ATTEMPT_NO_AUTOMATIC_RETRY');console.log(JSON.stringify({action,...({materialize,deploy,readback,finalize}[action]())}));}
catch(error){const record={passed:false,action,source:guard.SOURCE,error:safeFailure(error),recordedAt:new Date().toISOString(),noAutomaticRetry:true};try{guard.save(action+'-failure.json',record);}catch{}console.error(JSON.stringify(record));process.exitCode=1;}

