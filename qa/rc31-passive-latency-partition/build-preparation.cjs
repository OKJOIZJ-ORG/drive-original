'use strict';
// Local-only derivative builder. No private input read, packages, device or network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pinned={
 'qa/rc30-ts-device-replay/android-same-file-replay-v3.cjs':'ab097c543270833ebc4f98a03f4d7978287174757f9b1e78e4fff73e1305aa85',
 'qa/rc30-ts-device-replay/single-file-observer-v2.function.js':'bf07d3e1443c19edfb34fe060d5184addb0c481dd97f04eac0188f0c9908e7f9',
 'qa/rc30-ts-device-replay/native-folder-target.function.js':'81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a',
 'qa/rc30-ts-device-replay/native-ui-target-v3.function.js':'0e2af51d9c2234a4f81b447474838ef61954addf2b9618426c6442faa023d73e',
 'qa/rc30-resume-20261001/android-ui-common-rc30.cjs':'ffc682d78c276b543867fd8a2101b918927474b2817448e446b4e63e95e60a9e',
 'qa/rc31-resume-20261001/source-proof.expression.js':'6257edcc580785a3e265aec717ac06e7504ef86a408ce9c964f08719b5fc1725'};
function frozen(file){const b=fs.readFileSync(path.join(root,file));if(sha(b)!==pinned[file])throw Error('FROZEN_SOURCE_DRIFT');return b.toString('utf8');}
function change(s,from,to){if(!s.includes(from))throw Error('DERIVATION_ANCHOR_MISSING');return s.replace(from,to);}
function write(name,s){fs.writeFileSync(path.join(__dirname,name),s);return sha(Buffer.from(s));}
const source=JSON.parse(fs.readFileSync(path.join(root,'qa/rc31-resume-20261001/sourcebinding.json'),'utf8'));
if(source.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011'||source.version!=='1.22.0-rc.31')throw Error('IMMUTABLE_SOURCE_DRIFT');
const binding={sourceCommit:source.sourceCommit,version:source.version,sourceSHA256:source.sourceSHA256,actualExecution:false};
write('binding.json',JSON.stringify(binding,null,2)+'\n');
let observer=frozen('qa/rc30-ts-device-replay/single-file-observer-v2.function.js').replaceAll('installRc30SingleFileReplay','installRc31LatencyPartition').replaceAll('__rc30SingleFileReplay','__rc31LatencyPartition').replaceAll('drive-original.rc30-single-file-replay','drive-original.rc31-latency-partition');
observer=change(observer,"phase: ['opening', 'buffering', 'ready', 'ended', 'failed', 'cancelled']","phase: ['opening', 'buffering', 'ready', 'buffered-to-end', 'ended', 'failed', 'cancelled']");
observer=change(observer,"failure: fixed(s.failure), ...finiteFields(s, ['target', 'duration', 'appends', 'frames', 'lastMediaTime']),","failure: fixed(s.failure), ...finiteFields(s, ['target', 'duration', 'appends', 'frames', 'lastMediaTime', 'removals', 'waits']),\n      level: ['Q1','Q2'].includes(s.status?.level)?s.status.level:null,\n      mapping: finiteFields(s.mapping, ['sourceOrigin','sourceEnd','commonShift','targetSource','targetElement']),");
observer=change(observer,"q1Playback?.kind === 'general' ? 'Q2_GENERAL'","q1Playback?.kind === 'general' ? (s?.status?.level==='Q1'?'Q1_GENERAL':s?.status?.level==='Q2'?'Q2_GENERAL':'GENERAL_PENDING')");
observer=change(observer,'if (phase.samples.length < 144)','if (phase.samples.length < 176)');
observer=change(observer,"if (phases.length >= 5)","if (phases.length >= 3)");
observer=change(observer,"!['startup', 'seek50', 'seek90', 'nearEOF', 'reopen'].includes(label)","!['startup', 'seek50', 'seek90'].includes(label)");
observer=change(observer,'return { armed: true, label, targetSeconds: seconds','return { armed: true, armedAt: phase.armedAt, label, targetSeconds: seconds');
observer=change(observer,'phaseLimit: 5','phaseLimit: 3');
write('observer.function.js',observer);const exprHash=write('observer.expression.js','('+observer+')('+JSON.stringify(binding)+')');
let common=frozen('qa/rc30-resume-20261001/android-ui-common-rc30.cjs');
common=change(common,"!['1.22.0-rc.29','1.22.0-rc.30'].includes(safe.version)","safe.version!=='1.22.0-rc.31'");
common=change(common,'let client,serial,port,nativeBrowser,nativeSession;','let client,serial,port,nativeBrowser,nativeSession,partition;');
common=change(common,'  await work(context);report.completed=true;',`  context.attachPassiveNetwork=async privateId=>{if(partition)throw Error('PASSIVE_NETWORK_ALREADY_OWNED');partition=await require('./network-reducer.cjs').attach(nativeSession,privateId);return partition;};
  await work(context);report.completed=true;`);
const finalStart=common.indexOf(' finally{if(nativeSession)');
if(finalStart<0)throw Error('DERIVATION_ANCHOR_MISSING');
common=common.slice(0,finalStart)+` finally{
  let cleanupFailed=false;
  if(partition)try{report.passiveNetworkCleanup=await partition.stop();}catch{cleanupFailed=true;report.passiveNetworkCleanup={confirmed:false};}
  if(nativeSession)try{await nativeSession.detach();report.ownedNativeSessionDetached=true;}catch{cleanupFailed=true;report.ownedNativeSessionDetached=false;}
  if(nativeBrowser)try{await nativeBrowser.close();report.ownedNativeCdpDisconnected=true;}catch{cleanupFailed=true;report.ownedNativeCdpDisconnected=false;}
  if(client)try{await client.close();report.ownedMcpClosed=true;}catch{cleanupFailed=true;report.ownedMcpClosed=false;}
  if(port&&serial)try{cmd(['-s',serial,'forward','--remove',\x60tcp:\x24{port}\x60]);report.ownedForwardRemoved=true;}catch{cleanupFailed=true;report.ownedForwardRemoved=false;}
  if(cleanupFailed){report.completed=false;report.transportCleanupFailed=true;report.failure||='OWNED_TRANSPORT_CLEANUP_UNCONFIRMED';}
  fs.writeFileSync(path.join(__dirname,resultName),JSON.stringify(report,null,2)+'\\n');console.log(JSON.stringify(report,null,2));if(!report.completed)process.exitCode=1;
 }
};
`;
common=change(common,"context.evaluateNative=async fn=>{const r=await nativeSession.send('Runtime.evaluate',{expression:`(${fn})()`,awaitPromise:true,returnByValue:true});", "context.evaluateNative=async fn=>{let timer;const r=await Promise.race([nativeSession.send('Runtime.evaluate',{expression:`(${fn})()`,awaitPromise:true,returnByValue:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_COMMAND_DEADLINE')),45000);})]).finally(()=>clearTimeout(timer));");
const commonHash=write('android-common.cjs',common);
write('native-folder-target.function.js',frozen('qa/rc30-ts-device-replay/native-folder-target.function.js'));
write('native-ui-target.function.js',frozen('qa/rc30-ts-device-replay/native-ui-target-v3.function.js'));
let driver=frozen('qa/rc30-ts-device-replay/android-same-file-replay-v3.cjs');
driver=change(driver,"resultName='android-same-file-replay-attempt3-result.json'","resultName='actual-android-latency-partition-result.json'");
const start=driver.indexOf(' const dependencies={'),end=driver.indexOf(" const folderResolver=",start);
if(start<0||end<0)throw Error('DERIVATION_ANCHOR_MISSING');
driver=driver.slice(0,start)+` const freeze=JSON.parse(fs.readFileSync(path.join(__dirname,'dependency-freeze.json'),'utf8'));
 for(const row of freeze.files)if(sha(fs.readFileSync(path.resolve(__dirname,row.path)))!==row.sha256)throw Error('DEPENDENCY_DRIFT');
 const observer=fs.readFileSync(path.join(__dirname,'observer.expression.js'),'utf8');
`+driver.slice(end);
driver=driver.replaceAll('native-ui-target-v3.function.js','native-ui-target.function.js').replaceAll('../rc30-resume-20261001','../rc31-resume-20261001').replaceAll('android-ui-common-rc30.cjs','android-common.cjs');
driver=change(driver,"require('../rc31-resume-20261001/android-common.cjs')","require('./android-common.cjs')");
driver=change(driver,"'../rc30-ts-device-replay/'+resultName","resultName");
driver=driver.replaceAll('__rc30SingleFileReplay','__rc31LatencyPartition').replaceAll('__rc30AndroidReplayPrivate','__rc31AndroidLatencyPrivate').replaceAll('__rc30AndroidPriorProof','__rc31AndroidPriorProof').replaceAll('actual rc30','actual rc31').replaceAll('immutable rc30','immutable rc31');
// Frozen folder/card resolver intentionally retains __resumeReplayTarget30; it is
// a private holder convention, not a source-version assertion.
driver=change(driver,'let installed=false,privateInstalled=false,proofSaved=false,ownsPlayer=false,navigations=0,cleanupComplete=true;','let installed=false,privateInstalled=false,proofSaved=false,ownsPlayer=false,navigations=0,cleanupComplete=true,partition=null;');
driver=change(driver,"   const source=await evaluate('async()=>('+sourceProof.trim()+')');", "   if(!await evaluate('()=>localStorage.getItem(\"drive-original.qa.rc31-update-baseline\")===null'))fail('OTHER_UPDATE_BASELINE_OWNED');\n   const source=await evaluate('async()=>('+sourceProof.trim()+')');");
driver=change(driver,"targetFramePresented:!!p?.firstTargetFrame,deadline15Passed:","network:partition?.read()||null,partitionSummary:partition?require('./partition-summary.cjs').summarize(r,partition.read()):null,targetFramePresented:!!p?.firstTargetFrame,deadline15Passed:");
driver=change(driver,"const arm=await evaluate(`()=>window.__rc31LatencyPartition.arm(${JSON.stringify(label)},${JSON.stringify({targetSeconds,toleranceSeconds:tolerance})})`);","const arm=await evaluate(`()=>window.__rc31LatencyPartition.arm(${JSON.stringify(label)},${JSON.stringify({targetSeconds,toleranceSeconds:tolerance})})`);\n   partition.mark(label,arm.armedAt);");
driver=change(driver,'const requested=label===\'nearEOF\'?Math.max(0,duration-4):duration*fraction;','const requested=duration*fraction;');
driver=change(driver,"duration=r.latest.pipeline?.duration||r.latest.native?.duration;", "duration=r.latest.pipeline?.duration||(Number.isFinite(r.latest.pipeline?.mapping?.sourceEnd)&&Number.isFinite(r.latest.pipeline?.mapping?.sourceOrigin)?r.latest.pipeline.mapping.sourceEnd-r.latest.pipeline.mapping.sourceOrigin:r.latest.native?.duration);");
// Require normal search admissibility; no synthetic target/query population.
driver=change(driver,"await evaluate(`()=>{el.searchInput.value='';el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));return{syntheticEmptySearchSetup:true};}`);", "if(!await evaluate('()=>el.searchInput.value===\"\"||el.searchInput.value===window.__resumeReplayTarget30.target.name'))fail('NORMAL_SEARCH_PRESTATE_REQUIRED');");
driver=change(driver,"await evaluate(`()=>{el.searchInput.value='';el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));return{searchEmpty:true};}`);\n   if(searchCommand){await tap('searchInput');c.adb(searchCommand);c.adb(['shell','input','keyevent','KEYCODE_BACK']);}\n   else await evaluate(`()=>{el.searchInput.value=window.__resumeReplayTarget30.target.name;el.searchInput.dispatchEvent(new Event('input',{bubbles:true}));return{syntheticSearchSetup:true};}`);", "const searchAlreadyExact=await evaluate('()=>el.searchInput.value===window.__resumeReplayTarget30.target.name');\n   if(!searchAlreadyExact){if(!searchCommand)fail('NATIVE_ASCII_SEARCH_UNSUPPORTED');await tap('searchInput');c.adb(searchCommand);c.adb(['shell','input','keyevent','KEYCODE_BACK']);}");
driver=change(driver,'nativeSearchInput:!!searchCommand,syntheticSearchSetup:!searchCommand','nativeSearchInput:!searchAlreadyExact,existingExactQuery:searchAlreadyExact,syntheticSearchSetup:false');
driver=change(driver,'const installedResult=await evaluate',"partition=await c.attachPassiveNetwork(privateInput.target.id);c.step('owned passive page network event reduction',{responseBodyRead:false,requestWrapped:false,upstreamServiceWorkerVisibility:'UNKNOWN'});\n   const installedResult=await evaluate");
driver=change(driver,"await evaluate('()=>window.__rc31LatencyPartition.arm(\"startup\",{targetSeconds:0,toleranceSeconds:3})');ownsPlayer=true;await tap('card');", "const startupArm=await evaluate('()=>window.__rc31LatencyPartition.arm(\"startup\",{targetSeconds:0,toleranceSeconds:3})');partition.mark('startup',startupArm.armedAt);ownsPlayer=true;await tap('card');");
const flowStart=driver.indexOf("   const startup=await waitFrame('startup'"),flowEnd=driver.indexOf("   const metadataAfter=",flowStart);
if(flowStart<0||flowEnd<0)throw Error('DERIVATION_ANCHOR_MISSING');
driver=driver.slice(0,flowStart)+`   const startup=await waitFrame('startup',30000);
   if(!['Q1_TS','Q1_GENERAL'].includes(startup.latest.route))fail('Q1_ROUTE_NOT_SELECTED');
   await seek('seek50',.5);await seek('seek90',.9);await close();ownsPlayer=false;
`+driver.slice(flowEnd);
driver=change(driver,'canonical fresh metadata after same original reopen','canonical fresh metadata after same original seeks and close');
driver=change(driver,'  }finally{\n   if(installed)',"  }finally{\n   if(partition)try{c.step('final passive network partition',await partition.stop());}catch{cleanupComplete=false;}\n   if(installed)");
driver=change(driver,"c.report.exactFinalFrame='UNKNOWN';", "c.report.exactFinalFrame='NOT_TESTED';c.report.partitionScope='passive page-CDP and Q1 public stats; CPU/probe/worker inner timing not directly observed';");
write('android-latency-partition.cjs',driver);
const dependencies=['binding.json','observer.expression.js','android-common.cjs','network-reducer.cjs','partition-summary.cjs','native-folder-target.function.js','native-ui-target.function.js','../rc31-resume-20261001/source-proof.expression.js'];
write('dependency-freeze.json',JSON.stringify({sourceCommit:binding.sourceCommit,version:binding.version,actualExecution:false,files:dependencies.map(p=>({path:p,sha256:sha(fs.readFileSync(path.resolve(__dirname,p)))}))},null,2)+'\n');
write('derivation.json',JSON.stringify({actualExecution:false,privateInputRead:false,networkCalls:false,pinnedSources:pinned,
 observerChanges:['source31 binding and independent namespace','general Q1/Q2 status distinction and mapped relative duration','3 phases / 176 samples / explicit arm epoch'],
 driverChanges:['30s startup / 35s seeks / no EOF or reopen','native search only or exact existing query','immediate dedicated page-CDP numeric reduction','6min total plus finally retirement and transport cleanup'],
 commonSHA256:commonHash,observerExpressionSHA256:exprHash},null,2)+'\n');
console.log(JSON.stringify({localPreparation:true,actualExecution:false,filesWritten:9}));
