import {openDriveQ1Source} from '../../media/drive-source.mjs';
const error=code=>new Error('Q0_STREAM_'+code);
export function resolveRange(header,size){
  if(header==null)return {start:0,end:size-1,status:200};
  const m=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!m||(!m[1]&&!m[2]))throw error('RANGE');
  const number=s=>{const n=Number(s);if(!Number.isSafeInteger(n)||n<0)throw error('RANGE');return n;};
  let start,end;
  if(!m[1]){const suffix=number(m[2]);if(!suffix)throw error('RANGE');start=Math.max(0,size-suffix);end=size-1;}
  else{start=number(m[1]);end=m[2]?Math.min(size-1,number(m[2])):size-1;}
  if(start>=size||end<start)throw error('RANGE');
  return {start,end,status:206};
}

// One native source lifetime: all HTTP ranges share the same opening identity.
// Caller owns bounded metadata fetch/cancellation, credentials and lease checks.
// A cancelled active read can reopen only after settled cleanup, against the
// same private descriptor. A content/owner/cleanup failure retires every response.
export async function openNativeFence(options){
  const {chunkBytes=1048576,maxResponses=2,...sourceOptions}=options;
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>1048576||!Number.isSafeInteger(maxResponses)||maxResponses<1||maxResponses>4)throw error('OPTIONS');
  const lifetime=new AbortController();
  const sourceConfig={...sourceOptions,signal:lifetime.signal};
  if(sourceOptions.signal?.aborted)lifetime.abort();
  const externalAbort=()=>lifetime.abort();
  sourceOptions.signal?.addEventListener('abort',externalAbort,{once:true});
  let source;
  try{source=await openDriveQ1Source(sourceConfig);}catch(e){sourceOptions.signal?.removeEventListener('abort',externalAbort);throw e;}
  let pinned=source.identity;
  const size=Number(pinned.size),mime=pinned.mimeType;
  let stopped=false,cleanup=null,barrier=null,opening=null,activeEntry=null,tail=Promise.resolve(),deliveredBytes=0,reads=0,reopens=0;
  let lastSourceStats=source.stats(),pendingReads=0;
  const streams=new Set();
  function bind(observed){
    for(const key of ['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime','canDownload','trashed'])
      if(observed[key]!==pinned[key])throw error('CONTENT_CHANGED');
    if(pinned.sha256Checksum!==null&&observed.sha256Checksum!==pinned.sha256Checksum)throw error('CONTENT_CHANGED');
    if(pinned.sha256Checksum===null&&observed.sha256Checksum!==null)pinned=Object.freeze({...pinned,sha256Checksum:observed.sha256Checksum});
  }
  function detach(entry){entry.cancelled=true;entry.detach();streams.delete(entry);}
  function releaseSource(){
    if(barrier)return barrier;
    if(!source)return Promise.resolve({settled:true,pendingCallbacks:0,cleanupPending:0,cleanupFailed:false});
    const old=source;source=null;
    // Pin a checksum learned by a completed preflight even if its consumer left.
    try{bind(old.identity);}catch{stopped=true;}
    barrier=old.abort().then(result=>{lastSourceStats=old.stats();return result;});
    return barrier;
  }
  function retire(reason=error('RETIRED')){
    stopped=true;lifetime.abort();
    sourceOptions.signal?.removeEventListener('abort',externalAbort);
    sourceOptions.signal?.removeEventListener('abort',onAbort);
    for(const entry of [...streams]){try{entry.controller.error(reason);}catch{}detach(entry);}
    return cleanup||(cleanup=opening?opening.then(out=>out.next?out.next.abort():out.failure.cleanup||{settled:false,cleanupFailed:true}):releaseSource());
  }
  const current=()=>{if(stopped||sourceOptions.signal?.aborted||sourceOptions.isCurrent()!==true)throw error('OWNER_CHANGED');};
  const onAbort=()=>{void retire(error('ABORTED'));};
  sourceOptions.signal?.addEventListener('abort',onAbort,{once:true});
  const close=async()=>{sourceOptions.signal?.removeEventListener('abort',onAbort);return retire();};
  async function ready(){
    current();
    if(barrier){const result=await barrier;if(!result.settled){await retire(error('CLEANUP_UNSETTLED'));throw error('CLEANUP_UNSETTLED');}barrier=null;}
    current();
    if(!source){
      // Opening uses the lease lifetime signal so close while opening aborts it.
      let next;
      try{
        opening=openDriveQ1Source(sourceConfig).then(next=>({next}),failure=>({failure}));
        const outcome=await opening;opening=null;
        if(outcome.failure)throw outcome.failure;
        next=outcome.next;bind(next.identity);current();source=next;reopens++;
      }
      catch(e){if(next){source=next;}else if(e.cleanup&&!e.cleanup.settled){cleanup=Promise.resolve(e.cleanup);}await retire(error('REOPEN_FAILED'));throw e;}
    }
    current();
  }
  async function cancelEntry(entry,notify=false){
    if(entry.cancelled)return;
    if(notify)try{entry.controller.error(error('REQUEST_ABORTED'));}catch{}
    detach(entry);
    if(activeEntry===entry){
      const result=await releaseSource();
      if(!result.settled)await retire(error('CLEANUP_UNSETTLED'));
    }
  }
  function response({range=null,method='GET',signal}={}){
    try{current();}catch(e){void retire(e);throw e;}
    if(!['GET','HEAD'].includes(method))throw error('METHOD');
    const selection=resolveRange(range,size),length=selection.end-selection.start+1;
    const headers={'Content-Type':mime,'Content-Length':String(length),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
    if(selection.status===206)headers['Content-Range']=`bytes ${selection.start}-${selection.end}/${size}`;
    if(method==='HEAD')return new Response(null,{status:selection.status,headers});
    if(streams.size>=maxResponses)throw error('RESPONSE_LIMIT');
    let position=selection.start,entry;
    const abortRequest=()=>{void cancelEntry(entry,true);};
    const body=new ReadableStream({
      start(controller){entry={controller,cancelled:false,detach(){signal?.removeEventListener('abort',abortRequest);}};streams.add(entry);signal?.addEventListener('abort',abortRequest,{once:true});if(signal?.aborted)abortRequest();},
      async pull(controller){
        if(entry.cancelled)return;
        if(pendingReads>=maxResponses){controller.error(error('QUEUE_LIMIT'));detach(entry);return;}
        pendingReads++;
        const work=tail.then(async()=>{
          if(entry.cancelled)return;
          try{
            await ready();if(entry.cancelled)return;activeEntry=entry;
            const reading=source,end=Math.min(selection.end,position+chunkBytes-1);reads++;
            const bytes=await reading.read({start:position,end});bind(reading.identity);current();
            if(entry.cancelled)return;
            // Source read resolves only after exact-body consumption and postflight.
            controller.enqueue(bytes);deliveredBytes+=bytes.length;position=end+1;
            if(position>selection.end){controller.close();detach(entry);}
          }catch(e){
            const cancellation=entry.cancelled&&e?.message==='Q1_SOURCE_ABORTED';
            if(!cancellation)await retire(error('SOURCE_FAILED'));
            else if(barrier&&!(await barrier).settled)await retire(error('CLEANUP_UNSETTLED'));
          }finally{if(activeEntry===entry)activeEntry=null;}
        });
        tail=work.catch(()=>{});
        try{await work;}catch{await retire(error('SOURCE_FAILED'));}finally{pendingReads--;}
      },
      cancel(){return cancelEntry(entry);}
    },{highWaterMark:0});
    return new Response(body,{status:selection.status,headers});
  }
  return Object.freeze({response,close,stats:()=>({stopped,activeResponses:streams.size,pendingReads,reads,reopens,deliveredBytes,chunkBytes,source:source?.stats()||lastSourceStats,
    memoryScope:'one held source chunk; delivered/browser/consumer bytes excluded',genericUpstreamCleanup:'unknown'})});
}
