(()=>{
  const controller=navigator.serviceWorker.controller;
  const result={done:false,accepted:false,staticAssetGET:0,mediaGET:0,metadataGET:0};
  let version=null;
  const current=()=>controller&&controller.state==='activated'&&navigator.serviceWorker.controller===controller&&APP_VERSION==='1.22.0-rc.13';
  const requestURL=new URL('runtime-config.js',location.href);requestURL.searchParams.set('qa-sw-runtime',crypto.randomUUID());
  const cacheKey=new URL('runtime-config.js',location.href).href;
  const get=()=>current()&&version==='1.22.0-rc.13'?{controller,version}:null;
  const job=(async()=>{
    if(!current())throw Error('SW_RUNTIME_OWNER');
    result.staticAssetGET++;
    const response=await fetch(requestURL.href,{cache:'no-store'});
    if(!response.ok||response.status!==200||response.url!==requestURL.href||!current())throw Error('SW_RUNTIME_RESPONSE');
    await response.arrayBuffer();
    const matches=[];
    for(const key of await caches.keys()){
      if(!key.startsWith('drive-original-shell-'))continue;
      const cache=await caches.open(key),record=await cache.match(cacheKey);
      if(record?.url===requestURL.href)matches.push(key.slice('drive-original-shell-'.length));
    }
    if(matches.length!==1||matches[0]!=='1.22.0-rc.13'||!current())throw Error('SW_RUNTIME_CACHE_IDENTITY');
    version=matches[0];result.version=version;result.controllerActivated=true;result.sameController=true;result.accepted=true;
  })().catch(error=>{result.failure=/^SW_RUNTIME_[A-Z_]+$/.test(error?.message||'')?error.message:'SW_RUNTIME_FAILED';}).finally(()=>{result.done=true;});
  return{get,poll:()=>({...result}),clear:()=>{version=null;}};
})()
