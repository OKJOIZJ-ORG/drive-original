import test from 'node:test';
import assert from 'node:assert/strict';
import {openDriveQ1Source} from '../media/drive-source.mjs';

const base=()=>({id:'test-file',headRevisionId:'revision-1',size:'1000',mimeType:'video/mp2t',
  modifiedTime:'2026-09-27T00:00:00.000Z',capabilities:{canDownload:true},trashed:false,version:'1',sha256Checksum:'a'.repeat(64)});
function response(start=0,end=9,{total=1000,status=206,headers={},chunks=[new Uint8Array(end-start+1).fill(7)],onCancel=()=>{}}={}){
  const body=new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();},cancel:onCancel});
  return {status,headers:new Headers({'Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':String(end-start+1),...headers}),body};
}
const options=patch=>({fileId:'test-file',accountKey:'account-1',accountGeneration:2,readMetadata:async()=>base(),
  readRange:async({start,end})=>response(start,end),isCurrent:()=>true,...patch});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('fresh open/pre/post content fences release exact bytes while version-only changes succeed',async()=>{
  let version=0;const phases=[],ranges=[];
  const source=await openDriveQ1Source(options({readMetadata:async({phase,signal})=>{
    assert.equal(signal.aborted,false);phases.push(phase);return {...base(),version:String(++version)};
  },readRange:async request=>{ranges.push({...request,signal:null});return response(request.start,request.end);}}));
  assert.ok(Object.isFrozen(source)&&Object.isFrozen(source.identity));assert.equal(source.identity.version,'1');
  const bytes=await source.read({start:0,end:9});assert.deepEqual(bytes,new Uint8Array(10).fill(7));bytes.fill(0);
  assert.deepEqual(await source.read({start:10,end:19}),new Uint8Array(10).fill(7));
  assert.deepEqual(phases,['open','preflight','postflight','preflight','postflight']);
  assert.equal(ranges[0].range,'bytes=0-9');assert.equal(ranges.length,2);
  assert.equal(source.stats().readsCompleted,2);assert.equal(source.stats().releasedBytes,20);
  assert.equal(source.stats().retainedBytes,0);assert.equal(source.stats().peakRetainedBytes,10);source.abort();
});

test('postflight owns all bytes: none are released before matching metadata finishes',async()=>{
  const post=deferred();const source=await openDriveQ1Source(options({readMetadata:({phase})=>phase==='postflight'?post.promise:Promise.resolve(base())}));
  let done=false;const pending=source.read({start:0,end:9}).then(value=>{done=true;return value;});await flush();
  assert.equal(done,false);assert.equal(source.stats().releasedBytes,0);assert.equal(source.stats().retainedBytes,10);
  post.resolve(base());assert.equal((await pending).length,10);source.abort();
});

test('content changes and permission loss fail before range access, without adopting a new baseline',async()=>{
  for(const patch of [{headRevisionId:'revision-2'},{size:'1001'},{mimeType:'video/mp4'},
    {modifiedTime:'2026-09-28T00:00:00.000Z'},{sha256Checksum:'b'.repeat(64)},
    {sha256Checksum:undefined},{capabilities:{canDownload:false}},{trashed:true},{id:'other'}]){
    let reads=0;const source=await openDriveQ1Source(options({readMetadata:async({phase})=>phase==='open'?base():{...base(),...patch},
      readRange:async()=>{reads++;return response();}}));
    await assert.rejects(source.read({start:0,end:9}),/^Error: Q1_SOURCE_(CONTENT_DRIFT|PERMISSION|METADATA)$/);
    assert.equal(reads,0);assert.equal(source.stats().state,'failed');assert.equal(source.stats().retainedBytes,0);
    await assert.rejects(source.read({start:0,end:9}),/^Error: Q1_SOURCE_/);assert.equal(reads,0);
  }
});

test('postflight drift or metadata failure discards the full body and redacts provider errors',async()=>{
  for(const fail of [false,true]){
    const source=await openDriveQ1Source(options({readMetadata:async({phase})=>{
      if(phase==='postflight'){if(fail)throw new Error('private metadata detail');return {...base(),headRevisionId:'changed'};}return base();
    }}));
    await assert.rejects(source.read({start:0,end:9}),/^Error: Q1_SOURCE_(CONTENT_DRIFT|READ_FAILED)$/);
    assert.equal(source.stats().receivedBytes,10);assert.equal(source.stats().releasedBytes,0);assert.equal(source.stats().retainedBytes,0);
  }
});

test('checksum may be initially unavailable but becomes a strict fence once observed',async()=>{
  let calls=0;const source=await openDriveQ1Source(options({readMetadata:async()=>{
    calls++;return {...base(),sha256Checksum:calls===1?undefined:calls<5?'a'.repeat(64):'b'.repeat(64)};
  }}));
  assert.equal(source.identity.sha256Checksum,null);await source.read({start:0,end:9});assert.equal(source.stats().checksumBound,true);
  await assert.rejects(source.read({start:10,end:19}),/Q1_SOURCE_CONTENT_DRIFT/);assert.equal(source.stats().readsCompleted,1);
  for(const hash of ['',123,'x'.repeat(64),'a'.repeat(63)])
    await assert.rejects(openDriveQ1Source(options({readMetadata:async()=>({...base(),sha256Checksum:hash})})),/Q1_SOURCE_METADATA/);
});

test('malformed/missing/zero/short/overlong range headers cancel the opened body without consuming it',async()=>{
  for(const patch of [{status:200},{headers:{'Content-Range':'bytes 1-10/1000'}},
    {headers:{'Content-Range':'bytes 0-9/1001'}},{headers:{'Content-Length':'0'}},
    {headers:{'Content-Length':'9'}},{headers:{'Content-Length':'11'}},{headers:{'Content-Encoding':'gzip'}}]){
    let cancelled=0;const source=await openDriveQ1Source(options({readRange:async()=>response(0,9,{...patch,onCancel:()=>cancelled++})}));
    await assert.rejects(source.read({start:0,end:9}),/Q1_SOURCE_HEADERS/);await flush();
    assert.equal(cancelled,1);assert.equal(source.stats().receivedBytes,0);assert.equal(source.stats().cleanupPending,0);
  }
});

test('empty/short/long/error bodies fail without a successful postflight or escaping bytes',async()=>{
  for(const mode of ['empty','short','long','error','missing']){
    const phases=[];let body;
    const source=await openDriveQ1Source(options({readMetadata:async({phase})=>{phases.push(phase);return base();},readRange:async()=>{
      const result=response(0,9,{chunks:mode==='empty'?[]:[new Uint8Array(mode==='short'?9:mode==='long'?11:10)]});
      if(mode==='error')result.body=new ReadableStream({pull(controller){controller.error(new Error('private body detail'));}});
      if(mode==='missing')result.body=null;body=result.body;return result;
    }}));
    await assert.rejects(source.read({start:0,end:9}),/^Error: Q1_SOURCE_(BODY_LENGTH|BODY|READ_FAILED)$/);await flush();
    assert.equal(source.stats().releasedBytes,0);assert.equal(source.stats().retainedBytes,0);
    assert.deepEqual(phases,['open','preflight']);if(body)assert.equal(body.locked,false);
  }
});

test('safe exact offsets exceed4GiB, while invalid endpoints and >1MiB requests fail before callbacks',async()=>{
  const size=2**40,source=await openDriveQ1Source(options({readMetadata:async()=>({...base(),size:String(size)}),
    readRange:async({start,end,range})=>{assert.equal(range,`bytes=${start}-${end}`);return response(start,end,{total:size});}}));
  assert.equal((await source.read({start:2**32+1,end:2**32+10})).length,10);source.abort();
  for(const request of [{start:-1,end:9},{start:10,end:9},{start:0,end:1000},{start:0.5,end:1},
    {start:0,end:Number.MAX_SAFE_INTEGER+1},{start:0,end:1024*1024}]){
    let ranges=0;const next=await openDriveQ1Source(options({readMetadata:async()=>({...base(),size:String(size)}),readRange:async()=>{ranges++;return response();}}));
    if(request.end===1000)request.end=size;
    await assert.rejects(next.read(request),/Q1_SOURCE_RANGE/);assert.equal(ranges,0);assert.equal(next.stats().metadataRequests,1);
  }
});

test('concurrent reads terminalize both requests with no invisible queue',async()=>{
  const body=deferred();let ranges=0;
  const source=await openDriveQ1Source(options({readRange:()=>{ranges++;return body.promise;}}));
  const first=source.read({start:0,end:9});const rejected=assert.rejects(first,/Q1_SOURCE_CONCURRENT/);await flush();
  await assert.rejects(source.read({start:10,end:19}),/Q1_SOURCE_CONCURRENT/);await rejected;
  let cancelled=0;body.resolve(response(0,9,{onCancel:()=>cancelled++}));await flush();
  assert.equal(ranges,1);assert.equal(cancelled,1);assert.equal(source.stats().retainedBytes,0);
});

test('open and per-read deadlines settle even when injected callbacks ignore abort',async()=>{
  const never=new Promise(()=>{});
  await assert.rejects(openDriveQ1Source(options({requestTimeoutMs:15,readMetadata:()=>never})),/Q1_SOURCE_TIMEOUT/);
  const late=deferred();const source=await openDriveQ1Source(options({requestTimeoutMs:15,readRange:()=>late.promise}));
  await assert.rejects(source.read({start:0,end:9}),/Q1_SOURCE_TIMEOUT/);
  let cancelled=0;late.resolve(response(0,9,{onCancel:()=>cancelled++}));await flush();
  assert.equal(cancelled,1);assert.equal(source.stats().state,'failed');assert.equal(source.stats().retainedBytes,0);
  await assert.rejects(source.read({start:0,end:9}),/Q1_SOURCE_TIMEOUT|Q1_SOURCE_CLOSED/);
});

test('abort during body/postflight and account staleness cancel owners and suppress completion',async()=>{
  for(const mode of ['body','postflight','stale']){
    const controller=new AbortController(),gate=deferred();let current=true,body;
    const source=await openDriveQ1Source(options({signal:controller.signal,isCurrent:()=>current,
      readMetadata:async({phase})=>phase==='postflight'&&mode==='postflight'?gate.promise:base(),
      readRange:async()=>{const result=response();if(mode==='body')result.body=new ReadableStream({pull:()=>gate.promise});body=result.body;return result;}}));
    if(mode==='stale')current=false;
    const pending=source.read({start:0,end:9});const rejected=assert.rejects(pending,/Q1_SOURCE_(ABORTED|STALE)/);await flush();
    if(mode!=='stale')controller.abort();await rejected;gate.resolve(base());await flush();
    assert.equal(source.stats().retainedBytes,0);assert.equal(source.stats().releasedBytes,0);if(body)assert.equal(body.locked,false);
  }
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(openDriveQ1Source(options({signal:cancelled.signal})),/Q1_SOURCE_ABORTED/);
});

test('predicate reentry/abort/throw/async values cannot leak output or provider errors',async()=>{
  for(const mode of ['reenter','abort','throw','async']){
    let source,armed=false;const nested=[];
    source=await openDriveQ1Source(options({isCurrent:()=>{
      if(!armed)return true;armed=false;
      if(mode==='reenter')nested.push(source.read({start:10,end:19}).catch(()=>{}));
      if(mode==='abort')source.abort();if(mode==='throw')throw new Error('private owner detail');
      if(mode==='async')return Promise.reject(new Error('private promise'));return true;
    }}));armed=true;
    await assert.rejects(source.read({start:0,end:9}),/^Error: Q1_SOURCE_(CONCURRENT|ABORTED|OWNER_CHECK)$/);
    await Promise.all(nested);assert.equal(source.stats().retainedBytes,0);assert.equal(source.stats().releasedBytes,0);
  }
  await flush();
});

test('last ownership check after completed postflight still suppresses returned-byte metrics and reentry',async()=>{
  for(const mode of ['stale','abort','reenter']){
    let source,armed=false;const nested=[];
    source=await openDriveQ1Source(options({isCurrent:()=>{
      if(!armed||source.stats().receivedBytes!==10||source.stats().retainedBytes!==0)return true;
      armed=false;if(mode==='stale')return false;if(mode==='abort')source.abort();
      if(mode==='reenter')nested.push(source.read({start:10,end:19}).catch(()=>{}));return true;
    }}));armed=true;
    await assert.rejects(source.read({start:0,end:9}),/Q1_SOURCE_(STALE|ABORTED|CONCURRENT)/);
    await Promise.all(nested);assert.equal(source.stats().readsCompleted,0);assert.equal(source.stats().releasedBytes,0);
    assert.equal(source.stats().retainedBytes,0);
  }
});

test('unacknowledged or rejected external cancellation is reported, without retaining arrays or permitting retries',async()=>{
  for(const rejects of [false,true]){
    let reads=0,releases=0;const pending=deferred();
    const source=await openDriveQ1Source(options({readRange:async()=>({status:206,
      headers:new Headers({'Content-Range':'bytes 0-9/1000','Content-Length':'10'}),
      body:{getReader:()=>({read(){reads++;return pending.promise;},
        cancel(){return rejects?Promise.reject(new Error('private cancellation')):new Promise(()=>{});},releaseLock(){releases++;}})}})}));
    const reading=source.read({start:0,end:9}),rejected=assert.rejects(reading,/Q1_SOURCE_ABORTED/);await flush();source.abort();await rejected;await flush();
    assert.equal(source.stats().retainedBytes,0);assert.equal(source.stats().cleanupPending,rejects?0:1);
    assert.equal(source.stats().cleanupFailed,rejects);assert.equal(releases,rejects?1:0);
    await assert.rejects(source.read({start:0,end:9}),/Q1_SOURCE_/);assert.equal(reads,1);
    pending.resolve({done:true});await flush();
  }
});

test('body cancellation starts before transport abort so an abort-errored stream does not falsely fail cleanup',async()=>{
  const events=[];let reading=false;
  const source=await openDriveQ1Source(options({readRange:async({signal})=>({status:206,
    headers:new Headers({'Content-Range':'bytes 0-9/1000','Content-Length':'10'}),
    body:new ReadableStream({
      start(controller){signal.addEventListener('abort',()=>{events.push('abort');controller.error(new DOMException('Aborted','AbortError'));},{once:true});},
      pull(){reading=true;},
      cancel(){events.push('cancel');assert.equal(signal.aborted,false);}
    })})}));
  const pending=source.read({start:0,end:9}),rejected=assert.rejects(pending,/Q1_SOURCE_ABORTED/);
  await flush();assert.equal(reading,true);
  const cleanup=await source.abort();await rejected;
  assert.deepEqual(events,['cancel','abort']);
  assert.deepEqual(cleanup,{settled:true,pendingCallbacks:0,cleanupPending:0,cleanupFailed:false});
  assert.equal(source.stats().retainedBytes,0);assert.equal(source.stats().releasedBytes,0);
});

test('exact1MiB body is bounded and owned; each per-read abort signal also terminalizes the source',async()=>{
  const length=1024*1024,original=new Uint8Array(length).fill(3);
  const source=await openDriveQ1Source(options({readMetadata:async()=>({...base(),size:String(length)}),
    readRange:async()=>response(0,length-1,{total:length,chunks:[original]})}));
  const result=await source.read({start:0,end:length-1});original.fill(8);
  assert.equal(result.length,length);assert.equal(result[0],3);assert.equal(source.stats().peakRetainedBytes,length);source.abort();
  const controller=new AbortController(),next=await openDriveQ1Source(options({readRange:()=>new Promise(()=>{})}));
  const pending=next.read({start:0,end:9,signal:controller.signal}),rejected=assert.rejects(pending,/Q1_SOURCE_ABORTED/);
  await flush();controller.abort();await rejected;assert.equal(next.stats().state,'aborted');
});

test('per-read signal, hostile request accessors and unsupported options are fixed-code terminal failures',async()=>{
  for(const request of [{signal:{}},{get signal(){throw new Error('private signal');}},null]){
    const source=await openDriveQ1Source(options());await assert.rejects(source.read(request),/^Error: Q1_SOURCE_/);
    assert.equal(source.stats().state,'failed');assert.equal(source.stats().busy,false);
  }
  for(const patch of [{accountGeneration:-1},{fileId:'a/b'},{requestTimeoutMs:70001},{requestTimeoutMs:0},{isCurrent:null}])
    await assert.rejects(openDriveQ1Source(options(patch)),/^Error: Q1_SOURCE_OPTIONS$/);
});

test('shared abort completion waits for late Range response cancellation before permitting replacement',async()=>{
  const late=deferred(),cancelDone=deferred();let cancelled=0,finished=false;
  const source=await openDriveQ1Source(options({requestTimeoutMs:100,readRange:()=>late.promise}));
  const read=source.read({start:0,end:9}),rejected=assert.rejects(read,/Q1_SOURCE_ABORTED/);await flush();
  const cleanup=source.abort();assert.equal(source.abort(),cleanup);cleanup.then(()=>{finished=true;});
  await rejected;assert.equal(finished,false);assert.equal(source.stats().pendingCallbacks,1);
  late.resolve(response(0,9,{onCancel:()=>{cancelled++;return cancelDone.promise;}}));await flush();
  assert.equal(cancelled,1);assert.equal(finished,false);assert.equal(source.stats().cleanupPending,1);
  cancelDone.resolve();assert.deepEqual(await cleanup,{settled:true,pendingCallbacks:0,cleanupPending:0,cleanupFailed:false});
});

test('ignored metadata and rejected cancellation provide a bounded explicit no-replacement result',async()=>{
  const gate=deferred();const source=await openDriveQ1Source(options({requestTimeoutMs:15,
    readMetadata:({phase})=>phase==='open'?Promise.resolve(base()):gate.promise}));
  const reading=source.read({start:0,end:9}),rejected=assert.rejects(reading,/Q1_SOURCE_ABORTED/);await flush();
  const cleanup=source.abort();await rejected;
  assert.deepEqual(await cleanup,{settled:false,pendingCallbacks:1,cleanupPending:0,cleanupFailed:false});
  gate.resolve(base());await flush();
  const next=await openDriveQ1Source(options({readRange:async()=>response(0,9,{status:200,onCancel:()=>Promise.reject(new Error('private cancel'))})}));
  await assert.rejects(next.read({start:0,end:9}),/Q1_SOURCE_HEADERS/);
  const result=await next.abort();assert.equal(result.settled,false);assert.equal(result.cleanupFailed,true);
});

test('failed opening carries cleanup evidence when metadata ignores abort and no owner could be returned',async()=>{
  let error;try{await openDriveQ1Source(options({requestTimeoutMs:15,readMetadata:()=>new Promise(()=>{})}));}catch(value){error=value;}
  assert.equal(error.message,'Q1_SOURCE_TIMEOUT');
  assert.deepEqual(error.cleanup,{settled:false,pendingCallbacks:1,cleanupPending:0,cleanupFailed:false});
});

test('abort in response handoff microtasks cannot acknowledge cleanup before the opened body is cancelled',async()=>{
  for(const depth of [0,1,2,3,4,5]){
    let source,cancelled=0;const cancelDone=deferred();
    source=await openDriveQ1Source(options({requestTimeoutMs:100,readRange:()=>{
      let task=Promise.resolve();for(let i=0;i<depth;i++)task=task.then(()=>{});task.then(()=>source.abort());
      const result=response();result.body=new ReadableStream({cancel(){cancelled++;return cancelDone.promise;}});return result;
    }}));
    const reading=source.read({start:0,end:9}),rejected=assert.rejects(reading,/Q1_SOURCE_ABORTED/);await rejected;await flush();
    let done=false;const cleanup=source.abort().then(result=>{done=true;return result;});
    await flush();assert.equal(cancelled,1,`handoff depth ${depth}`);assert.equal(done,false);
    cancelDone.resolve();assert.equal((await cleanup).settled,true);
  }
});
