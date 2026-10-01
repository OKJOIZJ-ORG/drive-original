'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),guard=require('./delivery-guard.cjs');
guard.requireExecute();guard.assertSource();const deployment=guard.requireDeployment();
const run=cp.spawnSync(process.execPath,[path.join(guard.worker,'node_modules/wrangler/bin/wrangler.js'),'versions','view',deployment.workerVersion,'--json','--config','wrangler.jsonc'],
 {cwd:guard.worker,env:guard.cliEnv,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(__dirname,'version-readback-private.json'),run.stdout||'');fs.writeFileSync(path.join(__dirname,'version-readback-error-private.log'),run.stderr||'');
if(run.status!==0||run.error||run.signal)throw Error('VERSION_READBACK_FAILED');
const record=JSON.parse(run.stdout);if(record.id!==deployment.workerVersion)throw Error('WORKER_IDENTITY_MISMATCH');
guard.assertSource();console.log(JSON.stringify({source:guard.SOURCE,workerVersion:record.id,exitCode:run.status,rawNotExported:true,producerSha256:guard.sha(fs.readFileSync(__filename))}));
