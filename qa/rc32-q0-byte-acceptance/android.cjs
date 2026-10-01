'use strict';
// Runtime protected input only. Exact folder/search/card preparation uses ordinary native UI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const replay=path.resolve(__dirname,'../rc32-ts-device-replay');
const gate=require(path.join(replay,'binding-gate.cjs')),{loadPrivate,inputCommand}=require(path.join(replay,'android-replay.cjs'));
const worker=require('./worker-network.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
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
 const observer=fs.readFileSync(path.join(__dirname,'observer.function.js'),'utf8'),proof=fs.readFileSync(path.join(replay,'source-proof.expression.js'),'utf8'),ui=fs.readFileSync(path.join(replay,'native-ui-target-v3.function.js'),'utf8'),folderResolver=fs.readFileSync(path.join(replay,'native-folder-target.function.js'),'utf8');
 const provenance={sourceCommit:binding.sourceCommit,version:binding.version,sourceSHA256:binding.sourceSHA256,files:Object.fromEntries(['android.cjs','worker-network.cjs','observer.function.js'].map(p=>[p,sha(fs.readFileSync(path.join(__dirname,p)))])),frozenHelpersSHA256:Object.fromEntries(['android-common.cjs','android-replay.cjs','binding-gate.cjs','source-proof.expression.js','native-ui-target-v3.function.js','native-folder-target.function.js'].map(p=>[p,sha(fs.readFileSync(path.join(replay,p)))])),claim:'validated206-range upper bound OR complete noncompressed post-close source-worker traffic envelope with exact SW start/request agreement and independent CDP terminals; not exact body-at-frame',actualRequests:0};
 return require(path.join(replay,'android-common.cjs'))(__filename,'../rc32-q0-byte-acceptance/'+resultName,async c=>{
  let network,installed=false,savedProof=false,privateInstalled=false,ownsPlayer=false,passed=false,cleanup=true,observed,finalNetwork,navigations=0,actualAt=null;const preparedAt=Date.now();
  const evaluate=fn=>{if(actualAt===null?Date.now()-preparedAt>360000:Date.now()-actualAt>180000)throw Error(actualAt===null?'Q0_PREPARATION_DEADLINE':'Q0_UNIT_DEADLINE');return c.evaluateNative(fn);};
  const height=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);
  const geometry=(key,cleanupRead=false)=>(cleanupRead?c.evaluateNative:evaluate)(key==='folder'?`()=>(${folderResolver})(window.__q0PriorProof.nextFolder)`:`()=>(${ui})(${JSON.stringify(key)},{})`);
  const tap=async(key,cleanupRead=false)=>{const g=await geometry(key,cleanupRead);if(!g.available||![g.x,g.y,g.dpr,g.viewportHeight,height].every(Number.isFinite))throw Error('Q0_NATIVE_TARGET_UNAVAILABLE');c.adb(['shell','input','tap',String(Math.round(g.x*g.dpr)),String(Math.round(height-g.viewportHeight*g.dpr+g.y*g.dpr))]);await c.wait(500);return g;};
  const nativeQuery=async(value,cleanupRead=false)=>{if(value!==''&&!inputCommand(value))throw Error('Q0_NATIVE_QUERY_UNSUPPORTED');await tap('searchInput',cleanupRead);const length=await c.evaluateNative('()=>el.searchInput.value.length');c.adb(queryEraseCommand(length));if(value)c.adb(inputCommand(value));c.adb(['shell','input','keyevent','KEYCODE_BACK']);await c.wait(500);};
  const read=()=>c.evaluateNative('()=>window.__q0Byte.read()');
  const close=async()=>{let s=await c.evaluateNative('()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,q0:!!q0Playback,q1:!!q1Playback})');if(!s.closed)c.adb(['shell','input','keyevent','KEYCODE_BACK']);const end=Date.now()+15000;while((!s.closed||!s.retired||s.q0||s.q1)&&Date.now()<end){await c.wait(200);s=await c.evaluateNative('()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,q0:!!q0Playback,q1:!!q1Playback})');}c.step('normal Back and retirement',s);if(!s.closed||!s.retired||s.q0||s.q1)throw Error('Q0_RETIREMENT_UNCONFIRMED');};
  try{
   c.step('local immutable measurement binding',provenance);
   await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
   await evaluate(`()=>{if(window.__q0PriorProof||window.__q0Byte||window.__resumeReplayTarget30)throw Error('Q0_HELPER_BUSY');window.__q0PriorProof={value:window.__resumeSwProof,scrollY:window.scrollY,folderId:state.currentFolderId,query:el.searchInput.value};return{saved:true};}`);savedProof=true;
   c.step('source32 proof',await evaluate('async()=>('+proof.trim()+')'));
   const inputReady=await evaluate(`()=>{const input=${JSON.stringify(input)};if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)throw Error('Q0_ACCOUNT');window.__resumeReplayTarget30=input;return{privateTargetInstalled:true};}`);privateInstalled=true;c.step('protected exact target installed',inputReady);
   if(!await evaluate('()=>el.searchInput.value===""||el.searchInput.value===window.__resumeReplayTarget30.target.name'))throw Error('Q0_SEARCH_PRESTATE');
   for(const folder of input.folderPath){
    if(await evaluate('()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)'))break;
    await evaluate(`()=>{window.__q0PriorProof.nextFolder=${JSON.stringify(folder)};return{ready:true};}`);
    let g=await geometry('folder');if(!g.currentFolderSame){for(let i=0;!g.available&&g.metadataUnique&&g.moreVisible&&i<3;i++){await tap('folderMoreButton');g=await geometry('folder');}if(!g.available)throw Error('Q0_NORMAL_FOLDER_UNAVAILABLE');await tap('folder');navigations++;}
    const end=Date.now()+25000;let s;do{await c.wait(250);s=await evaluate('()=>({same:state.currentFolderId===window.__q0PriorProof.nextFolder.id,loading:!!state.loadingFiles||!!state.loadingTree,population:state.files.length>0||state.folders.length>0})');}while(!(s.same&&!s.loading&&s.population)&&Date.now()<end);if(!(s.same&&!s.loading&&s.population))throw Error('Q0_FOLDER_POPULATION_UNCONFIRMED');
   }
   if(!await evaluate('()=>el.searchInput.value===window.__resumeReplayTarget30.target.name'))await nativeQuery(input.target.name);
   const searchEnd=Date.now()+40000;let search;do{await c.wait(250);search=await evaluate('()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,querySame:el.searchInput.value===window.__resumeReplayTarget30.target.name,loading:!!state.loadingFiles||!!state.loadingTree})');}while(!(search.found&&search.querySame&&!search.loading)&&Date.now()<searchEnd);c.step('bounded normal folder/native search preparation',search);if(!search.found||!search.querySame||search.loading)throw Error('Q0_NORMAL_TARGET_UNCONFIRMED');
   const ready=await evaluate('()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,loading:!!state.loadingFiles,folderSame:state.currentFolderId==="root"||window.__resumeReplayTarget30.target.parents.includes(state.currentFolderId),closed:el.playerSheet.hidden})');c.step('prepared normal card admission',ready);if(!ready.found||ready.loading||!ready.folderSame||!ready.closed)throw Error('Q0_PREPARED_CARD_REQUIRED');
   c.step('Q0 bounded observer installed',await evaluate(`()=>(${observer})(window.__resumeReplayTarget30,${JSON.stringify(binding)})`));installed=true;
   c.step('fresh before metadata',await evaluate('()=>window.__q0Byte.metadata("before")'));
   network=await worker.attach(c,input.target.id,Number(input.target.size),input.target.headRevisionId);c.step('sole source-worker Network enabled',{attached:true,bodyRead:false,cacheSettingsChanged:false});
   const g=await geometry('card');
   if(!g.available||![g.x,g.y,g.dpr,g.viewportHeight,height].every(Number.isFinite))throw Error('Q0_NATIVE_CARD_UNAVAILABLE');
   actualAt=Date.now();network.arm();c.step('Q0 first frame arm',await evaluate('()=>window.__q0Byte.arm()'));ownsPlayer=true;
   c.adb(['shell','input','tap',String(Math.round(g.x*g.dpr)),String(Math.round(height-g.viewportHeight*g.dpr+g.y*g.dpr))]);
   const end=Date.now()+70000;let firstRecorded=false;
   do{await c.wait(150);observed=await read();if(observed.firstFrame&&!firstRecorded){c.step('first current Q0 frame and contemporaneous source-worker reduction',{frame:observed.firstFrame,network:network.read(),exactAtFrameByteClaim:false});firstRecorded=true;}if(observed.failure||observed.progressFrame)break;}while(Date.now()<end);
   c.step('bounded Q0 frame/progress result',observed);if(!observed.firstFrame||!observed.progressFrame||observed.failure||!observed.current)throw Error('Q0_FRAME_UNCONFIRMED');
   await close();ownsPlayer=false;
   const drainEnd=Date.now()+10000;let trace;do{finalNetwork=network.read();trace=(await read()).swReaderTrace;if(finalNetwork.live===0&&trace.terminalCount===trace.requestCount&&trace.requestCount===finalNetwork.requestCount)break;await c.wait(200);}while(Date.now()<drainEnd);
   c.step('post-close conservative upstream transfer envelope',{network:finalNetwork,swReaderTrace:trace});c.step('same source-worker target after terminal drain',await network.verify());
   c.step('fresh after metadata',await evaluate('()=>window.__q0Byte.metadata("after")'));
   passed=qualify(observed,finalNetwork,Number(input.target.size),trace);c.step('TR01 finite scope result',{passed,fileBytes:Number(input.target.size),rangeTransferUpperBound:finalNetwork.all206RangeUpperBound,postCloseTrafficEnvelope:finalNetwork.postCloseTrafficEnvelope,firstFrameBeforeWholeDownload:passed,exactAtFrameBodyBytes:'UNKNOWN',coldMediaEvidence:finalNetwork.rows.every(r=>!r.cache),TR02:'NOT_TESTED',wholeGoalPassed:false});if(!passed)throw Error('Q0_BYTES_UNQUALIFIED');
  }catch(e){if(installed)try{c.step('failure live safe evidence',{observer:await read(),network:network?.read()||null});}catch{}throw e;
  }finally{
   if(ownsPlayer)try{await close();}catch{cleanup=false;}
   if(network)try{const r=await network.stop();c.step('owned source-worker observer cleanup',r);if(!r.ownedWorkerDetached||!r.ownedForwardRemoved)cleanup=false;}catch{cleanup=false;}
   if(installed)try{c.step('owned RVFC/timer cleanup',await c.evaluateNative('()=>window.__q0Byte.stop()'));}catch{cleanup=false;}
   for(let i=0;i<navigations;i++)try{c.adb(['shell','input','keyevent','KEYCODE_BACK']);await c.wait(400);}catch{cleanup=false;}
   if(privateInstalled)try{
    const end=Date.now()+10000;let r;do{r=await c.evaluateNative('()=>({folderSame:state.currentFolderId===window.__q0PriorProof.folderId,loading:!!state.loadingFiles||!!state.loadingTree})');if(r.folderSame&&!r.loading)break;await c.wait(250);}while(Date.now()<end);c.step('normal Back settled original folder restoration',r);if(!r.folderSame||r.loading)throw Error('Q0_FOLDER_RESTORATION');
    const q=await c.evaluateNative('()=>({same:el.searchInput.value===window.__q0PriorProof.query,original:window.__q0PriorProof.query===""?"EMPTY":"TARGET"})');if(!q.same)await nativeQuery(q.original==='EMPTY'?'':input.target.name,true);
   }catch{cleanup=false;}
   if(savedProof)try{const r=await c.evaluateNative('()=>{const p=window.__q0PriorProof;const folderSame=state.currentFolderId===p.folderId,querySame=el.searchInput.value===p.query;window.scrollTo(0,p.scrollY);delete window.__resumeReplayTarget30;delete window.__q0Byte;window.__resumeSwProof=p.value;delete window.__q0PriorProof;return{targetRemoved:true,proofRestored:true,folderSame,querySame};}');c.step('owned target/proof restoration',r);if(!r.folderSame||!r.querySame)cleanup=false;}catch{cleanup=false;}
   c.report.cleanupComplete=cleanup;c.report.actualUnitMs=actualAt===null?0:Date.now()-actualAt;c.report.preparationMs=(actualAt||Date.now())-preparedAt;c.report.originalMediaReadOnly=true;
   if(!cleanup)throw Error('Q0_CLEANUP_UNCONFIRMED');
  }
 });
}
module.exports={execute,qualify,queryEraseCommand};
if(require.main===module){if(!process.argv[2]){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}else execute(path.resolve(process.argv[2]),process.argv[3]).catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'Q0_PREPARATION_FAILED');process.exitCode=1;});}
