'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const manifest=JSON.parse(read('licenses/video-q3-source-manifest.json')),demand=(v,m)=>{if(!v)throw Error(m);};
demand(sha(read('licenses/'+manifest.archive))===manifest.sha256,'Q3_SOURCE_ARCHIVE');
const base='qa/q3-product-integration/relink-check/video-q3-source/';
for(const row of manifest.files){const b=read(base+row.path);demand(b.length===row.bytes&&sha(b)===row.sha256,'Q3_SOURCE_FILE:'+row.path);}
for(const row of manifest.sharedSource.files){const b=read('qa/q2-audio-source-publication/audio-source/'+row.path);demand(b.length===row.bytes&&sha(b)===row.sha256,'Q3_SHARED_SOURCE:'+row.path);}
const wasm=read('media/video-q3-codec.wasm'),glue=read('media/video-q3-codec.mjs');
demand(sha(wasm)===manifest.targetWasm.sha256&&wasm.length===manifest.targetWasm.bytes,'Q3_TARGET');
demand(sha(read(base+'output/video-q3-codec.wasm'))===sha(wasm)&&sha(read(base+'output/video-q3-codec.mjs'))===sha(glue),'Q3_SAME_TOOLCHAIN_RELINK');
new WebAssembly.Module(wasm);let p=8,memory;function u(){let v=0,s=0,x;do{x=wasm[p++];v+=(x&127)*2**s;s+=7;}while(x&128);return v;}
while(p<wasm.length){const id=wasm[p++],length=u(),end=p+length;if(id===5){demand(u()===1,'Q3_MEMORY_COUNT');const flags=u(),initial=u(),maximum=(flags&1)?u():null;memory={flags,initialBytes:initial*65536,maximumBytes:maximum*65536};}p=end;}
demand(memory.flags===1&&memory.initialBytes===33554432&&memory.maximumBytes===67108864,'Q3_MEMORY_BOUND');
const result={pass:true,sourceFiles:manifest.files.length,completeSharedArchives:manifest.sharedSource.files.length,archiveSha256:manifest.sha256,wasmSha256:sha(wasm),wasmBytes:wasm.length,glueSha256:sha(glue),sameToolchainRelink:true,memory,scope:'Exact local corresponding-source and same-toolchain bridge relink; no public or device claim'};
fs.writeFileSync(path.join(__dirname,'source-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
