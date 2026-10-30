// Pinned original bytes enter one short-lived local decoder; no URL/auth data.
export const HEIF_LIMITS=Object.freeze({inputBytes:32*1024*1024,pixels:16000000,timeoutMs:30000});
const HEIC_BRANDS=new Set(['heic','heix','hevc','hevx']);
export function isHeifHeader(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<16)return false;
  const tag=i=>String.fromCharCode(...bytes.subarray(i,i+4));
  const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(tag(4)!=='ftyp'||size<16||size%4!==0)return false;
  const brands=[tag(8)];for(let i=16;i+4<=Math.min(size,bytes.length,64);i+=4)brands.push(tag(i));
  return !brands.some(x=>x==='avif'||x==='avis')&&brands.some(x=>HEIC_BRANDS.has(x));
}

export function decodeHeifImage(blob,{signal}={}){
  return new Promise((resolve,reject)=>{
    let worker=null,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();worker=null;error?reject(error):resolve(value);};
    const fail=code=>finish(new Error(code));
    const abort=()=>fail('HEIF_CANCELLED');
    const timer=setTimeout(()=>fail('HEIF_TIMEOUT'),HEIF_LIMITS.timeoutMs);
    if(!(blob instanceof Blob)||!Number.isSafeInteger(blob.size)||blob.size<16||blob.size>HEIF_LIMITS.inputBytes){fail('HEIF_INPUT_LIMIT');return;}
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(async()=>{
      const head=new Uint8Array(await blob.slice(0,64).arrayBuffer());if(settled)return;
      if(!isHeifHeader(head)){fail('HEIF_FORMAT_UNSUPPORTED');return;}
      const bytes=await blob.arrayBuffer();if(settled)return;
      worker=new Worker(new URL('./heif-worker.js',import.meta.url));
      worker.onerror=event=>{event.preventDefault?.();fail('HEIF_WORKER_FAILED');};
      worker.onmessageerror=()=>fail('HEIF_WORKER_FAILED');
      worker.onmessage=({data})=>{
        if(data?.error){fail(/^HEIF_[A-Z_]+$/.test(data.error)?data.error:'HEIF_DECODE_FAILED');return;}
        if(!(data?.blob instanceof Blob)||data.blob.type!=='image/png'||data.blob.size<1||data.blob.size>HEIF_LIMITS.pixels*4+1048576
          ||!Number.isSafeInteger(data.width)||!Number.isSafeInteger(data.height)||data.width<1||data.height<1||data.width*data.height>HEIF_LIMITS.pixels
          ||!Number.isSafeInteger(data.sourceFrames)||data.sourceFrames<1){fail('HEIF_OUTPUT_INVALID');return;}
        finish(null,{blob:data.blob,width:data.width,height:data.height,sourceFrames:data.sourceFrames,frames:1,bitDepth:8,format:'png'});
      };
      worker.postMessage({bytes},[bytes]);
    }).catch(()=>fail('HEIF_DECODE_FAILED'));
  });
}
