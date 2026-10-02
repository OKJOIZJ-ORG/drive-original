'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),guard=require('./delivery-guard.cjs');guard.assertSource();
const readyFile=path.join(__dirname,'source-readiness.json'),ready=JSON.parse(fs.readFileSync(readyFile)),pc=JSON.parse(fs.readFileSync(path.join(__dirname,'pc-source-binding.json')));
assert(ready.passed&&ready.sourceCommit===guard.SOURCE&&ready.version===guard.VERSION&&pc.sourceCommit===guard.SOURCE);assert.equal(ready.publicAssets,65);assert.equal(ready.cacheAssets,50);
const binding={sourceCommit:guard.SOURCE,version:guard.VERSION,origin:new URL(guard.BASE).origin,publicationVerified:true,readinessSHA256:guard.sha(fs.readFileSync(readyFile)),sourceSHA256:Object.fromEntries(['app.js','sw.js','version.json','media/native-color.mjs','media/revision-pin.js','index.html'].map(file=>[file,guard.sha(guard.blob(file))])),cache:pc.shellExpected};assert.equal(binding.cache.length,50);
fs.writeFileSync(path.join(__dirname,'android-update-baseline.expression.js'),fs.readFileSync(path.join(__dirname,'android-update-baseline.template.js')),{flag:'wx'});
fs.writeFileSync(path.join(__dirname,'android-current-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({prepared:true,actualExecution:false,publicHashes:6,cacheRows:50}));
