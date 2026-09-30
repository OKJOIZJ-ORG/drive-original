'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),worker=path.join(root,'worker'),deployment=JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json'),'utf8'));
if(!deployment.passed||deployment.source!=='9cd94b8caae8f0e5269bf1df7d413b4e8bbdd303'||!/^[a-f0-9-]{36}$/.test(deployment.workerVersion))throw Error('DEPLOYMENT_REQUIRED');
const run=cp.spawnSync(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'versions','view',deployment.workerVersion,'--json','--config','wrangler.jsonc'],{cwd:worker,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(__dirname,'version-readback-private.json'),run.stdout||'');fs.writeFileSync(path.join(__dirname,'version-readback-error-private.log'),run.stderr||'');
if(run.status!==0||run.error||run.signal)throw Error('VERSION_READBACK_FAILED');
const record=JSON.parse(run.stdout);if(record.id!==deployment.workerVersion)throw Error('WORKER_IDENTITY_MISMATCH');
console.log(JSON.stringify({workerVersion:record.id,exitCode:run.status,rawNotExported:true,producerSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}));
