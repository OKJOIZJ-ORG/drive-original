'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pins={'android-same-file-replay.cjs':'1d730fee60ed98aaaf1cf6c1d3a945fd87da7417dced06920e7e4a8f53543072',
 'android-same-file-replay-v2.cjs':'69490c03abac1cd98439a0c517f3a16cb001f7be8162991c2e9f050c39ea42bb',
 'single-file-observer-v2.expression.js':'3d5c4c5646f678ce410ed8605e0a327fef6776ebd2cc814b44745b92d297c9b1',
 'native-folder-target.function.js':'81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a'};
for(const[name,pin]of Object.entries(pins))if(sha(fs.readFileSync(path.join(__dirname,name)))!==pin)throw Error('FROZEN_PRIOR_DRIFT');
for(const name of ['native-ui-target-v3.function.js','android-same-file-replay-v3.cjs']){
 const r=spawnSync(process.execPath,['--check',path.join(__dirname,name)],{encoding:'utf8',windowsHide:true,timeout:10000});if(r.status!==0)throw Error('V3_SYNTAX');
}
const tests=['native-ui-target-v3.test.cjs','native-action-v3.test.cjs'];
const r=spawnSync(process.execPath,['--test',...tests.map(n=>path.join(__dirname,n))],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
const output=(r.stdout||'')+(r.stderr||''),count=label=>Number(output.match(new RegExp('(?:#|ℹ) '+label+' (\\d+)'))?.[1]||0);
if(r.status!==0||count('tests')!==12||count('pass')!==12)throw Error('V3_LOCAL_CHECK');
const report={schema:'drive-original.rc30-replay-preparation/3',actualExecutionByChild:false,browserDeviceNetworkCallsMade:false,
 sourceCommit:'aa46bd083ce8c21f55cf7d9a4759f0d6709188c2',localTests:{tests:12,passed:12,failed:0,exitCode:0,outputSha256:sha(Buffer.from(output))},
 frozenPriorPins: pins,files:Object.fromEntries(['android-same-file-replay-v3.cjs','native-ui-target-v3.function.js',...tests].map(name=>{
  const b=fs.readFileSync(path.join(__dirname,name));return[name,{bytes:b.length,sha256:sha(b)}];})),
 privateInputRead:false,originalMediaMutated:false,productEdited:false,exactFinalFrame:'UNKNOWN'};
fs.writeFileSync(path.join(__dirname,'preparation-v3-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
