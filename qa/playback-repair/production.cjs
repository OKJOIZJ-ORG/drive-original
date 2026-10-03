'use strict';
// Fixed prepared package; one deployment attempt; no implicit retry or QA publication.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),worker=path.join(root,'worker');
const base='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const git=a=>cp.execFileSync('git',a,{cwd:root,maxBuffer:128*1024*1024});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=()=>git(['rev-parse','HEAD']).toString().trim(),blob=(ref,file)=>git(['show',ref+':'+file]);
const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n))),save=(n,v)=>fs.writeFileSync(path.join(__dirname,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
function prepared(){const p=load('production-preparation.json');assert.equal(source(),p.source);assert.equal(git(['status','--porcelain']).length,0);assert.equal(sha(fs.readFileSync(__filename)),p.producerSha256);return p;}
function prepare(){
 const ref=source(),pack=load('local-package.json');assert.equal(git(['status','--porcelain']).length,0);assert.equal(git(['branch','--show-current']).toString().trim(),'main');assert(pack.passed&&pack.version==='1.22.1'&&pack.workerAssetsEqualGitBlobs);
 const names=require('../../scripts/public-files.cjs').concat('.nojekyll');assert.equal(names.length,65);
 const assets=names.map(file=>{const b=file==='.nojekyll'?Buffer.alloc(0):blob(ref,file);assert.equal(sha(b),pack.publicGitSha256[file]);assert.equal(sha(fs.readFileSync(path.join(pack.workerAssetsPath,file))),sha(b));return{file,bytes:b.length,sha256:sha(b)};});
 for(const file of ['runtime-config.js','worker/wrangler.jsonc','worker/index.mjs','worker/durable-object.mjs','worker/google.mjs','worker/crypto.mjs'])assert(blob(ref,file).equals(blob('54e786f499c4496259bdb6e066e9626381cbe376',file)),'EXISTING_BACKEND_CHANGED');
 const mode={};vm.runInNewContext(blob(ref,'runtime-config.js').toString(),mode);assert.deepEqual(JSON.parse(JSON.stringify(mode.__DRIVE_ORIGINAL_RUNTIME__)),{candidate:false,driveMutationsEnabled:true,accountStateWritesEnabled:true});
 const checks=load('release-local-checks.json');assert(checks.passed&&checks.tests===880&&checks.resolution.focusedExitCode===0);
 const config=JSON.parse(blob(ref,'worker/wrangler.jsonc'));assert.equal(config.vars.PUBLIC_ORIGIN,new URL(base).origin);assert.equal(config.vars.AUTH_ENABLED,'true');assert.equal(config.vars.AUTH_DIAGNOSTICS,'false');assert.equal(config.vars.CANDIDATE_DRIVE_WRITES_ENABLED,'true');assert.equal(config.observability.enabled,false);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'qa/release-1.22.0/deployment.json')));assert(prior.passed);
 const p={source:ref,runtimeSource:pack.source,version:'1.22.1',base,site:pack.workerAssetsPath,assets,priorWorker:prior.workerVersion,producerSha256:sha(fs.readFileSync(__filename)),limits:{deployMs:300000,readbackMs:60000,verificationMs:120000,requestMs:15000},preparedAt:new Date().toISOString()};save('production-preparation.json',p);return{prepared:true,source:ref,runtimeSource:pack.source,assets:assets.length,priorWorker:p.priorWorker};
}
function deploy(){
 const p=prepared();for(const a of p.assets)assert.equal(sha(fs.readFileSync(path.join(p.site,a.file))),a.sha256);
 save('production-deployment-attempt.json',{source:p.source,startedAt:new Date().toISOString(),noAutomaticRetry:true});
 const run=cp.spawnSync(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config','wrangler.jsonc','--assets',p.site],{cwd:worker,env:{...process.env,WRANGLER_SEND_METRICS:'false',DO_NOT_TRACK:'1'},encoding:'utf8',timeout:p.limits.deployMs,maxBuffer:8*1024*1024,windowsHide:true});
 const raw=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(__dirname,'production-deployment-private.log'),raw,{flag:'wx'});const workerVersion=/Current Version ID:\s*([a-f0-9-]{36})/i.exec(raw)?.[1]||null;
 const r={passed:run.status===0&&!run.signal&&!run.error&&!!workerVersion,source:p.source,runtimeSource:p.runtimeSource,version:p.version,workerVersion,exitCode:run.status,errorCode:run.error?.code||null,rawLogSha256:sha(Buffer.from(raw)),finishedAt:new Date().toISOString()};save('production-deployment.json',r);assert(r.passed,'PRODUCTION_DEPLOYMENT_FAILED');return r;
}
function readback(){
 const p=prepared(),d=load('production-deployment.json');assert(d.passed&&d.source===p.source);
 const run=cp.spawnSync(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'versions','view',d.workerVersion,'--json','--config','wrangler.jsonc'],{cwd:worker,env:{...process.env,WRANGLER_SEND_METRICS:'false',DO_NOT_TRACK:'1'},encoding:'utf8',timeout:p.limits.readbackMs,maxBuffer:8*1024*1024,windowsHide:true});fs.writeFileSync(path.join(__dirname,'production-readback-private.json'),run.stdout||'',{flag:'wx'});assert.equal(run.status,0);
 const current=JSON.parse(run.stdout),prior=JSON.parse(fs.readFileSync(path.join(root,'qa/release-1.22.0/readback-private.json')));assert.equal(current.id,d.workerVersion);assert.deepEqual(current.resources.bindings,prior.resources.bindings);
 const r={passed:true,source:p.source,workerVersion:d.workerVersion,bindings:current.resources.bindings.length,sameBindingsNamespaceSecretsClient:true,rawSha256:sha(Buffer.from(run.stdout)),recordedAt:new Date().toISOString()};save('production-readback.json',r);return r;
}
async function verify(){
 const p=prepared(),d=load('production-deployment.json'),control=load('production-readback.json');assert(d.passed&&control.passed&&d.source===p.source&&control.workerVersion===d.workerVersion);
 const prior=JSON.parse(fs.readFileSync(path.join(root,'qa/release-1.22.0/served.json')));assert(prior.passed);
 const started=Date.now(),requests=new Set(),r={passed:false,source:p.source,runtimeSource:p.runtimeSource,version:p.version,workerVersion:d.workerVersion,assets:[],privateRoutes:[],cleanup:{}};
 const key=(b,f)=>require(path.join(worker,'node_modules/blake3-wasm')).hash(b.toString('base64')+path.extname(f).substring(1)).toString('hex').slice(0,32);
 const request=async(url,opts={})=>{const ms=Math.min(p.limits.requestMs,p.limits.verificationMs-(Date.now()-started));assert(ms>0,'TOTAL_DEADLINE');const c=new AbortController();requests.add(c);const timer=setTimeout(()=>c.abort(),ms);try{const response=await fetch(url,{...opts,signal:c.signal,cache:'no-store'});return{response,bytes:opts.method==='HEAD'?null:Buffer.from(await response.arrayBuffer())};}finally{clearTimeout(timer);c.abort();requests.delete(c);}};
 save('production-verification-attempt.json',{source:p.source,workerVersion:d.workerVersion,limits:p.limits,startedAt:new Date().toISOString()});
 try{
  for(let i=0;i<p.assets.length;i+=4){const outcomes=await Promise.allSettled(p.assets.slice(i,i+4).map(async a=>{
   const bytes=a.file==='.nojekyll'?Buffer.alloc(0):blob(p.source,a.file),old=prior.assets.find(x=>x.file===a.file),reuse=!!old?.gitEqual&&old.sha256===a.sha256&&old.bytes===a.bytes;
   const result=await request(base+a.file+'?repair='+Date.now(),reuse?{method:'HEAD',headers:{'Accept-Encoding':'identity'}}:{});assert.equal(result.response.status,200);
   if(reuse){assert.equal(result.response.headers.get('etag'),'"'+key(bytes,a.file)+'"');const size=result.response.headers.get('content-length');if(size!==null)assert.equal(size,String(a.bytes));}else assert(result.bytes.equals(bytes));
   return{...a,status:200,method:reuse?'HEAD':'GET',gitEqual:true,reused:reuse,byteProof:reuse?'prior-full-byte/Git-hash/fresh-strong-content-address':'fresh-full-byte'};
  }));for(const result of outcomes)if(result.status==='fulfilled')r.assets.push(result.value);else throw result.reason;}
  for(const file of ['memory/CHECKPOINT.md','qa/playback-repair/results.json','tests/app.test.js','worker/wrangler.jsonc','auth/session-owner.mjs','.git/config']){const {response}=await request(base+file);assert.equal(response.status,404);r.privateRoutes.push({file,status:404});}
  const {response,bytes}=await request(base+'api/session/credential',{method:'POST',headers:{Origin:new URL(base).origin,'Content-Type':'application/json','X-Drive-Original-CSRF':'1','Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'},body:JSON.stringify({expectedAccount:null,credentialProtocol:2})});assert.equal(response.status,401);assert.match(response.headers.get('cache-control')||'',/no-store/);assert.equal(JSON.parse(bytes).error.code,'unauthorized');r.anonymousSession={status:401,noStore:true,cookieAbsent:true,backendAccountMutation:false};
 }catch(e){r.failure={name:e.name,code:e.code||null,message:/^[A-Z0-9_]+$/.test(e.message)?e.message:undefined};}
 finally{for(const c of requests)c.abort();r.cleanup.requestsSettled=requests.size===0;r.elapsedMs=Date.now()-started;r.passed=!r.failure&&r.cleanup.requestsSettled&&r.assets.length===65;save('production-served.json',r);}
 assert(r.passed,'PRODUCTION_SERVING_FAILED');return{passed:r.passed,source:r.source,runtimeSource:r.runtimeSource,workerVersion:r.workerVersion,assets:65,freshGET:r.assets.filter(x=>!x.reused).length,unchangedHEAD:r.assets.filter(x=>x.reused).length,private404:6,elapsedMs:r.elapsedMs,cleanup:r.cleanup};
}
const action=process.argv[2];assert(['prepare','deploy','readback','verify'].includes(action));assert.equal(process.argv.slice(3).join(' '),action==='prepare'?'':'--execute');Promise.resolve().then(()=>({prepare,deploy,readback,verify}[action]())).then(r=>console.log(JSON.stringify(r))).catch(e=>{try{save('production-'+action+'-failure.json',{passed:false,action,source:source(),name:e.name,code:e.code||null,noAutomaticRetry:true});}catch{}console.error(JSON.stringify({passed:false,action,name:e.name,code:e.code||null}));process.exitCode=1;});
