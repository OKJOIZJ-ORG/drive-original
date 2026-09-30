'use strict';
// Actual worker message dispatch under bounded, synthetic platform controls.
// Tests overlap/owner replacement and preservation of independent media/auth
// stores together; does not represent network, account or device acceptance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const listeners=new Map(),replies=[],ports=[],pending=[],calls=[];let complete;
const active={},scope='https://app.test/drive-original/';
const c={URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,
  importScripts(){},fetch(){throw Error('unexpected external fetch');},
  caches:{async open(name){calls.push({name});return {addAll(requests){
    calls.push({requests:requests.map(r=>({url:r.url,cache:r.cache}))});
    return new Promise(resolve=>{complete=resolve;});
  }};}},
  self:{registration:{scope,active},serviceWorker:active,addEventListener(type,fn){listeners.set(type,fn);},
    clients:{async get(id){return {id,type:'window',url:scope+'?case='+id};}}}
};
vm.createContext(c);vm.runInContext(source,c,{filename:'sw.js'});
vm.runInContext(`
  clientCredentials.set('sentinel','synthetic-auth-state');
  tokenRequests.set('sentinel','synthetic-pending-auth');
  q0Pins.set('sentinel','synthetic-original-pin');
  q0Acquisitions.set('sentinel','synthetic-pin-job');
  q1CleanupFences.set('sentinel','synthetic-unsettled-cleanup');
  q1TransportOwners.set('sentinel','synthetic-live-source');
  q1RetiredThrough.set('sentinel',9);
  globalThis.storeState=()=>JSON.stringify([clientCredentials,tokenRequests,q0Pins,q0Acquisitions,q1CleanupFences,q1TransportOwners,q1RetiredThrough].map(m=>[...m]));
`,c);
const before=c.storeState();
for(let index=0;index<9;index++){
  const port={close(){this.closed=true;},postMessage(data){replies.push({...data});}};ports.push(port);
  listeners.get('message')({source:{id:'client-'+index,type:'window'},data:{type:'APP_SHELL_REFRESH',
    protocol:'drive-original-shell-refresh-v1',requestId:'case-'+index},ports:[port],waitUntil(p){pending.push(p);}});
}
(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);assert.equal(calls[1].requests.length,41);
  assert.equal(calls[1].requests.filter(r=>r.url===scope).length,1);
  assert.equal(calls[1].requests.filter(r=>r.url===scope+'index.html').length,1);
  assert(calls[1].requests.every(r=>r.cache==='no-store'&&r.url.startsWith(scope)));
  assert(ports[8].closed);assert.equal(replies.length,0);
  // Replace the active worker between admitted request and complete cache job.
  c.self.registration.active={};complete();await Promise.all(pending);
  assert.equal(replies.length,8);assert(replies.every(r=>r.ok===false&&r.code==='owner-changed'));
  assert(ports.every(p=>p.closed));assert.equal(c.storeState(),before);
  assert.equal(vm.runInContext('shellRefreshWaiters',c),0);
  const output={level:'actual worker VM message dispatch with synthetic platform timing',
    workerSha256:crypto.createHash('sha256').update(source).digest('hex'),passed:true,
    simultaneousRequests:9,admitted:8,batches:1,knownRequestCount:41,rootAndIndexAliases:true,
    ownerReplacementAck:'8 negative / 0 success',portsClosed:9,authAndQ0Q1StoresUnchanged:true,
    requests:calls[1].requests};
  fs.writeFileSync(path.join(__dirname,'protocol-adversary-results.json'),JSON.stringify(output,null,2)+'\n');
  process.stdout.write(JSON.stringify({...output,requests:undefined},null,2)+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
