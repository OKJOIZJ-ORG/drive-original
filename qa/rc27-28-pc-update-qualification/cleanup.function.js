function(){
  if(top!==self||location.origin!=='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev')throw Error('QA_ORIGIN_REQUIRED');
  const result=window.__rc28NormalUpdateJournal?.clear?.()??{observerReleased:true,journalAbsent:true};delete window.__rc28NormalUpdateJournal;
  return {...result,cdpPersistentScriptStillRequiresRemoval:true,cookiesPurged:false,appCachePurged:false,serviceWorkerUnregistered:false};
}
