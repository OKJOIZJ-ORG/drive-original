async function diagnoseActualInventory() {
  const result={schema:'rc36-actual-inventory-diagnostic/1',productChanged:false,originalWrite:false,selectionRowsLimit:20,mediaInputs:0,requests:[]};
  const version=APP_VERSION,account=state.authAccountKey,generation=state.driveSessionGeneration,controller=navigator.serviceWorker.controller;
  const current=()=>APP_VERSION===version&&version==='1.22.0-rc.36'&&state.authAccountKey===account&&state.driveSessionGeneration===generation&&navigator.serviceWorker.controller===controller&&state.authStatus==='online'&&hasUsableToken()&&!state.selected;
  if(!current()||window.__rc36ActualColor||state.accountStateLoadingPromise||state.accountStateSyncPromise)throw Error('COLOR_DIAGNOSTIC_ADMISSION');
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),20000);let source;
  const json=async(url,signal)=>{const r=await driveFetch(url,{signal});result.requests.push({kind:'metadata',status:r.status});if(!r.ok)throw Error('COLOR_DIAGNOSTIC_METADATA_HTTP');return r.json();};
  try {
    const query=new URLSearchParams({q:"trashed=false and mimeType='video/mp4'",orderBy:'modifiedTime desc',pageSize:'20',spaces:'drive',corpora:'user',fields:'incompleteSearch,files(id,size,resourceKey,videoMediaMetadata(durationMillis))'});
    const list=await json(DRIVE_API+'/files?'+query,ac.signal);if(list.incompleteSearch)throw Error('COLOR_DIAGNOSTIC_INCOMPLETE');
    const file=list.files.find(f=>Number(f.size)===443834&&Number(f.videoMediaMetadata?.durationMillis)===5999);if(!file)throw Error('COLOR_DIAGNOSTIC_SAMPLE_CHANGED');
    const url=new URL(DRIVE_API+'/files/'+encodeURIComponent(file.id));url.searchParams.set('fields','id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');url.searchParams.set('supportsAllDrives','true');
    const {openDriveQ1Source}=await import('./media/drive-source.mjs');const {probePinnedGeneralTracks}=await import('./media/general-tracks.mjs');
    source=await openDriveQ1Source({fileId:file.id,accountKey:account,accountGeneration:generation,isCurrent:current,signal:ac.signal,requestTimeoutMs:10000,
      readMetadata:({signal})=>json(url.href,signal),
      readRange:async({range,signal})=>{const u=new URL(DRIVE_API+'/files/'+encodeURIComponent(file.id));u.searchParams.set('alt','media');u.searchParams.set('supportsAllDrives','true');
        const r=await driveFetch(u.href,{signal,driveNoRetry:true,driveMaxRateAttempts:1,headers:{Range:range,...(file.resourceKey?{'X-Goog-Drive-Resource-Keys':file.id+'/'+file.resourceKey}:{})}});
        result.requests.push({kind:'range',range,status:r.status,contentRange:r.headers.get('content-range'),contentLength:r.headers.get('content-length'),contentType:r.headers.get('content-type')});return r;}});
    const inventory=await probePinnedGeneralTracks(source,{signal:ac.signal,isCurrent:current});
    result.inventory={kind:inventory.kind,reason:inventory.reason??null,audioTracks:inventory.audioTracks.map(t=>({id:t.trackId,codec:t.codec,route:t.route,reason:t.reason})),cleanup:inventory.cleanup,reads:inventory.reads};result.completed=true;
  }catch(e){result.completed=false;result.failure=/^(?:Q1_SOURCE|GENERAL|COLOR_DIAGNOSTIC)_[A-Z0-9_]+$/.test(e.message)?e.message:'UNCLASSIFIED_SAFE_ERROR';result.cleanup=e.cleanup??null;result.reads=e.reads??null;}
  finally{clearTimeout(timer);if(source)result.finalSourceCleanup=await source.abort();ac.abort();result.ownerCurrent=current();result.playerUntouched=!state.selected&&el.playerSheet.hidden;}
  return result;
}
