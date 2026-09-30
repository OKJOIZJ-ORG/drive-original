function(current, signal, seedIds) {
  const ids=new Set(seedIds),start=Date.now();let requests=0,bytes=0,pages=0,blocked=0;
  const fail=code=>Object.assign(new Error(code),{code});
  const check=()=>{if(signal.aborted||!current())throw fail('stale_owner');if(Date.now()-start>=30000)throw fail('time_limit');};
  const bounded=(promise,readSignal)=>new Promise((resolve,reject)=>{const abort=()=>reject(fail('cancelled'));readSignal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>readSignal.removeEventListener('abort',abort));if(readSignal.aborted)abort();});
  const read=async(address,options={})=>{
    check();const url=new URL(address),keys=[...url.searchParams.keys()].sort().join(',');
    const about=url.pathname==='/drive/v3/about'&&keys==='fields'&&url.searchParams.get('fields')==='user(permissionId)';
    const catalog=url.pathname==='/drive/v3/files'&&url.searchParams.get('spaces')==='appDataFolder'&&url.searchParams.get('pageSize')==='1000'
      &&url.searchParams.get('q')==="(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false"
      &&['nextPageToken,incompleteSearch,files(id,name,modifiedTime)','nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)'].includes(url.searchParams.get('fields'))
      &&[...url.searchParams.keys()].every(k=>['spaces','pageSize','q','fields','pageToken','orderBy'].includes(k))
      &&(!url.searchParams.has('orderBy')||url.searchParams.get('orderBy')==='modifiedTime desc');
    const body=/^\/drive\/v3\/files\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname)&&ids.has(url.pathname.split('/').pop())&&keys==='alt'&&url.searchParams.get('alt')==='media';
    if(url.origin!=='https://www.googleapis.com'||url.hash||url.username||url.password||options.method!=='GET'||options.headers||options.body!==undefined||!options.signal||!(about||catalog||body)){blocked++;throw fail('invalid_transport');}
    if(++requests>80||(catalog&&++pages>16))throw fail('request_limit');
    const response=await bounded(driveFetch(url.href,{method:'GET',signal:options.signal,driveNoRetry:true,driveMaxRateAttempts:1,redirect:'error',credentials:'omit',[ACCOUNT_STATE_READ]:true}),options.signal);check();
    if(!response.ok){await response.body?.cancel();throw fail('read_failed');}
    const reader=response.body?.getReader();if(!reader)throw fail('invalid_reader');const chunks=[];let length=0;
    try{for(;;){check();const r=await bounded(reader.read(),options.signal);check();if(r.done)break;bytes+=r.value.byteLength;length+=r.value.byteLength;if(bytes>8*1024*1024)throw fail('byte_limit');chunks.push(r.value);}}
    catch(e){void reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);raw.fill(0);
    if(catalog){const value=JSON.parse(text);if(value.incompleteSearch===true||!Array.isArray(value.files))throw fail('incomplete_catalog');for(const file of value.files){if(!/^[A-Za-z0-9_-]{1,200}$/.test(file.id)||!(file.name==='drive-original-account-state.json'||/^drive-original-account-state-v2-[A-Za-z0-9_-]+\.json$/.test(file.name)))throw fail('unexpected_file');if(seedIds.length&&!ids.has(file.id))throw fail('concurrent_change');ids.add(file.id);}if(ids.size>64)throw fail('file_limit');}
    check();return new Response(text,{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {read,summary:()=>({requests,bytes,pages,blocked,writes:0,namespaceAllowed:true,canonicalAccountStateRead:true})};
}
