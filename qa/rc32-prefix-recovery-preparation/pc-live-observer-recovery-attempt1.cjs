'use strict';
// Recover observation of the existing authorized normal-profile tab; never reload it.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const resultName=process.argv[2]||'pc-observer-recovery-progress-safe.json';
if(!/^pc-observer-recovery-[a-z0-9-]+-safe\.json$/.test(resultName))throw Error('SAFE_OUTPUT_NAME_REQUIRED');
const output=path.join(__dirname,resultName);
function pkg(name){const root=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');const p=fs.readdirSync(root).map(d=>path.join(root,d,'node_modules',name)).find(p=>fs.existsSync(path.join(p,'package.json')));if(!p)throw Error('OFFICIAL_PACKAGE_MISSING');return p;}
function unpack(r){if(r.isError)throw Error('MCP_OPERATION_FAILED');const text=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');const match=text.match(/```json\s*([\s\S]*?)```/);if(!match)throw Error('SAFE_JSON_EXPECTED');return JSON.parse(match[1]);}
async function run(){if(fs.existsSync(output))throw Error('RESULT_ALREADY_EXISTS');let client,timer;const report={schema:'drive-original.pc-observer-recovery/1',startedAt:new Date().toISOString(),productChanged:false,reloaded:false,profileSettingsChanged:false,privateIdentifiersExported:false,observations:[]};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 try{
  const sdk=pkg('@modelcontextprotocol/sdk'),mcp=pkg('chrome-devtools-mcp');
  const {Client}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/index.js')).href),{StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/stdio.js')).href);
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'build/src/bin/chrome-devtools-mcp.js'),'--autoConnect','--channel=stable','--categoryExtensions=false','--no-usage-statistics','--no-performance-crux','--redactNetworkHeaders'],stderr:'pipe',env:{...process.env,CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1'}});transport.stderr.on('data',()=>{});
  client=new Client({name:'drive-original-pc-observer-recovery',version:'1.0.0'},{capabilities:{}});
  await Promise.race([client.connect(transport),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXISTING_BROWSER_CONNECT_BOUND')),30000);})]).finally(()=>clearTimeout(timer));
  const listing=await client.callTool({name:'list_pages',arguments:{}});if(listing.isError)throw Error('PAGE_LIST_FAILED');
  const text=listing.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  const pages=text.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*(\d+): (.*)$/);if(!m)return[];const url=m[2].match(/^(https?:\/\/\S+)/)?.[1]||m[2].match(/\((https?:\/\/[^\s]+)\)(?: \[selected\])?(?: isolatedContext=.*)?$/)?.[1];if(!url)return[];try{return new URL(url).origin===origin?[Number(m[1])]:[];}catch{return[];}});
  report.listing={candidateCount:pages.length,containsExpectedOrigin:text.includes(origin),reportedError:!!listing.isError};save();
  if(pages.length!==1)throw Error('EXACT_CANDIDATE_TAB_REQUIRED');const pageId=pages[0];
  const evalSafe=async fn=>unpack(await client.callTool({name:'evaluate_script',arguments:{pageId,function:fn,waitForStableDom:false}}));
  const admit=await evalSafe(`()=>({sameOrigin:location.origin===${JSON.stringify(origin)},version:APP_VERSION,runner:!!window.__rc32PrefixRecoveryRunner,closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback})`);report.admission=admit;save();
  if(!admit.sameOrigin||admit.version!=='1.22.0-rc.32'||!admit.runner||!admit.closed||admit.q0||admit.q1)throw Error('LIVE_REGISTRY_ADMISSION_FAILED');
  if(process.argv[3]==='probe'){
   report.probe=await evalSafe(`async()=>{let c=null;try{c=JSON.parse(window.__rc32DeeperContext)}catch{}const initial={projection:JSON.stringify(state.accountMediaState),revision:state.accountStateRevision,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.tokenRevision};const samples=[];for(let i=0;i<4;i++){if(i)await new Promise(resolve=>setTimeout(resolve,10000));samples.push({elapsedSeconds:i*10,contextAccountSame:!!c&&c.accountKey===state.accountId,contextDriveGenerationSame:!!c&&c.generation===state.driveSessionGeneration,projectionSame:initial.projection===JSON.stringify(state.accountMediaState),revisionSame:initial.revision===state.accountStateRevision,authGenerationSame:initial.auth===state.authGeneration,driveGenerationSame:initial.drive===state.driveSessionGeneration,tokenRevisionSame:initial.token===state.tokenRevision,accountLoaded:state.accountStateLoaded===true,identityPending:!!state.accountIdentityPending,online:state.authStatus==='online',usableToken:hasUsableToken(),visible:document.visibilityState==='visible',refreshPending:!!state.accountStateLoadingPromise,syncPending:!!state.accountStateSyncPromise,syncTimerPending:!!state.accountStateSyncTimer,syncRetryPending:!!state.accountStateSyncRetryTimer,syncErrorPresent:state.accountStateSyncError!==null,selectedNone:state.selected===null,mediaIdle:state.mediaAttempt==='idle',q1None:q1Playback===null,retired:q1RetirementResult?.settled===true,mediaPriorityInactive:playerMediaPriorityActive===false,expiresInMs:state.expiresAt-Date.now()});}return{historicalOwnerComparisonAvailable:false,samples};}`);report.completed=true;console.log(JSON.stringify(report.probe));return;
  }
  if(process.argv[3]==='cleanup'){
   report.cleanup=await evalSafe(`async()=>{const r=window.__rc32PrefixRecoveryRunner;const before=r.read();if(before.active)throw Error('ACTIVE_OWNER_CLEANUP_REFUSED');r.cleanup();const end=Date.now()+15000;while(!r.read().disposed&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,100));const after=r.read();if(!after.disposed)return{disposed:false,active:after.active};window.__rc32DeeperSwProof?.clear?.();for(const key of ['__rc32PrefixRecoveryRunner','__rc32PrefixRecoveryInstall','__rc32DeeperContext','__rc32DeeperSwProof','__pc32CorpusContextLoad','__pc32PrefixSafeResult','__pc32PrefixRunStarted'])delete window[key];return{disposed:true,active:false,ownedPrivateHandlesRemoved:true,originalMediaMutated:false};}`);report.completed=report.cleanup.disposed===true;console.log(JSON.stringify(report.cleanup));return;
  }
  const end=Date.now()+2700000;let lastJobs=-1;
  do{
   const r=await evalSafe(`()=>{const r=window.__rc32PrefixRecoveryRunner.read(),s=r.jobs.at(-1)?.summary;return{at:new Date().toISOString(),active:r.active,stopped:r.stopped,disposed:r.disposed,done:r.burst.done,phase:r.burst.activePhase,burstStarted:r.burst.started,jobs:r.jobs.length,coverage:s?.coverage,catalogStable:s?.catalogStable,released:s?.released,lastFailure:s?.failure,expiresMs:state.expiresAt-Date.now()};}`);
   if(r.jobs!==lastJobs||r.done||r.stopped){report.observations.push(r);lastJobs=r.jobs;save();console.log(JSON.stringify(r));}
   if(r.done||r.stopped){report.runnerTerminal=r;report.safeRunner=await evalSafe('()=>window.__rc32PrefixRecoveryRunner.read()');report.completed=r.done&&!r.stopped;save();break;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }while(Date.now()<end);
  if(!report.runnerTerminal)throw Error('OBSERVER_TOTAL_BOUND');
 }catch(error){report.completed=false;report.failure=/^[A-Z0-9_]+$/.test(error.message)?error.message:'OBSERVER_CONNECTION_FAILED';console.log(JSON.stringify({completed:false,failure:report.failure}));}
 finally{if(client)try{await client.close();report.ownedMcpClosed=true;}catch{report.ownedMcpClosed=false;report.completed=false;}save();if(!report.completed)process.exitCode=1;}
}
if(require.main===module)run();
module.exports={unpack};
