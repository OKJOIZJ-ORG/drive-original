'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),pkg=path.join(__dirname,'audio-source');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const qaBase=path.join(root,'qa/q2-audio-compatibility');
const sdk=path.join(qaBase,'build-investigation/work/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1');
const cache=path.join(qaBase,'build-investigation/work/emscripten-cache');
function cacheSnapshot(dir,rel=''){
 const all=[];for(const e of fs.readdirSync(path.join(dir,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const name=path.join(rel,e.name);if(e.isDirectory())all.push(...cacheSnapshot(dir,name));
  else if(e.isFile())all.push({path:name.replaceAll('\\','/'),sha256:sha(fs.readFileSync(path.join(dir,name)))});
 }return all;
}
const version=fs.readFileSync(path.join(sdk,'upstream/emscripten/emscripten-version.txt'),'utf8').trim();
if(version!=='"4.0.15"')throw Error('COMPILER_VERSION');
const expected={
 'upstream/bin/clang.exe':'c6d657e4526ee468c92b253aa1e0c2680b286547b2c70aeffe527ba300053cd7',
 'upstream/bin/wasm-ld.exe':'e263d154b50a49622f50a74436e300afaf6b82f45a3a290f79348692ffc28bb8',
 'upstream/bin/wasm-opt.exe':'01bc21a3f43563a932905cfb15c04035fe5df6de759c3702694c9d5e8acbc5d2',
 'upstream/emscripten/emcc.py':'b568f029fb754df5fbe247237f5e14296f485c73c515f67029514571b103a353',
};
for(const [name,h]of Object.entries(expected))if(sha(fs.readFileSync(path.join(sdk,name)))!==h)throw Error('COMPILER_HASH:'+name);
const snapshot=JSON.stringify(cacheSnapshot(cache));
const compileBridge=process.argv.includes('--compile-bridge');
const toBash=p=>p.replaceAll('\\','/');
const script=`#!/usr/bin/env bash\nset -euo pipefail\nexport EMSDK_QUIET=1\nsource '${toBash(sdk)}/emsdk_env.sh'\nexport EM_CACHE='${toBash(cache)}' EM_FROZEN_CACHE=1\nmkdir -p '${toBash(__dirname)}/tmp'\nexport TMPDIR='${toBash(__dirname)}/tmp' TEMP='${toBash(__dirname)}/tmp' TMP='${toBash(__dirname)}/tmp'\nbash '${toBash(pkg)}/relink.sh'${compileBridge?' --compile-bridge':''}\n`;
fs.writeFileSync(path.join(__dirname,'run-relink.local.sh'),script);
const result=cp.spawnSync('C:/Program Files/Git/bin/bash.exe',[path.join(__dirname,'run-relink.local.sh')],{cwd:pkg,encoding:'utf8',timeout:120000});
const reportName=compileBridge?'bridge-recompile':'relink';
fs.writeFileSync(path.join(__dirname,reportName+'.log'),(result.stdout||'')+(result.stderr||''));
if(result.status!==0)throw Error('RELINK_FAILED:'+result.status);
const wasm=fs.readFileSync(path.join(pkg,'output/codec.wasm'));
const exact=wasm.length===502740&&sha(wasm)==='48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf';
const glue=fs.readFileSync(path.join(pkg,'output/codec.mjs'),'utf8');
const product=fs.readFileSync(path.join(root,'media/audio-codec.mjs'),'utf8');
const report={method:compileBridge?'Recompile supplied bridge.c using extracted full FFmpeg source and supplied generated avconfig.h, then relink supplied static libraries. No FFmpeg compile or compiler installation.':'Extract publication package, relink supplied bridge object/static libraries with hash-verified existing Emscripten; no FFmpeg compile or compiler installation.',
 compilerVersion:'4.0.15',compilerExecutables:expected,frozenCache:true,cacheFileCount:JSON.parse(snapshot).length,
 cacheUnchanged:snapshot===JSON.stringify(cacheSnapshot(cache)),wasm:{bytes:wasm.length,sha256:sha(wasm),exact},
 generatedGlue:{bytes:Buffer.byteLength(glue),sha256:sha(glue),productMatchesAfterTwoFilenameReferences:glue.split('codec.wasm').length===3&&glue.replaceAll('codec.wasm','audio-codec.wasm')===product},
 scope:'Local same verified Windows toolchain only. No cross-host, browser/device, patent clearance or public source-access claim.'};
if(compileBridge)report.recompiledBridge={bytes:fs.statSync(path.join(pkg,'output/bridge.o')).size,sha256:sha(fs.readFileSync(path.join(pkg,'output/bridge.o')))};
fs.writeFileSync(path.join(__dirname,reportName+'-results.json'),JSON.stringify(report,null,2)+'\n');
if(!exact||!report.cacheUnchanged||!report.generatedGlue.productMatchesAfterTwoFilenameReferences)throw Error('RELINK_ACCEPTANCE');
console.log(JSON.stringify(report));
