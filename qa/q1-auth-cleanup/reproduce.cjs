'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const after=process.argv.includes('--after');
const baselineSource='776605b00da1b26537db72239cff9c5f217e012e';
const productBytes=file=>after?fs.readFileSync(path.join(root,file)):require('node:child_process').execFileSync('git',['show',`${baselineSource}:${file}`],{cwd:root});
const testFile=fs.readFileSync(path.join(root,'tests/sw.test.js'),'utf8');
const harness=testFile.slice(0,testFile.indexOf("test('401 refresh"))
  .replace("const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');",'const source = productSource;');
const {createWorker,tokenResponse}=new Function('require','__dirname','productSource',harness+'\nreturn {createWorker,tokenResponse};')(require,path.join(root,'tests'),productBytes('sw.js').toString());
const tick=()=>new Promise(resolve=>setTimeout(resolve,50));
(async()=>{
  const {openDriveQ1Source}=await import('data:text/javascript;base64,'+productBytes('media/drive-source.mjs').toString('base64'));
  const observations=[];
  for(const mode of after?['reject','pending','abandoned']:['reject','pending']){
    let release,current=true,cancelCalls=0;
    const stream=new ReadableStream({cancel(){cancelCalls++;return mode==='reject'?Promise.reject(new Error('fixture-cancel-failed')):new Promise(resolve=>{release=resolve;});}});
    const worker=createWorker(()=>new Response(stream,{status:401,headers:{'Content-Type':'application/json'}}));
    const messages=worker.addClient('A',(message,port)=>port.postMessage({...tokenResponse(message,'old'),requestCurrent:current}));
    worker.setToken('A','old');
    const caller=new AbortController();
    let outcome='pending';
    const pending=worker.request('A',{mediaOwner:'q1',sourceGeneration:3,signal:caller.signal}).response;
    pending.then(response=>{outcome=response.status;},()=>{outcome='rejected';});
    await tick();
    const beforeAbort=outcome,upstreamAbortedBeforeCaller=worker.calls[0].signal.aborted;
    if(!after||mode==='reject')caller.abort();
    current=after&&mode==='pending';
    await tick();
    const afterAbort=outcome;
    if(after)await pending;
    else if(release){release();await pending.catch(()=>{});}
    const record={mode,cancelCalls,beforeAbort,afterAbort,rangeRequests:worker.calls.length,tokenRequests:messages.filter(m=>m.type==='TOKEN_REQUEST').length,upstreamAbortedBeforeCaller,upstreamAborted:worker.calls[0].signal.aborted,
      pageOwnerClosed:!current,callerAbortDelivered:!after||mode==='reject'};
    if(after){
      // The abandoned old response need not reach the page. A newly current
      // source is denied by the SW fence even after shared credentials advance.
      current=true;worker.setToken('A','new',{revision:2});
      const next=await worker.request('A',{mediaOwner:'q1',sourceGeneration:4}).response;
      assert.equal(next.status,502);
      assert.equal(next.headers.get('X-Drive-Original-Q1-Cleanup'),'unconfirmed');
      const metadata={id:'fileA',size:'1000',mimeType:'video/mp4',modifiedTime:'fixture',headRevisionId:'rev1',trashed:false,capabilities:{canDownload:true}};
      const source=await openDriveQ1Source({fileId:'fileA',accountKey:'A-account',accountGeneration:1,isCurrent:()=>true,
        readMetadata:async()=>metadata,readRange:async()=>mode==='abandoned'?next:await pending});
      await assert.rejects(source.read({start:100,end:199}),/Q1_SOURCE_CLEANUP_UNCONFIRMED/);
      record.sourceCleanup=await source.abort();
      assert.equal(record.sourceCleanup.settled,false);
      record.nextRangeBlocked=worker.calls.length===1;
      record.oldFailureStatus=(await pending).status;
      record.oldResponseConsumedByPage=mode!=='abandoned';
      assert.equal(record.oldFailureStatus,502);
      if(release){release();await tick();}
      assert.equal(worker.calls.length,1,'late cleanup settlement cannot authorize replay');
    }else if(mode==='reject'){
      // A normally returned SW502 hides the failed remote cleanup from Q1.
      const metadata={id:'fileA',size:'1000',mimeType:'video/mp4',modifiedTime:'fixture',headRevisionId:'rev1',trashed:false,capabilities:{canDownload:true}};
      const source=await openDriveQ1Source({fileId:'fileA',accountKey:'A-account',accountGeneration:1,isCurrent:()=>true,
        readMetadata:async()=>metadata,readRange:async()=>await pending});
      await assert.rejects(source.read({start:100,end:199}),/Q1_SOURCE_HEADERS/);
      record.sourceCleanup=await source.abort();
      assert.equal(record.sourceCleanup.settled,true,'baseline hides upstream failure');
    }else{
      assert.equal(beforeAbort,'pending');assert.equal(afterAbort,'pending','caller abort does not settle a pending cancel');
    }
    assert.equal(worker.calls.length,1,'uncertain cleanup did not replay');
    observations.push(record);
  }
  const {createHash}=require('node:crypto');
  const sources=Object.fromEntries(['sw.js','media/drive-source.mjs','tests/sw.test.js','qa/q1-auth-cleanup/reproduce.cjs'].map(file=>[file,createHash('sha256').update(file==='sw.js'||file==='media/drive-source.mjs'?productBytes(file):fs.readFileSync(path.join(root,file))).digest('hex')]));
  // The original before.json is immutable; reruns of pinned old product bytes
  // get a separate record using this maintained driver.
  fs.writeFileSync(path.join(__dirname,after?'after.json':'before-recheck.json'),JSON.stringify({syntheticOnly:true,after,baselineSource:after?null:baselineSource,sources,observations},null,2)+'\n');
  console.log(JSON.stringify(observations));
})().catch(error=>{console.error(error);process.exitCode=1;});
