import {startGeneralWorker} from '../../media/general-owner.mjs';
import {probePinnedQ3Video} from '../../media/video-q3-pipeline.mjs';
const info=await(await fetch('/fixture-info.json')).json();
const identity=Object.freeze({accountKey:'synthetic',accountGeneration:1,fileId:'synthetic-q3',headRevisionId:info.sha256,size:info.size,mimeType:'video/mp4',modifiedTime:'fixed-fixture'});
let job;
window.cancelOwned=()=>job?.cancel();
window.capture=async()=>{
 let readMs=0,sourceAborts=0,sourceReads=0,bytes=0,chunks=0;const windows=[];
 function source(){let closed=false;return {identity,async read({start,end}){if(closed)throw Error('Q1_SOURCE_CANCELLED');const t=performance.now();try{const r=await fetch('/fixture.mp4',{headers:{Range:`bytes=${start}-${end}`}});if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${start}-${end}/${identity.size}`)throw Error('Q1_SOURCE_RANGE');sourceReads++;return new Uint8Array(await r.arrayBuffer());}finally{readMs+=performance.now()-t;}},async abort(){if(!closed)sourceAborts++;closed=true;return {settled:true};}};}
 const admission=await probePinnedQ3Video(source(),{nativeRejected:true});if(admission.route!=='q3')throw Error('Q3_ADMISSION');const started=performance.now();
 job=startGeneralWorker({source:source(),generation:1,targetTime:170,workerFactory:()=>new Worker('/media/video-q3-worker.mjs',{type:'module'}),onWindow:w=>windows.push(w),onChunk:c=>{if(c.position!==bytes)throw Error('Q3_OUTPUT_POSITION');bytes+=c.bytes.length;chunks++;}});
 const result=await job.done;return {admission,windows,result,bytes,chunks,workerElapsedMs:performance.now()-started,pageSource:{readMs,sourceReads,sourceAborts}};
};
