'use strict';
// Read committed public blobs only. Import is inert; no implicit HEAD binding.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),VERSION='1.22.0-rc.33',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inherited={
 'qa/rc32-ts-device-replay/observer.function.js':'e9e47f0d18a851c41b15858fb85ce1a9157527f6d7390bfd6d7a0c1ce7dd1472',
 'qa/rc32-ts-device-replay/source-proof.function.js':'fb4a763bcb5766a91a757e53dccd42f52ddbe7ae205f225e11ddc09863ad90c7',
 'qa/rc32-ts-device-replay/android-common.cjs':'c6822041c663495142b71356db26caed3270722dafa6d37a449713a659cc1286',
 'qa/rc32-ts-device-replay/android-owned-session.cjs':'65fcde4e2dec3df669ffb592df5ef4733e4382d6bf671fb35c1465fc942d49e6'
};
function checkParents(){for(const[file,hash]of Object.entries(inherited))if(sha(fs.readFileSync(path.join(root,file)))!==hash)throw Error('INHERITED_PRODUCER_DRIFT');}
function makeBinding(commit,version,lookup){
 if(!/^[0-9a-f]{40}$/.test(commit||'')||version!==VERSION)throw Error('EXPLICIT33_BINDING_REQUIRED');
 const sw=lookup('sw.js').toString('utf8'),literal=sw.match(/const SHELL_FILES = (\[[\s\S]*?\]);/)?.[1];if(!literal)throw Error('AUTHORITATIVE_SHELL_REQUIRED');
 const files=Array.from(vm.runInNewContext(literal)).filter(x=>x!=='./').map(x=>x.replace(/^\.\//,''));
 if(files.length!==46||new Set(files).size!==46||files.some(x=>!/^[A-Za-z0-9_./-]+$/.test(x)||x.includes('..')))throw Error('EXPECTED33_SHELL_REQUIRED');
 if(JSON.parse(lookup('version.json').toString('utf8')).version!==version)throw Error('COMMITTED33_VERSION_REQUIRED');
 for(const x of ['input.mjs','pipeline.mjs','worker.mjs','codec.mjs','codec.wasm','codec.LICENSE.txt'])if(!files.includes('media/video-q3-'+x))throw Error('Q3_RUNTIME_REQUIRED');
 const sourceFiles=['app.js','sw.js','version.json','media/drive-source.mjs','media/ts-player.mjs'];
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'qa/q3-product-integration/fixture-180s-receipt.json')));
 if(fixture.pass!==true||fixture.bytes!==18075476||fixture.sha256!=='cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a')throw Error('EXACT_FIXTURE_REQUIRED');
 return {schema:'drive-original.q3-actual-binding/1',sourceCommit:commit,version,sourceSHA256:Object.fromEntries(sourceFiles.map(f=>[f,sha(lookup(f))])),cache:files.map(file=>{const b=lookup(file);return{file,bytes:b.length,sha256:sha(b)};}),fixture:{bytes:fixture.bytes,sha256:fixture.sha256,width:640,height:360,fps:30,duration:180},hashSource:'explicit committed Git blobs; not working tree',privateInputRead:false};
}
function bind(commit,version){
 checkParents();if(!/^[0-9a-f]{40}$/.test(commit||'')||version!==VERSION)throw Error('EXPLICIT33_BINDING_REQUIRED');
 const call=args=>{const r=spawnSync('git',['-C',root,...args],{windowsHide:true,maxBuffer:32*1024*1024,timeout:10000});if(r.error||r.status!==0)throw Error('COMMITTED_OBJECT_UNAVAILABLE');return r.stdout;};
 if(call(['cat-file','-t',commit]).toString().trim()!=='commit')throw Error('COMMITTED_OBJECT_REQUIRED');
 const b=makeBinding(commit,version,f=>call(['show',commit+':'+f]));
 const proof=fs.readFileSync(path.join(root,'qa/rc32-ts-device-replay/source-proof.function.js'),'utf8');
 const observer=fs.readFileSync(path.join(__dirname,'observer.function.js'),'utf8');
 const writes={'binding-observer.json':JSON.stringify(b,null,2)+'\n','source-proof.expression.js':'('+proof.trim()+')('+JSON.stringify(b)+','+JSON.stringify(b.cache)+')\n','observer.expression.js':'('+observer.trim()+')('+JSON.stringify(b)+')\n'};
 for(const[file,data]of Object.entries(writes)){if(file.endsWith('.js'))new vm.Script(data);fs.writeFileSync(path.join(__dirname,file),data);}
 const files=['bind-observer.cjs','observer.function.js','observer.test.cjs','android-common33.cjs','android-observer-session.cjs','README.observer.md','observer-attempt1-label-history.json','observer-attempt1-label-failure.expression.js',...Object.keys(writes)].map(file=>{const bytes=fs.readFileSync(path.join(__dirname,file));return{file,bytes:bytes.length,sha256:sha(bytes)};});
 const result={schema:'drive-original.q3-actual-observer-bound/1',bound:true,sourceCommit:commit,version,cacheFiles:b.cache.length,cacheWithRootAlias:b.cache.length+1,inherited,files,actualOperationPerformed:false,unmet:['180s derived quality/complete output cadence','PC/Android sustained resources and performance','native encoder/GPU memory','temperature/throttling/battery','unsupported codec/track/color combinations']};
 fs.writeFileSync(path.join(__dirname,'observer-manifest.json'),JSON.stringify(result,null,2)+'\n');return result;
}
module.exports={makeBinding,bind,VERSION};
if(require.main===module){try{if(process.argv[2]!=='--bind'||process.argv[4]!=='--version')throw Error('EXPLICIT33_BINDING_REQUIRED');console.log(JSON.stringify(bind(process.argv[3],process.argv[5])));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'Q3_BIND_FAILED');process.exitCode=1;}}
