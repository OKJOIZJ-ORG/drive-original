'use strict';
// Additive QA driver: no execution on import; private input is never logged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const binding=require('./binding.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validatePrivate(value){
 const t=value.target||value.metadata;
 if(!value.account?.accountId||!value.account?.authAccountKey||!t?.id||!t.name||!t.mimeType||!t.modifiedTime
    ||!Number.isSafeInteger(Number(t.size))||Number(t.size)<=0||!Array.isArray(t.parents)
    ||!t.version||!t.headRevisionId||!(t.sha256Checksum||t.md5Checksum))throw Error('PRIVATE_INPUT_INVALID');
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
async function execute(privateFile,resultName='android-same-file-replay-result.json'){
 const privateInput=loadPrivate(privateFile);
 if(!/^[a-z0-9-]+\.json$/.test(resultName))throw Error('RESULT_NAME_INVALID');
 const dependencies={
  'android-ui-common-rc30.cjs':'ffc682d78c276b543867fd8a2101b918927474b2817448e446b4e63e95e60a9e',
  'source-proof.expression.js':'16638995b9660f9d38cabb2d762791d38d47ca6857ad07ba0d8a649cebe631b5'};
 for(const[name,expected]of Object.entries(dependencies))if(sha(fs.readFileSync(path.resolve(__dirname,'../rc30-resume-20261001',name)))!==expected)throw Error('MAINTAINED_DEPENDENCY_DRIFT');
 const observer=fs.readFileSync(path.join(__dirname,'single-file-observer.expression.js'),'utf8');
 if(sha(Buffer.from(observer))!=='c951b0cb694004e1fbd98335669432075164e0f223fdfe4229a55c75fe6380e7')throw Error('OBSERVER_DRIFT');
 const sourceProof=fs.readFileSync(path.resolve(__dirname,'../rc30-resume-20261001/source-proof.expression.js'),'utf8');
 const common=require('../rc30-resume-20261001/android-ui-common-rc30.cjs');
 return common(__filename,'../rc30-ts-device-replay/'+resultName,async c=>{
  const started=Date.now(),overallBound=360000;
  let installed=false,privateInstalled=false,proofSaved=false,navigations=0;
  const fail=code=>{throw Error(code);},within=()=>{if(Date.now()-started>overallBound)fail('REPLAY_TOTAL_BOUND');};
  const evaluate=fn=>c.evaluateNative(fn);
  const read=()=>evaluate('()=>window.__rc30SingleFileReplay.read()');
  const current=()=>evaluate(`()=>({version:APP_VERSION,portrait:innerHeight>innerWidth,closed:el.playerSheet.hidden,
   online:state.authStatus==='online',accountLoaded:state.accountStateLoaded,accountPresent:!!state.authAccountKey,
   revision:state.tokenRevision,expiresInMs:state.expiresAt-Date.now(),retired:q1RetirementResult?.settled===true,
   q0:!!q0Playback,q1:!!q1Playback,blob:!!state.mediaBlobUrl,frameOwner:state.frameCallbackId!==null})`);
  const geometry=key=>evaluate(`()=>{const q=window.__rc30AndroidReplayPrivate,t=window.__resumeReplayTarget30.target;
   let node;if(${JSON.stringify(key)}==='card')node=[...document.querySelectorAll('.file-card-open')].find(n=>n.closest('.file-card')?.dataset.fileId===t.id);
   else if(${JSON.stringify(key)}==='folder')node=[...document.querySelectorAll('[data-folder-id]')].find(n=>n.dataset.folderId===q.nextFolderId);
   else node=el[${JSON.stringify(key)}];
   if(!node)return{available:false};node.scrollIntoView({block:'center',inline:'nearest'});
   const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
   return{available:!node.hidden&&r.width>0&&r.height>0&&r.y>=0&&r.bottom<=innerHeight+.1&&!!hit&&(hit===node||node.contains(hit)),
    x,y,left:r.left,width:r.width,height:r.height,dpr:devicePixelRatio,viewportHeight:innerHeight,screenHeight:screen.height};}`);
  const tap=async key=>{within();const r=await geometry(key);if(!r.available)fail('NATIVE_TARGET_UNAVAILABLE');
   const physicalHeight=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);if(!physicalHeight)fail('PHYSICAL_SCREEN_UNKNOWN');
   c.adb(['shell','input','tap',String(Math.round(r.x*r.dpr)),String(Math.round(physicalHeight-r.viewportHeight*r.dpr+r.y*r.dpr))]);await c.wait(250);return r;};
  const waitFrame=async(label,limitMs)=>{
   const deadline=Date.now()+limitMs;let r;
   do{within();await c.wait(250);r=await read();const p=r.phases.find(x=>x.label===label);
    if(p?.firstTargetFrame||r.latest.native?.error||r.latest.pipeline?.failure||p?.fenceFailure)break;
   }while(Date.now()<deadline);
   const p=r.phases.find(x=>x.label===label);
   // Save the complete bounded safe journal before any failure exits.
   c.step(label+' actual native frame and deadline evidence',{diagnosticBoundMs:limitMs,actual: r,
    targetFramePresented:!!p?.firstTargetFrame,deadline15Passed:!!p?.firstTargetFrame&&p.firstTargetFrame.elapsedMs<=15000,
    diagnosticOutcome:p?.firstTargetFrame?'TARGET_FRAME':p?.fenceFailure?'FENCE_FAILURE':r.latest.pipeline?.failure?'PIPELINE_FAILURE':'TARGET_FRAME_TIMEOUT'});
   if(!p?.firstTargetFrame||p.fenceFailure||r.latest.native?.error||r.latest.pipeline?.failure)fail('TARGET_FRAME_UNCONFIRMED');
   return r;
  };
  const controls=async()=>{if(await evaluate("()=>el.playerModal.classList.contains('controls-idle')"))await tap('playerControlsEntry');};
  const pause=async wanted=>{let r=await read();if(r.latest.native?.paused!==wanted){await controls();await tap('ctrlPlayPause');}
   await c.wait(500);r=await read();if(r.latest.native?.paused!==wanted)fail('NATIVE_PAUSE_UNCONFIRMED');return r;};
  const seek=async(label,fraction)=>{
   await pause(true);await controls();const g=await geometry('seekBarContainer');if(!g.available)fail('NATIVE_SEEK_TARGET_UNAVAILABLE');
   const r=await read(),duration=r.latest.pipeline?.duration||r.latest.native?.duration;if(!Number.isFinite(duration)||duration<=0)fail('DURATION_UNKNOWN');
   const requested=label==='nearEOF'?Math.max(0,duration-4):duration*fraction;
   const ratio=requested/duration,physicalX=Math.round((g.left+g.width*ratio)*g.dpr);
   const actualRatio=Math.max(0,Math.min(1,(physicalX/g.dpr-g.left)/g.width)),targetSeconds=actualRatio*duration;
   const tolerance=Math.max(1.5,duration/(g.width*g.dpr)*.75);
   const arm=await evaluate(`()=>window.__rc30SingleFileReplay.arm(${JSON.stringify(label)},${JSON.stringify({targetSeconds,toleranceSeconds:tolerance})})`);
   c.step(label+' native slider intent',{...arm,requestedSeconds:requested,quantizedTargetSeconds:targetSeconds,
    quantizationDistanceSeconds:Math.abs(targetSeconds-requested),nativeOsInput:true,humanFingerInput:false});
   const physicalHeight=Number(c.report.physicalScreen.match(/(\d+)x(\d+)/)[2]),physicalY=Math.round(physicalHeight-g.viewportHeight*g.dpr+g.y*g.dpr);
   c.adb(['shell','input','swipe',String(physicalX),String(physicalY),String(physicalX),String(physicalY),'120']);
   return waitFrame(label,35000);
  };
  const close=async()=>{let s=await current();if(!s.closed)c.adb(['shell','input','keyevent','KEYCODE_BACK']);
   const end=Date.now()+15000;do{await c.wait(250);s=await current();}while(!(s.closed&&s.retired&&!s.q0&&!s.q1&&!s.blob&&!s.frameOwner)&&Date.now()<end);
   c.step('normal native Back and player retirement',s);if(!(s.closed&&s.retired&&!s.q0&&!s.q1&&!s.blob&&!s.frameOwner))fail('PLAYER_RETIREMENT_UNCONFIRMED');};
  try{
   await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
   const before=await current();c.step('actual rc30 current source account closed admission',before);
   if(before.version!==binding.version||!before.closed||!before.portrait||!before.online||!before.accountLoaded||!before.retired||before.q0||before.q1||before.blob)fail('ACTUAL_REPLAY_ADMISSION');
   await evaluate(`()=>{if(window.__rc30SingleFileReplay||window.__resumeReplayTarget30||window.__rc30AndroidReplayPrivate)throw Error('PRIVATE_HELPER_ALREADY_OWNED');
    window.__rc30AndroidPriorProof=window.__resumeSwProof;return{priorProofSavedPrivately:true};}`);proofSaved=true;
   const source=await evaluate('async()=>('+sourceProof.trim()+')');c.step('genuine immutable rc30 source and current shell proof',source);
   const privateReady=await evaluate(`()=>{const input=${JSON.stringify(privateInput)};
    if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey)return{ready:false,accountSame:false};
    window.__resumeReplayTarget30=input;window.__rc30AndroidReplayPrivate={query:el.searchInput.value,scrollY:window.scrollY,nextFolderId:null};
    return{ready:true,accountSame:true,privateTargetKeptBrowserLocal:true};}`);
   if(!privateReady.ready)fail('PRIVATE_ACCOUNT_MISMATCH');privateInstalled=true;c.step('exact private recovery account and target prestate',privateReady);
   for(const folder of privateInput.folderPath){within();const already=await evaluate(`()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)`);if(already)break;
    await evaluate(`()=>{window.__rc30AndroidReplayPrivate.nextFolderId=${JSON.stringify(folder.id)};return{privateFolderSelected:true};}`);await tap('folder');navigations++;await c.wait(600);
   }
   const found=await evaluate(`()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1})`);if(!found.found)fail('TARGET_NOT_IN_CURRENT_LIBRARY');
   const searchCommand=inputCommand(privateInput.target.name);
   await evaluate(`()=>{el.searchInput.value='';el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));return{searchEmpty:true};}`);
   if(searchCommand){await tap('searchInput');c.adb(searchCommand);c.adb(['shell','input','keyevent','KEYCODE_BACK']);}
   else await evaluate(`()=>{el.searchInput.value=window.__resumeReplayTarget30.target.name;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));return{syntheticSearchSetup:true};}`);
   await c.wait(500);c.step('normal library exact target search preparation',{nativeSearchInput:!!searchCommand,syntheticSearchSetup:!searchCommand,noProgrammaticPlayerOrCardAction:true});
   const installedResult=await evaluate('()=>('+observer.trim()+')');installed=true;c.step('bounded passive current owner frame observer',installedResult);
   const metadataBefore=await evaluate('()=>window.__rc30SingleFileReplay.metadata("before")');c.step('canonical metadata before exact original playback',metadataBefore);
   if(!metadataBefore.sameExactTarget||!metadataBefore.stableMetadataSame||!metadataBefore.freshRevisionChecksumSame||!metadataBefore.notTrashed||!metadataBefore.canDownload)fail('FRESH_METADATA_MISMATCH');
   await evaluate('()=>window.__rc30SingleFileReplay.arm("startup",{targetSeconds:0,toleranceSeconds:3})');await tap('card');
   const startup=await waitFrame('startup',60000);if(startup.latest.route!=='Q1_TS')fail('Q1_TS_NOT_SELECTED');
   await seek('seek50',.5);await seek('seek90',.9);await seek('nearEOF',null);
   await pause(false);const tailDeadline=Date.now()+45000;let tail;do{within();await c.wait(250);tail=await read();}while(!(tail.eof.nativeEnded&&tail.eof.q1Ended)&&!tail.latest.pipeline?.failure&&Date.now()<tailDeadline);
   c.step('actual original TS native EOF and bounded final window evidence',{tailBoundMs:45000,actual:tail,
    nativeEndAndCurrentPipelineEnd:tail.eof.nativeEnded&&tail.eof.q1Ended,exactFinalOriginalFrame:'UNKNOWN'});
   if(!(tail.eof.nativeEnded&&tail.eof.q1Ended&&tail.eof.finalWindowPresented>0))fail('NATIVE_EOF_UNCONFIRMED');
   await close();await evaluate('()=>window.__rc30SingleFileReplay.arm("reopen",{targetSeconds:0,toleranceSeconds:3})');
   await tap('card');await waitFrame('reopen',60000);await close();
   const metadataAfter=await evaluate('()=>window.__rc30SingleFileReplay.metadata("after")');c.step('canonical fresh metadata after same original reopen',metadataAfter);
   if(!metadataAfter.sameExactTarget||!metadataAfter.stableMetadataSame||!metadataAfter.freshRevisionChecksumSame)fail('FRESH_METADATA_MISMATCH');
  }finally{
   if(installed){try{c.step('final bounded actual replay journal',await read());c.step('owned passive observer cleanup',await evaluate('()=>window.__rc30SingleFileReplay.stop()'));}catch{c.step('observer cleanup limitation',{safeReadFailed:true});}}
   try{await close();}catch{c.step('normal close cleanup limitation',{retirementUnconfirmed:true});}
   for(let i=0;i<navigations;i++){c.adb(['shell','input','keyevent','KEYCODE_BACK']);await c.wait(400);}
   if(privateInstalled)try{c.step('browser private query target and replay handle cleanup',await evaluate(`()=>{const q=window.__rc30AndroidReplayPrivate;
    if(q){el.searchInput.value=q.query;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));window.scrollTo(0,q.scrollY);}
    delete window.__rc30SingleFileReplay;delete window.__resumeReplayTarget30;delete window.__rc30AndroidReplayPrivate;
    return{privateHandlesRemoved:true,queryRestored:true,version:APP_VERSION,closed:el.playerSheet.hidden,online:state.authStatus==='online',revision:state.tokenRevision,expiresInMs:state.expiresAt-Date.now()};}`));}catch{c.step('private cleanup limitation',{privateCleanupUnconfirmed:true});}
   if(proofSaved)try{c.step('owned source proof cleanup',await evaluate(`()=>{if(window.__rc30AndroidPriorProof)window.__resumeSwProof=window.__rc30AndroidPriorProof;else delete window.__resumeSwProof;
    delete window.__rc30AndroidPriorProof;return{ownedProofRemovedOrPriorRestored:true};}`));}catch{c.step('source proof cleanup limitation',{proofCleanupUnconfirmed:true});}
   c.report.nativeOsInput=true;c.report.humanFingerInput=false;c.report.syntheticMedia=false;c.report.originalMediaReadOnly=true;
   c.report.exactFinalFrame='UNKNOWN';c.report.sourceCommit=binding.sourceCommit;c.report.replayDurationMs=Date.now()-started;
  }
 });
}
module.exports={validatePrivate,loadPrivate,inputCommand,execute};
if(require.main===module){const file=process.argv[2],result=process.argv[3];
 if(!file){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}
 else execute(path.resolve(file),result).catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED');process.exitCode=1;});
}
