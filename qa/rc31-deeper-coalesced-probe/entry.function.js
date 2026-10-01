function (create,facade,binding) {
 'use strict';
 const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',FOLDER='application/vnd.google-apps.folder';
 let registry=new Map(),folders=new Map(),rootId=null,owner=null,proof=null,active=null,pending=null,targetReads=0,navigationReads=0;
 const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),parents=x=>Array.isArray(x)?[...x].sort():null;
 const capture=p=>({controller:p.controller,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,abort:state.accountStateAbortController,writer:state.accountStateWriterId,revision:state.accountStateRevision,source:mediaSourceGeneration,media:state.mediaSession,playback:state.playbackSession,retirement:q1RetirementResult,href:location.href,projection:clone(state.accountMediaState)});
 const released=()=>!pending&&(!active||active.poll().done===true);
 const proofOK=p=>p&&p.version===binding.version&&p.sourceCommit===binding.sourceCommit&&['app.js','sw.js','version.json'].every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256[k]);
 const idle=()=>navigator.onLine===true&&document.visibilityState==='visible'&&state.authStatus==='online'&&hasUsableToken()&&state.demo===false&&!state.accountIdentityPending&&state.loadingFiles!==true&&state.loadingFavorites!==true&&state.loadingTree!==true&&Boolean(state.accountStateAbortController?.signal)&&!state.accountStateAbortController.signal.aborted&&state.accountStateLoaded===true&&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null&&state.pendingPlay===false&&state.mediaTransportStarted===false&&q1Playback===null&&playerMediaPriorityActive===false&&q1RetirementResult?.settled===true&&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null;
 const current=()=>owner&&APP_VERSION===binding.version&&DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&location.origin===ORIGIN&&location.href===owner.href&&navigator.serviceWorker.controller===owner.controller&&owner.controller.state==='activated'&&proofOK(proof?.get?.())&&proof.get().controller===owner.controller&&idle()&&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive&&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.expiresAt===owner.expiry&&state.accountStateAbortController===owner.abort&&!owner.abort?.signal.aborted&&state.accountStateWriterId===owner.writer&&state.accountStateRevision===owner.revision&&mediaSourceGeneration===owner.source&&state.mediaSession===owner.media&&state.playbackSession===owner.playback&&q1RetirementResult===owner.retirement&&accountMediaStatesEqual(state.accountMediaState,owner.projection);
 const denied=reason=>({ready:false,reason,privateIdentityExported:false});
 const rejected=()=>({poll:()=>({done:true,summary:{complete:false,failure:'SOURCE_BINDING_REJECTED',writeRequests:0,mediaRequests:0}}),cancel:()=>({cancelled:true})});
 const catalogOK=()=>active?.poll?.()?.summary?.catalogStable===true&&active.poll().summary.released===true&&active.poll().summary.failure==null;
 function gate(reference){if(!released())return denied('OWNER_ACTIVE');if(!catalogOK())return denied('FINAL_CATALOG_UNQUALIFIED');if(!current())return denied('OWNER_CHANGED');if(!registry.has(reference))return denied('UNKNOWN_REFERENCE');return null;}
 const entry=(contextText,acceptedProof,options)=>{
  options=options||{cohort:1,mode:'probe'};
  if(!released()||Object.keys(options).some(k=>!['cohort','mode'].includes(k))||!Number.isSafeInteger(options.cohort)||options.cohort<1||options.cohort>38||!['probe','metadata-only'].includes(options.mode))return rejected();
  registry.clear();folders.clear();rootId=null;targetReads=0;navigationReads=0;proof=acceptedProof;const p=proof?.get?.();if(!proofOK(p))return rejected();owner=capture(p);
  const witness=(selection,pass)=>{
   registry.clear();folders.clear();rootId=pass?.rootBefore?.id||null;
   const items=pass?.items||[],folderRows=items.filter(x=>x.mimeType===FOLDER);
   // Retain only already-collected folders. Each requested ancestor chain is
   // separately limited to eight known IDs; catalog size does not expand reads.
   if(!rootId||new Set(items.map(x=>x.id)).size!==items.length)return;
   folders.set(rootId,clone(pass.rootBefore));folderRows.forEach(x=>folders.set(x.id,clone(x)));
   selection.privateManifest.selected.forEach((r,i)=>{
    const item=items.find(x=>x.id===r.fileId);
    if(item&&String(item.version)===String(r.version)&&item.parents?.length===1&&folders.has(item.parents[0]))registry.set('representative-'+(i+1),{...clone(r),item:clone(item)});
   });
  };
  active=facade.call(runtime=>{runtime.deeperOptions={cohort:options.cohort};return create(runtime,witness);},contextText,proof,null,options.mode);return active;
 };
 entry.rearmTargets=acceptedProof=>{
  const p=acceptedProof?.get?.();
  if(!owner||!released()||!catalogOK()||!proofOK(p)||p.controller!==owner.controller||p.controller!==navigator.serviceWorker.controller||state.accountId!==owner.account||state.authAccountKey!==owner.key||state.driveSessionGeneration!==owner.drive||state.accountStateWriterId!==owner.writer||!Number.isSafeInteger(state.accountStateRevision)||state.accountStateRevision<owner.revision||!idle())return denied('FRESH_IDLE_OWNER_UNQUALIFIED');
  proof=acceptedProof;owner=capture(p);return {ready:Boolean(current()),privateRegistryExported:false,newMediaRequest:false};
 };
 const metadataFields='id,name,version,mimeType,size,modifiedTime,parents,trashed,driveId,resourceKey,capabilities(canDownload)';
 function qualified(meta,item,isRoot=false){return meta?.id===item.id&&String(meta.version)===String(item.version)&&meta.mimeType===item.mimeType&&meta.trashed===false&&(meta.driveId||null)===(item.driveId||null)&&meta.modifiedTime===item.modifiedTime&&(isRoot||(meta.name===item.name&&same(parents(meta.parents),parents(item.parents))))&&(item.mimeType===FOLDER||(String(meta.size)===String(item.size)&&meta.capabilities?.canDownload===item.capabilities?.canDownload));}
 async function fresh(item,isRoot=false){
  if(!current())throw Error('OWNER_CHANGED');
  const controller=new AbortController(),signal=controller.signal,accountSignal=owner.abort.signal;pending=controller;
  const stop=()=>controller.abort(),timer=setTimeout(stop,10000),links=[['pagehide',stop],['beforeunload',stop]];
  accountSignal.addEventListener('abort',stop,{once:true});links.forEach(([type,fn])=>window.addEventListener(type,fn,{once:true}));
  let response=null,reader=null,finished=false,cleanupFailure=false,request=null;
  const race=p=>new Promise((resolve,reject)=>{const abort=()=>reject(Error('TARGET_CANCELLED'));signal.addEventListener('abort',abort,{once:true});Promise.resolve(p).then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});if(signal.aborted)abort();});
  try{
   const url=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id));url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',metadataFields);
   const headers={Authorization:'Bearer '+owner.token};if(item.resourceKey)headers['X-Goog-Drive-Resource-Keys']=item.id+'/'+item.resourceKey;
   request=Promise.resolve(fetch(url.href,{method:'GET',headers,signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}));response=await race(request);
   if(!current())throw Error('OWNER_CHANGED');if(response.status!==200||!response.body)throw Error('TARGET_METADATA_FAILED');
   reader=response.body.getReader();const chunks=[];let bytes=0;
   for(;;){const x=await race(reader.read());if(!current())throw Error('OWNER_CHANGED');if(x.done){finished=true;break;}if(!(x.value instanceof Uint8Array)||(bytes+=x.value.byteLength)>32768)throw Error('TARGET_METADATA_LIMIT');chunks.push(x.value);}
   const body=new Uint8Array(bytes);let pos=0;for(const c of chunks){body.set(c,pos);pos+=c.length;}let meta;try{meta=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}finally{body.fill(0);chunks.length=0;}
   if(!current())throw Error('OWNER_CHANGED');if(!qualified(meta,item,isRoot))throw Error('TARGET_IDENTITY_CHANGED');return true;
  }finally{
   clearTimeout(timer);controller.abort();accountSignal.removeEventListener('abort',stop);links.forEach(([type,fn])=>window.removeEventListener(type,fn));
   if(!finished){let cleanupTimer;try{const cancel=reader?reader.cancel():response?response.body?.cancel():request?.then(r=>r.body?.cancel(),()=>{});await Promise.race([Promise.resolve(cancel),new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(Error('TARGET_CLEANUP_FAILED')),1000);})]);}catch{cleanupFailure=true;}finally{clearTimeout(cleanupTimer);}}
   try{reader?.releaseLock();}catch{}pending=null;if(cleanupFailure){registry.clear();folders.clear();owner=null;proof=null;throw Error('TARGET_CLEANUP_FAILED');}
  }
 }
 function coordinates(button,reference,kind){
  const r=button?.getBoundingClientRect?.();if(!r||r.width<=0||r.height<=0||r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)return denied('NOT_VISIBLE');
  const x=r.x+r.width/2,y=r.y+r.height/2;if(document.elementFromPoint){const hit=document.elementFromPoint(x,y);if(hit!==button&&!button.contains?.(hit))return denied('TARGET_OBSCURED');}
  return {ready:true,reference,kind,x,y,width:r.width,height:r.height,dpr:devicePixelRatio,privateIdentityExported:false,trustedNormalUIClickRequired:true};
 }
 function uiFile(row){
  const found=state.files.filter(x=>x.id===row.fileId);if(found.length!==1)return null;const x=found[0],i=row.item;
  if(x.mimeType!==i.mimeType||String(x.size)!==String(i.size)||x.modifiedTime!==i.modifiedTime||x.name!==i.name||!same(parents(x.parents),parents(i.parents))||(x.driveId||null)!==(i.driveId||null)||(x.version!=null&&String(x.version)!==String(row.version)))return null;return x;
 }
 entry.target=async reference=>{
  const bad=gate(reference);if(bad)return bad;const row=registry.get(reference);if(!uiFile(row))return denied('CURRENT_UI_METADATA_UNQUALIFIED');if(targetReads>=38)return denied('TARGET_READ_BUDGET');
  const buttons=[...document.querySelectorAll('.file-card-open')].filter(b=>b.closest('[data-file-id]')?.dataset.fileId===row.fileId);if(buttons.length!==1)return denied('NOT_RENDERED');
  targetReads++;try{await fresh(row.item);}catch(e){return denied(['OWNER_CHANGED','TARGET_CANCELLED','TARGET_METADATA_FAILED','TARGET_METADATA_LIMIT','TARGET_IDENTITY_CHANGED','TARGET_CLEANUP_FAILED'].includes(e.message)?e.message:'TARGET_METADATA_FAILED');}
  if(!current()||!uiFile(row))return denied('OWNER_CHANGED');
  const after=[...document.querySelectorAll('.file-card-open')].filter(b=>b.closest('[data-file-id]')?.dataset.fileId===row.fileId);if(after.length!==1)return denied('NOT_RENDERED');
  return {...coordinates(after[0],reference,'normal-file-card'),freshExactVersionQualified:true,uiVersionClaimed:false,metadataRequests:1,mediaRequests:0};
 };
 const canonical=id=>id==='root'&&state.rootFolderId===rootId?rootId:id;
 function chain(row){const ids=[],seen=new Set();let id=row.item.parents[0];while(id){if(seen.has(id)||!folders.has(id)||ids.length>=8)return null;seen.add(id);ids.unshift(id);if(id===rootId)return ids;const p=folders.get(id).parents;if(p?.length!==1)return null;id=p[0];}return null;}
 entry.navigationTarget=async reference=>{
  const bad=gate(reference);if(bad)return bad;const route=chain(registry.get(reference));if(!route)return denied('KNOWN_ANCESTORS_UNQUALIFIED');const here=canonical(state.currentFolderId),index=route.indexOf(here);
  if(index===route.length-1)return {ready:false,reason:'AT_SAMPLE_PARENT',reference,privateIdentityExported:false};if(!folders.has(here))return denied('CURRENT_FOLDER_OUTSIDE_INVENTORY');
  let id,button,kind;
  if(index>=0){id=route[index+1];const item=folders.get(id),rows=state.filter==='all'?state.folders.filter(f=>!state.query||String(f.name||'').toLocaleLowerCase('ko').includes(state.query)).slice(0,state.folderRenderLimit):[],nodes=[...document.querySelectorAll('#folderStrip .folder-row')],n=rows.findIndex(x=>x.id===id);
   if(n<0||rows.filter(x=>x.id===id).length!==1||nodes.length!==rows.length||rows[n].mimeType!==FOLDER||rows[n].name!==item.name||!same(parents(rows[n].parents),parents(item.parents))||rows[n].modifiedTime!==item.modifiedTime||nodes[n].querySelector('.folder-name')?.textContent!==item.name)return denied('FOLDER_CARD_UNQUALIFIED');button=nodes[n];kind='normal-folder-card';
  }else{
   const crumbs=buildBreadcrumbItems(state.folderStack,state.currentFolderId,state.currentFolderName),n=crumbs.findIndex(x=>canonical(x.id)===rootId),nodes=[...document.querySelectorAll('#breadcrumbTrail .crumb')];
   if(n<0||n===crumbs.length-1||nodes.length!==crumbs.length||nodes[n].tagName!=='BUTTON'||nodes[n].textContent!==crumbs[n].name)return denied('INVENTORY_ROOT_BREADCRUMB_UNQUALIFIED');id=rootId;button=nodes[n];kind='normal-breadcrumb';
  }
  if(navigationReads>=8)return denied('NAVIGATION_READ_BUDGET');navigationReads++;
  const view=JSON.stringify([state.currentFolderId,state.folderStack,state.query,state.filter,state.folders]);try{await fresh(folders.get(id),id===rootId);}catch(e){return denied(['OWNER_CHANGED','TARGET_CANCELLED','TARGET_METADATA_LIMIT','TARGET_IDENTITY_CHANGED','TARGET_CLEANUP_FAILED'].includes(e.message)?e.message:'TARGET_METADATA_FAILED');}
  if(!current()||view!==JSON.stringify([state.currentFolderId,state.folderStack,state.query,state.filter,state.folders]))return denied('NAVIGATION_VIEW_CHANGED');
  if(!button.isConnected)return denied('NOT_RENDERED');return {...coordinates(button,reference,kind),knownAncestorChainQualified:true,metadataRequests:1,mediaRequests:0};
 };
 entry.cleanup=()=>{pending?.abort();if(active&&active.poll().done!==true)active.cancel();registry.clear();folders.clear();rootId=null;owner=null;proof=null;return {released:released(),privateRegistryCleared:true};};
 return Object.freeze(entry);
}
