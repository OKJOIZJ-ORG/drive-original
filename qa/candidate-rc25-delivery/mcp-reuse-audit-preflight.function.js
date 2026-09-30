async function(){
  if(location.href!=='about:blank')throw Error('MCP_REUSE_EXPECTED_PAGE1_BLANK');
  const result={pageId:1,aboutBlank:true,originOpaque:location.origin==='null',freshContextProved:false,
    serviceWorkerAPIAvailable:Boolean(navigator.serviceWorker),cacheAPIAvailable:typeof caches!=='undefined',
    registeredWorkers:null,cacheNames:null,inspectedCandidateOriginBeforeNavigation:false,
    scope:'Only existing MCP-owned page1; about:blank does not prove a fresh context or empty candidate-origin storage'};
  if(navigator.serviceWorker)try{result.registeredWorkers=(await navigator.serviceWorker.getRegistrations()).length;}catch{result.serviceWorkerInspection='OPAQUE_OR_UNAVAILABLE';}
  if(typeof caches!=='undefined')try{result.cacheNames=(await caches.keys()).filter(k=>k.startsWith('drive-original-shell-'));}catch{result.cacheInspection='OPAQUE_OR_UNAVAILABLE';}
  return result;
}
