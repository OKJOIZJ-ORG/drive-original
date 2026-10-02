// Narrow derivative of rc31 disposableUiJob: one folder, one immutable video.
// Ambient provider/storage access is supplied only by the fenced root facade.
export function q3DisposableJob(env,binding,fixture,{recoveryRun=null}={}){
 const err=code=>Object.assign(new Error(code),{code}),clone=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>JSON.stringify((function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;})(x));
 const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,200}$/.test(x)&&x!=='appDataFolder';
 const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x||'');
 const hashes=['app.js','sw.js','version.json'];
 if(binding?.version!=='1.22.0-rc.37'||binding?.source!=='051dc3456f5000b958a18593848769b3687991e5'||hashes.some(k=>!/^[a-f0-9]{64}$/.test(binding.sourceSHA256?.[k]||''))||fixture?.bytes!==659966||fixture?.sha256!=='d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037'||fixture?.md5!=='cc7a0da5f6e2b89a9fdee916d259d285')throw err('binding');
 const owner={...env.read()},same=['accountId','accountKey','auth','data','token','revision','expiry','writer','stateRevision','projection','href','controller','signal','version','source','hashes','mediaSession','sourceGeneration','retirement'];
 if(owner.driveWrite!==true)throw err('grant');
 if(!owner.accountId||!owner.accountKey||!owner.token||!owner.signal||owner.version!==binding.version||owner.source!==binding.source||owner.hashes!==canonical(binding.sourceSHA256))throw err('binding');
 const pointerKey='drive-original.qa.disposable.color-exact-fixture.'+fixture.sha256+'.run',existing=env.storage.getItem(pointerKey);
 if(existing&&!recoveryRun)throw err('existing_run');
 const run=recoveryRun??env.uuid();if(!uuid(run))throw err('run');
 if(recoveryRun){let pointer;try{pointer=JSON.parse(existing);}catch{}if(pointer?.run!==run||pointer?.accountId!==owner.accountId||pointer?.accountKey!==owner.accountKey||pointer?.source!==binding.source)throw err('ledger');}
 const key=`drive-original.qa.disposable.${run}.recovery`,aborter=new AbortController(),began=Date.now();
 let requests=0,responseBytes=0,writes=0,done=false,started=false,failure=null,captureStable=false,cleanupFailure=null,snapshot=null,ledger=null,operation=null,lastHTTPStatus=null;
 const current=()=>{const next=env.read();return !aborter.signal.aborted&&!owner.signal.aborted&&Date.now()-began<120000&&same.every(k=>next[k]===owner[k])&&next.safe===true&&next.driveWrite===true&&next.controller?.state==='activated';};
 const check=()=>{if(!current())throw err('owner');};check();
 const folderMime='application/vnd.google-apps.folder',roles=['folder-a','test-video-1'];
 ledger=recoveryRun?JSON.parse(env.storage.getItem(key)):{schema:1,purpose:'color-exact-fixture',run,accountId:owner.accountId,accountKey:owner.accountKey,binding:clone(binding),fixture:clone(fixture),root:null,planned:[],created:[],events:[],status:'prepared'};
 const expectedMeta=(role,id,rootId,folderId)=>({id,name:`DriveOriginal-QA-${run}-${role}`,mimeType:role==='folder-a'?folderMime:'video/mp4',parents:[role==='folder-a'?rootId:folderId],appProperties:{qaRun:run,qaRole:role,qaFixtureSHA256:fixture.sha256}});
 function ledgerOK(){
  if(ledger?.schema!==1||ledger.purpose!=='color-exact-fixture'||ledger.run!==run||ledger.accountId!==owner.accountId||ledger.accountKey!==owner.accountKey||canonical(ledger.binding)!==canonical(binding)||canonical(ledger.fixture)!==canonical(fixture)||!Array.isArray(ledger.planned)||!Array.isArray(ledger.created)||!Array.isArray(ledger.events))throw err('ledger');
  if(recoveryRun){if(ledger.planned.length!==2||new Set(ledger.planned.map(x=>x.id)).size!==2||!idOK(ledger.root?.id)||ledger.planned.some((r,i)=>r.role!==roles[i]||!idOK(r.id)||typeof r.sent!=='boolean'||canonical(r.intent)!==canonical({method:'POST',route:i===0?'metadata-create':'multipart-create',metadata:expectedMeta(r.role,r.id,ledger.root.id,ledger.planned[0].id),fixtureSHA256:i===0?null:fixture.sha256,fixtureBytes:i===0?0:fixture.bytes}))||new Set(ledger.created.map(x=>x.id)).size!==ledger.created.length||ledger.created.some(x=>!ledger.planned.some(p=>p.id===x.id&&p.role===x.role&&p.sent===true)))throw err('ledger');}
 }
 ledgerOK();
 const save=()=>{check();env.storage.setItem(key,JSON.stringify(ledger));};
 const stop=()=>aborter.abort(err('cancelled')),timer=setTimeout(stop,120000);
 owner.signal.addEventListener('abort',stop,{once:true});env.lifecycle?.addEventListener('pagehide',stop,{once:true});env.lifecycle?.addEventListener('beforeunload',stop,{once:true});
 const clean=()=>{clearTimeout(timer);owner.signal.removeEventListener('abort',stop);env.lifecycle?.removeEventListener('pagehide',stop);env.lifecycle?.removeEventListener('beforeunload',stop);};
 const fields='id,name,version,headRevisionId,parents,trashed,mimeType,modifiedTime,appProperties,ownedByMe,driveId,size,md5Checksum,sha256Checksum,capabilities(canAddChildren,canTrash,canUntrash,canDownload)';
 const query=new URLSearchParams({supportsAllDrives:'true',fields}).toString();
 const race=(p,signal)=>new Promise((resolve,reject)=>{let settled=false;const finish=(fn,x)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(x);},cancel=()=>finish(reject,err('cancelled'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();Promise.resolve(p).then(x=>finish(resolve,x),e=>finish(reject,e));});
 async function settle(p){let t;try{await Promise.race([Promise.resolve(p),new Promise((_,reject)=>{t=setTimeout(()=>reject(err('cleanup_timeout')),2000);})]);}catch(e){cleanupFailure=e?.code==='cleanup_timeout'?'cleanup_timeout':'cleanup_failed';throw err(cleanupFailure);}finally{clearTimeout(t);}}
 async function request(address,method='GET',body){
  check();const u=new URL(address),id=u.pathname.split('/').at(-1),planned=ledger.planned.find(x=>x.id===id&&x.sent);
  const get=method==='GET'&&u.origin==='https://www.googleapis.com'&&!u.searchParams.has('alt')&&((u.pathname==='/drive/v3/files/root')||planned&&u.pathname==='/drive/v3/files/'+id||u.pathname==='/drive/v3/files/generateIds'||u.pathname==='/drive/v3/files');
  const post=method==='POST'&&u.origin==='https://www.googleapis.com'&&(u.pathname==='/drive/v3/files'||u.pathname==='/upload/drive/v3/files'&&u.searchParams.get('uploadType')==='multipart');
  const patch=method==='PATCH'&&planned&&u.origin==='https://www.googleapis.com'&&body==='{"trashed":true}'&&u.pathname==='/drive/v3/files/'+id&&!u.searchParams.has('addParents')&&!u.searchParams.has('removeParents');
  if(!get&&!post&&!patch)throw err('route');if(++requests>40)throw err('request_budget');if(method!=='GET'&&++writes>4)throw err('write_budget');
  const local=new AbortController(),expire=setTimeout(()=>local.abort(err('request_timeout')),15000),signal=AbortSignal.any([aborter.signal,owner.signal,local.signal]);
  let pending=null,response=null,reader=null,finished=false;const chunks=[];
  try{
   pending=Promise.resolve(env.fetch(u.href,{method,body,signal,credentials:'omit',redirect:'error',cache:'no-store',headers:{Authorization:`Bearer ${owner.token}`,...(method==='GET'?{}:{'Content-Type':body instanceof Blob?body.type:'application/json'})}}));
   response=await race(pending,signal);check();if(!response.ok||method==='GET'&&response.status!==200){lastHTTPStatus=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;throw err('http');}reader=response.body?.getReader();if(!reader)throw err('body');let length=0;
   for(;;){const x=await race(reader.read(),signal);check();if(x.done){finished=true;break;}if(!(x.value instanceof Uint8Array))throw err('body');length+=x.value.length;responseBytes+=x.value.length;if(length>65536||responseBytes>1048576)throw err('byte_budget');chunks.push(x.value);}
   const raw=new Uint8Array(length);let p=0;for(const x of chunks){raw.set(x,p);p+=x.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}finally{raw.fill(0);}
  }finally{
   clearTimeout(expire);local.abort();try{if(!finished)await settle(Promise.resolve().then(()=>reader?reader.cancel():response?response.body?.cancel():pending?pending.then(r=>r.body?.cancel(),()=>undefined):undefined));}finally{try{reader?.releaseLock();}catch{}chunks.length=0;}
  }
 }
 const get=id=>{if(id!=='root'&&!ledger.planned.some(p=>p.id===id&&p.sent))throw err('id');return request(`https://www.googleapis.com/drive/v3/files/${id}?${query}`);};
 function rootOK(root){if(!idOK(root?.id)||root.mimeType!==folderMime||root.trashed!==false||root.driveId||root.ownedByMe!==true||root.capabilities?.canAddChildren!==true||!/^\d+$/.test(root.version||'')||(ledger.root&&root.id!==ledger.root.id))throw err('root');}
 function validate(meta,row){const intended=row.intent.metadata;if(!meta||meta.id!==row.id||!idOK(meta.id)||meta.name!==intended.name||meta.mimeType!==intended.mimeType||meta.ownedByMe!==true||meta.driveId||!/^\d+$/.test(meta.version||'')||typeof meta.trashed!=='boolean'||typeof meta.modifiedTime!=='string'||canonical(meta.parents)!==canonical(intended.parents)||canonical(meta.appProperties)!==canonical(intended.appProperties))throw err('metadata');if(row.role==='test-video-1'&&(String(meta.size)!==String(fixture.bytes)||meta.md5Checksum!==fixture.md5||meta.sha256Checksum!==fixture.sha256||meta.capabilities?.canDownload!==true))throw err('fixture_receipt');return meta;}
 async function children(folder){const p=new URLSearchParams({q:`'${folder.id}' in parents and trashed = false`,spaces:'drive',pageSize:'2',fields:'nextPageToken,incompleteSearch,files('+fields+')'});const value=await request(`https://www.googleapis.com/drive/v3/files?${p}`);const video=ledger.planned[1];if(value.incompleteSearch!==false||value.nextPageToken||!Array.isArray(value.files)||value.files.length>1||value.files.some(x=>!video.sent||x.id!==video.id||x.trashed!==false))throw err('children');for(const x of value.files)validate(x,video);return value.files;}
 const summary=()=>({done,passed:done&&!failure,code:failure,requests,responseBytes,writes,created:ledger?.created.length??0,planned:ledger?.planned.length??0,submitted:ledger?.planned.filter(x=>x.sent).length??0,captureStable,privateRecoveryRetained:true,sourceBound:current(),ownedCleanupSettled:cleanupFailure===null,genericUpstreamCleanup:'unknown',lastHTTPStatus,rawExported:false});
 const allowed=['binding','grant','run','existing_run','owner','ledger','root','route','id','request_budget','write_budget','cancelled','request_timeout','http','body','byte_budget','metadata','fixture_receipt','fixture_hash','generation','children','drift','cleanup_failed','cleanup_timeout','operation'];
 function execute(fn){if(started)throw err('operation');started=true;operation=(async()=>{try{check();await fn();done=true;return summary();}catch(e){failure=cleanupFailure??(allowed.includes(e?.code)?e.code:'uncertain');ledger.status='uncertain';try{save();}catch{}done=true;return summary();}finally{clean();}})();return operation;}
 function record(row,meta,status){const found=ledger.created.find(x=>x.id===row.id);if(found)found.metadata=meta;else ledger.created.push({id:row.id,role:row.role,metadata:meta});ledger.events.push({method:'GET',id:row.id,status});save();}
 async function captureBody(){const root=await get('root');rootOK(root);let baseline;
  for(let pass=0;pass<2;pass++){const rows=[];for(const row of ledger.planned.filter(x=>x.sent)){const metadata=validate(await get(row.id),row);rows.push({id:row.id,role:row.role,metadata});}for(const row of rows.filter(x=>x.role==='folder-a'))await children(row);if(baseline&&canonical(baseline)!==canonical(rows))throw err('drift');baseline=rows;}
  snapshot=clone(baseline);ledger.created=clone(baseline);ledger.status=baseline.length===2?'recovery-verified':'partial-recovery-verified';captureStable=true;save();
 }
 return Object.freeze({
  create(blob){return execute(async()=>{
   if(recoveryRun||ledger.planned.length)throw err('ledger');if(!(blob instanceof Blob)||blob.size!==fixture.bytes)throw err('fixture_hash');const raw=await blob.arrayBuffer();let digest;try{digest=await env.sha256(raw);}finally{new Uint8Array(raw).fill(0);}check();if(digest!==fixture.sha256)throw err('fixture_hash');
   const root=await get('root');rootOK(root);ledger.root=clone(root);save();const ids=await request('https://www.googleapis.com/drive/v3/files/generateIds?count=2&space=drive&type=files');if(ids.space!=='drive'||!Array.isArray(ids.ids)||ids.ids.length!==2||new Set(ids.ids).size!==2||!ids.ids.every(idOK)||ids.ids.includes(root.id))throw err('generation');
   ledger.planned=roles.map((role,i)=>({id:ids.ids[i],role,sent:false,intent:{method:'POST',route:i===0?'metadata-create':'multipart-create',metadata:expectedMeta(role,ids.ids[i],root.id,ids.ids[0]),fixtureSHA256:i===0?null:fixture.sha256,fixtureBytes:i===0?0:fixture.bytes}}));save();env.storage.setItem(pointerKey,JSON.stringify({run,accountId:owner.accountId,accountKey:owner.accountKey,source:binding.source}));check();
   for(const row of ledger.planned){check();row.sent=true;ledger.status='creating';ledger.events.push({method:'POST',id:row.id,status:'submitted'});save();let body,url;
    if(row.role==='folder-a'){body=JSON.stringify(row.intent.metadata);url=`https://www.googleapis.com/drive/v3/files?${query}`;}else{const boundary='drive_original_qa_'+run;body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(row.intent.metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,blob,`\r\n--${boundary}--\r\n`],{type:`multipart/related; boundary=${boundary}`});url=`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${query}`;}
    await request(url,'POST',body);const receipt=validate(await get(row.id),row);if(receipt.trashed)throw err('metadata');record(row,receipt,'confirmed');
   }ledger.status='complete';save();
  });},
  capture(){return execute(async()=>{if(!recoveryRun)throw err('ledger');await captureBody();});},
  cleanup(){return execute(async()=>{
   if(!recoveryRun)throw err('ledger');await captureBody();
   for(const row of [...ledger.planned].reverse().filter(x=>x.sent)){const before=validate(await get(row.id),row),saved=ledger.created.find(x=>x.id===row.id)?.metadata;if(row.role==='test-video-1'?canonical(before)!==canonical(saved):BigInt(before.version)<BigInt(saved.version))throw err('drift');if(before.trashed)continue;if(before.capabilities?.canTrash!==true)throw err('metadata');if(row.role==='folder-a'){if((await children(row)).length)throw err('children');if(canonical(validate(await get(row.id),row))!==canonical(before))throw err('drift');}
    ledger.events.push({method:'PATCH',id:row.id,status:'submitted',before:clone(before),intent:{trashed:true}});save();await request(`https://www.googleapis.com/drive/v3/files/${row.id}?${query}`,'PATCH','{"trashed":true}');const after=validate(await get(row.id),row);if(!after.trashed)throw err('metadata');record(row,after,'trash-confirmed');
   }ledger.status='cleanup-confirmed';captureStable=false;save();
  });},
  summary,privateText(){check();return JSON.stringify({ledger,snapshot,pointer:{key:pointerKey,value:env.storage.getItem(pointerKey)}});},privateTarget(){check();if(!captureStable||failure||ledger.created.length!==2)throw err('metadata');const row=ledger.created.find(x=>x.role==='test-video-1');const metadata=validate(row?.metadata,ledger.planned[1]);if(metadata.trashed)throw err('metadata');return {metadata:clone(metadata),account:{accountId:owner.accountId,authAccountKey:owner.accountKey}};},
  async clear(){stop();if(operation)await operation;clean();snapshot=null;ledger=null;for(const k of Object.keys(owner))owner[k]=null;return {released:true,privateRecoveryRetained:true};},cancel:stop
 });
}
