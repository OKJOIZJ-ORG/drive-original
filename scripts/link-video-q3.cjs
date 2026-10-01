'use strict';
// Relink existing pinned decoder libraries. Never configure/compile/install an SDK.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa/q3-product-integration');
fs.mkdirSync(qa,{recursive:true});
const evidence=JSON.parse(fs.readFileSync(path.join(root,'qa/q3-browser-execution/evidence-manifest.json')));
for(const file of ['libavcodec.a','libavutil.a']){
 const target='qa/q3-browser-execution/'+file,record=evidence.files.find(x=>x.path===target),bytes=fs.readFileSync(path.join(root,target));
 if(!record||crypto.createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Q3_PINNED_LIBRARY_MISMATCH');
}
const script=`#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "$0")/../.."
export EMSDK_QUIET=1
source qa/q2-audio-compatibility/build-investigation/work/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1/emsdk_env.sh
export EM_CACHE="$(cygpath -m "$PWD/qa/q2-audio-compatibility/build-investigation/work/emscripten-cache")"
emcc media/video-q3-bridge.c qa/q3-browser-execution/libavcodec.a qa/q3-browser-execution/libavutil.a -Iqa/q3-browser-execution/work/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7 \\
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \\
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \\
 -s EXPORTED_RUNTIME_METHODS=HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free -msimd128 -flto -Oz -o media/video-q3-codec.mjs
`;
const scriptPath=path.join(qa,'link.sh');fs.writeFileSync(scriptPath,script);
const result=spawnSync('C:/Program Files/Git/bin/bash.exe',[scriptPath],{cwd:root,windowsHide:true,encoding:'utf8'});
fs.writeFileSync(path.join(qa,'link.log'),(result.stdout||'')+(result.stderr||''));
if(result.error||result.signal||result.status!==0)throw Error('Q3_RELINK_FAILED');
console.log('Q3 product bridge relink completed; decoder libraries unchanged.');
