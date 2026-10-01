'use strict';
// Additive QA driver: no execution on import; private input is never logged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const binding=require('./binding.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validatePrivate(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PRIVATE_INPUT_INVALID');
 const t=value.target||value.metadata;
 if(!value.account?.accountId||!value.account?.authAccountKey||!t?.id||!t.name||!t.mimeType||!t.modifiedTime
    ||!Number.isSafeInteger(Number(t.size))||Number(t.size)<=0||!Array.isArray(t.parents)
    ||!t.version||!t.headRevisionId||!(t.sha256Checksum||t.md5Checksum))throw Error('PRIVATE_INPUT_INVALID');
 if(['accountId','authAccountKey'].some(k=>typeof value.account[k]!=='string')
    ||['id','name','mimeType','modifiedTime','headRevisionId'].some(k=>typeof t[k]!=='string')
    ||t.parents.some(p=>typeof p!=='string')
    ||['md5Checksum','sha256Checksum','resourceKey'].some(k=>t[k]!=null&&typeof t[k]!=='string'))throw Error('PRIVATE_INPUT_INVALID');
 const target=Object.fromEntries(['id','name','size','mimeType','modifiedTime','parents','version','headRevisionId','sha256Checksum','md5Checksum','resourceKey'].filter(k=>t[k]!=null).map(k=>[k,t[k]]));
 const folderPath=value.folderPath||[];
 if(!Array.isArray(folderPath)||folderPath.length>8||folderPath.some(f=>!f?.id||typeof f.name!=='string'))throw Error('PRIVATE_INPUT_INVALID');
 return {account:{accountId:value.account.accountId,authAccountKey:value.account.authAccountKey},target,
   folderPath:folderPath.map(f=>({id:f.id,name:f.name}))};
}
function loadPrivate(file){
 let value;try{const b=fs.readFileSync(file);if(b.length>1048576)throw Error();value=JSON.parse(b.toString('utf8'));}catch{throw Error('PRIVATE_INPUT_INVALID');}
 return validatePrivate(value);
}
function inputCommand(name){
 // Restricted ASCII only; unsupported names use explicit synthetic search setup,
 // while actual opening/transport/seek remains trusted native OS input.
 if(!/^[A-Za-z0-9_. ()\[\]-]{1,240}$/.test(name))return null;
 return ['shell','input','text',"'"+name.replace(/ /g,'%s')+"'"];
}
async function execute(privateFile,resultName='actual-android-latency-partition-result.json'){
 const privateInput=loadPrivate(privateFile);
 if(!/^[a-z0-9-]+\.json$/.test(resultName))throw Error('RESULT_NAME_INVALID');
 const freeze=JSON.parse(fs.readFileSync(path.join(__dirname,'dependency-freeze.json'),'utf8'));
 for(const row of freeze.files)if(sha(fs.readFileSync(path.resolve(__dirname,row.path)))!==row.sha256)throw Error('DEPENDENCY_DRIFT');
 const observer=fs.readFileSync(path.join(__dirname,'observer.expression.js'),'utf8');
 const folderResolver=fs.readFileSync(path.join(__dirname,'native-folder-target.function.js'),'utf8');
 if(sha(Buffer.from(folderResolver))!=='81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a')throw Error('FOLDER_HELPER_DRIFT');
 const uiResolver=fs.readFileSync(path.join(__dirname,'native-ui-target.function.js'),'utf8');
 if(sha(Buffer.from(uiResolver))!=='0e2af51d9c2234a4f81b447474838ef61954addf2b9618426c6442faa023d73e')throw Error('NATIVE_UI_HELPER_DRIFT');
 const sourceProof=fs.readFileSync(path.resolve(__dirname,'../rc31-resume-20261001/source-proof.expression.js'),'utf8');
 const common=require('./android-common.cjs');
 return common(__filename,resultName,async c=>{
  const started=Date.now(),overallBound=360000;
  let installed=false,privateInstalled=false,proofSaved=false,ownsPlayer=false,navigations=0,cleanupComplete=true,partition=null;
  const fail=code=>{throw Error(code);},within=()=>{if(Date.now()-started>overallBound)fail('REPLAY_TOTAL_BOUND');};
  const evaluate=fn=>c.evaluateNative(fn);
  const read=()=>evaluate('()=>window.__rc31LatencyPartition.read()');
  const current=()=>evaluate(`()=>({version:APP_VERSION,portrait:innerHeight>innerWidth,closed:el.playerSheet.hidden,
   online:state.authStatus==='online',accountLoaded:state.accountStateLoaded,accountPresent:!!state.authAccountKey,
   revision:state.tokenRevision,expiresInMs:state.expiresAt-Date.now(),retired:q1RetirementResult?.settled===true,
   q0:!!q0Playback,q1:!!q1Playback,blob:!!state.mediaBlobUrl,frameOwner:state.frameCallbackId!==null})`);
  const geometry=async(key,options={})=>{const keys=['card','folder','folderMoreButton','searchInput','ctrlPlayPause','mediaStage','playerControlsEntry','seekBarContainer'];
   if(!keys.includes(key))fail('NATIVE_KEY_NOT_ALLOWED');
   const r=await evaluate(key==='folder'?`()=>(${folderResolver})(window.__rc31AndroidLatencyPrivate.nextFolder)`:
    `()=>(${uiResolver})(${JSON.stringify(key)},${JSON.stringify(options)})`);
   // Persist the safe exact target diagnosis BEFORE an unavailable target fails.
   c.step('native target geometry and actual hit admission',{key,...r});return r;};
  const tap=async(key,settleMs=650)=>{within();const r=await geometry(key);if(!r.available)fail('NATIVE_TARGET_UNAVAILABLE');
   const physicalHeight=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);if(!physicalHeight)fail('PHYSICAL_SCREEN_UNKNOWN');
   c.adb(['shell','input','tap',String(Math.round(r.x*r.dpr)),String(Math.round(physicalHeight-r.viewportHeight*r.dpr+r.y*r.dpr))]);await c.wait(settleMs);return r;};
  const waitFrame=async(label,limitMs)=>{
   const deadline=Date.now()+limitMs;let r;
   do{within();await c.wait(250);r=await read();const p=r.phases.find(x=>x.label===label);
    if(p?.firstTargetFrame||r.latest.native?.error||r.latest.pipeline?.failure||p?.fenceFailure)break;
   }while(Date.now()<deadline);
   const p=r.phases.find(x=>x.label===label);
   // Save the complete bounded safe journal before any failure exits.
   c.step(label+' actual native frame and deadline evidence',{diagnosticBoundMs:limitMs,actual: r,
    network:partition?.read()||null,partitionSummary:partition?require('./partition-summary.cjs').summarize(r,partition.read()):null,targetFramePresented:!!p?.firstTargetFrame,deadline15Passed:!!p?.firstTargetFrame&&p.firstTargetFrame.elapsedMs<=15000,
    diagnosticOutcome:p?.firstTargetFrame?'TARGET_FRAME':p?.fenceFailure?'FENCE_FAILURE':r.latest.pipeline?.failure?'PIPELINE_FAILURE':'TARGET_FRAME_TIMEOUT'});
   if(!p?.firstTargetFrame||p.fenceFailure||r.latest.native?.error||r.latest.pipeline?.failure)fail('TARGET_FRAME_UNCONFIRMED');
   return r;
  };
  const controls=async()=>{
   let seekTarget=await geometry('seekBarContainer');if(seekTarget.available)return;
   // Visible chrome may cover the bottom entry. One normal surface tap dismisses
   // it; a later unobscured native entry tap reveals it. Neither calls UI functions.
   let entry=await geometry('playerControlsEntry');
   if(!entry.available&&!entry.controlsIdle){await tap('mediaStage');entry=await geometry('playerControlsEntry');}
   if(!entry.available)fail('NATIVE_ENTRY_UNAVAILABLE');await tap('playerControlsEntry');
   const end=Date.now()+2000;do{seekTarget=await geometry('seekBarContainer');if(seekTarget.available)return;await c.wait(250);}while(Date.now()<end);
   fail('NATIVE_SEEK_TARGET_UNAVAILABLE');
  };
  const pause=async wanted=>{
   let r=await read();if(r.latest.native?.paused===wanted)return r;
   const transport=await geometry('ctrlPlayPause');
   if(transport.available){await tap('ctrlPlayPause');r=await read();}
   // The proven native mediaStage path toggles playback when chrome is idle;
   // when chrome is visible its first tap only dismisses chrome. At most two
   // spaced surface taps are permitted, with actual paused-state checks each time.
   for(let attempt=0;r.latest.native?.paused!==wanted&&attempt<2;attempt++){
    await tap('mediaStage');r=await read();c.step('normal native stage pause state discriminator',{
     wantedPaused:wanted,attempt:attempt+1,actualPaused:r.latest.native?.paused??null,
     controlsIdle:await evaluate("()=>el.playerModal.classList.contains('controls-idle')"),
     sourceSame:r.latest.sourceSame,accountSame:r.latest.accountSame,targetSame:r.latest.targetSame,route:r.latest.route});
   }
   if(r.latest.native?.paused!==wanted)fail('NATIVE_PAUSE_UNCONFIRMED');return r;
  };
  const seek=async(label,fraction)=>{
   await pause(true);await controls();const g=await geometry('seekBarContainer');if(!g.available)fail('NATIVE_SEEK_TARGET_UNAVAILABLE');
   const r=await read(),duration=r.latest.pipeline?.duration||(Number.isFinite(r.latest.pipeline?.mapping?.sourceEnd)&&Number.isFinite(r.latest.pipeline?.mapping?.sourceOrigin)?r.latest.pipeline.mapping.sourceEnd-r.latest.pipeline.mapping.sourceOrigin:r.latest.native?.duration);if(!Number.isFinite(duration)||duration<=0)fail('DURATION_UNKNOWN');
   const requested=duration*fraction;
   const ratio=requested/duration;await controls();const fresh=await geometry('seekBarContainer',{xFraction:ratio});
   if(!fresh.available)fail('NATIVE_SEEK_POINT_UNAVAILABLE');
   const physicalX=Math.round(fresh.x*fresh.dpr),actualRatio=Math.max(0,Math.min(1,(physicalX/fresh.dpr-fresh.left)/fresh.width)),targetSeconds=actualRatio*duration;
   const tolerance=Math.max(1.5,duration/(fresh.width*fresh.dpr)*.75);
   const arm=await evaluate(`()=>window.__rc31LatencyPartition.arm(${JSON.stringify(label)},${JSON.stringify({targetSeconds,toleranceSeconds:tolerance})})`);
   partition.mark(label,arm.armedAt);
   c.step(label+' native slider intent',{...arm,requestedSeconds:requested,quantizedTargetSeconds:targetSeconds,
    quantizationDistanceSeconds:Math.abs(targetSeconds-requested),nativeOsInput:true,humanFingerInput:false});
   const physicalHeight=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)[2]),physicalY=Math.round(physicalHeight-fresh.viewportHeight*fresh.dpr+fresh.y*fresh.dpr);
   c.adb(['shell','input','swipe',String(physicalX),String(physicalY),String(physicalX),String(physicalY),'120']);
   return waitFrame(label,35000);
  };
  const close=async()=>{let s=await current();if(!s.closed)c.adb(['shell','input','keyevent','KEYCODE_BACK']);
   const end=Date.now()+15000;do{await c.wait(250);s=await current();}while(!(s.closed&&s.retired&&!s.q0&&!s.q1&&!s.blob&&!s.frameOwner)&&Date.now()<end);
   c.step('normal native Back and player retirement',s);if(!(s.closed&&s.retired&&!s.q0&&!s.q1&&!s.blob&&!s.frameOwner))fail('PLAYER_RETIREMENT_UNCONFIRMED');};
  try{
   await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
   const before=await current();c.step('actual rc31 current source account closed admission',before);
   if(before.version!==binding.version||!before.closed||!before.portrait||!before.online||!before.accountLoaded||!before.retired||before.q0||before.q1||before.blob)fail('ACTUAL_REPLAY_ADMISSION');
   await evaluate(`()=>{if(window.__rc31LatencyPartition||window.__resumeReplayTarget30||window.__rc31AndroidLatencyPrivate)throw Error('PRIVATE_HELPER_ALREADY_OWNED');
    window.__rc31AndroidPriorProof=window.__resumeSwProof;return{priorProofSavedPrivately:true};}`);proofSaved=true;
   if(!await evaluate('()=>localStorage.getItem("drive-original.qa.rc31-update-baseline")===null'))fail('OTHER_UPDATE_BASELINE_OWNED');
   const source=await evaluate('async()=>('+sourceProof.trim()+')');c.step('genuine immutable rc31 source and current shell proof',source);
   const privateReady=await evaluate(`()=>{const input=${JSON.stringify(privateInput)};
    if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)return{ready:false,accountSame:false};
    window.__resumeReplayTarget30=input;window.__rc31AndroidLatencyPrivate={query:el.searchInput.value,scrollY:window.scrollY,nextFolder:null};
    return{ready:true,accountSame:true,privateTargetKeptBrowserLocal:true};}`);
   if(!privateReady.ready)fail('PRIVATE_ACCOUNT_MISMATCH');privateInstalled=true;c.step('exact private recovery account and target prestate',privateReady);
   if(!await evaluate('()=>el.searchInput.value===""||el.searchInput.value===window.__resumeReplayTarget30.target.name'))fail('NORMAL_SEARCH_PRESTATE_REQUIRED');
   for(const folder of privateInput.folderPath){within();const already=await evaluate(`()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)`);if(already)break;
    await evaluate(`()=>{window.__rc31AndroidLatencyPrivate.nextFolder=${JSON.stringify(folder)};return{privateFolderSelected:true};}`);
    let target=await geometry('folder');
    if(!target.currentFolderSame){for(let reveal=0;!target.available&&target.metadataUnique&&target.moreVisible&&reveal<3;reveal++){
      await tap('folderMoreButton');target=await geometry('folder');}
     if(!target.available)fail('NORMAL_FOLDER_TARGET_UNAVAILABLE');await tap('folder');navigations++;
    }
    const end=Date.now()+25000;let settled;do{within();await c.wait(250);settled=await evaluate(`()=>({currentFolderSame:state.currentFolderId===window.__rc31AndroidLatencyPrivate.nextFolder.id,
      loadingFiles:!!state.loadingFiles,loadingTree:!!state.loadingTree,fileCount:state.files.length,folderCount:state.folders.length,
      populationPresent:state.files.length>0||state.folders.length>0,targetInLoadedPopulation:state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)})`);
    }while(!(settled.currentFolderSame&&!settled.loadingFiles&&!settled.loadingTree&&settled.populationPresent)&&Date.now()<end);
    c.step('normal native folder path exact private metadata and settled population',{metadataUnique:target.metadataUnique,rowUnique:target.rowUnique,nativeOsInput:true,...settled});
    if(!(settled.currentFolderSame&&!settled.loadingFiles&&!settled.loadingTree&&settled.populationPresent))fail('NORMAL_FOLDER_POPULATION_UNCONFIRMED');
   }
   const searchCommand=inputCommand(privateInput.target.name);
   const searchAlreadyExact=await evaluate('()=>el.searchInput.value===window.__resumeReplayTarget30.target.name');
   if(!searchAlreadyExact){if(!searchCommand)fail('NATIVE_ASCII_SEARCH_UNSUPPORTED');await tap('searchInput');c.adb(searchCommand);c.adb(['shell','input','keyevent','KEYCODE_BACK']);}
   const searchEnd=Date.now()+40000;let found;do{within();await c.wait(250);found=await evaluate(`()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,
    querySame:el.searchInput.value===window.__resumeReplayTarget30.target.name,loadingFiles:!!state.loadingFiles,loadingTree:!!state.loadingTree})`);
   }while(!(found.found&&found.querySame&&!found.loadingFiles&&!found.loadingTree)&&Date.now()<searchEnd);
   c.step('normal library exact target search preparation',{nativeSearchInput:!searchAlreadyExact,existingExactQuery:searchAlreadyExact,syntheticSearchSetup:false,noProgrammaticPlayerOrCardAction:true,...found});
   if(!(found.found&&found.querySame&&!found.loadingFiles&&!found.loadingTree))fail('TARGET_NOT_IN_CURRENT_LIBRARY');
   partition=await c.attachPassiveNetwork(privateInput.target.id);c.step('owned passive page network event reduction',{responseBodyRead:false,requestWrapped:false,upstreamServiceWorkerVisibility:'UNKNOWN'});
   const installedResult=await evaluate('()=>('+observer.trim()+')');installed=true;c.step('bounded passive current owner frame observer',installedResult);
   const metadataBefore=await evaluate('()=>window.__rc31LatencyPartition.metadata("before")');c.step('canonical metadata before exact original playback',metadataBefore);
   if(!metadataBefore.sameExactTarget||!metadataBefore.stableMetadataSame||!metadataBefore.freshRevisionChecksumSame||!metadataBefore.notTrashed||!metadataBefore.canDownload)fail('FRESH_METADATA_MISMATCH');
   const startupArm=await evaluate('()=>window.__rc31LatencyPartition.arm("startup",{targetSeconds:0,toleranceSeconds:3})');partition.mark('startup',startupArm.armedAt);ownsPlayer=true;await tap('card');
   const startup=await waitFrame('startup',30000);
   if(!['Q1_TS','Q1_GENERAL'].includes(startup.latest.route))fail('Q1_ROUTE_NOT_SELECTED');
   await seek('seek50',.5);await seek('seek90',.9);await close();ownsPlayer=false;
   const metadataAfter=await evaluate('()=>window.__rc31LatencyPartition.metadata("after")');c.step('canonical fresh metadata after same original seeks and close',metadataAfter);
   if(!metadataAfter.sameExactTarget||!metadataAfter.stableMetadataSame||!metadataAfter.freshRevisionChecksumSame)fail('FRESH_METADATA_MISMATCH');
  }finally{
   if(partition)try{c.step('final passive network partition',await partition.stop());}catch{cleanupComplete=false;}
   if(installed){try{c.step('final bounded actual replay journal',await read());c.step('owned passive observer cleanup',await evaluate('()=>window.__rc31LatencyPartition.stop()'));}catch{cleanupComplete=false;c.step('observer cleanup limitation',{safeReadFailed:true});}}
   if(ownsPlayer)try{await close();}catch{cleanupComplete=false;c.step('normal close cleanup limitation',{retirementUnconfirmed:true});}
   for(let i=0;i<navigations;i++){c.adb(['shell','input','keyevent','KEYCODE_BACK']);await c.wait(400);}
   if(privateInstalled)try{c.step('browser private query target and replay handle cleanup',await evaluate(`()=>{const q=window.__rc31AndroidLatencyPrivate;
    if(q){el.searchInput.value=q.query;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));window.scrollTo(0,q.scrollY);}
    delete window.__rc31LatencyPartition;delete window.__resumeReplayTarget30;delete window.__rc31AndroidLatencyPrivate;
    return{privateHandlesRemoved:true,queryRestored:true,version:APP_VERSION,closed:el.playerSheet.hidden,online:state.authStatus==='online',revision:state.tokenRevision,expiresInMs:state.expiresAt-Date.now()};}`));}catch{cleanupComplete=false;c.step('private cleanup limitation',{privateCleanupUnconfirmed:true});}
   if(proofSaved)try{c.step('owned source proof cleanup',await evaluate(`()=>{if(window.__rc31AndroidPriorProof)window.__resumeSwProof=window.__rc31AndroidPriorProof;else delete window.__resumeSwProof;
    delete window.__rc31AndroidPriorProof;return{ownedProofRemovedOrPriorRestored:true};}`));}catch{cleanupComplete=false;c.step('source proof cleanup limitation',{proofCleanupUnconfirmed:true});}
   c.report.nativeOsInput=true;c.report.humanFingerInput=false;c.report.syntheticMedia=false;c.report.originalMediaReadOnly=true;
   c.report.exactFinalFrame='NOT_TESTED';c.report.partitionScope='passive page-CDP and Q1 public stats; CPU/probe/worker inner timing not directly observed';c.report.sourceCommit=binding.sourceCommit;c.report.replayDurationMs=Date.now()-started;
   c.report.cleanupComplete=cleanupComplete;if(!cleanupComplete)fail('CLEANUP_UNCONFIRMED');
  }
 });
}
module.exports={validatePrivate,loadPrivate,inputCommand,execute};
if(require.main===module){const file=process.argv[2],result=process.argv[3];
 if(!file){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}
 else execute(path.resolve(file),result).catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED');process.exitCode=1;});
}
