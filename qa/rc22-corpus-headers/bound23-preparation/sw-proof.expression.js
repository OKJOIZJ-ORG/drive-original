(()=>{'use strict';const __BINDING__=Object.freeze({...{"schema":"drive-original.corpus-header-source-binding/1","version":"1.22.0-rc.23","sourceCommit":"7591044adc1149391265b0e56a93a47252088a47","sourceSHA256":{"app.js":"ee10b3740adb32e88da46719aa1f4d7b38bb209242d4d328b70334d3c072bb2b","sw.js":"512551d52dc380fc3806d95c42f9059e5c4fbd3e8b4394e2750fc1b2c26349eb","version.json":"abf96cc0e625e0572939d645a68af1460999e8fd79deedf655a40c0db4667a10"}},sourceSHA256:Object.freeze({"app.js":"ee10b3740adb32e88da46719aa1f4d7b38bb209242d4d328b70334d3c072bb2b","sw.js":"512551d52dc380fc3806d95c42f9059e5c4fbd3e8b4394e2750fc1b2c26349eb","version.json":"abf96cc0e625e0572939d645a68af1460999e8fd79deedf655a40c0db4667a10"})});return (function(binding){
  const controller=navigator.serviceWorker.controller,result={done:false,accepted:false,staticAssetGET:0,mediaGET:0,metadataGET:0};let accepted=false;
  const pinned=()=>binding?.sourceCommit&&/^[a-f0-9]{40}$/.test(binding.sourceCommit)&&['app.js','sw.js','version.json'].every(k=>/^[a-f0-9]{64}$/.test(binding.sourceSHA256?.[k]??''));
  const current=()=>pinned()&&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'&&controller&&controller.state==='activated'&&navigator.serviceWorker.controller===controller&&APP_VERSION===binding.version;
  const get=()=>accepted&&current()?{controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:{...binding.sourceSHA256}}:null;
  (async()=>{
    if(!current())throw Error('SW_SOURCE_BINDING_REJECTED');
    const requestURL=new URL('runtime-config.js',location.href);requestURL.searchParams.set('qa-sw-runtime',crypto.randomUUID());const cacheKey=new URL('runtime-config.js',location.href).href;
    result.staticAssetGET++;const response=await fetch(requestURL.href,{cache:'no-store',redirect:'error'});
    if(response.status!==200||response.url!==requestURL.href||!current())throw Error('SW_RUNTIME_RESPONSE');const runtimeBytes=new Uint8Array(await response.arrayBuffer());runtimeBytes.fill(0);
    const matches=[];for(const key of await caches.keys()){if(!key.startsWith('drive-original-shell-'))continue;const record=await(await caches.open(key)).match(cacheKey);if(record?.url===requestURL.href)matches.push(key.slice('drive-original-shell-'.length));}
    if(matches.length!==1||matches[0]!==binding.version||!current())throw Error('SW_RUNTIME_CACHE_IDENTITY');
    for(const path of ['app.js','sw.js','version.json']){
      const url=new URL(path,location.href);result.staticAssetGET++;const response=await fetch(url.href,{cache:'no-store',redirect:'error'});if(response.status!==200||response.url!==url.href||!current())throw Error('SW_SOURCE_RESPONSE');
      const bytes=new Uint8Array(await response.arrayBuffer());try{if(bytes.length>2*1024*1024)throw Error('SW_SOURCE_LENGTH');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==binding.sourceSHA256[path])throw Error('SW_SOURCE_HASH_MISMATCH');}finally{bytes.fill(0);}
    }
    if(!current())throw Error('SW_SOURCE_OWNER');accepted=true;result.version=binding.version;result.sourcePinned=true;result.accepted=true;
  })().catch(e=>{result.failure=/^SW_[A-Z_]+$/.test(e?.message??'')?e.message:'SW_PROOF_FAILED';}).finally(()=>{result.done=true;});
  return {get,poll:()=>({...result}),clear(){accepted=false;}};
})(__BINDING__);})()
