(() => {
  const key='drive-original.qa.normal-update-journal.v1';
  let saved;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
  const rows=Array.isArray(saved?.rows)?saved.rows.slice(-255):[];const ordinal=(Number(saved?.ordinal)||0)+1;
  const listeners=[],seen=new WeakSet(),workerIds=new WeakMap();let workerSequence=0,timer=null,stopped=false,last='';
  const add=(stage,detail={})=>{if(stopped)return;if(rows.length>=256)rows.shift();rows.push({stage,document:ordinal,at:Date.now(),ms:Math.round(performance.now()),...detail});
    try{sessionStorage.setItem(key,JSON.stringify({ordinal,rows}));}catch{}};
  const listen=(node,type,fn)=>{if(stopped||listeners.length>=96)return;node.addEventListener(type,fn);listeners.push([node,type,fn]);};
  const workerId=w=>{if(!w)return null;if(!workerIds.has(w))workerIds.set(w,++workerSequence);return workerIds.get(w);};
  const watch=w=>{if(!w||seen.has(w))return;seen.add(w);const id=workerId(w);add('worker-observed',{worker:id,workerState:w.state});listen(w,'statechange',()=>add('worker-statechange',{worker:id,workerState:w.state}));};
  const sample=async()=>{if(stopped)return;let registrations=[];try{registrations=await navigator.serviceWorker.getRegistrations();}catch{add('registrations-unavailable');}if(stopped)return;
    const worker=navigator.serviceWorker.controller;watch(worker);
    for(const r of registrations){watch(r.active);watch(r.waiting);watch(r.installing);if(!seen.has(r)){seen.add(r);listen(r,'updatefound',()=>{add('updatefound');watch(r.installing);});}}
    let shells=[];try{shells=(await caches.keys()).filter(k=>/^drive-original-shell-1\.22\.0-rc\.(24|25)$/.test(k));}catch{}
    const safe={controller:Boolean(worker),controllerOrdinal:workerId(worker),controllerState:worker?.state??null,registrations:registrations.length,
      rootScope:registrations.every(r=>r.scope===new URL('./',location.href).href),active:registrations.map(r=>r.active?.state??null),
      activeOrdinals:registrations.map(r=>workerId(r.active)),installing:registrations.some(r=>r.installing),waiting:registrations.some(r=>r.waiting),shellVersions:shells.map(k=>k.slice('drive-original-shell-'.length))};
    const next=JSON.stringify(safe);if(next!==last){last=next;add('lifecycle-snapshot',safe);}
  };
  listen(navigator.serviceWorker,'controllerchange',()=>{add('controllerchange',{controller:Boolean(navigator.serviceWorker.controller),state:navigator.serviceWorker.controller?.state??null});void sample();});
  listen(document,'click',e=>{if(e.isTrusted&&e.target?.closest?.('#bannerUpdateButton'))add('trusted-banner-update-click');
    if(e.isTrusted&&e.target?.closest?.('#checkUpdateButton'))add('trusted-normal-version-check-click');});
  listen(window,'pagehide',()=>{add('pagehide');stopped=true;clearInterval(timer);for(const[n,t,f]of listeners)n.removeEventListener(t,f);listeners.length=0;});
  listen(window,'error',e=>add(e.target===window?'page-error':'resource-error',{resourceTag:e.target?.tagName??null}));
  listen(window,'unhandledrejection',()=>add('unhandled-rejection'));
  window.__normalUpdateJournal={read:()=>({ordinal,rows:rows.map(r=>({...r})),stopped}),clear:()=>{stopped=true;clearInterval(timer);for(const [n,t,f]of listeners)n.removeEventListener(t,f);listeners.length=0;sessionStorage.removeItem(key);return {journalReleased:true};}};
  add('document-start',{secure:isSecureContext});timer=setInterval(()=>void sample(),150);void sample();
})();
