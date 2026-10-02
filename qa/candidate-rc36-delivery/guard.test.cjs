'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifiedDownload}=require('./verified-download.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),guard=require('./delivery-guard.cjs');

test('exact rc36 committed manifest and runtime derive the real delivery/cache counts',()=>{
 const result=guard.assertSource();assert.equal(result.source,'d3f78f321a804f582668dde1b7cd3e0f949b24c9');assert.equal(result.version,'1.22.0-rc.36');
 assert.equal(guard.files.length,64);assert.equal(result.publicAssets,65);assert.equal(guard.shellFiles().length,50);assert.equal(result.rootCacheAlias,1);
 assert(guard.files.includes('media/native-color.mjs')&&guard.shellFiles().includes('media/native-color.mjs'));
});
test('public allowlist rejects private, absolute, escaped and duplicate paths',()=>{
 const manifest=files=>Buffer.from('module.exports='+JSON.stringify(files)+';');
 for(const bad of ['qa/results.json','memory/DECISIONS.md','worker/index.mjs','tests/app.test.js','../outside','/absolute','C:/outside','media\\outside',''])assert.throws(()=>guard.validateManifest(manifest(['media/native-color.mjs',bad])),/PUBLIC_ALLOWLIST_INVALID/);
 assert.throws(()=>guard.validateManifest(manifest(['media/native-color.mjs','media/native-color.mjs'])),/PUBLIC_ALLOWLIST_INVALID/);
 assert.throws(()=>guard.validateManifest(manifest(['app.js'])),/OBSERVED_COLOR_PUBLIC_ASSET_REQUIRED/);
});
test('runtime and worker fences reject production, routed, alternate-origin and write-enabled targets',()=>{
 const runtime={};vm.runInNewContext(guard.blob('runtime-config.js').toString(),runtime);const flags=runtime.__DRIVE_ORIGINAL_RUNTIME__,config=JSON.parse(guard.blob('worker/wrangler.jsonc'));
 assert.doesNotThrow(()=>guard.validateScope(flags,config));
 for(const altered of [{...flags,candidate:false},{...flags,driveMutationsEnabled:true},{...flags,accountStateWritesEnabled:false}])assert.throws(()=>guard.validateScope(altered,config),/CANDIDATE_RUNTIME_SCOPE_REQUIRED/);
 for(const altered of [{...config,name:'drive-original-production'},{...config,routes:['*']},{...config,env:{}},{...config,vars:{...config.vars,PUBLIC_ORIGIN:'https://example.test'}},{...config,vars:{...config.vars,CANDIDATE_DRIVE_WRITES_ENABLED:'true'}},{...config,observability:{enabled:true}}])assert.throws(()=>guard.validateScope(flags,altered),/CANDIDATE_WORKER_SCOPE_REQUIRED/);
});
test('maintained corrected download helper is reused exactly and deployment UUID parsing is concrete',()=>{
 assert(fs.readFileSync(path.join(__dirname,'verified-download.cjs')).equals(fs.readFileSync(path.join(__dirname,'../candidate-rc35-delivery/verified-download.cjs'))));
 const literal=fs.readFileSync(path.join(__dirname,'delivery.cjs'),'utf8').match(/const workerVersion=(.+?)\.exec/)[1],expression=vm.runInNewContext(literal);
 assert.equal(expression.exec('Current Version ID: 12345678-1234-1234-1234-123456789012')[1],'12345678-1234-1234-1234-123456789012');
 assert.equal(expression.exec('Current Version ID: unknown'),null);
});
test('one exact streamed source has bounded size and all timers/reader cleaned',async()=>{
 let cancelled=0;const expected=Buffer.from('abcd'),parts=[expected.subarray(0,2),expected.subarray(2)];
 const result=await verifiedDownload('https://example.test/',expected,{fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>parts.length?{value:parts.shift(),done:false}:{done:true},cancel:async()=>cancelled++})}})});
 assert.equal(result.bytes,4);assert.equal(cancelled,1);
});
test('an actually aborted HTTP reader settles with rejection and preserves its deadline cause',async()=>{
 const http=require('node:http');let socket;
 const server=http.createServer((request,response)=>{response.writeHead(200);response.write('a');});
 server.on('connection',connection=>socket=connection);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(verifiedDownload('http://127.0.0.1:'+server.address().port+'/',Buffer.from('ab'),{progressMs:80,totalMs:1000}),error=>error.message==='DELIVERY_NO_PROGRESS'&&error.delivery.bytesRead===1&&error.delivery.cleanup===undefined);}
 finally{socket?.destroy();await new Promise(resolve=>server.close(resolve));}
});
test('unexpected bytes fail instead of trusting status or Content-Length',async()=>{
 let cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.from('a'),{fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>({value:Buffer.from('too big'),done:false}),cancel:async()=>cancelled++})}})}),/DELIVERY_SIZE_EXCEEDED/);
 assert.equal(cancelled,1);
});
test('no-progress aborts/cancels the pending reader and preserves byte count',async()=>{
 let aborted=false,cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.from('a'),{progressMs:10,totalMs:100,fetchImpl:async(_,options)=>{
  options.signal.addEventListener('abort',()=>aborted=true);return{status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>cancelled++})}};
 }}),error=>error.message==='DELIVERY_NO_PROGRESS'&&error.delivery.bytesRead===0);
 assert.equal(aborted,true);assert.equal(cancelled,1);
});
test('continued progress cannot exceed the total deadline even if a reader ignores abort',async()=>{
 let cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.alloc(10000),{progressMs:100,totalMs:20,fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>{await new Promise(resolve=>setTimeout(resolve,3));return{value:Buffer.from('a'),done:false};},cancel:async()=>cancelled++})}})}),error=>error.message==='DELIVERY_TOTAL_DEADLINE'&&error.delivery.bytesRead>0);
 assert.equal(cancelled,1);
});
