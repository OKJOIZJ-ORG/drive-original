'use strict';
// Local committed-byte preparation only. This CLI never opens a device/browser.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const DIR=__dirname,ROOT=path.resolve(DIR,'../..'),TEMPLATES=path.join(ROOT,'qa/q3-actual-preparation');
const OLD_SOURCE='5174485b3c17d047259701bbdd889f9b0740f555',OLD_VERSION='1.22.0-rc.33';
const PINS={
 'android-q3-actor.cjs':'116ff013cf771002bbea0e2fa2a70e448ec533ff46bcd38f1455a9de0bf5443a',
 'android-q3-eof-actor.cjs':'506adeb3b1213a23dcda13063bd5b7dcb70f4d5d0873c331be5cdbb76374298a',
 'android-common33.cjs':'a1cfbd89e922158a43fd6f3e9a09869057c5df4a1c514ff078cebd519337637f',
 'eof-observer.function.js':'2825c5efeec6e972cd3e4990ac3091d94d9b990f06f99f3b5fbef83664c10941',
 'source-proof.expression.js':'fdd71db2cc76e36921db9c2bb512183ea2f8ad70d4302d094276551884b57954',
 'observer.expression.js':'c2f8df2f7e29da5d93bac064d81236a96d0338f85724c62bcb703c7055d05f5e',
 'pc-seek-targets33.expression.js':'145a0533560cf6e37eb1c9a56f3cc85d97a5e88dc71cb7c209dfd8c09dbf1e9a',
 'resource-watch.cjs':'5f533f7fe33d54a0134a3ca27e3d11900361d48d7082f523e17c1f1f85f8acbd',
 'binding-observer.json':'21d64ac825efdbf0dfec5e9cfcb9a2cd1d02064aea8aac2294abcb5249ada1aa'};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function exact(text,from,to){if(text.split(from).length!==2)throw Error('UNIQUE_TEMPLATE_ANCHOR');return text.replace(from,to);}
function templates(){return Object.fromEntries(Object.entries(PINS).map(([n,h])=>{const b=fs.readFileSync(path.join(TEMPLATES,n));if(hash(b)!==h)throw Error('FROZEN_TEMPLATE_DRIFT');return[n,b];}));}
function identity(source,version){if(!/^[a-f0-9]{40}$/.test(source||'')||source===OLD_SOURCE||version!=='1.22.0-rc.34')throw Error('EXPLICIT_RC34_FULL_SOURCE_VERSION_REQUIRED');}
function gitBytes(source,file){return cp.execFileSync('git',['show',`${source}:${file}`],{cwd:ROOT,maxBuffer:16777216});}
function build(source,version,{get=gitBytes,input=templates()}={}){
 identity(source,version);const old=JSON.parse(input['binding-observer.json']),versionBytes=get(source,'version.json');
 if(JSON.parse(versionBytes).version!==version)throw Error('COMMITTED_VERSION_MISMATCH');
 const sw=get(source,'sw.js').toString('utf8'),app=get(source,'app.js').toString('utf8');
 if(!sw.includes(version)||!app.includes(version))throw Error('COMMITTED_RUNTIME_VERSION_MISMATCH');
 const shell=sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/)?.[1];if(!shell)throw Error('CACHE_LIST_ANCHOR');
 const files=[...shell.matchAll(/'\.\/([^']+)'/g)].map(m=>m[1]);
 if(files.length!==old.cache.length||new Set(files).size!==files.length||old.cache.some(r=>!files.includes(r.file)))throw Error('CACHE_CONTRACT_CHANGED');
 const cache=old.cache.map(r=>{const b=get(source,r.file);return{file:r.file,bytes:b.length,sha256:hash(b)};});
 const sourceSHA256=Object.fromEntries(Object.keys(old.sourceSHA256).map(n=>[n,hash(get(source,n))]));
 const binding={...old,sourceCommit:source,version,sourceSHA256,cache,hashSource:'explicit committed Git blobs; not working tree',privateInputRead:false};
 const out={'binding-observer.json':Buffer.from(JSON.stringify(binding,null,2)+'\n')};
 const reidentify=s=>s.replaceAll(OLD_SOURCE,source).replaceAll(OLD_VERSION,version);
 for(const n of ['source-proof.expression.js','observer.expression.js']){let s=exact(input[n].toString('utf8'),JSON.stringify(old),JSON.stringify(binding));if(n==='source-proof.expression.js')s=exact(s,JSON.stringify(old.cache),JSON.stringify(cache));out[n]=Buffer.from(s);}
 for(const n of ['android-common33.cjs','pc-seek-targets33.expression.js','eof-observer.function.js'])out[n]=Buffer.from(reidentify(input[n].toString('utf8')));
 out['resource-watch.cjs']=input['resource-watch.cjs'];
 let base=reidentify(input['android-q3-actor.cjs'].toString('utf8'));for(const n of ['source-proof.expression.js','observer.expression.js','pc-seek-targets33.expression.js'])base=exact(base,PINS[n],hash(out[n]));out['android-q3-actor.cjs']=Buffer.from(base);
 let eof=reidentify(input['android-q3-eof-actor.cjs'].toString('utf8'));eof=exact(eof,PINS['android-q3-actor.cjs'],hash(out['android-q3-actor.cjs']));eof=exact(eof,PINS['eof-observer.function.js'],hash(out['eof-observer.function.js']));out['android-q3-eof-actor.cjs']=Buffer.from(eof);
 out['observer-manifest.json']=Buffer.from(JSON.stringify({schema:'drive-original.q3-actual-observer-bound/1',bound:true,sourceCommit:source,version,cacheFiles:cache.length,cacheWithRootAlias:cache.length+1,templateSourceCommit:OLD_SOURCE,templatePins:PINS,files:Object.entries(out).map(([file,b])=>({file,bytes:b.length,sha256:hash(b)}))},null,2)+'\n');
 return{binding,out};
}
function delivery(source,version,file,sha){
 identity(source,version);if(!/^[a-f0-9]{64}$/.test(sha||''))throw Error('EXPLICIT_DELIVERY_SHA_REQUIRED');
 const p=path.resolve(ROOT,file),relative=path.relative(ROOT,p);if(relative.replaceAll('\\','/')!=='qa/candidate-rc34-delivery/source-readiness.json')throw Error('CANONICAL_DELIVERY_PROOF_REQUIRED');
 const b=fs.readFileSync(p);if(b.length>2097152||hash(b)!==sha)throw Error('DELIVERY_PROOF_PIN');const r=JSON.parse(b);
 if(r.sourceCommit!==source||r.version!==version||r.passed!==true||r.publicAssets!==61||r.cacheAssets!==46||!r.fixedSourceAssetBindings)throw Error('EXACT_DELIVERY_PROOF_REQUIRED');
 const evidence=r.distributionEvidence,worker=r.workerVersion,origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(worker||'')||evidence?.sourceCommit!==source||evidence.workerVersion!==worker||evidence.candidateUrl!==origin)throw Error('EXACT_DELIVERY_WORKER_IDENTITY_REQUIRED');
 function record(ref,name){const expected=`qa/candidate-rc34-delivery/${name}`;if(ref?.path!==expected||!/^[a-f0-9]{64}$/.test(ref.sha256||''))throw Error('PINNED_DELIVERY_RECORD_REQUIRED');const bytes=fs.readFileSync(path.join(ROOT,expected));if(bytes.length>2097152||hash(bytes)!==ref.sha256)throw Error('DELIVERY_RECORD_PIN');return JSON.parse(bytes);}
 const deployed=record(evidence.deploymentRecord,'deployment.json'),control=record(evidence.controlPlaneRecord,'redacted-readback.json');
 if(deployed.source!==source||control.source!==source||deployed.workerVersion!==worker||control.workerVersion!==worker||deployed.passed!==true||deployed.stable!==true||deployed.candidateUrl!==origin)throw Error('EXACT_DELIVERY_WORKER_IDENTITY_REQUIRED');
 return{file:relative.replaceAll('\\','/'),sha256:sha,sourceCommit:source,version,workerVersion:worker,passed:true,deploymentRecord:evidence.deploymentRecord,controlPlaneRecord:evidence.controlPlaneRecord};
}
function bind(source,version,file,sha){
 const proof=delivery(source,version,file,sha),{binding,out}=build(source,version);
 const receipt={schema:'drive-original.q3-read-coalescing-preparation/1',sourceCommit:source,version,deliveryProof:proof,templatePins:PINS,privateInputRead:false,actualOperationPerformed:false,actionMs:300000,cleanupEndMs:345000,fullOutputQuality:'NOT_QUALIFIED',nativeRetainedHeap:'UNKNOWN',files:Object.entries(out).map(([file,b])=>({file,bytes:b.length,sha256:hash(b)}))};
 out['bound-preparation-safe.json']=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
 for(const n of Object.keys(out))if(fs.existsSync(path.join(DIR,n)))throw Error('NEW_BINDING_ONLY_NO_OVERWRITE');
 for(const[n,b]of Object.entries(out))fs.writeFileSync(path.join(DIR,n),b,{flag:'wx'});
 return{prepared:true,sourceCommit:source,version,privateInputRead:false,actualOperationPerformed:false,files:receipt.files,actorPlan:'node qa/q3-read-coalescing-acceptance/android-q3-eof-actor.cjs --plan <new-safe-label>',resourceReadyBeforeActor:true};
}
if(require.main===module){const a=process.argv.slice(2);try{if(a.length!==5||a[0]!=='--bind')throw Error('EXPLICIT_BIND_FULL_SOURCE_VERSION_DELIVERY_FILE_SHA');console.log(JSON.stringify(bind(...a.slice(1))));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'PREPARATION_FAILED');process.exitCode=1;}}
module.exports={PINS,OLD_SOURCE,OLD_VERSION,hash,exact,identity,templates,build,delivery,bind};
