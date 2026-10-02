'use strict';
// Known Git bytes bound memory; progress/total deadlines bound slow public archives.
async function verifiedDownload(url,expected,{fetchImpl=fetch,totalMs=120000,progressMs=15000}={}){
 const controller=new AbortController(),started=Date.now(),parts=[];let total=0,reader,timer;
 const deadline=setTimeout(()=>controller.abort(Error('DELIVERY_TOTAL_DEADLINE')),totalMs);
 async function bounded(promise){
  let abort;
  const stopped=new Promise((_,reject)=>{abort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();});
  try{return await Promise.race([promise,stopped,new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error('DELIVERY_NO_PROGRESS');controller.abort(error);reject(error);},progressMs);})]);}
  finally{clearTimeout(timer);timer=null;controller.signal.removeEventListener('abort',abort);}
 }
 try{
  const response=await bounded(fetchImpl(url,{cache:'no-store',signal:controller.signal}));
  if(response.status!==200)throw Error('DELIVERY_HTTP_'+response.status);
  reader=response.body?.getReader();if(!reader)throw Error('DELIVERY_BODY_REQUIRED');
  while(true){const chunk=await bounded(reader.read());if(chunk.done)break;
   total+=chunk.value.length;if(total>expected.length)throw Error('DELIVERY_SIZE_EXCEEDED');parts.push(Buffer.from(chunk.value));
  }
  const bytes=Buffer.concat(parts,total);if(!bytes.equals(expected))throw Error('DELIVERY_GIT_BYTE_MISMATCH');
  return {bytes:total,elapsedMs:Date.now()-started,totalBudgetMs:totalMs,noProgressBudgetMs:progressMs};
 }catch(error){error.delivery={bytesRead:total,expectedBytes:expected.length,elapsedMs:Date.now()-started};throw error;}
 finally{clearTimeout(deadline);clearTimeout(timer);controller.abort();
  if(reader){let cleanupTimer,settled=false;try{await Promise.race([reader.cancel().then(()=>{settled=true;},()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,5000);})]);}
   finally{clearTimeout(cleanupTimer);}if(!settled){const error=Error('DELIVERY_CLEANUP_UNSETTLED');error.delivery={bytesRead:total,expectedBytes:expected.length,elapsedMs:Date.now()-started};throw error;}}
 }
}
module.exports={verifiedDownload};
