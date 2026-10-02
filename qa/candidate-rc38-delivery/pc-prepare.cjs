'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),guard=require('./delivery-guard.cjs');
guard.assertSource();
const shell=guard.shellFiles();assert.equal(shell.length,50);assert.equal(guard.files.length+1,65);
const binding={sourceCommit:guard.SOURCE,version:guard.VERSION,sourceSHA256:Object.fromEntries(['app.js','sw.js','version.json'].map(file=>[file,guard.sha(guard.blob(file))]))};
const expected=shell.map(file=>({file,sha256:guard.sha(guard.blob(file))}));
const baseline=fs.readFileSync(path.join(__dirname,'pc-update-baseline.template.js'),'utf8'),factory=fs.readFileSync(path.join(__dirname,'pc-source-proof.function.js'),'utf8');
const proof=factory.trim()+'('+JSON.stringify(binding)+','+JSON.stringify(expected)+')\n';new vm.Script(baseline);new vm.Script(proof);
function save(name,value){fs.writeFileSync(path.join(__dirname,name),value,{flag:'wx'});}
save('pc-update-baseline.expression.js',baseline);save('pc-source-proof.expression.js',proof);
save('pc-source-binding.json',JSON.stringify({...binding,beforeVersion:'1.22.0-rc.37',baselineKey:'drive-original.qa.rc38-update-baseline',shellExpected:expected,rootAliasAdditional:true,actualExecution:false,executingWorkerBytes:'UNKNOWN',baselineSha256:guard.sha(Buffer.from(baseline)),proofSha256:guard.sha(Buffer.from(proof)),producerSha256:guard.sha(fs.readFileSync(__filename))},null,2)+'\n');
console.log(JSON.stringify({prepared:true,actualExecution:false,cachedDistinct:50,rootAliasAdditional:true}));
