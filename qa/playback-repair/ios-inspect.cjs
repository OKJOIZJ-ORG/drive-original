// One bounded expression against the currently connected operating Safari tab.
// Expression/result files stay private when they contain file identities.
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const expressionPath = process.argv[2];
const resultPath = process.argv[3];
if (!expressionPath || !resultPath || fs.existsSync(resultPath)) throw new Error('New expression/result paths required');
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const started = Date.now(), deadline = started + 50000;
const result = { status:'FAIL', nativeTouchQualified:false };
let socket, objectId, sequence = 0;
const pending = new Map();
const screenshotPath = process.argv[4];
const targetId = process.argv[5];
function call(method, params={}, cleanup=false) {
  const timeout = cleanup ? 4000 : Math.min(42000, deadline-Date.now());
  if (timeout <= 0) return Promise.reject(new Error('Overall deadline'));
  return new Promise((resolve,reject) => {
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`));},timeout);
    pending.set(id,{resolve,reject,timer}); socket.send(JSON.stringify({id,method,params}));
  });
}
(async()=>{
  try {
    const targets = await (await fetch('http://127.0.0.1:9234/json/list',{signal:AbortSignal.timeout(5000)})).json();
    const matches=targets.filter(x=>x.type==='page' && x.url?.startsWith(origin+'/') && (!targetId||x.id===targetId));
    if(matches.length!==1) throw new Error('Exactly one operating Safari tab required');
    const ws=new URL(matches[0].webSocketDebuggerUrl);
    if(ws.hostname!=='127.0.0.1'||ws.port!=='9234') throw new Error('Unexpected socket');
    socket=new WebSocket(ws);
    socket.addEventListener('message',event=>{
      const msg=JSON.parse(String(event.data));
      const waiter=pending.get(msg.id);
      if(!waiter)return; clearTimeout(waiter.timer); pending.delete(msg.id);
      if(msg.error)waiter.reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
      else waiter.resolve(msg.result||{});
    });
    await once(socket,'open',{signal:AbortSignal.timeout(5000)});
    await call('Runtime.enable'); await call('Page.enable');
    objectId=(await call('Runtime.evaluate',{expression:'globalThis',returnByValue:false})).result?.objectId;
    if(!objectId)throw new Error('Global object unavailable');
    const expression=fs.readFileSync(expressionPath,'utf8').trim();
    const response=await call('Runtime.callFunctionOn',{objectId,
      functionDeclaration:`function(){return (${expression});}`,returnByValue:true,awaitPromise:true,userGesture:true});
    if(response.wasThrown||response.exceptionDetails){
      result.evaluationException={className:response.result?.className||null,type:response.result?.type||null};
      const privateRoot=path.resolve(__dirname,'../../../maintenance/tools/playback-repair');
      if(path.resolve(resultPath).toLowerCase().startsWith((privateRoot+path.sep).toLowerCase()))
        result.privateExceptionDescription=response.result?.description||response.exceptionDetails?.text||null;
      throw new Error('Page evaluation exception');
    }
    if(!Object.hasOwn(response.result||{},'value'))throw new Error('Missing serializable result');
    result.value=response.result.value; result.status='PASS';
    if(screenshotPath){const shot=await call('Page.captureScreenshot',{format:'png'});const bytes=Buffer.from(shot.data,'base64');
      if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new Error('Screenshot PNG expected');
      fs.writeFileSync(screenshotPath,bytes);result.screenshotBytes=bytes.length;}
  } catch(error){result.failure=String(error.message);}
  finally {
    if(socket?.readyState===WebSocket.OPEN){
      if(screenshotPath)try{const cleanup=await call('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return globalThis.__iosLocalUiCleanup?.()??true;}',returnByValue:true,awaitPromise:true},true);result.uiCleanup=cleanup.result?.value===true;if(!result.uiCleanup)result.status='FAIL';}catch{result.uiCleanup=false;result.status='FAIL';}
      if(objectId)try{await call('Runtime.releaseObject',{objectId},true);result.objectReleased=true;}catch{result.objectReleased=false;result.status='FAIL';}
      socket.close();try{await once(socket,'close',{signal:AbortSignal.timeout(2000)});result.socketClosed=true;}catch{result.socketClosed=false;result.status='FAIL';}
    }
    result.elapsedMs=Date.now()-started; result.observedAt=new Date().toISOString();
    fs.mkdirSync(path.dirname(resultPath),{recursive:true});fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status,elapsedMs:result.elapsedMs,failure:result.failure}));
    process.exitCode=result.status==='PASS'?0:1;
  }
})();
