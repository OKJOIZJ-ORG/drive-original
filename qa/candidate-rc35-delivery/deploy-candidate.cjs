'use strict';
// Root executes only after review/GO. Raw CLI output stays in this private QA directory.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),guard=require('./delivery-guard.cjs');
guard.requireExecute();guard.assertSource();const before=guard.verifySite(),startedAt=new Date().toISOString();
const args=[path.join(guard.worker,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config','wrangler.jsonc','--assets',guard.site];
const run=cp.spawnSync(process.execPath,args,{cwd:guard.worker,env:guard.cliEnv,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
const raw=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(__dirname,'deployment-private.log'),raw);
const version=/Current Version ID:\s*([a-f0-9-]{36})/i.exec(raw)?.[1]||null;
let stable=false;try{guard.assertSource();stable=JSON.stringify(before)===JSON.stringify(guard.verifySite());}catch(_){}
const record={source:guard.SOURCE,startedAt,finishedAt:new Date().toISOString(),exitCode:run.status,signal:run.signal,errorCode:run.error?.code||null,
 passed:run.status===0&&!run.signal&&!run.error&&stable&&Boolean(version),workerVersion:version,stable,candidateUrl:guard.BASE,
 assetsPath:guard.site,assets:before,rawLogSha256:guard.sha(Buffer.from(raw)),producerSha256:guard.sha(fs.readFileSync(__filename)),
 scope:'Explicit root-reviewed free candidate35 only; general Drive writes false; no production/main/push/automation/original-media changes'};
fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({passed:record.passed,source:guard.SOURCE,workerVersion:version,exitCode:run.status,signal:run.signal,stable}));
process.exitCode=record.passed?0:1;
