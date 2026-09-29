import {run} from './pipeline.mjs';
let controller,active=false;
self.onmessage=async({data})=>{
 if(data.type==='cancel'){controller?.abort();return}
 if(data.type!=='run'||active)return;
 active=true;controller=new AbortController();
 try{const result=await run({manifest:data.manifest,startTime:data.startTime,signal:controller.signal,
 readPacket:async(p,signal)=>{const r=await fetch('/fixture.mp4',{headers:{Range:`bytes=${p.start}-${p.start+p.size-1}`},signal});if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${p.start}-${p.start+p.size-1}/${data.manifest.inputBytes}`)throw Error('Q3_RANGE');return new Uint8Array(await r.arrayBuffer())},
 onFrame:async count=>{if(data.cancelAfter===count)controller.abort()},
 onChunk:async(bytes,position)=>{const b=bytes.slice();self.postMessage({type:'chunk',bytes:b,position},[b.buffer])}});self.postMessage({type:'done',result})}
 catch(e){self.postMessage({type:'error',error:e.message,metrics:e.metrics})}
 finally{active=false;controller=null;self.postMessage({type:'closed'})}
};
