import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerClient } from './worker-client.mjs';

// Transport fault/race tests only; real worker/MSE evidence is owned by the
// separate Chrome driver. This stub preserves ArrayBuffer transfer semantics.
async function withClient(run,{onFragment=()=>{},postFailure=null}={}) {
  const Previous=globalThis.Worker;let transport;
  globalThis.Worker=class {
    constructor(){transport=this;this.sent=[];this.terminated=false;}
    postMessage(message,transfers){
      if(message.type===postFailure)throw new Error('private transport failure');
      this.sent.push(structuredClone(message,{transfer:transfers}));
    }
    terminate(){this.terminated=true;}
    deliver(message){this.onmessage({data:{generation:7,...message}});}
  };
  let client;
  try{
    client=createWorkerClient({sourceSize:188,generation:7,onFragment});
    transport.deliver({type:'ready'});await client.ready;
    await run(client,transport);
  }finally{
    if(client&&!client.stats().terminated){
      const abort=client.abort();transport.deliver({type:'aborted',stats:{state:'aborted'}});await abort;
    }
    globalThis.Worker=Previous;
  }
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('ACK post failure is sanitized, terminates and drains the consumer promise chain',async()=>{
  await withClient(async(client,transport)=>{
    const input=client.push(new Uint8Array(188));
    transport.deliver({type:'fragment',fragmentSequence:1,bytes:new ArrayBuffer(4),initIncluded:true,sourceConsumed:188});
    await assert.rejects(input,/^Error: WORKER_POST_FAILED$/);await turn();await turn();
    assert.equal(client.stats().status,'failed');assert.equal(client.stats().terminated,true);
    assert.equal(client.stats().acks,0);assert.equal(client.stats().fragmentBusy,false);
  },{postFailure:'ack'});
});

test('finished already in transit satisfies cancellation cleanup, never cancelled EOF success',async()=>{
  await withClient(async(client,transport)=>{
    const input=client.push(new Uint8Array(188));
    transport.deliver({type:'input-done',sequence:1,offset:188});await input;
    const end=client.finish();const abort=client.abort();
    transport.deliver({type:'finished',stats:{state:'finished',muxReleased:true}});
    await assert.rejects(end,/^Error: WORKER_ABORTED$/);await abort;
    assert.equal(client.stats().status,'aborted');assert.equal(client.stats().terminated,true);
    assert.equal(client.stats().worker.state,'finished');assert.equal(client.stats().worker.muxReleased,true);
  });
});

test('error already in transit preserves cleanup failure evidence during abort',async()=>{
  await withClient(async(client,transport)=>{
    const input=client.push(new Uint8Array(188));const abort=client.abort();
    transport.deliver({type:'error',stats:{state:'error',failure:'SESSION_CLEANUP_FAILED',muxReleased:true}});
    await assert.rejects(input,/^Error: WORKER_ABORTED$/);await abort;
    assert.equal(client.stats().status,'failed');assert.equal(client.stats().terminated,true);
    assert.equal(client.stats().worker.failure,'SESSION_CLEANUP_FAILED');
  });
});

test('inspection has one credit and stale generation cannot resolve or advance input',async()=>{
  await withClient(async(client,transport)=>{
    const inspected=client.inspect();
    assert.throws(()=>client.inspect(),/^Error: WORKER_INSPECTION_BUSY$/);
    transport.deliver({type:'inspection',generation:6,inspectionSequence:1,stats:{generation:6}});
    assert.equal(client.stats().inputs,0);assert.equal(client.stats().status,'open');
    const stats={generation:7,state:'open',consumed:0};
    transport.deliver({type:'inspection',inspectionSequence:1,stats});assert.deepEqual(await inspected,stats);
    const input=client.push(new Uint8Array(188));
    transport.deliver({type:'input-done',sequence:1,offset:188});await input;
    assert.equal(client.stats().sourceBytesConsumed,188);assert.equal(client.stats().detachedInputs,1);
    const end=client.finish();assert.throws(()=>client.inspect(),/^Error: WORKER_INSPECTION_BUSY$/);
    transport.deliver({type:'finished',stats:{state:'finished'}});await end;
    assert.equal(client.stats().status,'finished');assert.equal(client.stats().terminated,true);
  });
});

test('consumer rejection aborts and awaits worker cleanup without sending ACK',async()=>{
  await withClient(async(client,transport)=>{
    const input=client.push(new Uint8Array(188));
    transport.deliver({type:'fragment',fragmentSequence:1,bytes:new ArrayBuffer(4),initIncluded:true,sourceConsumed:188});
    await assert.rejects(input,/^Error: WORKER_CONSUMER_FAILED$/);await turn();
    assert.equal(transport.sent.at(-1).type,'abort');assert.equal(client.stats().acks,0);
    transport.deliver({type:'aborted',stats:{state:'aborted',muxReleased:true}});await client.abort();
    assert.equal(client.stats().worker.muxReleased,true);assert.equal(client.stats().fragmentBusy,false);
  },{onFragment:()=>Promise.reject(new Error('private consumer failure'))});
});
