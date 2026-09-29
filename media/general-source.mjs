import {CustomSource} from './mediabunny-q1.mjs';
const demand=(x,code)=>{if(!x)throw new Error(`GENERAL_${code}`);};
// Finite concurrent ownership, unlimited lifetime throughput. Discovery alone
// has a byte/request deadline; waiting for a paused MSE consumer has no timer.
export function createGeneralSource(source,{signal,isCurrent=()=>true,discoveryBytes=32*1024*1024,discoveryRequests=512,readTimeoutMs=30000}={}){
 demand(source?.identity&&typeof source.read==='function'&&typeof source.abort==='function','SOURCE');
 const size=Number(source.identity.size);demand(Number.isSafeInteger(size)&&size>0,'SIZE');
 const cache=new Map(),blockSize=65536,maxCache=262144;let retained=0,active=true,streaming=false,chain=Promise.resolve(),queued=0,closing;
 const metrics={requests:0,bytes:0,logicalReads:0,cacheHits:0,peakCache:0,inFlight:0,peakInFlight:0,peakQueued:0,discoveryBytes:0,discoveryRequests:0};
 const check=()=>demand(active&&!signal?.aborted&&isCurrent(),'CANCELLED');
 const close=()=>{if(!closing){active=false;cache.clear();retained=0;signal?.removeEventListener('abort',close);closing=Promise.resolve().then(()=>source.abort());}return closing;};
 async function block(start){check();const hit=cache.get(start);if(hit){cache.delete(start);cache.set(start,hit);metrics.cacheHits++;return hit;}
  const end=Math.min(size,start+blockSize)-1,length=end-start+1;
  if(!streaming){demand(metrics.discoveryBytes+length<=discoveryBytes&&metrics.discoveryRequests<discoveryRequests,'DISCOVERY_LIMIT');metrics.discoveryBytes+=length;metrics.discoveryRequests++;}
  metrics.requests++;metrics.bytes+=length;metrics.inFlight++;metrics.peakInFlight=Math.max(metrics.peakInFlight,metrics.inFlight);let timer;
  try{const bytes=await Promise.race([source.read({start,end}),new Promise((_,reject)=>{timer=setTimeout(()=>{void close();reject(new Error('GENERAL_READ_TIMEOUT'));},readTimeoutMs);})]);check();demand(bytes instanceof Uint8Array&&bytes.length===length,'READ_BODY');cache.set(start,bytes);retained+=length;while(retained>maxCache){const [key,b]=cache.entries().next().value;cache.delete(key);retained-=b.length;}metrics.peakCache=Math.max(metrics.peakCache,retained);return bytes;}
  finally{clearTimeout(timer);metrics.inFlight--;}
 }
 function request(start,end){check();demand(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>start&&end<=size,'READ_RANGE');demand(queued<4,'READ_QUEUE_LIMIT');queued++;metrics.peakQueued=Math.max(metrics.peakQueued,queued);
  const task=chain.catch(()=>{}).then(async()=>{check();const base=Math.floor(start/blockSize)*blockSize,b=await block(base);return b.slice(start-base,Math.min(end-base,b.length));}).finally(()=>queued--);chain=task;return task;
 }
 async function exact(start,length){demand(Number.isSafeInteger(length)&&length>0&&length<=4*1024*1024,'METADATA_LIMIT');const bytes=new Uint8Array(length);for(let p=0;p<length;){const b=await request(start+p,start+length);bytes.set(b,p);p+=b.length;}return bytes;}
 const custom=new CustomSource({getSize(){check();return size;},maxCacheSize:262144,prefetchProfile:'none',read(start,end){check();metrics.logicalReads++;demand(end-start<=4*1024*1024,'INPUT_SPAN_LIMIT');let p=start;return new ReadableStream({async pull(c){try{const bytes=await request(p,end);check();p+=bytes.length;c.enqueue(bytes);if(p===end)c.close();}catch(e){c.error(e);}}},{highWaterMark:1});},dispose:()=>{void close();}});
 signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)void close();
 return {custom,request,exact,check,size,metrics,beginStreaming(){check();streaming=true;},async cleanup(){const result=await close();await chain.catch(()=>{});return {...result,settled:result?.settled===true&&queued===0&&metrics.inFlight===0};}};
}
