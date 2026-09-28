/* Public QA helper: no tokens or account metadata are emitted by its handle. */
function createDisposableJob(env, { cleanup = true, loseFirstMoveResponse = true, recoveryRun = null } = {}) {
  const initial = env.read();
  const safePage = value => value.productWrites===false && value.connected===true && value.usable===true && value.idle===true;
  if (!initial.accountId || !initial.authAccountKey || !initial.token || initial.identityPending || initial.demo || !safePage(initial)) throw new Error('QA_AUTH_OR_IDLE_REQUIRED');
  if(recoveryRun!==null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(recoveryRun)) throw new Error('QA_RECOVERY_RUN_INVALID');
  const run = recoveryRun || crypto.randomUUID();
  const prefix = `drive-original.qa.disposable.${run}.`;
  env = { ...env, prefix };
  const lifetime = new AbortController();
  const start = Date.now();
  const current = () => {
    const now = env.read();
    return !lifetime.signal.aborted && !initial.accountSignal?.aborted && Date.now()-start < 180000
      && ['accountId','authAccountKey','authGeneration','driveSessionGeneration','token','tokenRevision','sw'].every(k=>now[k]===initial[k])
      && !now.identityPending && !now.demo && safePage(now);
  };
  const assert = () => { if (!current()) throw new Error('QA_OWNER_CHANGED_OR_CANCELLED'); };
  const captureAccountStateRequest = () => ({ options:{signal:lifetime.signal}, current, assert });
  const state = { accountId:initial.accountId, authAccountKey:initial.authAccountKey, accountIdentityPending:false, demo:false, moveFolderRows:[] };
  const DRIVE_MUTATIONS_ENABLED = true; // QA closure only; page immutable false is never assigned.
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const navigator = env.navigator;
  const localStorage = {
    get length() { return keys().length; }, key(i) {return keys()[i]??null;},
    getItem(k) { if(!k.startsWith(prefix)) throw new Error('QA_STORAGE_SCOPE'); return env.storage.getItem(k); },
    setItem(k,v) { assert(); if(!k.startsWith(prefix)) throw new Error('QA_STORAGE_SCOPE'); env.storage.setItem(k,v); }
  };
  function keys() {const out=[];for(let i=0;i<env.storage.length;i++){const k=env.storage.key(i);if(k?.startsWith(prefix))out.push(k);}return out;}
  const showToast = () => {};
  const fields = 'id,version,parents,trashed,mimeType,capabilities(canTrash,canUntrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren),appProperties,ownedByMe,driveId';
  const folderMime = 'application/vnd.google-apps.folder';
  const roles = ['folder-a','folder-b','test-file'];
  const ledger = recoveryRun ? JSON.parse(env.storage.getItem(prefix+'recovery')) : {schema:1,run,accountId:initial.accountId,accountKey:initial.authAccountKey,created:[],planned:[],events:[],status:'prepared'};
  if(!ledger || ledger.schema!==1 || ledger.run!==run || ledger.accountId!==initial.accountId || ledger.accountKey!==initial.authAccountKey
    || !Array.isArray(ledger.planned) || !Array.isArray(ledger.created) || !Array.isArray(ledger.events)) throw new Error('QA_RECOVERY_LEDGER_INVALID');
  const admitted = new Map();
  let root = null, requests=0, writes=0, bytes=0, lost=false, progress='prepared', finished=false, outcome=null;
  const save = () => { assert(); env.storage.setItem(prefix+'recovery',JSON.stringify(ledger)); };
  const phase = name => {progress=name;ledger.status=name;save();};
  const idOK = id => typeof id==='string' && /^[A-Za-z0-9_-]{5,200}$/.test(id);
  const sameState = (a,b) => a.id===b.id && a.version===b.version && a.trashed===b.trashed && JSON.stringify(a.parents)===JSON.stringify(b.parents);
  const params = () => new URLSearchParams({supportsAllDrives:'true',fields});
  function validateMetadata(meta,id,role) {
    if(meta?.id!==id || meta.ownedByMe!==true || meta.driveId || !meta.version || typeof meta.trashed!=='boolean'
      || !Array.isArray(meta.parents) || meta.parents.length!==1 || !idOK(meta.parents[0])
      || meta.appProperties?.qaRun!==run || meta.appProperties?.qaRole!==role
      || meta.mimeType!==(role==='test-file'?'text/plain':folderMime)) throw new Error('QA_TAG_OR_METADATA_INVALID');
    const parent=meta.parents[0];
    if(parent!==root && !ledger.planned.some(row=>row.id===parent && row.role.startsWith('folder-'))) throw new Error('QA_PARENT_INVALID');
    return meta;
  }
  async function transport(url, options={}) {
    assert();
    const u = new URL(url), method=options.method||'GET';
    if(u.origin!=='https://www.googleapis.com' || u.username || u.password || u.hash) throw new Error('QA_URL_BLOCKED');
    if(!['GET','POST','PATCH'].includes(method)) throw new Error('QA_METHOD_BLOCKED');
    if(recoveryRun && method!=='GET') throw new Error('QA_RECOVERY_READ_ONLY');
    let body;
    try { body=options.body===undefined?undefined:JSON.parse(options.body); } catch {throw new Error('QA_BODY_BLOCKED');}
    const create = u.pathname==='/drive/v3/files' && method==='POST';
    const generate = u.pathname==='/drive/v3/files/generateIds' && method==='GET';
    const match = /^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
    const id=match?.[1];
    if(generate) {
      if(u.searchParams.toString()!=='count=3&space=drive&type=files' || body!==undefined || ledger.planned.length) throw new Error('QA_GENERATE_BLOCKED');
    } else {
      const allowed=['supportsAllDrives','fields', ...(method==='PATCH'?['addParents','removeParents']:[])];
      if([...u.searchParams.keys()].some(k=>!allowed.includes(k)) || new Set([...u.searchParams.keys()]).size!==[...u.searchParams.keys()].length
        || u.searchParams.get('supportsAllDrives')!=='true' || u.searchParams.get('fields')!==fields) throw new Error('QA_QUERY_BLOCKED');
      if(create) {
        const row=ledger.planned.find(row=>row.id===body?.id);
        if(!row || ledger.created.some(x=>x.id===row.id) || row.sent || writes>=3 || Object.keys(body).sort().join(',')!=='appProperties,id,mimeType,name,parents'
          || body.name!==`DriveOriginal-QA-${run}-${row.role}` || JSON.stringify(body.appProperties)!==JSON.stringify({qaRun:run,qaRole:row.role})
          || body.mimeType!==(row.role==='test-file'?'text/plain':folderMime) || JSON.stringify(body.parents)!==JSON.stringify([row.role==='test-file'?ledger.created.find(x=>x.role==='folder-a')?.id:root])) throw new Error('QA_CREATE_BLOCKED');
        row.sent=true;save();
      } else {
        if(!match || (id!=='root' && !ledger.planned.some(row=>row.id===id)) || (method!=='GET' && !admitted.has(id))) throw new Error('QA_ID_BLOCKED');
        if(method==='GET' && body!==undefined) throw new Error('QA_BODY_BLOCKED');
        if(method==='PATCH') {
          const before=admitted.get(id);
          if(ledger.planned.find(row=>row.id===id)?.role!=='test-file') throw new Error('QA_FOLDER_WRITE_BLOCKED');
          if(JSON.stringify(body)==='{}') {
            const target=u.searchParams.get('addParents');
            if(before.trashed || !admitted.has(target) || admitted.get(target).mimeType!==folderMime || admitted.get(target).trashed
              || u.searchParams.get('removeParents')!==before.parents.join(',')) throw new Error('QA_MOVE_BLOCKED');
          } else if(JSON.stringify(body)!=='{"trashed":true}' && JSON.stringify(body)!=='{"trashed":false}') throw new Error('QA_BODY_BLOCKED');
          else if(u.searchParams.has('addParents')||u.searchParams.has('removeParents')||body.trashed===before.trashed || (body.trashed===false && ledger.created.find(x=>x.id===id)?.role!=='test-file')) throw new Error('QA_TRASH_BLOCKED');
        }
      }
    }
    if(++requests>90 || writes>=12 || bytes>1500000) throw new Error('QA_BUDGET');
    if(method!=='GET') {writes++;ledger.events.push({method,id:body?.id||id,state:'submitted'});save();}
    const timer=setTimeout(()=>lifetime.abort(),20000);
    let response;
    try {
      const signal=options.signal?AbortSignal.any([lifetime.signal,options.signal]):lifetime.signal;
      if(signal.aborted) throw new Error('QA_OWNER_CHANGED_OR_CANCELLED');
      response=await env.fetch(url,{method,body:options.body,signal,redirect:'error',credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${initial.token}`,...(method==='GET'?{}:{'Content-Type':'application/json'})}});
      assert();
      if(!response.ok) throw Object.assign(new Error('QA_HTTP_REJECTED'),{status:response.status});
      const reader=response.body?.getReader();
      if(!reader) throw new Error('QA_RESPONSE_UNREADABLE');
      const chunks=[];let replyBytes=0;
      try {
        while(true) {
          assert();if(signal.aborted)throw new Error('QA_OWNER_CHANGED_OR_CANCELLED');
          const {done,value}=await reader.read();
          assert();if(signal.aborted)throw new Error('QA_OWNER_CHANGED_OR_CANCELLED');
          if(done)break;
          replyBytes+=value.byteLength;bytes+=value.byteLength;
          if(replyBytes>131072||bytes>1500000)throw new Error('QA_RESPONSE_BUDGET');
          chunks.push(value);
        }
      } catch(error) {await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
      const buffer=new Uint8Array(replyBytes);let offset=0;
      for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
      assert();if(signal.aborted)throw new Error('QA_OWNER_CHANGED_OR_CANCELLED');
      const meta=JSON.parse(text);
      if(method==='GET' && !generate) {
        if(id==='root') {
          if(!idOK(meta.id)||meta.mimeType!==folderMime||meta.trashed!==false||meta.driveId||meta.ownedByMe!==true||meta.capabilities?.canAddChildren!==true) throw new Error('QA_ROOT_INVALID');
          root=meta.id;
        } else {
          const role=ledger.planned.find(x=>x.id===id)?.role;
          admitted.set(id,validateMetadata(meta,id,role));
        }
      }
      if(method==='PATCH' && options.driveNoRetry && loseFirstMoveResponse && !lost && u.searchParams.has('addParents')) {lost=true;throw new Error('QA_INJECTED_RESPONSE_LOSS');}
      return Response.json(meta);
    } finally {clearTimeout(timer);}
  }
  async function driveFetch(url, options={}) {
    const u=new URL(url);
    // Enrich the exact canonical field selection with independent QA ownership checks.
    u.searchParams.set('fields',fields);
    return transport(u.href,options);
  }
  /* CANONICAL_CONTROLLER */
  const get = async id => (await transport(`${DRIVE_API}/files/${id}?${params()}`)).json();
  async function create(row) {
    const body={id:row.id,name:`DriveOriginal-QA-${run}-${row.role}`,mimeType:row.role==='test-file'?'text/plain':folderMime,
      parents:[row.role==='test-file'?ledger.created.find(x=>x.role==='folder-a').id:root],appProperties:{qaRun:run,qaRole:row.role}};
    try {await transport(`${DRIVE_API}/files?${params()}`,{method:'POST',body:JSON.stringify(body)});} catch(error) {
      // Create may already have applied. A known ID allows read-only recovery; never replay.
      ledger.events.push({method:'POST',id:row.id,state:'response-uncertain'});save();
    }
    const meta=await get(row.id);ledger.created.push({id:row.id,role:row.role,metadata:meta});save();return meta;
  }
  async function mutation(id,action,targetId=null) {
    const before=await get(id);
    const result=await executeDriveMutation(before,action,targetId?await get(targetId):null,{operationId:crypto.randomUUID()});
    const after=await get(id);
    if(!driveMutationPreStateMatches(result.metadata,driveMutationMetadata(after,id))) throw new Error('QA_POST_DRIFT');
    ledger.created.find(x=>x.id===id).metadata=after;save();return after;
  }
  async function restore(id) {
    const recorded=ledger.created.find(x=>x.id===id).metadata, before=await get(id);
    if(!sameState(recorded,before)||!before.trashed||before.capabilities?.canUntrash!==true) throw new Error('QA_RESTORE_DRIFT');
    try {await transport(`${DRIVE_API}/files/${id}?${params()}`,{method:'PATCH',body:'{"trashed":false}'});} catch { /* Read once, no replay. */ }
    const after=await get(id);
    if(after.trashed || JSON.stringify(after.parents)!==JSON.stringify(before.parents)) throw new Error('QA_RESTORE_UNCERTAIN');
    ledger.created.find(x=>x.id===id).metadata=after;save();
  }
  const cancel=()=>lifetime.abort();
  env.lifecycle?.addEventListener('pagehide',cancel,{once:true});
  const deadline=setTimeout(cancel,180000);
  const done=(async()=>{
    try {
      phase('root-read');await get('root');
      if(recoveryRun) {
        phase('recovery-read');
        if(ledger.planned.length!==3 || new Set(ledger.planned.map(row=>row.id)).size!==3
          || !ledger.planned.every((row,i)=>idOK(row.id)&&row.role===roles[i]&&typeof row.sent==='boolean')) throw new Error('QA_RECOVERY_LEDGER_INVALID');
        let verified=0,unknown=0;
        for(const row of ledger.planned) if(row.sent) {try{await get(row.id);verified++;}catch{unknown++;}}
        phase(unknown?'recovery-uncertain':'recovery-verified');
        outcome={ok:unknown===0,readOnlyRecovery:true,verified,unknown,requests,writes:0,recoveryRetained:true};return outcome;
      }
      const generated=await (await transport(`${DRIVE_API}/files/generateIds?count=3&space=drive&type=files`)).json();
      if(generated.space!=='drive'||(generated.kind!==undefined&&generated.kind!=='drive#generatedIds')||!Array.isArray(generated.ids)||generated.ids.length!==3||new Set(generated.ids).size!==3||!generated.ids.every(idOK)) throw new Error('QA_GENERATED_IDS_INVALID');
      ledger.planned=roles.map((role,i)=>({role,id:generated.ids[i],sent:false}));save();
      phase('creating');for(const row of ledger.planned)await create(row);
      const [a,b,file]=ledger.created;
      phase('move');await mutation(file.id,'move',b.id);
      phase('trash');await mutation(file.id,'trash');
      phase('restore');await restore(file.id);
      phase('move-back');await mutation(file.id,'move',a.id);
      if(cleanup) {phase('cleanup-trash');await mutation(file.id,'trash');}
      phase('complete');outcome={ok:true,roundTrip:true,testFileTrashed:cleanup,testFoldersRetained:2,created:3,requests,writes,responseLossVerified:lost};
    } catch(error) {
      // Error messages/status never include server text, IDs, names, account or token.
      outcome={ok:false,phase:progress,code:/^QA_[A-Z_]+$/.test(error.message)?error.message:'QA_CONTROLLER_UNCERTAIN',requests,writes,recoveryRetained:true};
    } finally {finished=true;clearTimeout(deadline);env.lifecycle?.removeEventListener('pagehide',cancel);}
    return outcome;
  })();
  return Object.freeze({recoveryRun:run,poll:()=>({finished,phase:progress,requests,writes,...(finished?{result:outcome}:{})}),done,cancel});
}
