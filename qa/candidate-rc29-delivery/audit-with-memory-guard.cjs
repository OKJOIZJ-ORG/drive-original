'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),guard=require('./delivery-guard.cjs');
guard.requireExecute();guard.assertSource();guard.requireDeployment();
const auditPath=path.join(guard.root,'qa/candidate-delivery-audit.cjs');
if(!fs.readFileSync(auditPath).equals(guard.blob('qa/candidate-delivery-audit.cjs')))throw Error('FIXED_AUDIT_PRODUCER_CHANGED');
// Inspect only launch resources, without the older preflight's ADB/device probes.
const raw=cp.execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],
 {encoding:'utf8',windowsHide:true,timeout:15000});
const memory=JSON.parse(raw);
const report={source:guard.SOURCE,memory:{freePhysicalKiB:memory.FreePhysicalMemory,freeVirtualKiB:memory.FreeVirtualMemory,
 physicalFloorKiBExclusive:1048576,virtualFloorKiBExclusive:1572864,
 existingLaunchFloorPassed:memory.FreePhysicalMemory>1048576&&memory.FreeVirtualMemory>1572864},
 existingDependencies:fs.existsSync(path.join(guard.root,'qa/node_modules/playwright/package.json')),
 scope:'Local launch-memory check only; no Android/device/process probes',producerSha256:guard.sha(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(__dirname,'audit-memory-guard.json'),JSON.stringify(report,null,2)+'\n');
if(!report.memory.existingLaunchFloorPassed||!report.existingDependencies)throw Error('NEW_CHROME_MEMORY_FLOOR');
const run=cp.spawnSync(process.execPath,['qa/candidate-delivery-audit.cjs',guard.SOURCE,'candidate-rc29-delivery'],
 {cwd:guard.root,env:guard.cliEnv,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(__dirname,'audit-output.log'),(run.stdout||'')+(run.stderr||''));
if(run.status!==0||run.error||run.signal)throw Error('DELIVERY_AUDIT_FAILED');
guard.assertSource();const result=JSON.parse(fs.readFileSync(path.join(__dirname,'results.json'),'utf8'));
if(!result.passed||result.source!==guard.SOURCE||result.version!==guard.VERSION||result.base!==guard.BASE)throw Error('AUDIT_IDENTITY_MISMATCH');
console.log(JSON.stringify({passed:true,assets:result.assets.length,cache:result.cached.length,private404:result.privateRoutes.length,source:guard.SOURCE,exitCode:run.status}));
