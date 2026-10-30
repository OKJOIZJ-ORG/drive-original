// Read-only complete subtree listing. Set __formatAuditRoot to {id,path} in an
// owned signed-in QA tab. Names/IDs remain private local audit evidence.
() => {
  if(!window.__formatAuditRoot?.id)throw new Error('AUDIT_ROOT_REQUIRED');
  document.title='Drive Original · 파일 형식 조사 중';
  const root=window.__formatAuditRoot;
  const a=window.__formatAudit={rootId:root.id,started:Date.now(),folders:[],files:[],queue:[root],errors:[],phase:'listing',controller:new AbortController()};
  a.task=(async()=>{
    const seen=new Set();
    while(a.queue.length){
      const folder=a.queue.shift();if(seen.has(folder.id))continue;seen.add(folder.id);a.folders.push(folder);
      let pageToken;
      do{
        const params=new URLSearchParams({q:`trashed=false and '${folder.id}' in parents`,pageSize:'1000',spaces:'drive',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,headRevisionId,resourceKey,capabilities(canDownload))'});
        if(pageToken)params.set('pageToken',pageToken);
        const r=await driveFetch(`${DRIVE_API}/files?${params}`,{signal:a.controller.signal}),data=await r.json();
        if(data.incompleteSearch)throw new Error('INCOMPLETE_SEARCH');
        for(const file of data.files||[]){
          if(file.mimeType==='application/vnd.google-apps.folder')a.queue.push({id:file.id,path:folder.path+'/'+file.name});
          else a.files.push({...file,folder:folder.path});
        }
        pageToken=data.nextPageToken;
      }while(pageToken);
    }
    a.phase='listed';
  })().catch(e=>{a.errors.push({name:e.name,message:e.message,status:e.status||0});a.phase='listing-error';});
  return {started:true};
}
