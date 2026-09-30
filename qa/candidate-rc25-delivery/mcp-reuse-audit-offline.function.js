async function(){
  const until=(window.__mcpReuseDeliveryStarted??performance.now())+45000;
  while((typeof APP_VERSION==='undefined'||APP_VERSION!=='1.22.0-rc.25'||!navigator.serviceWorker.controller)&&performance.now()<until)await new Promise(r=>setTimeout(r,100));
  if(typeof APP_VERSION==='undefined'||APP_VERSION!=='1.22.0-rc.25'||!navigator.serviceWorker.controller||navigator.onLine!==false)throw Error('MCP_REUSE_OFFLINE_IDENTITY');
  if(globalThis.__DRIVE_ORIGINAL_RUNTIME__?.candidate!==true||DRIVE_MUTATIONS_ENABLED!==false||state.authAccountKey)throw Error('MCP_REUSE_OFFLINE_FLAGS');
  return {version:APP_VERSION,controlled:true,offline:true,candidate:true,writes:false,accountPresent:false,
    pageErrors:(window.__mcpReuseDeliveryErrors??[]).length,loadMs:Math.round((performance.now()-window.__mcpReuseDeliveryStarted)*1000)/1000,
    freshContextProved:false,scope:'Existing MCP profile offline reload; no actual account/media/device proof'};
}
