function(){
  const result={online:navigator.onLine===true,pageId:1,temporaryGlobalsRemoved:true,profileClosed:false,
    cachesPurged:false,cookiesTouched:false,scope:'Restore page1 online; retain its anonymous candidate shell cache'};
  delete window.__mcpReuseDeliveryErrors;delete window.__mcpReuseDeliveryStarted;
  return result;
}
