// Local QA build supervisor. Tracks only its launched process and descendants.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const result={schema:'drive-original.q3-build-monitor/1',startedAt:new Date().toISOString(),minimumCommitAvailableGiB:400/1024,samples:[],ownedProcesses:[],terminated:[],producers:['build.sh','launch-build.cjs','build-monitor.cjs'].map(f=>({path:f,sha256:sha(path.join(__dirname,f))}))};
const seen=new Map();let build,stopped=false,finished=false,timer;
function memory(){return JSON.parse(cp.execFileSync('python',[path.join(root,'qa/host-resource-snapshot.py')],{windowsHide:true,encoding:'utf8'}));}
function processes(){const s=cp.execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object Name,ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress'],{windowsHide:true,encoding:'utf8'}).trim();return s?JSON.parse(s):[];}
function own(ps){let changed=true;const ids=new Set(ps.filter(p=>seen.get(p.ProcessId)?.CreationDate===p.CreationDate).map(p=>p.ProcessId));if(!seen.has(build.pid))ids.add(build.pid);while(changed){changed=false;for(const p of ps)if(ids.has(p.ParentProcessId)&&!ids.has(p.ProcessId)){ids.add(p.ProcessId);changed=true;}}for(const p of ps)if(ids.has(p.ProcessId)){seen.set(p.ProcessId,p);}
 return ps.filter(p=>seen.get(p.ProcessId)?.CreationDate===p.CreationDate);}
function save(){result.ownedProcesses=[...seen.values()];fs.writeFileSync(path.join(__dirname,'build-resource-results.json'),JSON.stringify(result,null,2)+'\n');}
function terminate(ps,reason='HOST_COMMIT_AVAILABLE_BELOW_400_MIB'){stopped=true;result.stopReason=reason;const rows=own(ps);for(const p of rows.reverse()){
 // Recheck creation identity immediately before each Stop-Process. No command lines exposed.
 // PowerShell's JSON date and formatting vary; use exact JSON serialization instead.
 const exact=`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${p.ProcessId}"; if($p -and (ConvertTo-Json -Compress -InputObject $p.CreationDate) -eq '${JSON.stringify(p.CreationDate)}'){ Stop-Process -Id ${p.ProcessId} -Force }`;
 cp.execFileSync('powershell.exe',['-NoProfile','-Command',exact],{windowsHide:true});result.terminated.push({processId:p.ProcessId,creationDate:p.CreationDate});
 }save();}
function sample(){if(finished)return;try{const ps=processes();own(ps);const m=memory();result.samples.push(m);save();console.log(JSON.stringify({phase:'monitor',physicalAvailableGiB:m.physicalAvailableGiB,commitAvailableGiB:m.commitAvailableGiB,owned:seen.size}));if(m.commitAvailableGiB<result.minimumCommitAvailableGiB&&!stopped)terminate(ps);}catch(e){result.monitorFailure=e.message;save();if(build&&!stopped)terminate(processes(),'BUILD_MONITOR_FAILURE');process.exitCode=1;}}
const initial=memory();result.samples.push(initial);if(initial.commitAvailableGiB<result.minimumCommitAvailableGiB){result.stopReason='BUILD_NOT_STARTED_HOST_COMMIT_PRESSURE';save();process.exitCode=1;}else{
 const previous=path.join(__dirname,'build.log');if(fs.existsSync(previous)&&!fs.existsSync(path.join(__dirname,'build-before-retry.log')))fs.copyFileSync(previous,path.join(__dirname,'build-before-retry.log'));
 build=cp.spawn(process.execPath,[path.join(__dirname,'launch-build.cjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});result.rootPid=build.pid;save();build.stdout.on('data',b=>process.stdout.write(b));build.stderr.on('data',b=>process.stderr.write(b));
 build.once('error',e=>{result.launchFailure=e.message;finished=true;clearInterval(timer);save();process.exitCode=1;});
 build.once('exit',(code,signal)=>{finished=true;clearInterval(timer);result.finishedAt=new Date().toISOString();result.exit=code;result.signal=signal;result.pass=code===0&&!signal&&!stopped&&!result.monitorFailure;result.samples.push(memory());save();console.log(JSON.stringify({buildPass:result.pass,exit:code,signal,stopReason:result.stopReason}));process.exitCode=result.pass?0:1;});
 sample();timer=setInterval(sample,15000);
}
