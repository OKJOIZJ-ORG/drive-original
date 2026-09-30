async function(){
  // Preserved derivative of root's actual v4 discriminator, not the old v1 producer.
  const deadline=(window.__mcpReuseDeliveryStarted??performance.now())+45000;
  while((typeof APP_VERSION==='undefined'||APP_VERSION!=='1.22.0-rc.25'||!navigator.serviceWorker.controller)&&performance.now()<deadline)await new Promise(r=>setTimeout(r,100));
  if(typeof APP_VERSION==='undefined'||APP_VERSION!=='1.22.0-rc.25'||!navigator.serviceWorker.controller)throw Error('MCP_REUSE_OFFLINE_SHELL_IDENTITY');
  if(globalThis.__DRIVE_ORIGINAL_RUNTIME__?.candidate!==true||DRIVE_MUTATIONS_ENABLED!==false||state.authAccountKey)throw Error('MCP_REUSE_OFFLINE_FLAGS');
  const errors=(window.__mcpReuseDeliveryErrors??[]).slice();if(errors.length)throw Error('MCP_REUSE_PAGE_ERRORS');
  const path='/.nojekyll?mcp-network-proof=rc25-postreload',controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000),started=performance.now();
  const onlineBeforeProbe=navigator.onLine;let probe={completed:false,status:null,errorName:null};
  try{const response=await fetch(path,{cache:'no-store',credentials:'omit',signal:controller.signal});probe.completed=true;probe.status=response.status;await response.body?.cancel();}
  catch(e){probe.errorName=e?.name==='TypeError'?'TypeError':e?.name==='AbortError'?'AbortError':'OTHER';}
  finally{clearTimeout(timer);probe.durationMs=Math.round(performance.now()-started);}
  if(probe.completed||probe.errorName!=='TypeError')throw Error('MCP_REUSE_NETWORK_BLOCK_NOT_PROVED');
  return {version:APP_VERSION,controlled:true,candidate:true,writes:false,accountPresent:false,
    onlineBeforeProbe,onlineAfterProbe:navigator.onLine,probe:{...probe,path,cache:'no-store',credentials:'omit'},pageErrors:errors,
    navigatorOnlineLimitation:'Can remain true after reload with the emulated network blocked; uncached same-path online control is separately required',
    freshContextProved:false,derivativeProducer:true};
}
