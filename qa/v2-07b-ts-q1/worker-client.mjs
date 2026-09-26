// QA-only main-side ACK bridge. SourceBuffer ownership stays on the main thread;
// the worker cannot process beyond an output until its consumer resolves.
const requireThat=(condition,code)=>{if(!condition)throw new Error(code);};
function deferred() {
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  promise.catch(()=>{});return {promise,resolve,reject};
}

export function createWorkerClient({sourceSize,generation=1,onFragment}) {
  requireThat(Number.isSafeInteger(generation)&&generation>0&&Number.isSafeInteger(sourceSize)&&sourceSize>0
    &&typeof onFragment==='function','WORKER_OPTIONS');
  const worker=new Worker(new URL('./transmux-worker.mjs',import.meta.url),{type:'module'});
  const ready=deferred();let request=null,aborting=null,sequence=0,offset=0,fragment=0,fragmentBusy=false;
  let inspection=null,inspectionSequence=0;
  let status='starting',failure=null,terminated=false,workerStats=null,lastConsumed=0;
  const counters={inputs:0,detachedInputs:0,transferredInputBytes:0,fragments:0,acks:0,peakPendingInputs:0};
  const timer=setTimeout(()=>fail('WORKER_READY_TIMEOUT'),10000);
  function stop() {clearTimeout(timer);if(!terminated){worker.terminate();terminated=true;}}
  function rejectPending(code) {const error=new Error(code);ready.reject(error);request?.reject(error);request=null;
    inspection?.reject(error);inspection=null;}
  function fail(code) {
    if(terminated)return;
    status='failed';failure=code;rejectPending(code);stop();aborting?.resolve();
  }
  function post(message,transfer=[]) {
    try{worker.postMessage({...message,generation},transfer);}catch{fail('WORKER_POST_FAILED');throw new Error('WORKER_POST_FAILED');}
  }
  function begin(type,extra={}) {
    requireThat(status==='open'&&!request&&!aborting,'WORKER_REQUEST_BUSY');
    const result=deferred();let timeout=null;
    const pause=()=>{clearTimeout(timeout);timeout=null;};
    const arm=()=>{pause();timeout=setTimeout(()=>fail('WORKER_REQUEST_TIMEOUT'),15000);};
    request={...result,type,...extra,
      arm,pause,resolve:value=>{pause();result.resolve(value);},
      reject:error=>{pause();result.reject(error);}};
    arm();
    return result.promise;
  }
  function abort() {
    if(aborting)return aborting.promise;
    if(terminated)return Promise.resolve();
    if(status==='finished'){stop();return Promise.resolve();}
    aborting={...deferred(),finishing:request?.type==='eof'&&offset===sourceSize};rejectPending('WORKER_ABORTED');
    const timeout=setTimeout(()=>{status='aborted-unconfirmed';stop();aborting.resolve();},2000);
    aborting.promise.then(()=>clearTimeout(timeout));
    try{post({type:'abort'});}catch{aborting.resolve();}
    return aborting.promise;
  }
  worker.onmessage=({data})=>{
    if(terminated||data?.generation!==generation)return;
    try{
      if(data.type==='ready'){
        requireThat(status==='starting','WORKER_UNEXPECTED_READY');clearTimeout(timer);status='open';ready.resolve();return;
      }
      if(data.type==='aborted'){
        requireThat(aborting,'WORKER_UNEXPECTED_ABORT');workerStats=data.stats||null;status='aborted';stop();aborting.resolve();return;
      }
      // A terminal reply can already be in transit when cancellation is sent.
      // Retain cleanup evidence without resolving the cancelled EOF as success.
      if(data.type==='error'){workerStats=data.stats||null;fail('WORKER_SESSION_FAILED');return;}
      if(aborting){
        if(data.type==='finished'){
          requireThat(aborting.finishing,'WORKER_UNEXPECTED_FINISH');
          workerStats=data.stats||null;status='aborted';stop();aborting.resolve();
        }
        return;
      }
      if(data.type==='inspection'){
        requireThat(inspection&&data.inspectionSequence===inspection.sequence&&data.stats?.generation===generation,
          'WORKER_INSPECTION_INVALID');
        const done=inspection;inspection=null;done.resolve(data.stats);return;
      }
      if(data.type==='fragment'){
        requireThat(status==='open'&&request&&!fragmentBusy&&data.fragmentSequence===fragment+1
          &&data.bytes instanceof ArrayBuffer&&data.bytes.byteLength>0&&data.bytes.byteLength<=2*1024*1024
          &&data.initIncluded===(fragment===0)&&Number.isSafeInteger(data.sourceConsumed)
          &&data.sourceConsumed>=lastConsumed&&data.sourceConsumed<=offset,'WORKER_FRAGMENT_INVALID');
        const fragmentSequence=data.fragmentSequence;
        // The consumer owns intentional backpressure (including pause) now.
        // The worker watchdog only runs while the worker can actually progress.
        request.pause();
        fragment=fragmentSequence;lastConsumed=data.sourceConsumed;fragmentBusy=true;counters.fragments++;
        Promise.resolve().then(()=>onFragment(data)).then(()=>{
          if(terminated||aborting)return;
          fragmentBusy=false;request?.arm();post({type:'ack',fragmentSequence});counters.acks++;
        }).catch(()=>{if(!terminated&&!aborting){rejectPending('WORKER_CONSUMER_FAILED');void abort();}})
          .finally(()=>{fragmentBusy=false;});
        return;
      }
      if(data.type==='input-done'){
        requireThat(request?.type==='input'&&!fragmentBusy&&data.sequence===request.sequence&&data.offset===offset,'WORKER_INPUT_ACK_INVALID');
        lastConsumed=data.offset;
        const done=request;request=null;done.resolve();return;
      }
      if(data.type==='finished'){
        requireThat(request?.type==='eof'&&!fragmentBusy&&offset===sourceSize,'WORKER_FINISH_INVALID');
        lastConsumed=offset;
        workerStats=data.stats;status='finished';const done=request;request=null;stop();done.resolve();return;
      }
      fail('WORKER_MESSAGE_INVALID');
    }catch{fail('WORKER_MESSAGE_INVALID');}
  };
  worker.onerror=event=>{event.preventDefault();fail('WORKER_RUNTIME_ERROR');};
  worker.onmessageerror=()=>fail('WORKER_MESSAGE_ERROR');
  post({type:'start',sourceSize});

  return {
    ready:ready.promise,
    push(bytes){
      requireThat(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=65536&&offset+bytes.length<=sourceSize,'WORKER_INPUT_INVALID');
      const next=sequence+1;const pending=begin('input',{sequence:next});
      const copy=Uint8Array.from(bytes);const start=offset;offset+=copy.length;sequence=next;
      counters.inputs++;counters.transferredInputBytes+=copy.length;counters.peakPendingInputs=1;
      post({type:'input',sequence,offset:start,bytes:copy.buffer},[copy.buffer]);
      requireThat(copy.byteLength===0,'WORKER_TRANSFER_NOT_DETACHED');counters.detachedInputs++;
      return pending;
    },
    finish(){requireThat(offset===sourceSize,'WORKER_EOF_SIZE');const pending=begin('eof');post({type:'eof'});return pending;},
    inspect(){
      requireThat(status==='open'&&request?.type!=='eof'&&!inspection&&!aborting&&!terminated,'WORKER_INSPECTION_BUSY');
      const result=deferred();const next=++inspectionSequence;
      const timeout=setTimeout(()=>fail('WORKER_INSPECTION_TIMEOUT'),2000);
      inspection={sequence:next,resolve:value=>{clearTimeout(timeout);result.resolve(value);},
        reject:error=>{clearTimeout(timeout);result.reject(error);}};
      post({type:'inspect',inspectionSequence:next});return result.promise;
    },
    abort,
    stats(){return {status,failure,terminated,fragmentBusy,sourceBytesOffered:offset,sourceBytesConsumed:lastConsumed,
      ...counters,worker:workerStats};}
  };
}
