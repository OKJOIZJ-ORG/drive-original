// Only caller-proven metadata spans may be prefetched. Never infer a span from distance.
export function createMetadataReadCache({read,start,endExclusive,signal,checkCurrent=()=>{},maxBytes=2*1024*1024,maxRequests=64}={}){
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const rootStart=BigInt(start),rootEnd=BigInt(endExclusive),cache=[];
  const metrics={requests:0,receivedBytes:0,logicalReads:0,cacheHits:0,released:false};
  if(typeof read!=='function'||rootStart<0n||rootEnd<=rootStart||rootEnd>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>64)fail('SPARSE_INVALID_ARGUMENT');
  const check=()=>{if(metrics.released)fail('SPARSE_CACHE_RELEASED');if(signal?.aborted)fail('SPARSE_ABORTED');checkCurrent();};
  return Object.freeze({
    async read({start:p,length,parentStart=rootStart,parentEndExclusive=rootEnd,prefetchEndExclusive}={}){
      check();p=BigInt(p);const lo=BigInt(parentStart),hi=BigInt(parentEndExclusive),wanted=p+BigInt(length);
      if(!Number.isSafeInteger(length)||length<1||lo<rootStart||hi>rootEnd||lo>p||wanted>hi)fail('SPARSE_INVALID_BOUNDS');
      metrics.logicalReads++;
      for(const item of cache)if(p>=item.start&&wanted<=item.end){metrics.cacheHits++;check();return item.bytes.slice(Number(p-item.start),Number(wanted-item.start));}
      // Prefetch is an explicit proof from the parser, clipped to its exact parent.
      let fetchEnd=prefetchEndExclusive===undefined?wanted:BigInt(prefetchEndExclusive);
      fetchEnd=fetchEnd>hi?hi:fetchEnd;
      if(fetchEnd<wanted)fail('SPARSE_INVALID_BOUNDS');
      const lengthToRead=Number(fetchEnd-p);
      if(!Number.isSafeInteger(lengthToRead)||lengthToRead<1||lengthToRead>1024*1024)fail('SPARSE_BYTE_LIMIT');
      if(metrics.requests>=maxRequests)fail('SPARSE_REQUEST_LIMIT');
      if(metrics.receivedBytes+lengthToRead>maxBytes)fail('SPARSE_BYTE_LIMIT');
      metrics.requests++;
      const pending=Promise.resolve().then(()=>{check();return read({start:p,end:fetchEnd-1n});});
      let value;
      if(!signal)value=await pending;
      else value=await new Promise((resolve,reject)=>{
        let settled=false;
        const finish=(fn,v)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(v);};
        const cancel=()=>finish(reject,Object.assign(new Error('SPARSE_ABORTED'),{code:'SPARSE_ABORTED'}));
        signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
        pending.then(v=>finish(resolve,v),e=>finish(reject,e));
      });
      check();if(!(value instanceof Uint8Array)||value.length!==lengthToRead)fail('SPARSE_READ_LENGTH');
      // Own a copy: parser consumers and upstream buffers cannot corrupt each other.
      const owned=new Uint8Array(value);metrics.receivedBytes+=owned.length;cache.push({start:p,end:fetchEnd,bytes:owned});
      return owned.slice(0,length);
    },
    metrics:()=>({...metrics}),
    release(){for(const item of cache)item.bytes.fill(0);cache.length=0;metrics.released=true;}
  });
}
