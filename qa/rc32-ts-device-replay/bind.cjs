'use strict';
// Explicit readonly committed-object lookup. No HEAD inference and no private input.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const gate=require('./binding-gate.cjs'),root=path.resolve(__dirname,'../..');
function makeBinding(commit,lookup){
 if(commit!==gate.COMMIT||!/^[0-9a-f]{40}$/.test(commit))throw Error('IMMUTABLE32_BINDING_REQUIRED');
 const files=JSON.parse(fs.readFileSync(path.join(__dirname,'cache-files.json'))),map=new Map();
 for(const f of [...files,'sw.js'])map.set(f,lookup(f));
 if(JSON.parse(map.get('version.json').toString()).version!==gate.VERSION)throw Error('COMMITTED_VERSION_REQUIRED');
 const sourceSHA256=Object.fromEntries(['app.js','sw.js','version.json','media/drive-source.mjs','media/ts-player.mjs'].map(f=>[f,gate.sha(map.get(f))]));
 return gate.validateBinding({schema:'drive-original.rc32-ts-replay-binding/1',sourceCommit:commit,version:gate.VERSION,sourceSHA256,cache:files.map(file=>({file,sha256:gate.sha(map.get(file)),bytes:map.get(file).length})),hashSource:'explicit committed Git blobs; not working tree',privateInputRead:false});
}
function bind(commit){
 if(commit!==gate.COMMIT||!/^[0-9a-f]{40}$/.test(commit))throw Error('IMMUTABLE32_BINDING_REQUIRED');
 gate.verifyManifest('preparation-manifest.json');
 const call=args=>{const r=spawnSync('git',['-C',root,...args],{windowsHide:true,maxBuffer:32*1024*1024,timeout:10000});if(r.error||r.status!==0)throw Error('COMMITTED_OBJECT_UNAVAILABLE');return r.stdout;};
 if(call(['cat-file','-t',commit]).toString().trim()!=='commit')throw Error('COMMITTED_OBJECT_REQUIRED');
 const b=makeBinding(commit,f=>call(['show',commit+':'+f]));
 const write=(f,s)=>fs.writeFileSync(path.join(__dirname,f),s);
 write('binding.json',JSON.stringify(b,null,2)+'\n');
 for(const[name,args]of [['observer',[b]],['source-proof',[b,b.cache]]]){
  const fn=fs.readFileSync(path.join(__dirname,name+'.function.js'),'utf8'),expr='('+fn.trim()+')('+args.map(x=>JSON.stringify(x)).join(',')+')\n';new vm.Script(expr);write(name+'.expression.js',expr);
 }
 const files=['binding.json','observer.expression.js','source-proof.expression.js'].map(file=>{const bytes=fs.readFileSync(path.join(__dirname,file));return{file,bytes:bytes.length,sha256:gate.sha(bytes)};});
 write('bound-manifest.json',JSON.stringify({schema:'drive-original.rc32-bound-freeze/1',sourceCommit:b.sourceCommit,version:b.version,files},null,2)+'\n');
 gate.verifyBound();return{bound:true,sourceCommit:b.sourceCommit,version:b.version,cacheFiles:b.cache.length,files};
}
module.exports={makeBinding,bind};
if(require.main===module){try{console.log(JSON.stringify(bind(process.argv[2]),null,2));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'BIND_FAILED');process.exitCode=1;}}
