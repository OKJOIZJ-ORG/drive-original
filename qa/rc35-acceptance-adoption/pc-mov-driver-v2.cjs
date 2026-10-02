'use strict';
// Inert host driver: root supplies the existing normal-Chrome tab, protected tuple,
// and already inspected exact observer. No browser discovery or account mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ui=require('../rc35-cold-q0/cdp-ui.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function isoHeaderFunction(){let s=require('../rc35-cold-q0/bounded-header.cjs').browserHeader.toString();
 const a="const allowed=['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '];";
 if(s.split(a).length!==2||s.split("&&brand!=='qt  '").length!==2)throw Error('MOV_HEADER_DERIVATION');
 return s.replace(a,"const allowed=['qt  ','isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '];").replace("&&brand!=='qt  '",'').replace('normalIsoMp4:','normalTransportStream:Number(t.size)%188===0&&[0,188,376,564,752].every(p=>bytes[p]===0x47),normalIsoMovie:');
}
function phasePass(p){const f=p?.firstTargetFrame;return !!f&&Number.isFinite(f.elapsedMs)&&f.elapsedMs<=15000&&!p.fenceFailure&&f.width>0&&f.height>0;}
async function create({tab,cdp,target,binding,observerText,resultFile}){
 if(fs.existsSync(resultFile))throw Error('MOV_RESULT_NO_OVERWRITE');
 const report={schema:'rc35-current-known-PC-MOV-actual/2',sourceCommit:binding.sourceCommit,version:binding.version,fileBytes:Number(target.size),rawIdentifiersExported:false,producerSHA256:hash(fs.readFileSync(__filename)),observerSHA256:hash(Buffer.from(observerText)),inputHelperSHA256:hash(fs.readFileSync(path.join(__dirname,'../rc35-cold-q0/cdp-ui.cjs'))),scope:'One current MOV-named file (actual TS) startup/90-percent seek; historical failed tuple/cold condition/executing SW script bytes/p95 UNKNOWN',steps:[],timedPlaybackStarted:false,originalMediaMutated:false,productChanged:false,productionChanged:false};
 const save=()=>fs.writeFileSync(resultFile,JSON.stringify(report,null,2)+'\n');const step=(name,evidence)=>{report.steps.push({name,at:Date.now(),evidence});save();};
 const rpc=async fn=>{const r=await cdp.send('Runtime.evaluate',{expression:'('+fn+')()',awaitPromise:true,returnByValue:true},{timeoutMs:30000});if(r.exceptionDetails)throw Error('MOV_BROWSER_EVALUATION');return r.result.value;};
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const uiText=fs.readFileSync(path.join(__dirname,'../rc32-ts-device-replay/native-ui-target-v3.function.js'),'utf8');
 let ownsObserver=false,ownsInput=false,ownsHolder=false,ownsProof=false,ownsPlayer=false;
 const read=()=>rpc('()=>window.__rc35NativeSeekObserver.read()');
 async function header(){let enabled=false;try{
  await cdp.send('Network.enable',{});enabled=true;
  const methods=['Network.requestWillBeSent','Network.responseReceived'];const baseline=await cdp.readEvents({methods,limit:1000});
  const page=await rpc('async()=>('+isoHeaderFunction()+')(window.__resumeReplayTarget30)');
  const expected=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(target.id)+'/revisions/'+encodeURIComponent(target.headRevisionId));expected.searchParams.set('alt','media');
  const get=(o,k)=>Object.entries(o||{}).find(([n])=>n.toLowerCase()===k.toLowerCase())?.[1];let cursor=baseline.cursor,mediaRequest=null,requests=0,responses=0,rangeExact=false,lengthExact=false,status=null,truncated=false,pages=0;
  do{const out=await cdp.readEvents({methods,afterSequence:cursor,limit:1000});cursor=out.cursor;truncated||=out.truncated;pages++;
   for(const e of out.events){const p=e.params||{};if(e.method==='Network.requestWillBeSent'&&p.request?.url===expected.href&&p.request.method==='GET'){requests++;if(requests===1)mediaRequest=p.requestId;}
    if(e.method==='Network.responseReceived'&&p.requestId===mediaRequest&&p.response?.url===expected.href){responses++;status=p.response.status;rangeExact=get(p.response.headers,'Content-Range')==='bytes 0-16383/'+target.size;lengthExact=get(p.response.headers,'Content-Length')==='16384';}}
   if(!out.hasMore)break;if(pages>=8)throw Error('MOV_HEADER_EVENT_BOUND');
  }while(true);
  const qualified=(page.normalIsoMovie===true||page.normalTransportStream===true)&&page.bytes===16384&&requests===1&&responses===1&&status===206&&rangeExact&&lengthExact&&!truncated;
  step('bounded original ISO MOV header and independent CDP range',{page,requests,responses,status,rangeExact,lengthExact,truncated,qualified,rawHeadersExported:false});if(!qualified)throw Error('MOV_HEADER_CDP_UNQUALIFIED');return{...page,rangeMatched:true,requiresIndependentCdpRange:false};
 }finally{let disabled=!enabled;if(enabled)try{await cdp.send('Network.disable',{});disabled=true;}catch{}step('owned header Network domain cleanup',{ownedNetworkDisabled:disabled});if(!disabled)throw Error('MOV_HEADER_NETWORK_CLEANUP');}}
 async function observe(label){let r,p;const end=Date.now()+15000;do{r=await read();p=r.phases.find(x=>x.label===label);if(phasePass(p)||p?.fenceFailure||r.latest.native?.error)break;await wait(200);}while(Date.now()<end);step(label+' initial15 observation',r);
  if(!phasePass(p)&&!p?.fenceFailure&&!r.latest.native?.error){const late=Date.now()+15000;do{await wait(200);r=await read();p=r.phases.find(x=>x.label===label);if(p?.firstTargetFrame||p?.fenceFailure||r.latest.native?.error)break;}while(Date.now()<late);step(label+' bounded diagnostic continuation; initial15 criterion retained',r);}return{passed:phasePass(p),phase:p,latest:r.latest};}
 async function cleanup(){let good=true;
  try{const closed=await rpc('()=>el.playerSheet.hidden');if(!closed&&ownsPlayer)await tab.playwright.locator('body').press('Escape');const end=Date.now()+15000;let r;do{r=await rpc('()=>({closed:el.playerSheet.hidden,retired:q1RetirementResult?.settled===true&&playerTracksRetirementResult?.settled===true,ownersEmpty:!q0Playback&&!q1Playback&&!playerTracksOwner&&!q0PinnedSource,selectedEmpty:!state.selected,appBuffersEmpty:!state.mediaBlobUrl&&!state.mediaTempStorage&&!state.pendingOriginalBuffer})');if(r.closed&&r.retired&&r.ownersEmpty&&r.selectedEmpty&&r.appBuffersEmpty)break;await wait(200);}while(Date.now()<end);step('normal close and all-owner retirement',r);if(!r.closed||!r.retired||!r.ownersEmpty||!r.selectedEmpty||!r.appBuffersEmpty)good=false;ownsPlayer=false;
   if(ownsObserver){const metadata=await rpc('()=>window.__rc35NativeSeekObserver.metadata("after")');step('fresh after metadata',metadata);if(metadata.status!==200||!['sameExactTarget','stableMetadataSame','freshRevisionChecksumSame','accountSame','sourceSame','notTrashed','canDownload'].every(k=>metadata[k]===true))good=false;}
  }catch{good=false;}
  if(ownsInput)try{const r=await rpc('()=>{if(!window.__q0CdpInput)return{listenerRemoved:true,ownedApiAlreadyAbsent:true};const r=window.__q0CdpInput.stop();delete window.__q0CdpInput;return r;}');step('owned trusted card listener cleanup',r);if(!r.listenerRemoved)good=false;}catch{good=false;}
  if(ownsObserver)try{const r=await rpc('()=>{if(!window.__rc35NativeSeekObserver)return{disposed:true,removed:true,ownedApiAlreadyAbsent:true};const r=window.__rc35NativeSeekObserver.stop();delete window.__rc35NativeSeekObserver;return r;}');step('owned passive frame/interval/listener cleanup',r);if(!r.disposed||!r.removed)good=false;}catch{good=false;}
  try{const root=await rpc('()=>state.currentFolderId==="root"');if(!root){const button=tab.playwright.locator('#folderNav button').filter({hasText:'내 드라이브'});if(await button.count()!==1)throw Error('MOV_ROOT_BREADCRUMB');await button.click();}await tab.playwright.locator('#searchInput').fill('');const end=Date.now()+20000;let r;do{r=await rpc('()=>({root:state.currentFolderId==="root",queryEmpty:el.searchInput.value==="",loading:!!state.loadingFiles||!!state.loadingTree})');if(r.root&&r.queryEmpty&&!r.loading)break;await wait(200);}while(Date.now()<end);step('normal folder/query restoration',r);if(!r.root||!r.queryEmpty||r.loading)good=false;}catch{good=false;}
  try{const r=await rpc('()=>{'+(ownsHolder?'delete window.__resumeReplayTarget30;':'')+(ownsProof?'delete window.__resumeSwProof;':'')+'return{targetAbsent:!window.__resumeReplayTarget30,proofAbsent:!window.__resumeSwProof,observerAbsent:!window.__rc35NativeSeekObserver,inputAbsent:!window.__q0CdpInput};}');step('owned private holder/source proof cleanup',r);if(!Object.values(r).every(Boolean))good=false;}catch{good=false;}
  report.cleanupComplete=good;save();return good;
 }
 async function timed(){try{
  const g=await rpc('()=>('+uiText+')("card",{})');if(!g.available)throw Error('MOV_CARD_NOT_READY');const viewport={width:g.viewport.width,height:g.viewport.height};ui.point(g,viewport);
  step('passive exact card input prepared',await rpc('()=>('+ui.observeCard.toString()+')('+JSON.stringify({x:g.x,y:g.y})+')'));ownsInput=true;
  report.timedPlaybackStarted=true;step('startup arm',await rpc('()=>window.__rc35NativeSeekObserver.arm("startup")'));ownsPlayer=true;await ui.click(cdp,g,viewport);
  const hit=await rpc('()=>window.__q0CdpInput.read()');step('trusted exact startup card input',hit);if(!hit.observed||!hit.trusted||!hit.exactCard||!hit.pointMatched||hit.count!==1)throw Error('MOV_TRUSTED_CARD_UNQUALIFIED');
  const startup=await observe('startup');if(!startup.passed)throw Error('MOV_STARTUP_INITIAL15_FAILED');
  // Pause and seek only through the ordinary player UI.
  await tab.playwright.locator('#ctrlPlayPause').click();const paused=await rpc('()=>({paused:el.videoPlayer.paused,duration:playerTimeline().duration,sourceTime:playerTimeline().currentTime,current:state.selected?.id===window.__resumeReplayTarget30.target.id,closed:el.playerSheet.hidden})');step('ordinary UI pause and source timeline',paused);if(!paused.paused||!paused.current||paused.closed||!Number.isFinite(paused.duration)||paused.duration<=0)throw Error('MOV_SEEK_PREPARATION');
  const seek=await rpc('()=>('+uiText+')("seekBarContainer",{xFraction:0.9})');if(!seek.available)throw Error('MOV_SEEK_TARGET_UNAVAILABLE');const view={width:seek.viewport.width,height:seek.viewport.height};ui.point(seek,view);
  step('seek90 arm',await rpc('()=>window.__rc35NativeSeekObserver.arm("seek90",'+JSON.stringify({targetSeconds:paused.duration*.9,toleranceSeconds:1.5})+')'));await ui.click(cdp,seek,view);
  const seek90=await observe('seek90');report.functionalInitial15Passed=startup.passed&&seek90.passed;step('two-phase finite functional verdict',{startupPassed:startup.passed,seek90Passed:seek90.passed,historicalFailedTuple:'UNKNOWN',cold:'UNKNOWN',p95:'NOT_CLAIMED'});if(!report.functionalInitial15Passed)throw Error('MOV_SEEK90_INITIAL15_FAILED');
 }catch(e){report.failure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'MOV_OPERATION_FAILED';try{step('failure inclusive final observation',await read());}catch{}throw e;}finally{const cleaned=await cleanup();report.completed=report.functionalInitial15Passed===true&&cleaned&&!report.failure;save();}}
 return{report,save,step,rpc,read,header,wait,timed,cleanup,setOwnership(o){ownsObserver||=!!o.observer;ownsHolder||=!!o.holder;ownsProof||=!!o.proof;},observerText,binding,headerFunction:isoHeaderFunction()};
}
module.exports={create,phasePass,isoHeaderFunction};
