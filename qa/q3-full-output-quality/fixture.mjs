// Adapted from q3-product-integration/fixture.mjs; only the QA output sink changes.
import {startGeneralWorker} from '../../media/general-owner.mjs';
import {probePinnedQ3Video} from '../../media/video-q3-pipeline.mjs';
const info=await(await fetch('/fixture-info.json')).json();
const identity=Object.freeze({accountKey:'synthetic',accountGeneration:1,fileId:'synthetic-q3',headRevisionId:info.sha256,size:info.size,mimeType:'video/mp4',modifiedTime:'fixed-fixture'});
function source(){let closed=false;return {identity,async read({start,end}){if(closed)throw Error('Q1_SOURCE_CANCELLED');const response=await fetch('/fixture.mp4',{headers:{Range:`bytes=${start}-${end}`}});if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${start}-${end}/${identity.size}`)throw Error('Q1_SOURCE_RANGE');return new Uint8Array(await response.arrayBuffer());},async abort(){closed=true;return {settled:true};}};}
let job;
window.cancelOwned=()=>job?.cancel();
window.capture=async()=>{
 const admission=await probePinnedQ3Video(source(),{nativeRejected:true});
 if(admission.route!=='q3')throw Error('Q3_ADMISSION');
 const windows=[];let bytes=0,chunks=0;
 job=startGeneralWorker({source:source(),generation:1,workerFactory:()=>new Worker('/media/video-q3-worker.mjs',{type:'module'}),onWindow:w=>windows.push(w),onChunk:async c=>{if(c.position!==bytes||bytes+c.bytes.length>134217728)throw Error('Q3_OUTPUT_BOUND');await window.saveChunk([...c.bytes],c.position);bytes+=c.bytes.length;chunks++;}});
 const result=await job.done;
 return {admission,windows,result,bytes,chunks};
};
