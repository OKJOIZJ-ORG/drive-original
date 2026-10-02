'use strict';
// Root executes only after admitting one normal PC tab. This module never opens a browser.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const observerPath=path.resolve(__dirname,'../rc32-format-acceptance/image-observer.function.js');
const samplerPath=path.resolve(__dirname,'../rc31-actual-image-observation/painted-sampler.cjs');
const OBS='58096ab9f6061b73486dd59746d8f23ad5afb886bbaa9ce8d2898e75c69858d0',SAMPLE='d296113597b5cd30a0ee7fc90239bbfc07ed1f317dd306b152bd27269b6f8553';
const demand=(v,code)=>{if(!v)throw Error(code);};
function binding(b){
 demand(b?.schema==='pc-image-binding/1'&&/^[a-f0-9]{40}$/.test(b.sourceCommit)&&/^1\.22\.0-rc\.\d+$/.test(b.version),'BINDING');
 demand(Object.keys(b.sourceSHA256||{}).sort().join(',')==='app.js,sw.js,version.json'&&Object.values(b.sourceSHA256).every(v=>/^[a-f0-9]{64}$/.test(v)),'BINDING_HASHES');
 return b;
}
function observer(b){
 binding(b);const bytes=fs.readFileSync(observerPath);demand(hash(bytes)===OBS,'OBSERVER_BYTES');demand(hash(fs.readFileSync(samplerPath))===SAMPLE,'SAMPLER_BYTES');
 let s=bytes.toString();
 const changes=[['installRc32ImageObservation','installPcImageObservation'],['__rc32ImageObservation','__pcImageObservation'],['1d79897fd32c569137cab079bfd93107be2ee33f',b.sourceCommit],['1.22.0-rc.32',b.version],['7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497',b.sourceSHA256['app.js']],['8f27c0aa6710b78353b87911702a7e4c6e66535c404d5a66869992fc861b242b',b.sourceSHA256['sw.js']],['f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea',b.sourceSHA256['version.json']]];
 for(const [old,next]of changes){demand(s.includes(old),'OBSERVER_BIND_PRECONDITION');s=s.split(old).join(next);}
 // Closed-card observation also rejects a generation transition before explicit arm.
 s=s.replace('let owner = null, disposed = false;','const installedAccountGeneration=state.driveSessionGeneration; let owner = null, disposed = false;');
 s=s.replace('state.accountId === account.accountId && state.authAccountKey === account.authAccountKey','state.accountId === account.accountId && state.authAccountKey === account.authAccountKey && state.driveSessionGeneration===installedAccountGeneration');
 return s;
}
function input(p){
 demand(p?.schema==='pc-image-targets/1'&&typeof p.account?.accountId==='string'&&typeof p.account?.authAccountKey==='string','PRIVATE_OWNER');
 demand(Array.isArray(p.targets)&&p.targets.length>=1&&p.targets.length<=3,'TARGET_COUNT');const ids=new Set();
 for(const t of p.targets){demand(typeof t.id==='string'&&t.id.length>0&&!ids.has(t.id)&&typeof t.name==='string'&&typeof t.size==='string'&&/^[1-9]\d*$/.test(t.size)&&typeof t.mimeType==='string'&&typeof t.modifiedTime==='string'&&(t.headRevisionId||t.version||t.sha256Checksum),'TARGET_TUPLE');ids.add(t.id);demand(['gif','animated-webp','large-still'].includes(t.role),'TARGET_ROLE');}
 return p;
}
const tuple=t=>JSON.stringify(['id','name','size','mimeType','modifiedTime','version','headRevisionId','sha256Checksum','md5Checksum'].map(k=>t[k]??null).concat([Array.isArray(t.parents)?[...t.parents].sort():null]));
function compare(t,m){demand(m?.trashed===false&&m.capabilities?.canDownload===true&&tuple(t)===tuple(m),'FRESH_METADATA_MISMATCH');return true;}
async function run({transport,binding:bound,privateInput,output,totalMs=180000,cardOnly=false}){
 const b=binding(bound),p=input(privateInput),source=observer(b);demand(totalMs>0&&totalMs<=180000,'TOTAL_BOUND');
 demand(typeof transport.readPNG==='function','PNG_DECODER_REQUIRED');
 for(const k of ['evaluate','prepareTarget','openCard','closePlayer','captureCrop','readMetadata','restoreNavigation','closeOwned'])demand(typeof transport[k]==='function','TRANSPORT_CONTRACT');
 // wx reservation precedes any actual activity; raw private inputs never enter the receipt.
 const nativeSamplerPath=path.join(__dirname,'native-painted-sampler.cjs');
 demand(typeof cardOnly==='boolean','OBSERVATION_SCOPE');
 const fd=fs.openSync(output,'wx'),r={schema:'pc-image-observation/1',observationScope:cardOnly?'card only; viewer evidence retained separately':'card and two viewer lifetimes',sourceCommit:b.sourceCommit,version:b.version,observerTemplateSHA256:OBS,samplerTemplateSHA256:SAMPLE,samplerSHA256:hash(fs.readFileSync(nativeSamplerPath)),rows:[],passed:false,cleanup:{},rawIdentifiersExported:false};
 const start=performance.now(),controller=new AbortController();let timer=setTimeout(()=>controller.abort(),totalMs),installed=false;
 const call=async work=>{demand(!controller.signal.aborted&&performance.now()-start<totalMs,'TOTAL_BOUND');let timeout;try{return await Promise.race([Promise.resolve().then(()=>work(controller.signal)),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('TOTAL_BOUND')),Math.max(1,totalMs-(performance.now()-start)));})]);}finally{clearTimeout(timeout);}};
 const evaluate=s=>call(signal=>transport.evaluate(s,{signal,privateExpression:true}));
 const snap=()=>evaluate('window.__pcImageObservation.snapshot()');
 const close=async()=>{await call(signal=>transport.closePlayer({signal,normalInputOnly:true}));const until=performance.now()+5000;while(performance.now()<until){const v=await snap();if(v.closed&&v.selectionCleared&&v.sourcesCleared&&v.retired)return v;await new Promise(z=>setTimeout(z,100));}throw Error('CLOSE_UNSETTLED');};
 try{
  const {samplePainted}=require(nativeSamplerPath);
  for(let i=0;i<p.targets.length;i++){
   const t=p.targets[i],row={ordinal:i+1,role:t.role,animation:'UNKNOWN',alpha:'UNKNOWN',delay:'UNKNOWN',loop:'UNKNOWN',encodedOracle:'NOT_SUPPLIED',windows:[]};r.rows.push(row);
   const prepared=await call(signal=>transport.prepareTarget(t,{signal,normalInputOnly:true}));demand(prepared?.normalUi===true&&prepared.exactTarget===true,'NORMAL_TARGET_REQUIRED');
   compare(t,await call(signal=>transport.readMetadata(t,{signal})));row.beforeMetadata=true;
   // The list/card object intentionally omits API revision/checksum fields.
   // Compare that representation here; compare the complete fresh API tuple
   // before/after the observation without injecting it into product state.
   const cardTarget=Object.fromEntries(['id','name','size','mimeType','modifiedTime','parents'].filter(k=>t[k]!=null).map(k=>[k,t[k]]));
   row.selectedMetadataScope='Exact card id/name/size/type/modifiedTime/parents; complete API revision/checksum tuple checked separately before/after';
   await evaluate('('+source+')('+JSON.stringify({account:p.account,target:cardTarget})+')');installed=true;
   const budget={sampleCount:0,encodedBytes:0};
   const sample=async(phase,durationMs,maxSamples)=>samplePainted({phase,durationMs,maxSamples,budget,readPNG:transport.readPNG,readFence:()=>evaluate('window.__pcImageObservation.fence('+JSON.stringify(phase)+')'),capture:opts=>call(signal=>transport.captureCrop({...opts,signal,croppedOnly:true,save:false}))});
   // The extension capture protocol can exceed sub-second windows. Preserve
   // the sampler's8s ceiling and require two independently fenced crops.
   row.windows.push(await sample('card',8000,2));
   for(let life=0;life<(cardOnly?0:2);life++){
    const opened=await call(signal=>transport.openCard(t,{signal,normalInputOnly:true}));demand(opened?.normalCard===true&&opened.exactTarget===true,'NORMAL_CARD_REQUIRED');
    const until=performance.now()+15000;let v;do{v=await snap();if(v.imageReady&&v.sameOwner)break; // arm establishes this explicit new lifetime only after normal decode.
     if(v.imageReady){await evaluate('window.__pcImageObservation.arm()');v=await snap();break;}await new Promise(z=>setTimeout(z,100));}while(performance.now()<until);
    demand(v?.sourceQualified&&v.accountSame&&v.foreground&&v.online&&v.exactSelectedMetadata&&v.imageReady&&v.sameOwner&&v.originalMode&&v.transportVerified&&v.noImageIframeFallback&&v.videoHidden&&v.videoControlsHidden&&v.imageErrorHidden,'IMAGE_NOT_QUALIFIED');
    row.windows.push(await sample('viewer',8000,2));row['lifetime'+(life+1)]={...v,close:await close()};
   }
   compare(t,await call(signal=>transport.readMetadata(t,{signal})));row.afterMetadata=true;
   row.sampleCount=budget.sampleCount;row.encodedBytes=budget.encodedBytes;
   row.animation=row.windows.slice(1).some(x=>x.observedChangingPixel)?'SAMPLED_VISIBLE_CHANGE':'UNKNOWN';
   row.staticList=row.windows[0].observedStablePixel?'SAMPLED_STABLE':'UNKNOWN';
   row.disposed=await evaluate('window.__pcImageObservation.dispose()');installed=false;
  }r.passed=true;
 }catch(e){r.failure=/^[A-Z_0-9]+$/.test(e.message)?e.message:'IMAGE_UNIT_FAILED';r.passed=false;
  if(installed)try{r.failureSnapshot=await transport.evaluate('window.__pcImageObservation.snapshot()',{privateExpression:true,timeoutMs:2000});}catch{r.failureSnapshotUnavailable=true;}
 }finally{
  clearTimeout(timer);controller.abort();
  // Cleanup has its own short adapter deadlines, even when the observation unit expired.
  try{r.cleanup.normalClose=await transport.closePlayer({normalInputOnly:true,timeoutMs:5000});}catch{r.cleanup.normalClose=false;}
  if(installed)try{r.cleanup.observer=await transport.evaluate('window.__pcImageObservation.dispose()',{privateExpression:true,timeoutMs:2000});}catch{r.cleanup.observer=false;}
  else r.cleanup.observer={observerRemoved:true};
  try{r.cleanup.navigationRestored=await transport.restoreNavigation({normalInputOnly:true,timeoutMs:5000});}catch{r.cleanup.navigationRestored=false;}
  try{r.cleanup.ownedTransport=await transport.closeOwned({timeoutMs:5000});}catch{r.cleanup.ownedTransport=false;}
  r.elapsedMs=Math.round(performance.now()-start);r.qualityAcceptance='UNKNOWN';if(r.cleanup.normalClose?.closed!==true||r.cleanup.normalClose?.retired!==true||r.cleanup.observer?.observerRemoved!==true||r.cleanup.navigationRestored?.restored!==true||r.cleanup.ownedTransport?.closed!==true||r.cleanup.ownedTransport?.ownedOnly!==true){r.passed=false;r.cleanupFailure=true;}
  try{fs.writeSync(fd,JSON.stringify(r,null,2)+'\n');}finally{fs.closeSync(fd);}
 }return r;
}
function args(a){const o={};for(let i=0;i<a.length;i+=2){demand(a[i]?.startsWith('--')&&a[i+1],'ARGUMENTS');o[a[i].slice(2)]=a[i+1];}return o;}
async function cli(a){const mode=a.shift(),o=args(a);if(mode==='bind'){const b=binding({schema:'pc-image-binding/1',sourceCommit:o.source,version:o.version,sourceSHA256:{'app.js':o['app-sha'],'sw.js':o['sw-sha'],'version.json':o['version-sha']}});fs.writeFileSync(o.out,JSON.stringify(b,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({bound:true,actualRun:false}));return;}
 demand(mode==='run'&&o.execute==='true','EXPLICIT_EXECUTE_REQUIRED');const b=binding(JSON.parse(fs.readFileSync(o.binding))),p=input(JSON.parse(fs.readFileSync(o['private-input'])));demand(!fs.existsSync(o.out),'OUTPUT_EXISTS');const adapter=require(path.resolve(o.transport));const t=await adapter.create({binding:b,privateInput:p});let r;try{r=await run({transport:t,binding:b,privateInput:p,output:o.out});}catch(e){try{await t.closeOwned?.({timeoutMs:5000});}catch{}throw e;}console.log(JSON.stringify({passed:r.passed,rows:r.rows.length,rawIdentifiersExported:false}));if(!r.passed)process.exitCode=1;}
module.exports={binding,observer,input,compare,run,cli};
if(require.main===module)cli(process.argv.slice(2)).catch(()=>{console.error('PC_IMAGE_PREPARATION_OR_EXECUTION_FAILED');process.exitCode=1;});
