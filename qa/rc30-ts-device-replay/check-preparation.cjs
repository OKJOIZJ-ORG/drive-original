'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const names=['native-folder-target.test.cjs','observer-v2.test.cjs','driver-v2-preparation.test.cjs'];
const args=['--test',...names.map(name=>path.join(__dirname,name))];
const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
const output=(r.stdout||'')+(r.stderr||''),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const count=label=>Number(output.match(new RegExp('(?:#|ℹ) '+label+' (\\d+)'))?.[1]||0);
const report={schema:'drive-original.rc30-replay-preparation-checks/2',actualExecution:false,
 browserDeviceNetworkCallsMade:false,sourceCommit:'aa46bd083ce8c21f55cf7d9a4759f0d6709188c2',
 localTests:{tests:count('tests'),passed:count('pass'),failed:count('fail'),exitCode:r.status,
  outputSha256:sha(Buffer.from(output)),outputBytes:Buffer.byteLength(output)},
 files:Object.fromEntries(names.map(name=>{const b=fs.readFileSync(path.join(__dirname,name));return[name,{bytes:b.length,sha256:sha(b)}];})),
 exactFinalFrameClaimed:false,privateInputRead:false,originalMediaMutated:false};
if(r.error||r.status!==0||report.localTests.tests!==13||report.localTests.passed!==13)throw Error('LOCAL_PREPARATION_CHECK_FAILED');
fs.writeFileSync(path.join(__dirname,'preparation-v2-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
