'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),VERSION='1.22.0-rc.35',COMMIT='2c2b1244bee0f1a5e500318c83c6e126c5124e34',FIXTURE_SHA='bc831b81953010036a7d931100dfd264fa14d8e22633b6518268f6c6dbfc2e2f';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function gitBlob(commit,file){const r=spawnSync('git',['-C',root,'show',commit+':'+file],{windowsHide:true,timeout:10000,maxBuffer:64*1024*1024});if(r.error||r.status!==0)throw Error('COMMITTED_BLOB_UNAVAILABLE');return r.stdout;}
function makeBinding(commit,read=gitBlob){
 if(commit!==COMMIT||!/^[0-9a-f]{40}$/.test(commit||''))throw Error('FULL_COMMIT_REQUIRED');
 if(JSON.parse(read(commit,'version.json').toString()).version!==VERSION)throw Error('RC35_COMMITTED_VERSION_REQUIRED');
 const context={module:{exports:null}};vm.runInNewContext(read(commit,'scripts/public-files.cjs').toString(),context,{timeout:1000});const files=context.module.exports;
 if(!Array.isArray(files)||files.length<50||files.length>100||new Set(files).size!==files.length||files.some(f=>typeof f!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(f)||f.includes('..')||f.startsWith('qa/')))throw Error('PUBLIC_ALLOWLIST_REQUIRED');
 for(const f of ['app.js','index.html','styles.css','sw.js','media/general-tracks.mjs','media/subtitle-track.mjs','media/subtitle-presentation.mjs'])if(!files.includes(f))throw Error('TRACKS_PUBLIC_CUT_REQUIRED');
 const publicFiles=files.map(file=>{const b=read(commit,file);return{file,bytes:b.length,sha256:sha(b)};});
 const preparedFiles=['android-runner.cjs','android-provider.cjs','android-observer.function.js','android-native-target.function.js','android-binding.cjs'].map(file=>{const b=fs.readFileSync(path.join(__dirname,file));return{file,bytes:b.length,sha256:sha(b)};});
 return{schema:'drive-original.actual-android-tracks-binding/1',sourceCommit:commit,version:VERSION,publicFiles,preparedFiles,fixture:{file:'combined.mp4',bytes:759643,sha256:FIXTURE_SHA},mockOnly:true,publicationProof:"ROOT_MUST_CONFIRM_BEFORE_RUN",rootRunGoRequired:true};
}
function load(){const b=JSON.parse(fs.readFileSync(path.join(__dirname,'android-binding.json')));if(b.version!==VERSION||b.sourceCommit!==COMMIT||!/^[0-9a-f]{40}$/.test(b.sourceCommit)||b.fixture?.file!=='combined.mp4'||b.fixture?.bytes!==759643||b.fixture?.sha256!==FIXTURE_SHA||b.mockOnly!==true||b.publicationProof!=='ROOT_MUST_CONFIRM_BEFORE_RUN')throw Error('RC35_BINDING_REQUIRED');
 for(const x of b.preparedFiles){if(!/^android-[a-z.-]+$/.test(x.file))throw Error('HELPER_PATH_INVALID');const bytes=fs.readFileSync(path.join(__dirname,x.file));if(bytes.length!==x.bytes||sha(bytes)!==x.sha256)throw Error('HELPER_DRIFT');}
 const assets=new Map();for(const x of b.publicFiles){if(/\.(?:tgz|tar\.gz\.part[0-9]+)$/.test(x.file))continue;if(typeof x.file!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(x.file)||x.file.includes('..'))throw Error('PUBLIC_PATH_INVALID');const bytes=gitBlob(b.sourceCommit,x.file);if(bytes.length!==x.bytes||sha(bytes)!==x.sha256)throw Error('COMMITTED_ASSET_DRIFT');assets.set('/'+x.file,bytes);}assets.set('/',assets.get('/index.html'));
 const fixture=fs.readFileSync(path.join(__dirname,b.fixture.file));if(fixture.length!==b.fixture.bytes||sha(fixture)!==FIXTURE_SHA)throw Error('FIXTURE_DRIFT');return{binding:b,assets,fixture};}
module.exports={VERSION,COMMIT,FIXTURE_SHA,sha,makeBinding,load};
function verifyPublication(proof,commit,readReceipt=file=>fs.readFileSync(path.resolve(root,file))){
 if(proof?.schema!=='drive-original.root-verified-publication/1'||proof.sourceCommit!==commit||proof.version!==VERSION||proof.verifiedByRoot!==true
  ||proof.origin!=='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(proof.worker||'')
  ||proof.flags?.authEnabled!==true||proof.flags?.diagnosticsEnabled!==true||proof.flags?.generalWritesAllowed!==false||proof.flags?.freeOnly!==true)throw Error('VERIFIED_PUBLICATION_REQUIRED');
 const kinds=['sourceReadiness','deployment','control','publicAudit'];
 if(!Array.isArray(proof.receipts)||proof.receipts.length!==4||!kinds.every(k=>proof.receipts.some(r=>r.kind===k)))throw Error('PUBLICATION_RECEIPTS_REQUIRED');
 for(const row of proof.receipts){if(!/^qa\/candidate-rc35-delivery\/[A-Za-z0-9_.-]+\.json$/.test(row.file)||!/^[0-9a-f]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<=0)throw Error('PUBLICATION_RECEIPT_INVALID');const bytes=readReceipt(row.file);if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw Error('PUBLICATION_RECEIPT_DRIFT');}
 return{publicationVerified:true,verificationOwner:'root verified normalized receipt attestations; runner checks frozen receipt digests',sourceCommit:commit,worker:proof.worker,receipts:proof.receipts.map(r=>({kind:r.kind,bytes:r.bytes,sha256:r.sha256}))};
}
module.exports.verifyPublication=verifyPublication;
