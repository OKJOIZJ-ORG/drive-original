'use strict';
// One normal-profile permission and one retained connection for the complete unit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const {pathToFileURL}=require('node:url');
const here=__dirname,qa=path.dirname(here),out=path.join(here,'native-session-v2-result.json');
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=name=>fs.readFileSync(path.join(qa,name),'utf8');
function pkg(name){const root=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');const found=fs.readdirSync(root).map(d=>path.join(root,d,'node_modules',name)).find(p=>fs.existsSync(path.join(p,'package.json')));if(!found)throw Error('OFFICIAL_PACKAGE_MISSING');return found;}
function text(r){return r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');}
function unpack(r){if(r.isError)throw Error('NATIVE_TOOL_FAILED');const m=text(r).match(/```json\s*([\s\S]*?)```/);if(!m)throw Error('SAFE_JSON_EXPECTED');return JSON.parse(m[1]);}
function safe(e){return /^[A-Z0-9_]+$/.test(e.message)?e.message:'NATIVE_TOOL_OR_CONNECTION_FAILED';}
function candidates(value){return value.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*(\d+): (.*)$/);if(!m)return[];const u=m[2].match(/^(https?:\/\/\S+)/)?.[1]??m[2].match(/\((https?:\/\/[^\s]+)\)(?: \[selected\])?(?: isolatedContext=.*)?$/)?.[1];try{return u&&new URL(u).origin===origin?[Number(m[1])]:[];}catch{return[];}});}
async function main(){
 if(fs.existsSync(out))throw Error('SESSION_RESULT_EXISTS');
 const binding=JSON.parse(read('rc37-color-disposable-preparation/disposable-binding.json'));
 const scripts={proof:read('candidate-rc37-delivery/pc-source-proof.expression.js'),factory:read('rc37-color-disposable-preparation/disposable-factory.expression.js'),facade:read('rc37-color-disposable-preparation/disposable-facade.function.js'),input:read('rc37-color-disposable-preparation/disposable-file-input.function.js')};
 for(const value of Object.values(scripts))new Function('return ('+value+')');
 const fixture=path.join(qa,'fm05-controlled-diagnostic/subtitle.mp4'),bytes=fs.readFileSync(fixture);
 if(bytes.length!==659966||digest(bytes)!=='d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037')throw Error('FIXTURE_DRIFT');
 const driver=require('./driver.cjs');
 if(fs.existsSync(path.join(here,'actual-pc-result.json')))throw Error('INTEGRATION_RESULT_EXISTS');
 const backupRoot=path.join(qa,'v2-state-recovery-backup');if(!fs.statSync(backupRoot).isDirectory())throw Error('PRIVATE_BACKUP_ROOT_MISSING');
 let client,transport,pid,pageId,created=false,executed=false,liveJob=false,creatorBacked=false,backupFailed=false,backupIndex=0;
 const report={schema:'drive-original.rc37-retained-native-session/1',sessionId:crypto.randomUUID(),startedAt:new Date().toISOString(),producerSHA256:digest(fs.readFileSync(__filename)),source:binding.source,version:binding.version,approvalConnectionsStarted:1,connectionRetained:true,connectDeadlineMs:12000,approvalRpcDeadlineMs:60000,operationRpcDeadlineMs:25000,fixtureBytes:bytes.length,fixtureSHA256:digest(bytes),scripts:Object.fromEntries(Object.entries(scripts).map(([k,v])=>[k,digest(Buffer.from(v))])),steps:[],productChanged:false,originalMediaWrite:false,completed:false};
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 const step=(name,value)=>{report.steps.push({name,at:new Date().toISOString(),value});save();console.log(JSON.stringify({step:name,value}));};
 const call=async(name,args,ms=25000)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:ms,signal:AbortSignal.timeout(ms)});if(r.isError)throw Error('NATIVE_TOOL_FAILED');return r;};
 const evaluate=async expression=>unpack(await call('evaluate_script',{pageId,function:'async()=>('+expression+')',waitForStableDom:false}));
 const loadJob=async recovery=>{liveJob=true;creatorBacked=false;return evaluate('(window.__colorCreator37=('+scripts.facade+')('+scripts.factory+','+JSON.stringify(binding)+',window.__resumeSwProof,'+(recovery?"{recoveryRun:JSON.parse(localStorage.getItem('drive-original.qa.disposable.color-exact-fixture.d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037.run')).run}":'{}')+'),window.__colorCreator37.summary())');};
 async function backup(stage){if(backupFailed)throw Error('PRIVATE_BACKUP_PREVIOUS_FAILURE');try{const raw=await evaluate('window.__colorCreator37.privateText()');const value=JSON.parse(raw);const body=Buffer.from(JSON.stringify(value,null,2)+'\n');if(body.length>1048576)throw Error('PRIVATE_BACKUP_BOUND');fs.writeFileSync(path.join(backupRoot,'color-rc37-'+report.sessionId+'-'+(++backupIndex)+'-'+stage+'-private.json'),body,{flag:'wx'});creatorBacked=true;return{privateBackupSaved:true,bytes:body.length,sha256:digest(body)};}catch(e){backupFailed=true;throw e;}}
 async function releaseJob(stage){if(liveJob){if(!creatorBacked)step('private backup before '+stage,await backup(stage));await evaluate('window.__colorCreator37.clear()');liveJob=false;}}
 async function uidFor(label){const snapshot=await call('take_snapshot',{pageId});const rows=text(snapshot).split(/\r?\n/).flatMap(line=>{const m=line.match(/uid=([A-Za-z0-9_:-]+)\s+(?:button|textbox|input|combobox)\s+"([^"]*)"/);return m&&m[2]===label?[m[1]]:[];});if(rows.length!==1)throw Error('EXACT_FRESH_INPUT_REQUIRED');return rows[0];}
 async function finishHelpers(){let preserveCreator=false;if(liveJob){try{await releaseJob('final-release');}catch(e){preserveCreator=true;step('private owner retained',{backupOrReleaseFailed:true,failure:safe(e),creatorBacked});}}return evaluate('(async()=>{if(window.__rc37DisposableColor)await window.__rc37DisposableColor.cleanup();if(window.__colorCreator37&&!'+preserveCreator+'){await window.__colorCreator37.clear();delete window.__colorCreator37;}window.__colorInput37?.clear();delete window.__colorInput37;delete window.__colorActualTarget37;if(!'+preserveCreator+')delete window.__resumeSwProof;return {inputAbsent:!document.getElementById("color-disposable-fixture-input-37"),blobAbsent:!window.__colorFixtureBlob37,targetAbsent:!window.__colorActualTarget37,observerAbsent:!window.__rc37DisposableColor,creatorAbsent:!window.__colorCreator37,proofAbsent:!window.__resumeSwProof,closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true};})()');}
 async function execute(){
  if(executed)throw Error('EXECUTE_ALREADY_CONSUMED');executed=true;
  let integration;
  try{
   step('fresh source proof',await evaluate(scripts.proof));
   step('input prepared',await evaluate('(window.__colorInput37=('+scripts.input+')('+JSON.stringify(binding)+',window.__resumeSwProof),window.__colorInput37.ready())'));
   const uid=await uidFor('Color disposable fixture input');
   const inputOwner=unpack(await call('evaluate_script',{pageId,args:[uid],function:'input=>({owned:input===document.getElementById("color-disposable-fixture-input-37")&&input.isConnected&&input.type==="file"&&input.multiple===false&&input.accept==="video/mp4"&&input.closest("[data-color-disposable-fixture-input=\\"37\\"]")!==null&&window.__colorInput37.ready().ready})',waitForStableDom:false}));
   if(!inputOwner.owned)throw Error('EXACT_FIXTURE_INPUT_OWNER');
   await call('upload_file',{pageId,uid,filePaths:[fixture],includeSnapshot:false});step('native exact file selected',{uploadedToInput:true,automaticProviderUpload:false});
   step('fixture capture',await evaluate('window.__colorInput37.capture()'));
   step('creator admission',await loadJob(false));
   created=true;step('exact disposable create',await evaluate('window.__colorCreator37.create(window.__colorFixtureBlob37)'));
   step('private create recovery backup',await backup('created'));
   const createdSummary=await evaluate('window.__colorCreator37.summary()');
   if(!createdSummary.passed||createdSummary.created!==2)throw Error('EXACT_CREATE_UNQUALIFIED');
   await releaseJob('capture-replacement');step('fresh capture admission',await loadJob(true));
   const captured=await evaluate('window.__colorCreator37.capture()');step('fresh stable capture',captured);
   if(!captured.passed||!captured.captureStable)throw Error('EXACT_CAPTURE_UNQUALIFIED');
   step('private capture backup',await backup('captured'));step('detached exact target',await evaluate('window.__colorCreator37.installTarget()'));
   await releaseJob('playback-release');await evaluate('window.__colorInput37.clear()');
   const adapter={send:async(method,args)=>{if(method!=='Runtime.evaluate')throw Error('EXACT_EVALUATION_REQUIRED');return{result:{value:await evaluate(args.expression)}};}};
   const tab={playwright:{locator:selector=>({selectOption:async value=>{if(selector!=='#playerAudioTrack')throw Error('EXACT_AUDIO_INPUT_REQUIRED');const input=await evaluate('(()=>{const s=document.getElementById("playerAudioTrack"),options=[...s.options].filter(o=>o.value==='+JSON.stringify(String(value))+');if(s.disabled||options.length!==1||options[0].disabled)throw Error("EXACT_AUDIO_OPTION_REQUIRED");return {label:s.getAttribute("aria-label")||document.querySelector("label[for=playerAudioTrack]")?.textContent?.trim(),text:options[0].textContent.trim()};})()');const uid=await uidFor(input.label);const owner=unpack(await call('evaluate_script',{pageId,args:[uid],function:'input=>({owned:input===document.getElementById("playerAudioTrack")&&!input.disabled&&window.__rc37DisposableColor.read().current})',waitForStableDom:false}));if(!owner.owned)throw Error('EXACT_AUDIO_ELEMENT_OWNER');await call('fill',{pageId,uid,value:input.text,includeSnapshot:false});const selected=await evaluate('({value:document.getElementById("playerAudioTrack").value,current:window.__rc37DisposableColor.read().current})');if(selected.value!==String(value)||!selected.current)throw Error('EXACT_AUDIO_SELECTION_REQUIRED');}})},getAXState:async()=>{await call('take_snapshot',{pageId});}};
   integration=await driver.run({tab,cdp:adapter});step('actual account integration',integration);
  }finally{
   try{
    if(created){
     await evaluate('window.__rc37DisposableColor?.cleanup()');
     const pointer=await evaluate('({present:!!localStorage.getItem("drive-original.qa.disposable.color-exact-fixture.d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037.run"),submitted:window.__colorCreator37.summary().submitted})');
     if(pointer.present){await releaseJob('cleanup-replacement');step('fresh cleanup admission',await loadJob(true));const cleanup=await evaluate('window.__colorCreator37.cleanup()');step('exact recoverable trash',cleanup);step('private cleanup backup',await backup('cleaned'));report.disposableCleanupPassed=cleanup.passed&&cleanup.created===2;}
     else{report.disposableCleanupPassed=pointer.submitted===0;step('no provider sent intent',{submitted:pointer.submitted,pointerPresent:false});}
    }else report.disposableCleanupPassed=true;
   }catch(e){report.disposableCleanupPassed=false;step('provider cleanup failure',{failure:safe(e),noRetry:true});}
   finally{const helpers=await finishHelpers();step('final helper cleanup',helpers);report.helperCleanupPassed=Object.values(helpers).every(v=>v===true);}
   report.integrationPassed=integration?.completed===true;report.completed=report.integrationPassed&&report.disposableCleanupPassed&&report.helperCleanupPassed;save();
  }
 }
 try{
  const sdk=pkg('@modelcontextprotocol/sdk'),mcp=pkg('chrome-devtools-mcp');
  const {Client}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/index.js')).href),{StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/stdio.js')).href);
  transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'build/src/bin/chrome-devtools-mcp.js'),'--autoConnect','--channel=stable','--categoryExtensions=false','--no-usage-statistics','--no-performance-crux','--redactNetworkHeaders'],stderr:'pipe',env:{...process.env,CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1'}});transport.stderr.on('data',()=>{});
  client=new Client({name:'drive-original-rc37-retained-native-session',version:'1.0.0'},{capabilities:{}});
  await client.connect(transport,{timeout:12000,signal:AbortSignal.timeout(12000)});pid=transport.pid;
  step('one browser permission request pending',{connectionOpen:true});
  const listing=await call('list_pages',{},60000),pages=candidates(text(listing));
  fs.writeFileSync(path.join(backupRoot,'native-listing-'+report.sessionId+'-private.json'),JSON.stringify(listing),{flag:'wx'});
  step('connection listing diagnosis',{parsedCandidates:pages.length,containsExpectedOrigin:text(listing).includes(origin),contentTypes:listing.content.map(x=>x.type),structuredKeys:Object.keys(listing.structuredContent||{})});
  if(pages.length!==1){step('connection retained without input',{candidateAdmission:false});const lines=readline.createInterface({input:process.stdin,terminal:false});for await(const line of lines){const command=JSON.parse(line);if(command.op==='close')break;console.log(JSON.stringify({op:command.op,admitted:false,connectionRetained:true}));}lines.close();return;}
  pageId=pages[0];
  const admission=await evaluate('({version:APP_VERSION,online:state.authStatus==="online",ready:state.accountStateLoaded&&hasUsableToken(),closed:el.playerSheet.hidden,visible:document.visibilityState==="visible",q0:!!q0Playback,q1:!!q1Playback})');
  if(admission.version!==binding.version||!admission.online||!admission.ready||!admission.closed||!admission.visible||admission.q0||admission.q1)throw Error('CURRENT_IDLE_TAB_REQUIRED');step('retained connection ready',admission);
  const lines=readline.createInterface({input:process.stdin,terminal:false});
  for await(const line of lines){let command;try{command=JSON.parse(line);if(command.op==='execute'){await execute();console.log(JSON.stringify({op:'execute',completed:report.completed}));}else if(command.op==='close')break;else throw Error('EXACT_SESSION_COMMAND_REQUIRED');}catch(e){step('command failure',{failure:safe(e)});}}
  lines.close();
 }catch(e){report.failure=safe(e);save();console.log(JSON.stringify({failed:true,failure:report.failure}));}
 finally{pid??=transport?.pid;try{await client?.close();report.clientClosed=true;}catch{report.clientClosed=false;}try{if(pid){process.kill(pid,0);report.ownedMcpProcessExited=false;}else report.ownedMcpProcessExited=true;}catch(e){report.ownedMcpProcessExited=e.code==='ESRCH';}report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({op:'closed',clientClosed:report.clientClosed,ownedMcpProcessExited:report.ownedMcpProcessExited,completed:report.completed}));}
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({failed:true,failure:safe(e)}));process.exitCode=1;});
module.exports={candidates};
