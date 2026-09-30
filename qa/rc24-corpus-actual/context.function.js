async function (priorityName) {
const o=window.__driveNightCorpus,pin=o?.proof?.get();
if(!pin||APP_VERSION!=='1.22.0-rc.24'||state.authStatus!=='online'||!hasUsableToken()||state.selected||q1Playback||q1RetirementResult?.settled!==true)throw Error('CONTEXT_PREFLIGHT');
const account=state.accountId,generation=state.driveSessionGeneration,token=state.token,revision=state.tokenRevision;
const current=()=>state.accountId===account&&state.driveSessionGeneration===generation&&state.token===token&&state.tokenRevision===revision&&o.proof.get()?.controller===pin.controller;
let requests=0;async function get(url){if(!current())throw Error('CONTEXT_OWNER');const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{requests++;const r=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:c.signal});if(!r.ok)throw Error('CONTEXT_METADATA');const text=await r.text();if(text.length>2*1024*1024||!current())throw Error('CONTEXT_BODY');return JSON.parse(text);}finally{clearTimeout(t);}}
if(typeof priorityName!=='string'||priorityName.length>256)throw Error('CONTEXT_NAME');
const escaped=priorityName.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',"name='"+escaped+"' and trashed=false");u.searchParams.set('spaces','drive');u.searchParams.set('pageSize','100');u.searchParams.set('fields','files(id,parents),nextPageToken,incompleteSearch');
const found=await get(u.href);if(found.nextPageToken||found.incompleteSearch||found.files?.length!==1||found.files[0].parents?.length!==1)throw Error('CONTEXT_UNIQUE');
const priority=found.files[0],root=await get('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(priority.parents[0])+'?fields=id,mimeType,trashed,capabilities(canListChildren)&supportsAllDrives=true');
if(root.id!==priority.parents[0]||root.mimeType!=='application/vnd.google-apps.folder'||root.trashed!==false||root.capabilities?.canListChildren!==true||!current())throw Error('CONTEXT_ROOT');
o.context=JSON.stringify({accountKey:account,generation,rootId:root.id,priorityFileId:priority.id});
o.priority=priority.id;o.root=root.id;return{metadataGETs:requests,priorityExactNameUnique:true,prioritySingleParent:true,parentIsFolder:true,parentCanList:true,privateContextExported:false};
}
