'use strict';
// No connection, ADB, private context read or device input occurs on import/preparation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const here=__dirname,root=path.resolve(here,'../..'),qa=path.dirname(here),delivery=path.join(qa,'candidate-rc38-delivery');
const adb=path.resolve(root,'../maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe'),privateRoot=path.join(qa,'v2-state-recovery-backup');
const PRIVATE_INPUT=path.join(privateRoot,'rc38-android-created-context-private.json'),SOURCE=require('../candidate-rc38-delivery/source-binding.cjs').optionalSource();
const FIXTURE={file:path.join(qa,'player-track-selection/combined.mp4'),bytes:759643,sha256:'bc831b81953010036a7d931100dfd264fa14d8e22633b6518268f6c6dbfc2e2f',md5:'4a49dfa52d67d5b4b391fe9bb7f836ae',initialAudioTrackId:2,selectedAudioTrackId:3};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=(p,ms,code)=>{let t;return Promise.race([p,new Promise((_,reject)=>t=setTimeout(()=>reject(Error(code)),ms))]).finally(()=>clearTimeout(t));};
function safeFailure(e,operation){return {operation,code:/^(?:AAC|CURRENT|CDP|ADB|NATIVE)_[A-Z0-9_]+$/.test(e?.message)?e.message:'AAC_TOOL_OR_PRODUCT_EXCEPTION',
  errorName:['Error','TypeError','ReferenceError','AbortError','TimeoutError'].includes(e?.name)?e.name:'UNKNOWN',messageSHA256:sha(Buffer.from(String(e?.message||''))),
  timeoutObserved:/timeout|timed out|deadline|bound/i.test(e?.message||''),connectionObserved:/closed|disconnected|context|connection/i.test(e?.message||'')};}
function validateInput(v){if(v?.schema!=='rc38-android-exact-created-context/1'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.qaRunId||'')
  ||typeof v.account?.accountId!=='string'||!v.account.accountId||!v.metadata||Object.keys(v).some(k=>!['schema','account','metadata','qaRunId'].includes(k))
  ||Object.keys(v.account).some(k=>k!=='accountId')||v.metadata.appProperties?.qaRun!==v.qaRunId||v.metadata.appProperties?.qaRole!=='test-video-1'
  ||v.metadata.appProperties?.qaFixtureSHA256!=='bc831b81953010036a7d931100dfd264fa14d8e22633b6518268f6c6dbfc2e2f')throw Error('AAC_PRIVATE_CONTEXT_SHAPE');return v;}
function preparation(){const bound=SOURCE!=='UNKNOWN';if(bound)require('../candidate-rc38-delivery/source-binding.cjs').requireBinding();const files={driver:__filename,preflight:path.join(here,'preflight.test.cjs'),snapshotPreflight:path.join(here,'snapshot-focused.test.cjs'),snapshotMocks:path.join(here,'snapshot.mock.cjs'),pcHelper:path.join(here,'pc-browser.function.js'),helper:path.join(here,'browser.function.js'),guard:path.join(here,'connector-file-guard.function.js'),guardPreflight:path.join(here,'connector-guard-preflight.cjs'),sourceBindingModule:path.join(delivery,'source-binding.cjs'),priorPassiveReceipt:path.join(qa,'rc37-android-disposable-aac/local-checks.json'),observe:path.join(delivery,'android-current-observe.function.js'),proof:path.join(delivery,'android-current-proof.function.js'),
  binding:path.join(delivery,'android-current-binding.json'),readiness:path.join(delivery,'source-readiness.json'),geometry:path.join(qa,'player-track-selection/android-native-target.function.js'),popup:path.join(qa,'player-track-selection/android-native-select.cjs')};
  const text={};if(bound)files.runtimeBinding=path.join(delivery,'source-binding.json');if(!bound){delete files.binding;delete files.readiness;}for(const[k,file]of Object.entries(files))text[k]=fs.readFileSync(file,'utf8');for(const k of ['helper','pcHelper','guard','observe','proof','geometry'])new Function('return ('+text[k]+')');
  const fixtureBytes=fs.readFileSync(FIXTURE.file);if(fixtureBytes.length!==FIXTURE.bytes||sha(fixtureBytes)!==FIXTURE.sha256||crypto.createHash('md5').update(fixtureBytes).digest('hex')!==FIXTURE.md5)throw Error('AAC_COMBINED_FIXTURE_CHANGED');
  const binding=bound?JSON.parse(text.binding):{sourceCommit:'UNKNOWN',version:'1.22.0-rc.38'},ready=bound?JSON.parse(text.readiness):null;if(bound&&(binding.sourceCommit!==SOURCE||binding.version!=='1.22.0-rc.38'||!binding.publicationVerified
    ||binding.readinessSHA256!==sha(Buffer.from(text.readiness))||!ready.passed||ready.sourceCommit!==SOURCE||ready.version!==binding.version||binding.cache.length!==50))throw Error('AAC_DELIVERY_BINDING');
  const manifest={schema:'rc38-android-actual-aac3-preparation/1',sourceCommit:SOURCE,version:binding.version,prepared:true,runtimeBound:bound,actualEligible:bound,actualExecution:false,
    fixture:{...FIXTURE,file:path.relative(root,FIXTURE.file).replaceAll('\\','/')},
    privateInputCreated:false,accountMutationsOwnedByRoot:true,sourceCacheProofReused:true,nativeSelectReused:'physical-v9',rpcDeadlineMs:25000,metadataAbortMs:10000,initialFrameMs:15000,overallMs:180000,cleanupMs:40000,
    passiveTrace:{verdictChanged:false,pageTransitionRows:128,networkRows:128,networkPending:64,coverage:'EXACT_PAGE_TARGET_ONLY_ALL_WORKER_NETWORK_UNKNOWN',rawURLsHeadersBodiesIdentitiesExported:false},
    producers:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,{file:path.relative(root,file).replaceAll('\\','/'),sha256:sha(fs.readFileSync(file))}]))};
  return {files,text,binding,manifest};}
function quiet(v){return v?.version==='1.22.0-rc.38'&&v.accountReadyIdle&&v.closed&&v.retirementSettled&&v.documentVisible&&v.libraryVisible&&v.rootReady&&v.queryEmpty&&!v.bannerVisible&&!v.foreignHelpers
  &&v.serviceWorker?.active==='activated'&&v.serviceWorker.activeIsController&&!v.serviceWorker.waiting&&!v.serviceWorker.installing&&v.serviceWorker.rootScope;}
async function socket(url){const ws=new WebSocket(url),pending=new Map(),listeners=new Set();let next=0,closed=false;
  const rejectAll=()=>{closed=true;for(const r of pending.values()){clearTimeout(r.timer);r.reject(Error('CDP_CONNECTION_CLOSED'));}pending.clear();};
  const message=e=>{let r;try{r=JSON.parse(e.data);}catch{return;}if(r.method){for(const fn of listeners)fn(r.method,r.params);return;}const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);if(r.error)p.reject(Error('CDP_PROTOCOL_ERROR'));else p.resolve(r.result);};
  ws.addEventListener('message',message);ws.addEventListener('close',rejectAll);ws.addEventListener('error',rejectAll);
  let connectOpen,connectError;
  try{await bounded(new Promise((resolve,reject)=>{connectOpen=resolve;connectError=()=>reject(Error('CDP_CONNECT_ERROR'));ws.addEventListener('open',connectOpen,{once:true});ws.addEventListener('error',connectError,{once:true});}),10000,'CDP_CONNECT_BOUND');}
  catch(e){ws.close();rejectAll();ws.removeEventListener('message',message);ws.removeEventListener('close',rejectAll);ws.removeEventListener('error',rejectAll);throw e;}
  finally{ws.removeEventListener('open',connectOpen);ws.removeEventListener('error',connectError);}
  return {onEvent(fn){listeners.add(fn);return ()=>listeners.delete(fn);},send(method,params={}){if(closed)throw Error('CDP_CONNECTION_CLOSED');const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_RPC_BOUND'));},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});},
    async close(){if(ws.readyState===WebSocket.CLOSED){rejectAll();listeners.clear();ws.removeEventListener('message',message);ws.removeEventListener('close',rejectAll);ws.removeEventListener('error',rejectAll);return true;}const done=new Promise(resolve=>ws.addEventListener('close',resolve,{once:true}));ws.close();try{await bounded(done,5000,'CDP_CLOSE_BOUND');return true;}finally{rejectAll();listeners.clear();ws.removeEventListener('message',message);ws.removeEventListener('close',rejectAll);ws.removeEventListener('error',rejectAll);}}};}
// One exact file on the already owned page socket. No response body is requested.
function networkTrace(cdp,fileId,origin){const rows=[],pending=new Map(),counts={requests:0,responses:0,finished:0,failed:0,evicted:0,pendingEvicted:0,nonTargetReassignments:0,observerErrors:0};let attempted=false,stopped=false,next=0;
  const number=v=>Number.isFinite(v)?v:null,header=(h,key)=>Object.entries(h||{}).find(([k])=>k.toLowerCase()===key)?.[1];
  const push=row=>{if(rows.length===128){rows.shift();counts.evicted++;}rows.push(row);};
  function event(method,p){if(stopped||!method.startsWith('Network.'))return;try{
    if(method==='Network.requestWillBeSent'){const u=new URL(p.request.url);
      const credential=u.origin===origin&&u.pathname==='/api/session/credential'&&p.request.method==='POST';
      const metadata=p.request.method==='GET'&&u.origin==='https://www.googleapis.com'&&u.pathname==='/drive/v3/files/'+encodeURIComponent(fileId)&&u.searchParams.get('alt')!=='media';
      const media=(u.origin===origin&&u.pathname==='/__drive_media/'+encodeURIComponent(fileId))||(u.origin==='https://www.googleapis.com'&&u.pathname==='/drive/v3/files/'+encodeURIComponent(fileId)&&u.searchParams.get('alt')==='media');
      if(!credential&&!metadata&&!(p.request.method==='GET'&&media)){if(pending.delete(p.requestId)){counts.nonTargetReassignments++;push({event:'coverage-loss',reason:'NON_TARGET_REQUEST_REASSIGNMENT'});}return;}const range=String(header(p.request.headers,'range')||'').match(/^bytes=(\d+)-(\d+)$/),source=Number(u.searchParams.get('sourceGeneration'));
      if(pending.size===64&&!pending.has(p.requestId)){pending.delete(pending.keys().next().value);counts.pendingEvicted++;}
      const row={sequence:++next,kind:credential?'CREDENTIAL':metadata?'METADATA':range?'MEDIA_RANGE':'MEDIA',startedAt:number(p.timestamp),sourceGeneration:!credential&&u.searchParams.has('sourceGeneration')&&Number.isSafeInteger(source)?source:null,
        range:range&&range.slice(1).every(v=>Number.isSafeInteger(Number(v)))?{start:Number(range[1]),end:Number(range[2])}:null};pending.set(p.requestId,row);counts.requests++;push({event:'request',...row});return;}
    const row=pending.get(p.requestId);if(!row)return;const elapsed=Number.isFinite(p.timestamp)&&Number.isFinite(row.startedAt)?Math.max(0,(p.timestamp-row.startedAt)*1000):null;
    if(method==='Network.responseReceived'){const length=header(p.response.headers,'content-length');counts.responses++;push({event:'response',sequence:row.sequence,kind:row.kind,elapsedMs:elapsed,status:number(p.response.status),length:typeof length==='string'&&/^\d+$/.test(length)&&Number.isSafeInteger(Number(length))?Number(length):null,fromServiceWorker:p.response.fromServiceWorker===true});}
    else if(method==='Network.loadingFinished'){counts.finished++;push({event:'finished',sequence:row.sequence,kind:row.kind,elapsedMs:elapsed,encodedLength:number(p.encodedDataLength)});pending.delete(p.requestId);}
    else if(method==='Network.loadingFailed'){counts.failed++;push({event:'failed',sequence:row.sequence,kind:row.kind,elapsedMs:elapsed,canceled:p.canceled===true,failureSHA256:sha(Buffer.from(String(p.errorText||'')))});pending.delete(p.requestId);}
  }catch{counts.observerErrors++;}}
  const remove=cdp.onEvent(event),snapshot=()=>({coverage:'EXACT_FILE_AND_SAME_CANDIDATE_CREDENTIAL_REQUESTS_VISIBLE_ON_OWNED_PAGE_CDP_TARGET',allWorkerNetworkCoverage:'UNKNOWN',responseBodiesRetained:false,counts:{...counts,pending:pending.size},rows:rows.slice()});
  async function stop(){stopped=true;remove();pending.clear();fileId=null;if(attempted)await cdp.send('Network.disable');attempted=false;return {listenerRemoved:true,pendingCleared:true,domainDisabled:true};}
  return {snapshot,stop,async enable(){if(stopped)throw Error('AAC_NETWORK_OBSERVER_STOPPED');attempted=true;await cdp.send('Network.enable');}};}
async function run(mode,resultName){require('../candidate-rc38-delivery/source-binding.cjs').requireBinding();require('../candidate-rc38-delivery/delivery-guard.cjs').assertSource();if(!['--admit','--run'].includes(mode))throw Error('AAC_EXPLICIT_ACTION_REQUIRED');if(!/^actual-[0-9a-f]{8}-[0-9a-f-]{27}\.json$/.test(resultName||''))throw Error('AAC_UNIQUE_RESULT_REQUIRED');
  const prep=preparation(),out=path.join(here,resultName),nativeSelect=require(prep.files.popup),started=Date.now(),until=started+180000;
  const reviewed=JSON.parse(fs.readFileSync(path.join(here,'preparation.json'),'utf8'));
  if(JSON.stringify(reviewed)!==JSON.stringify(prep.manifest))throw Error('AAC_PREPARATION_CHANGED');
  const report={schema:'rc38-physical-android-actual-aac/1',mode,startedAt:new Date().toISOString(),sourceCommit:SOURCE,version:prep.binding.version,
    productChanged:false,providerFileMutations:false,originalMediaWrites:false,normalAppViewedState:'MAY_PERSIST_FOR_THIS_QA_FILE_ONLY_NO_SNAPSHOT_RESTORE',nativeOSInput:mode==='--run',humanFingerInput:false,producerSHA256:sha(fs.readFileSync(__filename)),binding:prep.manifest.producers,
    steps:[],scope:'ONE root-created actual Drive generated759643B6s AVC/AAC file; current tuple/config/metadata only; no pixel/YUV/p95/encoder-count/full-goal claim'};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  let input,serial,forward,cdp,network,owned=false,operation='initial preparation',initialTarget,deviceTemp=null,cleanupEnd=null;const cleanup={};
  const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n'),step=(name,value)=>{operation=name;report.steps.push({name,at:Date.now(),value});save();};
  const within=()=>{if(Date.now()>=until)throw Error('AAC_OVERALL_BOUND');};
  const remaining=max=>Math.max(1,Math.min(max,(cleanupEnd??until)-Date.now()));
  const cmd=args=>{const r=spawnSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:remaining(10000),maxBuffer:1024*1024});if(r.error)throw r.error;if(r.status!==0)throw Error('ADB_COMMAND_FAILED');return r.stdout.trim();};
  const native=args=>{within();return cmd(['-s',serial,'shell','input',...args]);};
  async function targets(){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),remaining(10000));try{const r=await fetch('http://127.0.0.1:'+forward+'/json/list',{signal:ac.signal});if(!r.ok)throw Error('CDP_TARGET_HTTP');const text=await r.text();if(text.length>1048576)throw Error('CDP_TARGET_BOUND');return JSON.parse(text);}finally{clearTimeout(t);}}
  const retain=e=>{const bytes=Buffer.from(JSON.stringify({operation,name:e?.name,message:e?.message,stack:e?.stack,exceptionDetails:e?.exceptionDetails})+'\n');if(bytes.length>131072)throw Error('AAC_EXCEPTION_RECEIPT_BOUND');
    fs.writeFileSync(path.join(privateRoot,'rc38-android-'+crypto.randomUUID()+'-exception-private.json'),bytes,{flag:'wx'});return {privateExceptionSaved:true,bytes:bytes.length,sha256:sha(bytes)};};
  const rpc=async expression=>{const r=await bounded(cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}),remaining(25000),'AAC_RPC_OR_GLOBAL_BOUND');if(r.exceptionDetails){const description=r.exceptionDetails.exception?.description||'',code=description.split('\n')[0].match(/^(?:Error|TypeError|ReferenceError): ((?:AAC|CURRENT|NATIVE)_[A-Z0-9_]+)$/)?.[1];const e=Error(code||'AAC_BROWSER_EXCEPTION');e.exceptionDetails=r.exceptionDetails;throw e;}return r.result.value;};
  const call=async name=>{const value=await rpc('window.__rc38AndroidActualAAC.'+name+'()');if(value?.passiveTrace){report.passiveTrace??={};report.passiveTrace.page=value.passiveTrace;}return value;};
  async function poll(label,predicate,ms,cleanupOnly=false){const end=Math.min(Date.now()+ms,cleanupOnly?Date.now()+ms:until);let r;do{if(!cleanupOnly)within();r=await call(cleanupOnly?'closed':'read');
    if(!cleanupOnly&&(!r.fence||r.error||r.failed))throw Error('AAC_LIFETIME_OR_MEDIA_FAILURE');if(predicate(r)){step(label,r);return r;}await wait(100);}while(Date.now()<end);step(label+' deadline',r);throw Error('AAC_PHASE_BOUND');}
  const geometry=key=>rpc('('+prep.text.geometry+')('+JSON.stringify(key)+')');
  function point(g){const {physicalWidth:w,physicalHeight:h}=report.device;if(!g.available||![g.x,g.y,g.dpr,g.viewportHeight,g.viewport?.width].every(Number.isFinite)||Math.abs(g.viewport.width*g.dpr-w)>3)throw Error('NATIVE_GEOMETRY');
    const x=Math.round(g.x*g.dpr),y=Math.round(h-g.viewportHeight*g.dpr+g.y*g.dpr);if(x<0||x>=w||y<0||y>=h)throw Error('NATIVE_POINT_OUTSIDE');return {x,y};}
  async function tap(key){const r=await call('read');if(!r.current||!r.routeCurrent||!r.fence)throw Error('AAC_NATIVE_OWNER');const g=await geometry(key),p=point(g);const last=await call('read');if(!last.current||!last.routeCurrent||!last.fence)throw Error('AAC_NATIVE_OWNER');native(['tap',String(p.x),String(p.y)]);await wait(150);}
  async function controls(){let g=await geometry('playerMoreSummary');if(g.available)return;g=await geometry('playerControlsEntry');if(!g.available&&!g.controlsIdle){await tap('mediaStage');g=await geometry('playerControlsEntry');}if(!g.available)throw Error('NATIVE_ENTRY_UNAVAILABLE');await tap('playerControlsEntry');}
  async function normalClose(){const r=await call('read');if(r.closed)return;if(!r.cleanupCurrent)throw Error('AAC_CLEANUP_OWNER_CHANGED');if(r.dialog){const g=await geometry('playerTracksClose'),p=point(g);cmd(['-s',serial,'shell','input','tap',String(p.x),String(p.y)]);await wait(150);}
    const current=await call('read');if(!current.cleanupCurrent)throw Error('AAC_CLEANUP_OWNER_CHANGED');cmd(['-s',serial,'shell','input','keyevent','KEYCODE_BACK']);}
  try{
    if(mode==='--run'){const stat=fs.statSync(PRIVATE_INPUT);if(!stat.isFile()||stat.size>65536)throw Error('AAC_PRIVATE_CONTEXT_BOUND');input=validateInput(JSON.parse(fs.readFileSync(PRIVATE_INPUT,'utf8')));if(fs.existsSync(path.join(privateRoot,'rc37-android-'+input.qaRunId+'-consumed-private.json')))throw Error('AAC_RETIRED_RC37_CONTEXT');}
    const rows=cmd(['devices','-l']).split(/\r?\n/).filter(x=>/^\S+\s+device(?:\s|$)/.test(x));if(rows.length!==1)throw Error('ADB_AUTHORIZED_DEVICE_COUNT');serial=rows[0].split(/\s+/)[0];
    const model=cmd(['-s',serial,'shell','getprop','ro.product.model']),android=cmd(['-s',serial,'shell','getprop','ro.build.version.release']);if(model!=='SM-X800'||android!=='16')throw Error('ADB_DEVICE_IDENTITY');
    const size=cmd(['-s',serial,'shell','wm','size']).match(/Physical size:\s*(\d+)x(\d+)/);if(!size)throw Error('ADB_PHYSICAL_SIZE');report.device={authorized:1,model,android,physicalWidth:Number(size[1]),physicalHeight:Number(size[2]),serialExported:false};
    forward=Number(cmd(['-s',serial,'forward','tcp:0','localabstract:chrome_devtools_remote']));if(!Number.isSafeInteger(forward)||forward<1||forward>65535)throw Error('ADB_FORWARD_RESPONSE');
    const selected=(await targets()).filter(x=>{try{return x.type==='page'&&new URL(x.url).origin===prep.binding.origin;}catch{return false;}});if(selected.length!==1)throw Error('CDP_EXACT_CURRENT_TARGET_COUNT');initialTarget=selected[0];
    const socketURL=new URL(initialTarget.webSocketDebuggerUrl);if(socketURL.hostname!=='127.0.0.1'||Number(socketURL.port)!==forward||socketURL.protocol!=='ws:')throw Error('CDP_LOCAL_SOCKET_TARGET');
    cdp=await socket(socketURL.href);const chrome=await rpc('navigator.userAgent.match(/Chrome\\/[\\d.]+/)?.[0]');if(!/^Chrome\/153\./.test(chrome||''))throw Error('AAC_CHROME_VERSION');report.device.chrome=chrome;
    let current=await rpc('('+prep.text.observe+')()');step('fresh current ready idle',current);if(!quiet(current))throw Error('AAC_CURRENT_QUIET');
    const source=await rpc('('+prep.text.proof+')('+JSON.stringify(prep.binding)+')');step('fresh current38 source cache controller proof',source);
    current=await rpc('('+prep.text.observe+')()');if(!quiet(current)||await rpc('!!window.__rc38AndroidActualAAC||!!window.__rc38DisposableColor||!!window.__colorActualTarget38'))throw Error('AAC_POST_SOURCE_QUIET');
    if(mode==='--admit'){report.completed=true;report.verdict='CURRENT38_PHYSICAL_READY_IDLE_ONLY';return report;}
    // A root-created context is consumed once. No rerun under a fresh result name.
    fs.writeFileSync(path.join(privateRoot,'rc38-android-'+input.qaRunId+'-consumed-private.json'),JSON.stringify({result:resultName,consumedAt:new Date().toISOString()})+'\n',{flag:'wx'});
    operation='enable exact-file passive network observer';network=networkTrace(cdp,input.metadata.id,prep.binding.origin);await bounded(network.enable(),remaining(25000),'AAC_NETWORK_ENABLE_BOUND');
    operation='install exact private context and observers';owned=true;step(operation,await rpc('('+prep.text.helper+')('+JSON.stringify(input)+','+JSON.stringify({sourceCommit:SOURCE,version:prep.binding.version})+')'));input=null;
    step('fresh exact root metadata before playback',await call('locate'));step('ordinary app open',await call('open'));
    await poll('Q0 current presented frame',r=>r.current&&r.routeCurrent&&r.q0&&r.q0Pinned&&r.verified&&r.transport&&r.phases.find(p=>p.label==='q0')?.first?.good,15000);
    await controls();if(!(await call('read')).paused)await tap('ctrlPlayPause');await poll('native ordinary pause',r=>r.paused,3000);
    step('closed native VideoFrame tuple',await call('captureNative'));
    await controls();await tap('playerMoreSummary');await tap('ctrlTracks');await poll('ordinary current two-AAC inventory and default2',r=>r.dialog&&r.tracksCurrent&&r.tracksCleanup&&!r.switching&&r.defaultAudio===2&&r.audioValue===2&&r.selectedAudio===null
      &&r.audioOptions.length===2&&[2,3].every(id=>r.audioOptions.some(t=>t.id===id&&t.codec==='aac'&&t.route==='q1')),12000);
    // Arm successor frame before any selection input. Native label/XML never exported.
    step('AAC3 presented-frame observer armed',await call('selectionReady'));const selectionStart=Date.now();await call('preInputCheck');await tap('playerAudioTrack');
    const expected=await rpc('(()=>{const s=el.playerAudioTrack,o=[...s.options].filter(x=>x.value==="3"&&!x.disabled);if(o.length!==1)throw Error("AAC_OPTION_EXACT");return o[0].textContent;})()');
    deviceTemp='/data/local/tmp/drive-original-select-owned-'+crypto.randomUUID()+'.xml';let raw;try{cmd(['-s',serial,'shell','uiautomator','dump',deviceTemp]);raw=cmd(['-s',serial,'exec-out','cat',deviceTemp]);const option=nativeSelect.target(raw,expected,report.device.physicalWidth,report.device.physicalHeight);
      if(!option.available)throw Error('NATIVE_POPUP_OPTION_UNCONFIRMED');const r=await call('read');if(!r.current||!r.routeCurrent||!r.dialog||!r.fence)throw Error('AAC_NATIVE_POPUP_OWNER');await call('preInputCheck');native(['tap',String(option.x),String(option.y)]);step('one exact OS-native AAC3 option',{issued:true,matchingOptionNodes:option.matchingOptionNodes,rawXmlOrLabelsExported:false});}
    finally{raw=null;cmd(['-s',serial,'shell','rm',deviceTemp]);deviceTemp=null;}
    await poll('current Q1 AAC3 presented frame',r=>r.current&&r.routeCurrent&&r.q1General&&!r.q0&&!r.switching&&r.verified&&r.transport&&Number.isFinite(r.mappedPresentedMediaTime)&&r.phases.find(p=>p.label==='aac3')?.first?.good,Math.max(1,15000-(Date.now()-selectionStart)));
    await poll('current generation source window config',r=>r.statsReady&&r.pipelineAudio===3&&r.currentWorkerWindow&&r.workerIdentityCurrent,15000);
    const value=await call('verify');step('current AAC3 tuple source config and original metadata',value);
    report.integrationPassed=value.tuplePass&&value.originalMetadataUnchanged&&value.sourceConfigPreserved&&value.visibleGeometry&&value.trustedAAC3Change&&value.pipelineAudio===3&&value.initialPosition?.passed===true;
    report.encoderCount=value.encoders===null?'UNKNOWN_WINDOW_ONLY':value.encoders;report.pixelEquality='NOT_TESTED';report.unlikeFormatVisibleYUV='UNKNOWN';report.p95='NOT_TESTED';report.wholeGoalPassed=false;
    if(!report.integrationPassed)throw Error('AAC_TUPLE_CONFIG_METADATA_UNQUALIFIED');report.completed=true;report.verdict='FINITE_CURRENT_ACTUAL_AAC3_SINGLE_START_SNAPSHOT_TUPLE_CONFIG_METADATA_ONLY';
  }catch(e){report.completed=false;report.mainFailure=safeFailure(e,operation);try{report.privateFailureReceipt=retain(e);}catch(receipt){report.privateFailureSaveFailed=safeFailure(receipt,'private exception receipt');}}
  finally{cleanupEnd=Date.now()+40000;
    if(report.passiveTrace?.page)report.passiveTrace.pageBeforeClose=report.passiveTrace.page;
    if(network){report.passiveTrace??={};report.passiveTrace.networkBeforeClose=network.snapshot();}
    if(owned&&cdp){try{const helperPresent=await rpc('!!window.__rc38AndroidActualAAC');if(!helperPresent){const idle=await rpc('('+prep.text.observe+')()');cleanup.failedInstallLeftNoHelperOrMedia=quiet(idle);}
      else{await bounded(normalClose(),Math.max(1,cleanupEnd-Date.now()),'AAC_NORMAL_CLOSE_BOUND');await bounded(poll('ordinary Back settled media owners',r=>Object.values(r).every(v=>v===true),15000,true),Math.max(1,cleanupEnd-Date.now()),'AAC_RETIREMENT_BOUND');
        const value=await bounded(call('stop'),Math.max(1,cleanupEnd-Date.now()),'AAC_HELPER_STOP_BOUND');step('owned helper cleanup',value);cleanup.mediaAndHelper=Object.values(value).every(v=>v===true);
        cleanup.finalCurrentReadyIdle=quiet(await rpc('('+prep.text.observe+')()'));}
      }catch(e){cleanup.mediaAndHelper=false;report.cleanupFailure=safeFailure(e,'ordinary close and helper cleanup');try{report.privateCleanupFailureReceipt=retain(e);}catch{report.privateCleanupFailureSaved=false;}}}
    else cleanup.noMediaHelperInstalled=true;
    if(network){report.passiveTrace.networkAfterClose=network.snapshot();try{cleanup.exactNetworkObserverRemoved=Object.values(await bounded(network.stop(),remaining(25000),'AAC_NETWORK_STOP_BOUND')).every(v=>v===true);}catch(e){cleanup.exactNetworkObserverRemoved=false;report.networkCleanupFailure=safeFailure(e,'exact network observer cleanup');try{report.privateNetworkCleanupFailureReceipt=retain(e);}catch{report.privateNetworkCleanupFailureSaved=false;}}}else cleanup.noNetworkObserverInstalled=true;
    if(deviceTemp){try{cmd(['-s',serial,'shell','rm',deviceTemp]);cleanup.ownedPopupXMLRemoved=true;}catch{cleanup.ownedPopupXMLRemoved=false;}}
    else cleanup.noOwnedPopupXML=true;
    if(initialTarget&&forward){try{const last=(await targets()).find(x=>x.id===initialTarget.id);cleanup.originalTabPreserved=!!last&&last.url===initialTarget.url;}catch{cleanup.originalTabPreserved=false;}}else cleanup.noOriginalTabChanged=true;
    if(cdp){try{cleanup.exactCDPSocketClosed=await bounded(cdp.close(),remaining(5000),'AAC_SOCKET_CLEANUP_BOUND');}catch{cleanup.exactCDPSocketClosed=false;}}else cleanup.noCDPSocketCreated=true;
    if(forward){try{cmd(['-s',serial,'forward','--remove','tcp:'+forward]);cleanup.exactForwardRemoved=true;}catch{cleanup.exactForwardRemoved=false;}}else cleanup.noForwardCreated=true;
    input=null;cleanup.nodePrivateContextCleared=true;cleanup.noMCPProcessCreated=true;cleanup.noTabCreatedOrClosed=true;report.cleanup=cleanup;report.cleanupComplete=Object.values(cleanup).every(v=>v===true);report.completed=report.completed===true&&report.cleanupComplete;report.completedAt=new Date().toISOString();save();}
  return report;
}
module.exports={preparation,run,validateInput,quiet,safeFailure,socket,networkTrace,PRIVATE_INPUT};
if(require.main===module){if(process.argv[2]==='--prepare'){const p=preparation();fs.writeFileSync(path.join(here,'preparation.json'),JSON.stringify(p.manifest,null,2)+'\n');console.log(JSON.stringify({prepared:true,runtimeBound:p.manifest.runtimeBound,actualEligible:p.manifest.actualEligible,actualExecution:false,privateInputCreated:false,sourceCommit:SOURCE}));}
  else run(process.argv[2],process.argv[3]).then(r=>{console.log(JSON.stringify({completed:r.completed,verdict:r.verdict??null,mainFailure:r.mainFailure??null,cleanupComplete:r.cleanupComplete}));if(!r.completed)process.exitCode=1;}).catch(e=>{console.error(JSON.stringify(safeFailure(e,'before reserved run')));process.exitCode=1;});}
