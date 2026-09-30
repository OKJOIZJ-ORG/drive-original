function(binding,attachKind) {
  'use strict';
  attachKind=attachKind||'new-document';
  const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
  if(top!==self||location.origin!==origin||location.protocol!=='https:')return {armed:false,reason:'WRONG_TOP_OR_ORIGIN'};
  if(!binding||binding.origin!==origin||binding.versions?.length!==2||binding.versions[0].version!=='1.22.0-rc.27'||binding.versions[1].version!=='1.22.0-rc.28'
    ||!binding.versions.every(v=>/^[a-f0-9]{40}$/.test(v.source)&&v.cached?.length===40&&v.cached.every(x=>/^[a-f0-9]{64}$/.test(x.sha256))))throw Error('QA_SOURCE_BINDING_REQUIRED');
  if(window.__rc28NormalUpdateJournal)return {armed:false,reason:'ALREADY_ARMED'};
  const key='drive-original.qa.normal-update-27-28.v1',bindingKey=binding.versions.map(v=>v.source).join(':'),knownVersions=binding.versions.map(v=>v.version);
  const stages=new Set(['document-start','lifecycle-snapshot','worker-observed','worker-statechange','updatefound','controllerchange','trusted-banner-update-click','trusted-force-refresh-click','trusted-normal-version-check-click','pagehide','page-error','resource-error','unhandled-rejection','registrations-unavailable','cache-unavailable','observer-timeout','cache-parity','cleanup']);
  const states=['installing','installed','activating','activated','redundant'];
  const safeState=v=>states.includes(v)?v:null;
  const booleanKeys=['controller','rootScope','controllerScriptMatches','activeMatchesController','installing','waiting','accountPresent','authOnline','playerClosed','visible','fromDocumentStart','sourceExpected','cacheParity'];
  const numberKeys=['document','at','ms','worker','controllerOrdinal','registrations','listenerCount','cacheCount','matched','missing','mismatch'];
  const clean=row=>{if(!row||!stages.has(row.stage))return null;const r={stage:row.stage};
    for(const k of booleanKeys)if(typeof row[k]==='boolean')r[k]=row[k];
    for(const k of numberKeys)if(Number.isFinite(row[k])&&row[k]>=0)r[k]=Math.round(row[k]);
    for(const k of ['workerState','controllerState'])if(k in row)r[k]=safeState(row[k]);
    if('version' in row)r.version=knownVersions.includes(row.version)?row.version:'unknown';
    if('attachKind' in row)r.attachKind=row.attachKind==='late-attach'?'late-attach':'new-document';
    if('resourceTag' in row)r.resourceTag=['LINK','SCRIPT','IMG','VIDEO','IFRAME'].includes(row.resourceTag)?row.resourceTag:'OTHER';
    if(Array.isArray(row.shellVersions))r.shellVersions=row.shellVersions.filter(v=>knownVersions.includes(v)).slice(0,4);
    if(Array.isArray(row.activeStates))r.activeStates=row.activeStates.slice(0,4).map(safeState);
    return r;};
  let saved;try{const raw=sessionStorage.getItem(key);if(raw&&raw.length<131072)saved=JSON.parse(raw);}catch{}
  const compatible=saved?.bindingKey===bindingKey;
  const rows=compatible&&Array.isArray(saved.rows)?saved.rows.map(clean).filter(Boolean).slice(-191):[];
  const ordinal=compatible&&Number.isSafeInteger(saved.ordinal)&&saved.ordinal<64?saved.ordinal+1:1;
  const runStartedAt=compatible&&Number.isFinite(saved.runStartedAt)?saved.runStartedAt:Date.now();
  let stopped=false,busy=false,timer=null,deadline=null,last='',dropped=Number.isSafeInteger(saved?.dropped)?Math.max(0,saved.dropped):0,workerSequence=0;
  const listeners=[],seen=new WeakSet(),workerIds=new WeakMap();
  const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify({bindingKey,ordinal,runStartedAt,dropped,rows}));}catch{}};
  const add=(stage,details={})=>{if(stopped)return;const row=clean({stage,document:ordinal,at:Date.now(),ms:performance.now(),...details});if(!row)return;
    if(rows.length>=192){rows.splice(64,1);dropped++;}rows.push(row);persist();};
  const listen=(node,type,fn,capture=false)=>{if(stopped||listeners.length>=64)return;node.addEventListener(type,fn,capture);listeners.push([node,type,fn,capture]);};
  const workerId=w=>{if(!w)return null;if(!workerIds.has(w))workerIds.set(w,++workerSequence);return workerIds.get(w);};
  const matches=w=>{try{const u=new URL(w.scriptURL);return u.origin===origin&&u.pathname==='/sw.js';}catch{return false;}};
  const watch=w=>{if(stopped||!w||seen.has(w))return;seen.add(w);const id=workerId(w);add('worker-observed',{worker:id,workerState:w.state});listen(w,'statechange',()=>add('worker-statechange',{worker:id,workerState:w.state}));};
  const runtime=()=>({version:typeof APP_VERSION==='undefined'?'unknown':knownVersions.includes(APP_VERSION)?APP_VERSION:'unknown',
    accountPresent:typeof state!=='undefined'&&Boolean(state.authAccountKey),authOnline:typeof state!=='undefined'&&state.authStatus==='online',
    playerClosed:typeof state!=='undefined'&&!state.selected&&!q0Playback&&!q1Playback,visible:document.visibilityState==='visible'});
  const sample=async()=>{if(stopped||busy)return;busy=true;try{let regs=[];try{regs=await navigator.serviceWorker.getRegistrations();}catch{add('registrations-unavailable');}
    if(stopped)return;const controller=navigator.serviceWorker.controller;watch(controller);
    const owned=regs.filter(r=>r.scope===origin+'/');for(const r of owned.slice(0,4)){watch(r.active);watch(r.installing);watch(r.waiting);if(!seen.has(r)){seen.add(r);listen(r,'updatefound',()=>{add('updatefound');watch(r.installing);});}}
    let cacheKeys=[];try{cacheKeys=await caches.keys();}catch{add('cache-unavailable');}if(stopped)return;
    const safe={...runtime(),controller:Boolean(controller),controllerOrdinal:workerId(controller),controllerState:controller?.state??null,
      controllerScriptMatches:Boolean(controller&&matches(controller)),registrations:owned.length,rootScope:regs.length===1&&owned.length===1,
      activeMatchesController:owned.length===1&&owned[0].active===controller,activeStates:owned.map(r=>r.active?.state??null),
      installing:owned.some(r=>r.installing),waiting:owned.some(r=>r.waiting),cacheCount:cacheKeys.filter(k=>k.startsWith('drive-original-shell-')).length,
      shellVersions:cacheKeys.filter(k=>knownVersions.some(v=>k==='drive-original-shell-'+v)).map(k=>k.slice('drive-original-shell-'.length))};
    const next=JSON.stringify(safe);if(next!==last){last=next;add('lifecycle-snapshot',safe);}
  }finally{busy=false;}};
  const release=(reason,removeStorage)=>{if(stopped){if(removeStorage)sessionStorage.removeItem(key);return;}
    add(reason);stopped=true;clearInterval(timer);clearTimeout(deadline);for(const[n,t,f,c]of listeners)n.removeEventListener(t,f,c);listeners.length=0;
    if(removeStorage)sessionStorage.removeItem(key);};
  const read=()=>({schema:'drive-original.actual-https-normal-update-journal/1',binding,ordinal,stopped,dropped,rows:rows.map(r=>({...r})),
    listenerCount:listeners.length,observerReleased:stopped&&listeners.length===0,initial27LateAttach:rows.some(r=>r.attachKind==='late-attach'),
    actualWorkerScriptHashKnown:false,scope:'Passive candidate lifecycle/cache reader; root public/SW proof required separately; no prior failure attribution'});
  const cacheParity=async version=>{
    if(stopped)throw Error('QA_OBSERVER_STOPPED');const b=binding.versions.find(v=>v.version===version);if(!b)throw Error('QA_EXPECTED_VERSION');
    const before=runtime(),controller=navigator.serviceWorker.controller;if(before.version!==version||!before.playerClosed)throw Error('QA_VERSION_CLOSED_PLAYER_REQUIRED');
    const end=performance.now()+15000,cacheName='drive-original-shell-'+version;
    if(!(await caches.keys()).includes(cacheName))throw Error('QA_EXPECTED_CACHE_MISSING');
    if(stopped)throw Error('QA_OBSERVER_STOPPED');
    let matched=0,missing=0,mismatch=0;
    for(const row of b.cached){if(performance.now()>end||stopped)throw Error('QA_CACHE15S_TIMEOUT');const response=await caches.match(origin+'/'+row.file,{cacheName});
      if(!response){missing++;continue;}let hash;try{const bytes=await response.arrayBuffer();if(bytes.byteLength>12*1024*1024)throw Error('QA_CACHE_LENGTH');
        hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}catch{mismatch++;continue;}
      if(hash===row.sha256)matched++;else mismatch++;}
    if(stopped)throw Error('QA_OBSERVER_STOPPED');
    const regs=await navigator.serviceWorker.getRegistrations();if(stopped)throw Error('QA_OBSERVER_STOPPED');
    const now=runtime(),ownerCurrent=now.version===before.version&&navigator.serviceWorker.controller===controller;
    const ownerQualified=Boolean(controller&&controller.state==='activated'&&matches(controller)&&regs.length===1&&regs[0].scope===origin+'/'&&regs[0].active===controller&&!regs[0].installing&&!regs[0].waiting);
    const cacheParity=matched===40&&missing===0&&mismatch===0&&ownerCurrent&&ownerQualified;
    add('cache-parity',{version,matched,missing,mismatch,cacheParity,sourceExpected:true});
    return {version,source:b.source,expectedSourceSHA256:b.sourceSHA256,matched,missing,mismatch,cacheParity,controllerPresent:Boolean(controller),
      controllerStable:ownerCurrent,ownerQualified,actualWorkerScriptHashKnown:false,networkRequestsByObserver:0};
  };
  window.__rc28NormalUpdateJournal={read,cacheParity,clear:()=>{const before=read();release('cleanup',true);return {journal:before,observerReleased:listeners.length===0,ownSessionStorageKeyRemoved:true,accountOrMediaTouched:false};}};
  listen(navigator.serviceWorker,'controllerchange',()=>{add('controllerchange',{controller:Boolean(navigator.serviceWorker.controller),controllerState:navigator.serviceWorker.controller?.state??null});void sample();});
  listen(document,'click',e=>{if(e.isTrusted&&e.target?.closest?.('#bannerUpdateButton'))add('trusted-banner-update-click');
    if(e.isTrusted&&e.target?.closest?.('#forceReloadButton'))add('trusted-force-refresh-click');
    if(e.isTrusted&&e.target?.closest?.('#checkUpdateButton'))add('trusted-normal-version-check-click');},true);
  listen(window,'pagehide',()=>release('pagehide',false));
  listen(window,'error',e=>add(e.target===window?'page-error':'resource-error',{resourceTag:e.target?.tagName}));
  listen(window,'unhandledrejection',()=>add('unhandled-rejection'));
  add('document-start',{fromDocumentStart:attachKind==='new-document',attachKind,visible:document.visibilityState==='visible'});
  timer=setInterval(()=>void sample(),250);deadline=setTimeout(()=>release('observer-timeout',false),Math.max(1,20*60*1000-(Date.now()-runStartedAt)));void sample();
  return {armed:true,attachKind,ordinal,expectedVersions:knownVersions,networkRequestsByObserver:0};
}
