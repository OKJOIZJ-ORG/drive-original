const WIDTH=524144,TOTAL=2*1024*1024;
const CODES=new Set(['OWNER_CHANGED','CANCELLED','RUN_DEADLINE','REQUEST_DEADLINE','REQUEST_FAILED','RESPONSE_STATUS',
  'RESPONSE_BODY','BODY_LIMIT','BYTE_BUDGET','REQUEST_BUDGET','METADATA_INVALID','IDENTITY_CHANGED','SOURCE_SHAPE',
  'RANGE_ENCODING','RANGE_LENGTH','RANGE_CONTENT_RANGE','CLEANUP_UNCERTAIN','ANALYZER_FAILED']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const parents=p=>Array.isArray(p)&&p.every(x=>typeof x==='string')?[...p].sort():null;
const fail=code=>{throw Error(code);};
const fields='id,name,size,mimeType,modifiedTime,parents,version,headRevisionId,md5Checksum,sha1Checksum,sha256Checksum,trashed,driveId,resourceKey,capabilities(canDownload)';
const decimal=s=>typeof s==='string'&&/^(0|[1-9][0-9]*)$/.test(s);

export function createCollector(runtime,analyzer,binding){
  let done=false,started=false,active=null,summary=null,cancelReason=null,runTimer=null,monitor=null;
  let mediaRequests=0,metadataRequests=0,totalBytes=0,rangeVisible=0,rangeHidden=0,cleanupSettled=true;
  const stop=reason=>{cancelReason=cancelReason||reason;active?.abort();};
  const check=()=>{if(cancelReason)fail(cancelReason);if(runtime.current()!==true)fail('OWNER_CHANGED');};
  const abort=()=>stop('CANCELLED');
  const race=(promise,signal)=>new Promise((resolve,reject)=>{
    const cancel=()=>reject(Error(cancelReason||'REQUEST_DEADLINE'));
    signal.addEventListener('abort',cancel,{once:true});
    Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',cancel);resolve(v);},()=>{signal.removeEventListener('abort',cancel);reject(Error('REQUEST_FAILED'));});
    if(signal.aborted)cancel();
  });
  async function request(media,range){
    check();if(media?++mediaRequests>2:++metadataRequests>5)fail('REQUEST_BUDGET');
    const controller=new AbortController();active=controller;
    const timer=setTimeout(()=>controller.abort(),10000);
    let response=null,reader=null,requestPromise=null,finished=false,body=null,chunks=[],returned=false;
    try{
      const file=runtime.file,url=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id));
      url.searchParams.set('supportsAllDrives','true');url.searchParams.set(media?'alt':'fields',media?'media':fields);
      const headers={Authorization:'Bearer '+runtime.token};
      if(file.resourceKey)headers['X-Goog-Drive-Resource-Keys']=file.id+'/'+file.resourceKey;
      if(media)headers.Range=`bytes=${range.start}-${range.end}`;
      requestPromise=Promise.resolve(runtime.fetch(url.href,{method:'GET',headers,signal:controller.signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}));
      response=await race(requestPromise,controller.signal);check();
      if(response.status!==(media?206:200))fail('RESPONSE_STATUS');
      if(!response.body)fail('RESPONSE_BODY');
      const expected=media?range.end-range.start+1:null;
      if(media){
        if(response.headers.get('content-encoding'))fail('RANGE_ENCODING');
        const length=response.headers.get('content-length'),cr=response.headers.get('content-range');
        if(length!==null&&(!decimal(length)||Number(length)!==expected))fail('RANGE_LENGTH');
        if(cr!==null){if(cr!==`bytes ${range.start}-${range.end}/${range.size}`)fail('RANGE_CONTENT_RANGE');rangeVisible++;}
        else{if(length===null||Number(length)!==expected)fail('RANGE_LENGTH');rangeHidden++;}
      }
      reader=response.body.getReader();let size=0;
      for(;;){
        const part=await race(reader.read(),controller.signal);check();
        if(part.done){finished=true;break;}
        if(!(part.value instanceof Uint8Array))fail('RESPONSE_BODY');
        size+=part.value.length;totalBytes+=part.value.length;
        if(totalBytes>TOTAL)fail('BYTE_BUDGET');
        if(size>(media?expected:65536))fail('BODY_LIMIT');
        chunks.push(part.value);
      }
      if(media&&size!==expected)fail('RANGE_LENGTH');
      body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}
      check();returned=true;return body;
    }finally{
      clearTimeout(timer);controller.abort();
      if(!finished){let cleanupTimer;try{
        const cancellation=reader?reader.cancel():response?.body?response.body.cancel():requestPromise?.then(r=>r.body?.cancel(),()=>{});
        await Promise.race([Promise.resolve(cancellation),new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(Error('CLEANUP_UNCERTAIN')),1000);})]);
      }catch{cleanupSettled=false;}finally{clearTimeout(cleanupTimer);}}
      try{reader?.releaseLock();}catch{cleanupSettled=false;}
      for(const chunk of chunks)chunk.fill(0);chunks.length=0;reader=null;response=null;requestPromise=null;active=null;
      if(!returned)body?.fill(0);
      if(!cleanupSettled){body?.fill(0);fail('CLEANUP_UNCERTAIN');}
    }
  }
  function descriptor(meta){
    if(!meta||typeof meta!=='object'||meta.trashed!==false||meta.capabilities?.canDownload!==true||
      !decimal(String(meta.size))||!Number.isSafeInteger(Number(meta.size))||Number(meta.size)<188||Number(meta.size)%188!==0||
      !decimal(meta.version)||typeof meta.headRevisionId!=='string'||!meta.headRevisionId||
      typeof meta.md5Checksum!=='string'||!/^[a-fA-F0-9]{32}$/.test(meta.md5Checksum)||!parents(meta.parents))fail('METADATA_INVALID');
    const file=runtime.file;
    if(meta.id!==file.id||meta.name!==file.name||String(meta.size)!==String(file.size)||meta.mimeType!==file.mimeType||
      meta.modifiedTime!==file.modifiedTime||!same(parents(meta.parents),parents(file.parents))||
      (meta.driveId||null)!==(file.driveId||null)||(meta.resourceKey||null)!==(file.resourceKey||null)||
      (file.version!=null&&String(file.version)!==meta.version))fail('IDENTITY_CHANGED');
    return {id:meta.id,name:meta.name,size:String(meta.size),mimeType:meta.mimeType,modifiedTime:meta.modifiedTime,
      parents:parents(meta.parents),version:meta.version,headRevisionId:meta.headRevisionId,md5Checksum:meta.md5Checksum,
      sha1Checksum:meta.sha1Checksum??null,sha256Checksum:meta.sha256Checksum??null,driveId:meta.driveId??null,resourceKey:meta.resourceKey??null};
  }
  async function metadata(){
    const bytes=await request(false);try{
      let meta;try{meta=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('METADATA_INVALID');}
      check();return descriptor(meta);
    }finally{bytes.fill(0);}
  }
  async function run(){
    if(started)return;started=true;let head=null,tail=null,output=null,failure=null;
    const events=['pagehide','beforeunload','visibilitychange'];
    try{
      check();runtime.accountSignal.addEventListener('abort',abort,{once:true});
      events.forEach(t=>runtime.events.addEventListener(t,abort));
      runtime.serviceWorkerEvents.addEventListener('controllerchange',abort);
      runTimer=setTimeout(()=>stop('RUN_DEADLINE'),60000);
      monitor=setInterval(()=>{try{check();}catch{stop('OWNER_CHANGED');}},100);
      const identity=await metadata(),sourceSize=Number(identity.size),width=Math.min(WIDTH,sourceSize),tailOffset=sourceSize-width;
      for(const start of [0,tailOffset]){
        if(!same(await metadata(),identity))fail('IDENTITY_CHANGED');
        const bytes=await request(true,{start,end:start+width-1,size:sourceSize});
        if(head===null)head=bytes;else tail=bytes;
        if(!same(await metadata(),identity))fail('IDENTITY_CHANGED');
      }
      check();output=await analyzer({headBytes:head,tailBytes:tail,sourceSize,tailOffset,headAtEof:width===sourceSize,
        tailAtEof:true,version:binding.version,sourceCommit:binding.sourceCommit});check();
    }catch(error){failure=CODES.has(error?.message)?error.message:'ANALYZER_FAILED';output=null;}
    finally{
      active?.abort();clearTimeout(runTimer);clearInterval(monitor);runTimer=null;monitor=null;
      runtime.accountSignal.removeEventListener('abort',abort);events.forEach(t=>runtime.events.removeEventListener(t,abort));
      runtime.serviceWorkerEvents.removeEventListener('controllerchange',abort);
      head?.fill(0);tail?.fill(0);head=null;tail=null;active=null;
      try{runtime.release();}catch{cleanupSettled=false;failure='CLEANUP_UNCERTAIN';output=null;}
      summary={complete:failure===null,failure,mediaRequests,metadataRequests,totalBytes,writeRequests:0,
        visibleExactContentRange:rangeVisible,corsHiddenKnownSizeLength:rangeHidden,
        cleanupSettled,privateBuffersReleased:true,analysis:output};done=true;runtime=null;
    }
  }
  return Object.freeze({run,poll:()=>({started,done,summary}),cancel:()=>{stop('CANCELLED');return {cancelled:true};}});
}
