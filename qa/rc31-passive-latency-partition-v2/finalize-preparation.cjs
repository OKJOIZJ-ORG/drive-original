'use strict';
// Local exact allowlist only: no private input, browser/device or network calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['README.md','build-preparation.cjs','finalize-preparation.cjs','android-common.cjs','android-latency-partition.cjs','binding.json','network-reducer.cjs','range-offset-observer.cjs','retained-stats.function.js','observer.function.js','observer.expression.js','partition-summary.cjs','native-folder-target.function.js','native-ui-target.function.js','root-execute.cjs','verify-preparation.cjs','dependency-freeze.json','derivation.json','inherited.test.cjs','additive.test.cjs'];
for(const p of files.filter(p=>/\.(?:cjs|js)$/.test(p)))cp.execFileSync(process.execPath,['--check',path.join(__dirname,p)],{stdio:'pipe'});
const test=cp.spawnSync(process.execPath,['--test',path.join(__dirname,'inherited.test.cjs'),path.join(__dirname,'additive.test.cjs')],{encoding:'utf8'});
if(test.status!==0)throw Error('LOCAL_TEST_FAILED');
const match=/tests (\d+)[\s\S]*?pass (\d+)[\s\S]*?fail (\d+)/.exec(test.stdout);
if(!match||Number(match[1])!==16||Number(match[2])!==16||Number(match[3])!==0)throw Error('TEST_RECEIPT_INVALID');
const checks={actualExecution:false,privateInputRead:false,deviceBrowserNetworkCalls:false,sourceCommit:'4a484e6f839d2e6c3eb83503acb08147362cb011',syntaxFiles:files.filter(p=>/\.(?:cjs|js)$/.test(p)).length,localTests:{tests:16,passed:16,failed:0},scope:'controlled local preparation privacy/owner/generation/bounds/lifecycle checks; not actual latency proof'};
fs.writeFileSync(path.join(__dirname,'checks.json'),JSON.stringify(checks,null,2)+'\n');files.push('checks.json');
const rows=files.map(p=>{const b=fs.readFileSync(path.join(__dirname,p));return{path:p,bytes:b.length,sha256:sha(b)};});
const manifest={schema:'drive-original.rc31-passive-latency-freeze/2',sourceCommit:checks.sourceCommit,version:'1.22.0-rc.31',actualExecution:false,privateFilesIncluded:false,files:rows};
fs.writeFileSync(path.join(__dirname,'preparation-freeze.json'),JSON.stringify(manifest,null,2)+'\n');
const verified=require('./verify-preparation.cjs').verify(),b=fs.readFileSync(path.join(__dirname,'preparation-freeze.json'));
console.log(JSON.stringify({finalFreeze:true,actualExecution:false,files:rows.length,totalBytes:rows.reduce((n,r)=>n+r.bytes,0),manifestBytes:b.length,manifestSHA256:sha(b),verified,checks}));
