'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=['tests/static.test.js'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const governed=[...new Set([...require('../../scripts/public-files.cjs'),...files,
  'scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs',
  'worker/index.mjs','worker/crypto.mjs','worker/google.mjs','worker/durable-object.mjs',
  'media/audio-codec-build.json','media/mediabunny-q1-build.json'])].sort();
const snapshot=()=>governed.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const before=snapshot(),producerSha256=sha(fs.readFileSync(__filename));
const args=['--test','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true});
const log=(run.stdout||'')+(run.stderr||'');
fs.writeFileSync(path.join(__dirname,'product-tests.log'),log);
const counts={};
for(const name of ['tests','pass','fail','cancelled','skipped','todo']){
  const match=new RegExp('(?:#|ℹ) '+name+' (\\d+)').exec(log);
  counts[name]=match?Number(match[1]):null;
}
const after=snapshot(),stable=JSON.stringify(before)===JSON.stringify(after)
  &&producerSha256===sha(fs.readFileSync(__filename));
const report={recordedAt:new Date().toISOString(),passed:run.status===0&&!run.signal&&!run.error&&stable,
  exitCode:run.status,signal:run.signal,errorCode:run.error?.code??null,node:process.version,args,counts,
  stable,producerSha256,logSha256:sha(Buffer.from(log)),before,after,
  scope:'Version-only28 static integration checks; unchanged implementation reuses frozen27 full665 evidence; no actual account/device acceptance'};
fs.writeFileSync(path.join(__dirname,'product-tests.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,counts,exitCode:run.status,signal:run.signal}));
process.exitCode=report.passed?0:1;
