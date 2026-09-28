  let etag=null;
  async function media(stage,condition=null){
    check();if(++summary.mediaRequests>3)throw fail('MEDIA_REQUEST_LIMIT');
    const child=new AbortController(),stop=()=>child.abort(abort.signal.reason||fail('CANCELLED'));
    abort.signal.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>child.abort(fail('MEDIA_TIMEOUT')),15000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const url=new URL('https://www.googleapis.com/drive/v3/files/'+fileSnapshot.id);
      url.searchParams.set('alt','media');url.searchParams.set('supportsAllDrives','true');
      const headers={Authorization:'Bearer '+owner.token,Range:'bytes=0-1'};
      if(fileSnapshot.resourceKey)headers['X-Goog-Drive-Resource-Keys']=fileSnapshot.id+'/'+fileSnapshot.resourceKey;
      if(condition!==null)headers['If-Match']=condition;
      pending=Promise.resolve(fetch(url.href,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',headers,signal:child.signal}));
      response=await race(pending,child.signal);check();
      const row={stage,status:response.status,bodyBytes:0};summary.results.push(row);
      if(response.status===412&&stage==='nonmatching'){row.rejected=true;return;}
      if(response.status!==206||!response.body)throw fail('MEDIA_RESPONSE');
      const cr=response.headers.get('Content-Range'),cl=response.headers.get('Content-Length');
      if((cr!==null&&cr!=='bytes 0-1/'+fileSnapshot.size)||(cr===null&&cl!=='2')||(cl!==null&&cl!=='2'))throw fail('MEDIA_RANGE_EVIDENCE');
      const observed=response.headers.get('ETag');
      if(stage==='baseline'){
        summary.etagExposed=observed!==null;
        summary.strongEtag=typeof observed==='string'&&observed.length<=512&&/^"[\x21\x23-\x7e]*"$/.test(observed);
        if(summary.strongEtag)etag=observed;
      }else if(observed!==null&&observed!==etag)throw fail('MEDIA_ETAG_CHANGED');
      reader=response.body.getReader();let length=0;
      for(;;){const item=await race(reader.read(),child.signal);check();if(item.done){eof=true;break;}
        if(!(item.value instanceof Uint8Array))throw fail('MEDIA_RESPONSE');
        length+=item.value.length;summary.mediaBytes+=item.value.length;
        if(length>2||summary.mediaBytes>6)throw fail('MEDIA_BYTE_LIMIT');
      }
      if(length!==2)throw fail('MEDIA_LENGTH');row.bodyBytes=length;row.rejected=false;
    }catch(error){
      if(child.signal.aborted)throw child.signal.reason;
      if(error?.name==='TypeError')throw fail('MEDIA_CORS_OR_NETWORK');
      throw error;
    }finally{
      clearTimeout(timer);abort.signal.removeEventListener('abort',stop);child.abort(fail('CANCELLED'));
      if(!eof){const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await bounded(cleanup,2000);}catch(error){cleanupFailed=error?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailed);}
      }
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';throw fail(cleanupFailed);}
    }
  }
  const execute=async()=>{
    try{
      await metadata({signal:abort.signal});await media('baseline');await metadata({signal:abort.signal});check();
      if(summary.strongEtag){
        await metadata({signal:abort.signal});await media('matching',etag);await metadata({signal:abort.signal});check();
        const wrong=etag==='"drive-original-qa-nonmatching-1"'?'"drive-original-qa-nonmatching-2"':'"drive-original-qa-nonmatching-1"';
        await metadata({signal:abort.signal});await media('nonmatching',wrong);await metadata({signal:abort.signal});check();
        summary.conditionalSupported=summary.results.at(-1).status===412;
      }
      summary.complete=true;
    }catch(error){summary.failure=/^(?:METADATA|LIST_IDENTITY|MEDIA|CLEANUP|OWNER|RUN|CANCELLED)[A-Z_]*$/.test(error?.code||error?.message||'')?error.code||error.message:'CONDITIONAL_DIAGNOSTIC_FAILED';}
    finally{
      clearTimeout(timeout);window.removeEventListener('pagehide',cancel);cancel();
      if(work.size)try{await bounded(Promise.allSettled([...work]),3000);}catch{cleanupFailed='CLEANUP_TIMEOUT';}
      if(cleanupFailed){summary.failure=cleanupFailed;summary.complete=false;}
      summary.sourceCleanup={settled:!cleanupFailed,scope:'local fetch/body callbacks only'};
      source=null;projection=null;owner=null;fileSnapshot=null;pinned=null;selected=null;swProof=null;etag=null;
      summary.localReferencesReleased=true;done=true;
    }
  };
  void execute();
  return Object.freeze({poll:()=>({done,summary:done?JSON.parse(JSON.stringify(summary)):null}),cancel});
}
