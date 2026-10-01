// Only scanner-validated moov metadata is admitted. No top-level/mdat prefetch.
// Windows may contain skipped sample-table or unknown metadata, never parsed.
export function createMoovWindowCache({read,box,fileSize,signal,checkCurrent=()=>{},maxBytes=2*1024*1024,maxRequests=64}={}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 const start=Number(box?.offset),end=Number(box?.endExclusive),head=Number(box?.headerBytes),size=Number(fileSize),body=start+head,cache=new Map();
 const metrics={requests:0,receivedBytes:0,logicalReads:0,cacheHits:0,windowBytes:16384,released:false,sampleTableOrUnknownMetadataMayBePrefetched:true,sampleTablesParsed:false};
 if(typeof read!=='function'||![start,end,head,size].every(Number.isSafeInteger)||start<0||end>size||end<=body||Number(box?.size)!==end-start||![8,16].includes(head)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>64)fail('SPARSE_INVALID_BOUNDS');
 // A small moov is split too: never request its full body/container in one GET.
 const width=Math.min(16384,Math.max(1,Math.ceil((end-body)/2)));
 const check=()=>{if(metrics.released)fail('SPARSE_CACHE_RELEASED');if(signal?.aborted)fail('SPARSE_ABORTED');checkCurrent();};
 return Object.freeze({async read({start:a,end:b}){
  check();a=Number(a);b=Number(b);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<start||b<a||b>=end)fail('SPARSE_INVALID_BOUNDS');metrics.logicalReads++;
  if(a<body){if(b>=body)fail('SPARSE_INVALID_BOUNDS');return read({start:a,end:b});}
  const out=new Uint8Array(b-a+1);let p=a;
  while(p<=b){check();const lo=body+Math.floor((p-body)/width)*width,hi=Math.min(end,lo+width);let value=cache.get(lo);
   if(value){metrics.cacheHits++;}else{
    if(metrics.requests>=maxRequests)fail('SPARSE_REQUEST_LIMIT');if(metrics.receivedBytes+hi-lo>maxBytes)fail('SPARSE_BYTE_LIMIT');metrics.requests++;
    const bytes=await read({start:lo,end:hi-1});check();if(!(bytes instanceof Uint8Array)||bytes.length!==hi-lo)fail('SPARSE_READ_LENGTH');
    value=new Uint8Array(bytes);metrics.receivedBytes+=value.length;cache.set(lo,value);
   }
   const stop=Math.min(b+1,hi);out.set(value.subarray(p-lo,stop-lo),p-a);p=stop;
  }check();return out;
 },metrics:()=>({...metrics}),release(){for(const bytes of cache.values())bytes.fill(0);cache.clear();metrics.released=true;}});
}
