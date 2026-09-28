(()=>{
  const native=globalThis.Worker,events=[],workers=[];
  let released=false;
  const safeCode=value=>typeof value==='string'&&/^[A-Z0-9_-]{1,96}$/.test(value)?value:null;
  const copyNumbers=(out,input,keys)=>{for(const key of keys)if(Number.isFinite(input?.[key]))out[key]=input[key];};
  const observe=event=>{
    const data=event.data;
    if(released||events.length>=128||!['ready','error','finished','aborted'].includes(data?.type))return;
    const row={type:data.type,elapsedMs:Date.now()-started};
    if(data.type==='error')row.code=safeCode(data.code);
    if(data.stats){
      const s=data.stats;row.state=typeof s.state==='string'?s.state:null;row.failure=safeCode(s.failure);
      copyNumbers(row,s,['consumed','inputSequence','fragments','acknowledged','peakInputBytes','peakOutputBytes','peakConfigBytes','peakInitBytes']);
      if(typeof s.muxReleased==='boolean')row.muxReleased=s.muxReleased;
      if(s.owner){row.owner={state:typeof s.owner.state==='string'?s.owner.state:null,failure:safeCode(s.owner.failure)};
        copyNumbers(row.owner,s.owner,['emittedIntervals','firstEmissionOffset']);
        if(s.owner.elementary){row.owner.elementary={};copyNumbers(row.owner.elementary,s.owner.elementary,['videoFrames','aacFrames']);}}
    }
    events.push(row);
  };
  const wrapper=new Proxy(native,{construct(target,args,newTarget){
    const worker=Reflect.construct(target,args,newTarget);
    try{const url=new URL(String(args[0]),location.href);
      if(!released&&workers.length<8&&url.origin===location.origin&&url.pathname==='/media/transmux-worker.mjs'){
        worker.addEventListener('message',observe);workers.push(worker);
      }}catch{}
    return worker;
  }});
  const started=Date.now();
  const clear=()=>{if(released)return;released=true;if(globalThis.Worker===wrapper)globalThis.Worker=native;
    for(const worker of workers)worker.removeEventListener('message',observe);workers.length=0;clearTimeout(timer);};
  globalThis.Worker=wrapper;const timer=setTimeout(clear,180000);
  return {poll:()=>({events:events.slice(),observedWorkers:workers.length,ownsWrapper:globalThis.Worker===wrapper,released}),clear};
})()
