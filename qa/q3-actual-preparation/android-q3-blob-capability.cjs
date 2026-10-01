'use strict';
const fs=require('node:fs'),path=require('node:path');
const output='android-q3-blob-capability-safe.json';
if(fs.existsSync(path.join(__dirname,output)))throw Error('RESULT_ALREADY_EXISTS');
const log=console.log;console.log=s=>{const r=JSON.parse(s);log(JSON.stringify({completed:r.completed,failure:r.failure||null,steps:r.steps,ownedForwardRemoved:r.ownedForwardRemoved}));};
require('./android-common33.cjs')(__filename,output,async c=>{
 await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
 const result=await c.evaluateNative(`async()=>{
  if(APP_VERSION!=='1.22.0-rc.33'||!el.playerSheet.hidden||state.selected!==null||q1Playback||q0Playback||q1RetirementResult?.settled!==true||window.__q3TailOwned33)throw Error('BLOB_IDLE_ADMISSION');
  let worker,url,timer;const out={blobCreated:false,moduleImported:false,sourceOrCodecStarted:false};
  try{url=URL.createObjectURL(new Blob(["import {streamGeneralQ3} from 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/media/video-q3-pipeline.mjs';self.postMessage({moduleImported:typeof streamGeneralQ3==='function'});"],{type:'text/javascript'}));out.blobCreated=true;
   out.moduleImported=await new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);worker=new Worker(url,{type:'module'});worker.onmessage=e=>resolve(e.data?.moduleImported===true);worker.onerror=e=>{e.preventDefault();resolve(false);};});
  }finally{clearTimeout(timer);if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}if(url)URL.revokeObjectURL(url);out.ownedWorkerTerminated=!!worker;out.blobRevoked=!!url;out.timerCleared=true;}
  return out;
 }`);
 c.step('harmless owned module Worker feasibility',result);
 if(!result.moduleImported||!result.ownedWorkerTerminated||!result.blobRevoked)throw Error('BLOB_MODULE_UNAVAILABLE');
}).finally(()=>{console.log=log;}).catch(()=>{process.exitCode=1;});
