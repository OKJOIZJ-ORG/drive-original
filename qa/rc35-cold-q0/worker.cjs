'use strict';
const {reducer,selectWorker}=require('../rc32-q0-byte-acceptance/worker-network.cjs');
const crypto=require('node:crypto');
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const bounded=async p=>{let t;try{return await Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(Error('COLD_CDP_DEADLINE')),5000);})]);}finally{clearTimeout(t);}};
async function preparePage(c){
 let port,browser,pageSession,browserSession,disposed=false,last;
 async function stop(){if(disposed)return last;disposed=true;let pageDetached=!pageSession,browserDetached=!browserSession,disconnected=!browser,forwardRemoved=!port;
  try{if(pageSession){await pageSession.detach();pageDetached=true;}}catch{}
  try{if(browserSession){await browserSession.detach();browserDetached=true;}}catch{}
  try{if(browser){await browser.close();disconnected=true;}}catch{}
  try{if(port){c.adb(['forward','--remove','tcp:'+port]);forwardRemoved=true;}}catch{}
  return last={disposed:true,ownedPageDetached:pageDetached,ownedBrowserSessionDetached:browserDetached,ownedConnectionDisconnected:disconnected,ownedForwardRemoved:forwardRemoved};}
 try{
  port=Number(c.adb(['forward','tcp:0','localabstract:chrome_devtools_remote']));if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('COLD_FORWARD');
  browser=await require('../node_modules/playwright').chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000});
  const pages=browser.contexts().flatMap(x=>x.pages()).filter(p=>{try{return new URL(p.url()).origin===ORIGIN;}catch{return false;}});if(pages.length!==1)throw Error('COLD_PAGE_COUNT');
  pageSession=await bounded(pages[0].context().newCDPSession(pages[0]));browserSession=await bounded(browser.newBrowserCDPSession());
  return{pageSession,browserSession,stop};
 }catch(e){await stop();throw Error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'COLD_CONNECTION_FAILED');}
}
async function attachPrepared(transport,{id,size,revision,expectedScripts}){
 const session=transport.browserSession;let target,worker,next=0,disposed=false,last,scriptOverflow=false;const pending=new Map(),scripts=new Map(),r=reducer(id,size,revision);
 const handler=e=>{if(e.sessionId!==worker)return;let m;try{m=JSON.parse(e.message);}catch{return;}
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('COLD_WORKER_COMMAND')):p.resolve(m.result);}
  else if(m.method==='Debugger.scriptParsed'){if(!m.params?.scriptId||(!scripts.has(m.params.scriptId)&&scripts.size>=128)){scriptOverflow=true;return;}scripts.set(m.params.scriptId,m.params.url);}
  else if(m.method)r.event(m.method,m.params||{});};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('COLD_WORKER_COMMAND_DEADLINE'));},5000);pending.set(id,{resolve,reject,timer});session.send('Target.sendMessageToTarget',{sessionId:worker,message:JSON.stringify({id,method,params})}).catch(()=>{const p=pending.get(id);if(p){pending.delete(id);clearTimeout(timer);reject(Error('COLD_WORKER_SEND'));}});});
 async function verify(){if(disposed||selectWorker((await bounded(session.send('Target.getTargets'))).targetInfos)!==target)throw Error('COLD_WORKER_CHANGED');return{sameWorkerTarget:true};}
 async function verifyScripts(){
  await verify();await command('Debugger.enable');const matched=[];
  try{for(const row of expectedScripts){const url=ORIGIN+'/'+row.file;let ids=[];const end=Date.now()+5000;do{ids=[...scripts].filter(x=>x[1]===url).map(x=>x[0]);if(ids.length)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<end);
    if(scriptOverflow)throw Error('COLD_SCRIPT_OBSERVATION_OVERFLOW');if(ids.length!==1)throw Error('COLD_EXECUTING_SCRIPT_AMBIGUOUS');const out=await command('Debugger.getScriptSource',{scriptId:ids[0]});if(typeof out.scriptSource!=='string'||Buffer.byteLength(out.scriptSource)>2*1024*1024||hash(out.scriptSource)!==row.sha256)throw Error('COLD_EXECUTING_SCRIPT_HASH');matched.push({file:row.file,sha256:row.sha256,matched:true});}
   await verify();return{actualWorkerScriptBytesMatched:true,scripts:matched,rawScriptExported:false};
  }finally{await command('Debugger.disable').catch(()=>{});scripts.clear();}
 }
 async function stop(){if(disposed)return last;disposed=true;let disabled=!worker,detached=!worker;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('COLD_WORKER_STOP'));}pending.clear();
  if(worker){try{await command('Network.disable');disabled=true;}catch{}try{await bounded(session.send('Target.detachFromTarget',{sessionId:worker}));detached=true;}catch{}}
  session.off('Target.receivedMessageFromTarget',handler);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('COLD_WORKER_STOP'));}pending.clear();scripts.clear();const cleared=r.clear();worker=null;target=null;
  return last={disposed:true,ownedWorkerNetworkDisabled:disabled,ownedWorkerDetached:detached,listenerRemoved:true,pendingCleared:true,...cleared};}
 try{target=selectWorker((await bounded(session.send('Target.getTargets'))).targetInfos);worker=(await bounded(session.send('Target.attachToTarget',{targetId:target,flatten:false}))).sessionId;session.on('Target.receivedMessageFromTarget',handler);await command('Network.enable');await verifyScripts();return{arm:r.arm,read:r.read,verify,verifyScripts,stop};}catch(e){await stop();throw e;}
}
module.exports={preparePage,attachPrepared,hash};
