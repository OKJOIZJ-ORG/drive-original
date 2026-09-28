'use strict';
// Public VM harness and synthetic interception semantics only. The source-side
// fetch abort rejects promptly while the independent SW request remains alive.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'tests/sw.test.js'),'utf8');
const prefix=source.slice(0,source.indexOf("test('401 refresh"));
const {createWorker,tokenResponse,partialResponse}=new Function('require','__dirname',prefix+'\nreturn {createWorker,tokenResponse,partialResponse};')(require,path.join(root,'tests'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const {openDriveQ1Source}=await import('../../media/drive-source.mjs');
  const observations=[];
  for(const mode of ['headers-late','credential-late']){
    const timers=new Map();let timerId=0,respondOld,oldPort,oldTokenMessage,started;
    const arrived=new Promise(resolve=>{started=resolve;});
    const worker=createWorker((_url,_options,attempt)=>{
      if(attempt===1&&mode==='headers-late'){started();return new Promise(resolve=>{respondOld=resolve;});}
      return partialResponse();
    },{setTimeoutImpl(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeoutImpl(id){timers.delete(id);}});
    let current=true;
    worker.addClient('A',(message,port)=>{
      if(mode==='credential-late'&&!oldPort){oldPort=port;oldTokenMessage=message;started();return;}
      port.postMessage({...tokenResponse(message,'old'),requestCurrent:current});
    });
    worker.setToken('A','old');
    const metadata={id:'fileA',size:'1000',mimeType:'video/mp4',modifiedTime:'fixture',headRevisionId:'rev1',trashed:false,capabilities:{canDownload:true}};
    let oldResponse;
    const q1=await openDriveQ1Source({fileId:'fileA',accountKey:'A-account',accountGeneration:1,isCurrent:()=>true,
      readMetadata:async()=>metadata,readRange:({signal})=>new Promise((resolve,reject)=>{
        oldResponse=worker.request('A',{mediaOwner:'q1',sourceGeneration:3}).response;
        oldResponse.then(resolve,reject);
        signal.addEventListener('abort',()=>reject(new DOMException('outer fetch aborted','AbortError')),{once:true});
      })});
    const read=q1.read({start:100,end:199});read.catch(()=>{});await arrived;
    current=false;
    const localCleanup=await q1.abort();await assert.rejects(read);
    assert.equal(localCleanup.settled,true);
    const pending401Fences=require('node:vm').runInContext('q1CleanupFences.size',worker.context);
    assert.equal(pending401Fences,0,'pending401 fences cannot see ownership before401 headers');
    // Q0 reads use the same proxy without mediaOwner=q1. The app's local
    // retirement result therefore permits a fresh upstream while old SW work
    // is still blocked at headers or the owner/token handshake.
    const q0=await worker.request('A',{sourceGeneration:4}).response;
    assert.equal(q0.status,206);
    const nextTransportStarted=true;
    if(mode==='headers-late'){
      respondOld(new Response(new ReadableStream({cancel:()=>new Promise(()=>{})}),{status:401}));
      await flush();
      const cleanupTimer=[...timers.values()].find(item=>item.delay===2000);assert.ok(cleanupTimer);cleanupTimer.callback();
      assert.equal((await oldResponse).status,502);
    }else{
      oldPort.postMessage({...tokenResponse(oldTokenMessage,'old'),requestCurrent:false});
      assert.equal((await oldResponse).status,401);
    }
    observations.push({mode,localCleanup,pending401Fences,nextTransportStarted,q0Status:q0.status,
      upstreamRequests:worker.calls.length,scope:'synthetic outer abort independent of SW request; not a new live browser assertion'});
  }
  const files=['sw.js','media/drive-source.mjs','app.js','tests/sw.test.js','qa/q1-auth-cleanup/cross-route-reproduce.cjs'];
  const sources=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  fs.writeFileSync(path.join(__dirname,'cross-route-before.json'),JSON.stringify({syntheticOnly:true,sources,observations},null,2)+'\n');
  console.log(JSON.stringify(observations));
})().catch(error=>{console.error(error);process.exitCode=1;});
