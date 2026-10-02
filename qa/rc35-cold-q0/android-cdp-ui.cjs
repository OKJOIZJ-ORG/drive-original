'use strict';
// Runtime protected input only. UI clicks/text are trusted Chrome CDP input on actual Android; Back remains Android OS input.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const replay=path.resolve(__dirname,'../rc32-ts-device-replay');
const {loadPrivate,inputCommand}=require(path.join(replay,'android-replay.cjs'));
const cold=require('../rc35-acceptance-adoption/pc-cold-admission.cjs');
const gate={verifyBound:verifyBound35};
const cdpUi=require('./cdp-ui.cjs'),headerObserver=require('./bounded-header.cjs');
const {joinSetup}=require('./preclose-setup.cjs'),{canPrepareFresh}=require('./initial-native-state.cjs');
const worker=require('./worker.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function queryEraseCommand(length){if(!Number.isSafeInteger(length)||length<0||length>240)throw Error('Q0_QUERY_BOUND');return['shell','input','keyevent','KEYCODE_MOVE_END',...Array(length).fill('KEYCODE_DEL')];}
function qualify(s,n,size,t){
 const frames=!!s.firstFrame&&!!s.progressFrame&&!s.failure&&s.current&&n.sourceWorker&&n.requestCount>0&&n.live===0&&!n.overflow&&!n.unqualified&&n.preflight?.allQualified===true;
 // CDP is the upstream completion boundary. SW diagnostic delivery is best effort;
 // retain its terminal count, require all starts and consumed-byte lower bounds.
 const agreement=!!t&&!t.overflow&&t.starts===n.requestCount&&t.requestCount===n.requestCount&&Number.isSafeInteger(t.terminalCount)&&t.terminalCount>=0&&t.terminalCount<=t.requestCount&&Number.isSafeInteger(t.finalReaderBytes)&&t.finalReaderBytes>=0&&t.finalReaderBytes<=n.actualBodyBytes;
 const finite=Number.isSafeInteger(n.all206RangeUpperBound)&&n.all206RangeUpperBound<size;
 const complete=n.completeChunkObservation&&Number.isSafeInteger(n.postCloseTrafficEnvelope)&&n.postCloseTrafficEnvelope>0&&n.postCloseTrafficEnvelope<size;
 return frames&&agreement&&(finite||complete);
}
async function execute(privateFile,resultName='actual-android-q0-byte-safe.json'){
 if(!/^[a-z0-9-]+\.json$/.test(resultName)||fs.existsSync(path.join(__dirname,resultName)))throw Error('RESULT_NAME_INVALID');
 const binding=gate.verifyBound(),input=loadPrivate(privateFile);if(input.target.mimeType!=='video/mp4'||!/\.mp4$/i.test(input.target.name)||Number(input.target.size)<1073741824)throw Error('LARGE_NORMAL_MP4_REQUIRED');
 const observer=fs.readFileSync(path.join(__dirname,'../rc32-q0-byte-acceptance/observer.function.js'),'utf8'),proof=fs.readFileSync(path.join(__dirname,'../candidate-rc35-delivery/pc-source-proof.expression.js'),'utf8'),ui=fs.readFileSync(path.join(replay,'native-ui-target-v3.function.js'),'utf8'),folderResolver=fs.readFileSync(path.join(replay,'native-folder-target.function.js'),'utf8');
 const provenance={sourceCommit:binding.sourceCommit,version:binding.version,sourceSHA256:binding.sourceSHA256,files:Object.fromEntries(['android.cjs','android-cdp-ui.cjs','cdp-ui.cjs','bounded-header.cjs','preclose-setup.cjs','initial-native-state.cjs','worker.cjs','binding.json'].map(p=>[p,sha(fs.readFileSync(path.join(__dirname,p)))])),frozenHelpersSHA256:binding.frozenHelpers,commonDerivation:'exact frozen32 common with one environment-version literal32→35 only',claim:'validated206-range upper bound OR complete noncompressed post-close source-worker traffic envelope with exact SW start/request agreement and independent CDP terminals; not exact body-at-frame',actualRequests:0,inputPath:'Chrome CDP trusted CSS mouse and keyboard; Android OS Back; no coordinate OS-tap claim'};
 return common35()(__filename,'../rc35-cold-q0/'+resultName,async c=>{
  let transport,coldPage,coldInstalled=false,coldAdmission,normalCloseQualified=false,headerProof,network,installed=false,savedProof=false,privateInstalled=false,cdpInputInstalled=false,ownsPlayer=false,passed=false,cleanup=true,observed,finalNetwork,navigations=0,actualAt=null;const preparedAt=Date.now();
  const evaluate=fn=>{if(actualAt===null?Date.now()-preparedAt>360000:Date.now()-actualAt>180000)throw Error(actualAt===null?'Q0_PREPARATION_DEADLINE':'Q0_UNIT_DEADLINE');return c.evaluateNative(fn);};
  const geometry=(key,cleanupRead=false)=>(cleanupRead?c.evaluateNative:evaluate)(key==='folder'?`()=>(${folderResolver})(window.__q0PriorProof.nextFolder)`:`()=>(${ui})(${JSON.stringify(key)},{})`);
  const viewport=()=>c.evaluateNative('()=>({width:innerWidth,height:innerHeight})');
  const tap=async(key,cleanupRead=false)=>{const g=await geometry(key,cleanupRead);await cdpUi.click(transport.pageSession,g,await viewport());await c.wait(500);return g;};
  const nativeQuery=async(value,cleanupRead=false)=>{await tap('searchInput',cleanupRead);if(!await c.evaluateNative('()=>document.activeElement===el.searchInput'))throw Error('Q0_CDP_QUERY_FOCUS');await cdpUi.replaceText(transport.pageSession,value);await c.evaluateNative('()=>{el.searchInput.blur();return{ordinaryQueryFocusReleased:true};}');await c.wait(500);};
  const read=()=>c.evaluateNative('()=>window.__q0Byte.read()');
  const close=async()=>{let s=await c.evaluateNative('()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,q0:!!q0Playback,q1:!!q1Playback})');if(!s.closed)c.adb(['shell','input','keyevent','KEYCODE_BACK']);const end=Date.now()+15000;while((!s.closed||!s.retired||s.q0||s.q1)&&Date.now()<end){await c.wait(200);s=await c.evaluateNative('()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,q0:!!q0Playback,q1:!!q1Playback})');}c.step('normal Back and retirement',s);if(!s.closed||!s.retired||s.q0||s.q1)throw Error('Q0_RETIREMENT_UNCONFIRMED');};
  try{
   c.report.schema='actual-android-rc35-cold-q0-cdp-ui/1';c.report.workBoundMs=180000;c.report.preparationBoundMs=360000;
   c.step('local immutable measurement binding',provenance);
   await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
   transport=await worker.preparePage(c);
   const initial=await evaluate('()=>({idle:('+cold.idleSnapshot.toString()+')(),native:{currentSrc:!!el.videoPlayer.currentSrc,hasSrc:!!el.videoPlayer.getAttribute("src"),srcObject:!!el.videoPlayer.srcObject,sourceCount:el.videoPlayer.querySelectorAll("source").length,readyState:el.videoPlayer.readyState,networkState:el.videoPlayer.networkState,buffered:el.videoPlayer.buffered.length},root:state.currentFolderId==="root",queryEmpty:el.searchInput.value==="",accountIdle:state.accountStateLoaded&&state.authStatus==="online"&&!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountStateSyncTimer&&!state.accountStateSyncRetryTimer&&!state.accountIdentityPending,foreignHelpers:!!window.__q0PriorProof||!!window.__q0Byte||!!window.__resumeReplayTarget30||!!window.__resumeSwProof||!!window.__q0CdpInput})');
   c.step('initial closed native prestate',initial);
   if(!cold.qualifyIdle(initial.idle)){
    if(!canPrepareFresh(initial))throw Error('COLD_INITIAL_OWNER_OR_BUFFER_ACTIVE');
    await transport.pageSession.send('Page.reload',{ignoreCache:false});
    const cleanEnd=Date.now()+35000;let clean=false;do{try{clean=await evaluate(`()=>typeof state==='object'&&APP_VERSION==='1.22.0-rc.35'&&state.accountId===${JSON.stringify(input.account.accountId)}&&state.authAccountKey===${JSON.stringify(input.account.authAccountKey)}&&state.accountStateLoaded&&state.authStatus==='online'&&el.playerSheet.hidden&&navigator.serviceWorker.controller?.state==='activated'`);}catch{}if(clean)break;await c.wait(300);}while(Date.now()<cleanEnd);
    if(!clean)throw Error('COLD_PREPARATION_RELOAD_DEADLINE');
    await transport.pageSession.send('Emulation.setFocusEmulationEnabled',{enabled:false});
    const pristine=await evaluate('()=>('+cold.idleSnapshot.toString()+')()');c.step('ordinary preparation reload restored pristine native element',pristine);if(!cold.qualifyIdle(pristine))throw Error('COLD_PREPARATION_NOT_PRISTINE');
   }
   await evaluate(`()=>{if(window.__q0PriorProof||window.__q0Byte||window.__resumeReplayTarget30)throw Error('Q0_HELPER_BUSY');window.__q0PriorProof={value:window.__resumeSwProof,scrollY:window.scrollY,folderId:state.currentFolderId,query:el.searchInput.value};return{saved:true};}`);savedProof=true;
   c.step('source35 public/cache/controller proof',await evaluate('async()=>('+proof.trim()+')'));
   const inputReady=await evaluate(`()=>{const input=${JSON.stringify(input)};if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)throw Error('Q0_ACCOUNT');window.__resumeReplayTarget30=input;return{privateTargetInstalled:true};}`);privateInstalled=true;c.step('protected exact target installed',inputReady);
   // Header admission is BEFORE fresh reload and BEFORE native decode/observer clocks.
   if(!await evaluate('()=>state.currentFolderId==="root"&&el.searchInput.value===""'))throw Error('COLD_INITIAL_ROOT_EMPTY_QUERY_REQUIRED');
   await evaluate(`()=>(${observer})(window.__resumeReplayTarget30,${JSON.stringify(binding)})`);installed=true;
   c.step('header metadata before',await evaluate('()=>window.__q0Byte.metadata("before")'));
   headerProof=await headerObserver.read(c,transport.pageSession,input);c.step('bounded actual original ISO header',headerProof);if(!headerProof.normalIsoMp4)throw Error('COLD_NORMAL_ISO_HEADER_REQUIRED');
   c.step('header metadata after',await evaluate('()=>window.__q0Byte.metadata("after")'));
   await evaluate('()=>{const s=window.__q0Byte.stop();delete window.__q0Byte;return s;}');installed=false;
   const navigation=await evaluate('()=>({folderId:window.__q0PriorProof.folderId,query:window.__q0PriorProof.query,scrollY:window.__q0PriorProof.scrollY})');
   coldPage=await cold.prepareOwnedPage(transport.pageSession,{execute:true,freshExclusiveSession:true});
   c.step('fresh owned page target cache bypass',{acknowledged:coldPage.cacheDisabledCommandAcknowledged,priorNativeAppByteOwnersEmpty:true});
   await transport.pageSession.send('Page.reload',{ignoreCache:false});
   const reloadEnd=Date.now()+35000;let restored=false;while(Date.now()<reloadEnd){try{restored=await evaluate(`()=>typeof state==='object'&&APP_VERSION==='1.22.0-rc.35'&&state.accountId===${JSON.stringify(input.account.accountId)}&&state.authAccountKey===${JSON.stringify(input.account.authAccountKey)}&&state.accountStateLoaded&&state.authStatus==='online'&&el.playerSheet.hidden&&navigator.serviceWorker.controller?.state==='activated'`);if(restored)break;}catch{}await c.wait(300);}if(!restored)throw Error('COLD_RELOAD_SOURCE_ACCOUNT_DEADLINE');
   await transport.pageSession.send('Emulation.setFocusEmulationEnabled',{enabled:false});
   await evaluate(`()=>{if(localStorage.getItem('drive-original.qa.rc35-update-baseline'))throw Error('COLD_UPDATE_BASELINE_PRESENT');window.__q0PriorProof={value:undefined,...${JSON.stringify(navigation)}};window.__resumeReplayTarget30=${JSON.stringify(input)};return{holderReinstalled:true};}`);
   c.step('fresh document source35 proof',await evaluate('async()=>('+proof.trim()+')'));
   c.step('fresh reload same native document',{freshTimeOrigin:true,priorProofDestroyedByNormalReload:true});
   if(!await evaluate('()=>el.searchInput.value===""||el.searchInput.value===window.__resumeReplayTarget30.target.name'))throw Error('Q0_SEARCH_PRESTATE');
   for(const folder of input.folderPath){
    if(await evaluate('()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)'))break;
    await evaluate(`()=>{window.__q0PriorProof.nextFolder=${JSON.stringify(folder)};return{ready:true};}`);
    let g=await geometry('folder');if(!g.currentFolderSame){for(let i=0;!g.available&&g.metadataUnique&&g.moreVisible&&i<3;i++){await tap('folderMoreButton');g=await geometry('folder');}if(!g.available)throw Error('Q0_NORMAL_FOLDER_UNAVAILABLE');await tap('folder');navigations++;}
    const end=Date.now()+25000;let s;do{await c.wait(250);s=await evaluate('()=>({same:state.currentFolderId===window.__q0PriorProof.nextFolder.id,loading:!!state.loadingFiles||!!state.loadingTree,population:state.files.length>0||state.folders.length>0})');}while(!(s.same&&!s.loading&&s.population)&&Date.now()<end);if(!(s.same&&!s.loading&&s.population))throw Error('Q0_FOLDER_POPULATION_UNCONFIRMED');
   }
   if(!await evaluate('()=>el.searchInput.value===window.__resumeReplayTarget30.target.name'))await nativeQuery(input.target.name);
   const searchEnd=Date.now()+40000;let search;do{await c.wait(250);search=await evaluate('()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,querySame:el.searchInput.value===window.__resumeReplayTarget30.target.name,loading:!!state.loadingFiles||!!state.loadingTree})');}while(!(search.found&&search.querySame&&!search.loading)&&Date.now()<searchEnd);c.step('bounded normal folder/Chrome CDP search preparation',search);if(!search.found||!search.querySame||search.loading)throw Error('Q0_NORMAL_TARGET_UNCONFIRMED');
   const ready=await evaluate('()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,loading:!!state.loadingFiles,folderSame:state.currentFolderId==="root"||window.__resumeReplayTarget30.target.parents.includes(state.currentFolderId),closed:el.playerSheet.hidden})');c.step('prepared normal card admission',ready);if(!ready.found||ready.loading||!ready.folderSame||!ready.closed)throw Error('Q0_PREPARED_CARD_REQUIRED');
   c.step('Q0 bounded observer installed',await evaluate(`()=>(${observer})(window.__resumeReplayTarget30,${JSON.stringify(binding)})`));installed=true;
   c.step('fresh before metadata',await evaluate('()=>window.__q0Byte.metadata("before")'));
   network=await worker.attachPrepared(transport,{id:input.target.id,size:Number(input.target.size),revision:input.target.headRevisionId,expectedScripts:binding.expectedScripts});c.step('executing actual SW and revision-pin bytes',await network.verifyScripts());c.step('sole source-worker Network enabled',{attached:true,bodyRead:false,targetScopedCacheBypass:true});
   const g=await geometry('card');
   const finalViewport=await viewport();cdpUi.point(g,finalViewport);
   c.step('passive exact card input observer',await evaluate('()=>('+cdpUi.observeCard.toString()+')('+JSON.stringify({x:g.x,y:g.y})+')'));cdpInputInstalled=true;
   c.step('cold admission installed',await evaluate('()=>'+coldPage.installExpression('window.__resumeReplayTarget30',JSON.stringify(binding))));coldInstalled=true;
   actualAt=Date.now();network.arm();c.step('Q0 first frame arm',await evaluate('()=>window.__q0Byte.arm()'));ownsPlayer=true;
   await cdpUi.click(transport.pageSession,g,finalViewport);
   const hit=await c.evaluateNative('()=>window.__q0CdpInput.read()');c.step('trusted exact normal card input',hit);if(!hit.observed||!hit.trusted||!hit.exactCard||!hit.pointMatched||hit.count!==1)throw Error('Q0_CDP_CARD_HIT_UNCONFIRMED');
   const end=Date.now()+70000;let firstRecorded=false;
   do{await c.wait(150);observed=await read();coldAdmission=await c.evaluateNative('()=>window.__pcColdAdmission.sample()');if(coldAdmission.failure)throw Error('COLD_ADMISSION_FAILED');if(observed.firstFrame&&!firstRecorded){c.step('first current Q0 frame and contemporaneous source-worker reduction',{frame:observed.firstFrame,network:network.read(),exactAtFrameByteClaim:false});firstRecorded=true;}if(observed.failure||observed.progressFrame)break;}while(Date.now()<end);
   c.step('bounded Q0 frame/progress result',observed);if(!observed.firstFrame||!observed.progressFrame||observed.failure||!observed.current)throw Error('Q0_FRAME_UNCONFIRMED');
   const setup=await evaluate('()=>('+joinSetup.toString()+')(25000)');c.step('bounded current Q0 auxiliary setup join before normal Back',setup);if(!setup.qualified)throw Error('Q0_AUXILIARY_SETUP_UNQUALIFIED');
   c.step('qualified cold observation interval',{admission:coldAdmission,cleanup:await c.evaluateNative('()=>window.__pcColdAdmission.stop()')});
   await close();ownsPlayer=false;normalCloseQualified=true;
   const drainEnd=Date.now()+10000;let trace;do{finalNetwork=network.read();trace=(await read()).swReaderTrace;if(finalNetwork.live===0&&trace.terminalCount===trace.requestCount&&trace.requestCount===finalNetwork.requestCount)break;await c.wait(200);}while(Date.now()<drainEnd);
   c.step('post-close conservative upstream transfer envelope',{network:finalNetwork,swReaderTrace:trace});c.step('same source-worker target after terminal drain',await network.verify());
   c.step('fresh after metadata',await evaluate('()=>window.__q0Byte.metadata("after")'));
   const registration=await evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration("/");return{activeMatches:r?.active===navigator.serviceWorker.controller,noWaiting:!r?.waiting,noInstalling:!r?.installing};}');c.step('final stable activated registration',registration);if(!registration.activeMatches||!registration.noWaiting||!registration.noInstalling)throw Error('COLD_REGISTRATION_DRIFT');
   const bytesQualified=qualify(observed,finalNetwork,Number(input.target.size),trace);const coldResult=cold.qualifyCold({admission:coldAdmission,cacheDisabledCommandAcknowledged:coldPage.cacheDisabledCommandAcknowledged,workerUnchanged:(await network.verify()).sameWorkerTarget,metadataQualified:true,byteObserverQualified:bytesQualified,normalCloseQualified,networkEvidence:finalNetwork});passed=bytesQualified&&headerProof.normalIsoMp4&&coldResult.qualified;c.step('original TR01 cold and transfer qualification',coldResult);c.step('TR01 finite scope result',{passed,fileBytes:Number(input.target.size),rangeTransferUpperBound:finalNetwork.all206RangeUpperBound,postCloseTrafficEnvelope:finalNetwork.postCloseTrafficEnvelope,firstFrameBeforeWholeDownload:passed,exactAtFrameBodyBytes:'UNKNOWN',operationalColdAdmissionQualified:coldResult.qualified,opfsDiskEmpty:'NOT_CLAIMED',TR02:'NOT_TESTED',wholeGoalPassed:false});if(!passed)throw Error('Q0_BYTES_UNQUALIFIED');
  }catch(e){c.report.primaryFailure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'Q0_OPERATION_FAILED';if(cdpInputInstalled)try{c.step('failure trusted input evidence',await c.evaluateNative('()=>window.__q0CdpInput.read()'));}catch{}if(installed)try{c.step('failure live safe evidence',{observer:await read(),network:network?.read()||null,coldAdmission:coldInstalled?await c.evaluateNative('()=>window.__pcColdAdmission.read()'):null});}catch{}throw e;
  }finally{
   if(ownsPlayer)try{await close();}catch{cleanup=false;}
   if(network)try{const r=await network.stop();c.step('owned source-worker observer cleanup',r);if(!r.ownedWorkerDetached||!r.ownedWorkerNetworkDisabled||!r.privateCorrelationCleared)cleanup=false;}catch{cleanup=false;}
   if(coldInstalled)try{c.step('owned cold gate cleanup',await c.evaluateNative('()=>{const s=window.__pcColdAdmission.stop();delete window.__pcColdAdmission;return s;}'));}catch{cleanup=false;}
   if(coldPage)try{const s=await coldPage.stop();c.step('owned cache flag restoration',s);if(!s.cacheRestoredToOwnedSessionDefault||!s.ownedPageNetworkDisabled)cleanup=false;}catch{cleanup=false;}
   if(installed)try{c.step('owned RVFC/timer cleanup',await c.evaluateNative('()=>window.__q0Byte.stop()'));}catch{cleanup=false;}
   for(let i=0;i<navigations;i++)try{c.adb(['shell','input','keyevent','KEYCODE_BACK']);await c.wait(400);}catch{cleanup=false;}
   if(privateInstalled)try{
    const end=Date.now()+10000;let r;do{r=await c.evaluateNative('()=>({folderSame:state.currentFolderId===window.__q0PriorProof.folderId,loading:!!state.loadingFiles||!!state.loadingTree})');if(r.folderSame&&!r.loading)break;await c.wait(250);}while(Date.now()<end);c.step('normal Back settled original folder restoration',r);if(!r.folderSame||r.loading)throw Error('Q0_FOLDER_RESTORATION');
    const q=await c.evaluateNative('()=>({same:el.searchInput.value===window.__q0PriorProof.query,original:window.__q0PriorProof.query===""?"EMPTY":"TARGET"})');if(!q.same)await nativeQuery(q.original==='EMPTY'?'':input.target.name,true);
   }catch{cleanup=false;}
   if(savedProof)try{const r=await c.evaluateNative('()=>{const p=window.__q0PriorProof;const folderSame=state.currentFolderId===p.folderId,querySame=el.searchInput.value===p.query;window.scrollTo(0,p.scrollY);delete window.__resumeReplayTarget30;delete window.__q0Byte;window.__resumeSwProof=p.value;delete window.__q0PriorProof;return{targetRemoved:true,proofRestored:true,folderSame,querySame};}');c.step('owned target/proof restoration',r);if(!r.folderSame||!r.querySame)cleanup=false;}catch{cleanup=false;}
   if(cdpInputInstalled)try{c.step('owned trusted card input cleanup',await c.evaluateNative('()=>{const r=window.__q0CdpInput.stop();delete window.__q0CdpInput;return r;}'));}catch{cleanup=false;}
   if(transport)try{const s=await transport.stop();c.step('owned additional native CDP/forward cleanup',s);if(!s.ownedPageDetached||!s.ownedBrowserSessionDetached||!s.ownedConnectionDisconnected||!s.ownedForwardRemoved)cleanup=false;}catch{cleanup=false;}
   c.report.sourceCommit=binding.sourceCommit;c.report.version=binding.version;c.report.TR01FiniteScopePassed=passed&&cleanup;c.report.coldConditionScope='operational selected-media no-local-byte-reuse; no diskempty claim';c.report.cleanupComplete=cleanup;c.report.actualUnitMs=actualAt===null?0:Date.now()-actualAt;c.report.preparationMs=(actualAt||Date.now())-preparedAt;c.report.originalMediaReadOnly=true;
   if(!cleanup)throw Error('Q0_CLEANUP_UNCONFIRMED');
  }
 });
}
module.exports={execute,qualify,queryEraseCommand,verifyBound35,common35,boundedHeader};
if(require.main===module){if(process.argv[2]!=='--execute'||!process.argv[3]){console.error('ROOT_EXECUTE_PRIVATE_INPUT_REQUIRED');process.exitCode=1;}else execute(path.resolve(process.argv[3]),process.argv[4]).catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'COLD_Q0_FAILED');process.exitCode=1;});}

function verifyBound35(){const b=JSON.parse(fs.readFileSync(path.join(__dirname,'binding.json'),'utf8')),root=path.resolve(__dirname,'../..');if(b.sourceCommit!=='2c2b1244bee0f1a5e500318c83c6e126c5124e34'||b.version!=='1.22.0-rc.35'||b.shellExpectedCount!==49||b.publicFileCount!==64)throw Error('COLD_BINDING');for(const [f,h] of Object.entries(b.frozenHelpers))if(sha(fs.readFileSync(path.join(root,f)))!==h)throw Error('COLD_FROZEN_HELPER_CHANGED');for(const [f,h] of Object.entries(b.sourceSHA256))if(sha(require('node:child_process').execFileSync('git',['show',b.sourceCommit+':'+f],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024}))!==h)throw Error('COLD_FIXED_GIT_SOURCE');return b;}
function common35(){const source=fs.readFileSync(path.join(replay,'android-common.cjs'),'utf8');if((source.match(/1\.22\.0-rc\.32/g)||[]).length!==1)throw Error('COLD_COMMON_DERIVATION');const Module=require('node:module'),m=new Module(path.join(replay,'android-common.cjs'),module);m.filename=path.join(replay,'android-common.cjs');m.paths=Module._nodeModulePaths(replay);m._compile(source.replace('1.22.0-rc.32','1.22.0-rc.35'),m.filename);return m.exports;}

function boundedHeader(input){return (async()=>{const t=input.target,a=new AbortController(),timer=setTimeout(()=>a.abort(),10000);let reader;try{const u=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(t.id)+'/revisions/'+encodeURIComponent(t.headRevisionId));u.searchParams.set('alt','media');const headers={Authorization:'Bearer '+state.token,Range:'bytes=0-16383'};if(t.resourceKey)headers['X-Goog-Drive-Resource-Keys']=t.id+'/'+t.resourceKey;const r=await fetch(u,{headers,cache:'no-store',redirect:'error',signal:a.signal});if(r.status!==206||r.headers.get('Content-Range')!=='bytes 0-16383/'+t.size)throw Error('COLD_HEADER_RANGE');reader=r.body.getReader();const bytes=new Uint8Array(16384);let n=0;for(;;){const v=await reader.read();if(v.done)break;if(n+v.value.length>bytes.length)throw Error('COLD_HEADER_BOUND');bytes.set(v.value,n);n+=v.value.length;}if(n!==16384)throw Error('COLD_HEADER_LENGTH');const view=new DataView(bytes.buffer),size=view.getUint32(0),tag=String.fromCharCode(...bytes.slice(4,8)),brand=String.fromCharCode(...bytes.slice(8,12));const compatible=[];if(tag==='ftyp'&&size>=16&&size<=n&&size%4===0)for(let p=16;p<size;p+=4)compatible.push(String.fromCharCode(...bytes.slice(p,p+4)));const allowed=['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '];return{normalIsoMp4:tag==='ftyp'&&size>=16&&size<=n&&size%4===0&&[brand,...compatible].some(x=>allowed.includes(x))&&brand!=='qt  ',bytes:n,headerSHA256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),rangeMatched:true,sourceRevisionPinned:true,rawHeaderExported:false,performedBeforeFreshReload:true};}finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});reader?.releaseLock();}})();}
