'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const binding=require('./android-binding.cjs'),provider=require('./android-provider.cjs'),runner=require('./android-runner.cjs');
const origin='http://127.0.0.1:43210',id='android-tracks-0123456789abcdef';
test('provider admits only owned origin and exact mock GET/download; blocks unrelated Google/account writes',()=>{
 assert.equal(provider.classify(origin+'/app.js','GET',origin,id).kind,'local');
 assert.equal(provider.classify('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media','GET',origin,id).kind,'media');
 for(const [url,method] of [['https://www.googleapis.com/drive/v3/files/OTHER?alt=media','GET'],['https://www.googleapis.com/drive/v3/files/'+id,'PATCH'],['https://www.googleapis.com/upload/drive/v3/files','POST'],['https://example.com/','GET']])assert.equal(provider.classify(url,method,origin,id).kind,'blocked');
});
test('mock Range bounds preserve exact bytes and reject malformed/outside requests',()=>{
 assert.deepEqual(provider.byteRange('bytes=2-99',8),{start:2,end:7,status:206});assert.deepEqual(provider.byteRange('bytes=8-',8),{status:416});assert.deepEqual(provider.byteRange('bytes=0-1,3-4',8),{status:416});assert.equal(provider.LIMITS.mediaBytes,24*1024*1024);
});
test('page/SW provider lifecycle has bounded numeric receipts and detaches all owned listeners',async()=>{
 class Session extends EventEmitter{constructor(){super();this.calls=[];this.detached=false;}async send(method,p={}){this.calls.push({method,p});return{};}async detach(){this.detached=true;}}
 const root=new Session(),pageSession=new Session();root.send=async(method,p={})=>{root.calls.push({method,p});if(method==='Target.sendMessageToTarget'){const x=JSON.parse(p.message);queueMicrotask(()=>root.emit('Target.receivedMessageFromTarget',{sessionId:p.sessionId,message:JSON.stringify({id:x.id,result:{}})}));}return{};};
 const api=await provider.install({newBrowserCDPSession:async()=>root},{context:()=>({newCDPSession:async()=>pageSession})},{origin,id,bytes:Buffer.from('01234567'),sha:'a'.repeat(64)});
 root.emit('Target.attachedToTarget',{sessionId:'owned',targetInfo:{type:'service_worker',url:origin+'/sw.js'}});await new Promise(r=>setImmediate(r));assert.equal(api.network.workersReady,1);
 pageSession.emit('Fetch.requestPaused',{requestId:'synthetic',request:{url:'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',method:'GET',headers:{Range:'bytes=2-4'}}});await new Promise(r=>setImmediate(r));
 const f=pageSession.calls.find(x=>x.method==='Fetch.fulfillRequest');assert.equal(Buffer.from(f.p.body,'base64').toString(),'234');assert.equal(api.network.mediaBytes,3);
 const stopped=await api.dispose();assert.equal(stopped.providerDetached,true);assert.equal(stopped.pending,0);assert.equal(root.listenerCount('Target.receivedMessageFromTarget'),0);assert.equal(pageSession.listenerCount('Fetch.requestPaused'),0);assert.equal(root.detached,true);
});
test('localhost server exposes only explicit public buffers and dedicated input probe, no filesystem route',()=>{
 const server=runner.serverFor(new Map([['/index.html',Buffer.from('SAFE')]]));
 const response=()=>({status:null,body:null,writeHead(status){this.status=status;return this;},end(body){this.body=body;return this;}});
 const bad=response();server.emit('request',{url:'/qa/private-target.json',method:'GET'},bad);assert.equal(bad.status,404);
 const ok=response();server.emit('request',{url:'/index.html',method:'GET'},ok);assert.equal(ok.status,200);assert.equal(ok.body.toString(),'SAFE');
 const probe=response();server.emit('request',{url:'/__android_input_preflight',method:'GET'},probe);assert.equal(probe.status,200);assert.ok(probe.body.toString().includes('__input.trusted=e.isTrusted'));
});
test('committed local binding cannot qualify publication; root verified frozen receipts are separate',()=>{
 const commit=binding.COMMIT,files=['index.html','app.js','styles.css','sw.js','version.json','media/general-tracks.mjs','media/subtitle-track.mjs','media/subtitle-presentation.mjs',...Array.from({length:43},(_,i)=>'media/synthetic'+i+'.js')];
 const b=binding.makeBinding(commit,(_,file)=>Buffer.from(file==='version.json'?JSON.stringify({version:binding.VERSION}):file==='scripts/public-files.cjs'?'module.exports='+JSON.stringify(files):'PUBLIC'));
 assert.equal(b.published,undefined);assert.equal(b.publicationProof,'ROOT_MUST_CONFIRM_BEFORE_RUN');assert.throws(()=>binding.verifyPublication(b,commit),/VERIFIED_PUBLICATION_REQUIRED/);
 const receipts=['sourceReadiness','deployment','control','publicAudit'].map(kind=>({kind,file:'qa/candidate-rc35-delivery/'+kind+'.json',bytes:2,sha256:binding.sha(Buffer.from('{}'))}));
 const proof={schema:'drive-original.root-verified-publication/1',sourceCommit:commit,version:binding.VERSION,verifiedByRoot:true,origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',worker:'11111111-1111-1111-1111-111111111111',flags:{authEnabled:true,diagnosticsEnabled:true,generalWritesAllowed:false,freeOnly:true},receipts};
 assert.equal(binding.verifyPublication(proof,commit,()=>Buffer.from('{}')).publicationVerified,true);assert.throws(()=>binding.verifyPublication(proof,commit,()=>Buffer.from('[]')),/PUBLICATION_RECEIPT_DRIFT/);
 proof.flags.generalWritesAllowed=true;assert.throws(()=>binding.verifyPublication(proof,commit,()=>Buffer.from('{}')),/VERIFIED_PUBLICATION_REQUIRED/);
});
test('preparation imports expose no automatic execution or legacy candidate navigation',()=>{
 const text=fs.readFileSync(path.join(__dirname,'android-runner.cjs'),'utf8');assert.ok(text.includes("process.argv[2]==='--bind'"));assert.ok(text.includes("['--run','--preflight']"));assert.ok(!text.includes('page.setViewportSize'));assert.ok(!text.includes('presentation.update()'));assert.ok(text.includes("await tap('playerTracksClose',true)"));assert.ok(text.indexOf('gate.verifyPublication(')<text.indexOf("cmd(['devices'"));
 for(const name of ['android-native-target.function.js','android-observer.function.js'])new vm.Script('('+fs.readFileSync(path.join(__dirname,name),'utf8')+')');
});

test('provider partial setup failure detaches listeners and sessions without an admitted player',async()=>{
 class Session extends EventEmitter{constructor(fail){super();this.fail=fail;this.detached=false;}async send(method){if(this.fail&&method==='Fetch.enable')throw Error('synthetic');return{};}async detach(){this.detached=true;}}
 const root=new Session(false),pageSession=new Session(true);await assert.rejects(provider.install({newBrowserCDPSession:async()=>root},{context:()=>({newCDPSession:async()=>pageSession})},{origin,id,bytes:Buffer.from('01234567'),sha:'a'.repeat(64)}),/OWNED_PROVIDER_SETUP_FAILED/);assert.equal(root.listenerCount('Target.targetCreated'),0);assert.equal(pageSession.listenerCount('Fetch.requestPaused'),0);assert.equal(root.detached,true);assert.equal(pageSession.detached,true);
});
