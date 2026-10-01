'use strict';
// Local verification + curated exact safe manifest. Never traverses private QA files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['README.md','android-common.cjs','android-latency-partition.cjs','binding.json','build-preparation.cjs','dependency-freeze.json','derivation.json','native-folder-target.function.js','native-ui-target.function.js','network-reducer.cjs','observer.function.js','observer.expression.js','partition-summary.cjs','preparation.test.cjs','verify-preparation.cjs','root-execute.cjs','finalize-preparation.cjs','preparation-checks.json'];
for(const name of files.filter(x=>/\.(cjs|js)$/.test(x))){const r=spawnSync(process.execPath,['--check',path.join(__dirname,name)],{encoding:'utf8',windowsHide:true,timeout:10000});if(r.status!==0)throw Error('LOCAL_SYNTAX_FAILED');}
const tests=spawnSync(process.execPath,['--test',path.join(__dirname,'preparation.test.cjs')],{encoding:'utf8',windowsHide:true,timeout:15000});if(tests.status!==0)throw Error('LOCAL_TEST_FAILED');
const pass=Number(tests.stdout.match(/(?:pass|passed)\s+(\d+)/)?.[1]);if(pass!==10)throw Error('LOCAL_TEST_COUNT');
const binding=require('./binding.json');
fs.writeFileSync(path.join(__dirname,'preparation-checks.json'),JSON.stringify({schema:'drive-original.rc31-latency-preparation/1',sourceCommit:binding.sourceCommit,version:binding.version,localSyntaxPassed:true,testsPassed:pass,testsFailed:0,actualExecution:false,privateInputsRead:false,browserCalls:false,deviceCalls:false,networkCalls:false,productEdited:false,oldQAFilesEdited:false,subagentsUsed:false},null,2)+'\n');
const manifest={schema:'drive-original.rc31-passive-latency-freeze/1',sourceCommit:binding.sourceCommit,version:binding.version,actualExecution:false,privateFilesIncluded:false,files:files.map(p=>{const b=fs.readFileSync(path.join(__dirname,p));return{path:p,bytes:b.length,sha256:sha(b)};})};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(__dirname,'preparation-freeze.json'),bytes);
console.log(JSON.stringify({verified:true,actualExecution:false,testsPassed:pass,files:files.length,curatedBytes:manifest.files.reduce((n,r)=>n+r.bytes,0),manifestBytes:bytes.length,manifestSHA256:sha(bytes),driver:manifest.files.find(r=>r.path==='android-latency-partition.cjs'),observer:manifest.files.find(r=>r.path==='observer.expression.js'),rootExecute:manifest.files.find(r=>r.path==='root-execute.cjs')}));
