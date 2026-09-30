'use strict';
// Fixed-Git public verification adapted from candidate-delivery-audit.cjs.
// No Chrome import/launch; no personal profile, media/account request or mutation.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source='7ba8e654fa38def8c8e00efcbf1600a4c8730c53';
const base='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const git=file=>execFileSync('git',['show',`${source}:${file}`],{cwd:root,maxBuffer:12*1024*1024});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mod={exports:null};vm.runInNewContext(git('scripts/public-files.cjs').toString(),{module:mod},{timeout:1000});
const files=mod.exports,version=JSON.parse(git('version.json')).version;
assert.equal(version,'1.22.0-rc.25');assert(Array.isArray(files)&&files.length===new Set(files).size);
const literal=git('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/);assert(literal);
const cached=[...vm.runInNewContext(literal[1],{},{timeout:1000})].filter(x=>x!=='./').map(x=>x.replace(/^\.\//,''));
const archives=files.filter(x=>/\.tgz$|\.tar\.gz\.part\d+$/.test(x));assert.equal(cached.length,40);assert.equal(archives.length,8);
const result={source,version,base,passed:false,assets:[],privateRoutes:[],browserLaunched:false,
 producerSha256:hash(fs.readFileSync(__filename)),originalProducerSha256:hash(fs.readFileSync(path.join(root,'qa/candidate-delivery-audit.cjs'))),
 scope:'Public fixed-source HTTP bytes and private route status only; browser reuse proof remains separate'};
(async()=>{
 for(const file of [...files,'.nojekyll']){result.currentStep='public:'+file;const r=await fetch(base+file+'?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200,file);const b=Buffer.from(await r.arrayBuffer()),expected=file==='.nojekyll'?Buffer.alloc(0):git(file);assert(b.equals(expected),'PUBLIC_GIT_BYTES');
  result.assets.push({file,bytes:b.length,sha256:hash(b),gitEqual:true});}
 for(const file of ['memory/CHECKPOINT.md','qa/package.json','media/build.json','worker/index.mjs','media/audio-codec-build.json','media/mediabunny-q1-build.json']){
  result.currentStep='private:'+file;const r=await fetch(base+file,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,404,file);await r.body?.cancel();result.privateRoutes.push({file,status:404});}
 const browserBinding={source,version,base,cached:cached.map(file=>({file,sha256:hash(git(file))})),archives};
 fs.writeFileSync(path.join(__dirname,'mcp-reuse-audit-binding.json'),JSON.stringify(browserBinding,null,2)+'\n');
 const browser=`async function(){const binding=${JSON.stringify(browserBinding)};const end=performance.now()+45000;while((typeof APP_VERSION==='undefined'||APP_VERSION!==binding.version||!navigator.serviceWorker.controller)&&performance.now()<end)await new Promise(r=>setTimeout(r,100));
 if(typeof APP_VERSION==='undefined'||APP_VERSION!==binding.version||!navigator.serviceWorker.controller)throw Error('MCP_REUSE_45S_VERSION_CONTROLLER');
 const cold={version:APP_VERSION,controlled:Boolean(navigator.serviceWorker.controller),accountPresent:Boolean(state.authAccountKey),candidate:globalThis.__DRIVE_ORIGINAL_RUNTIME__?.candidate,writes:DRIVE_MUTATIONS_ENABLED,shells:(await caches.keys()).filter(k=>k.startsWith('drive-original-shell-'))};
 if(cold.candidate!==true||cold.writes!==false||cold.accountPresent!==false||cold.shells.length!==1||cold.shells[0]!=='drive-original-shell-'+binding.version)throw Error('MCP_REUSE_SHELL_IDENTITY');
 const cache=await caches.open('drive-original-shell-'+binding.version),cached=[];for(const row of binding.cached){const r=await cache.match(new URL(row.file,location.href));if(!r)throw Error('MCP_REUSE_CACHE_MISSING');const bytes=await r.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==row.sha256)throw Error('MCP_REUSE_CACHE_HASH');cached.push({file:row.file,sha256:digest,gitEqual:true});}
 const uncachedSourceDownloads=[];for(const file of binding.archives){const present=Boolean(await cache.match(new URL(file,location.href)));if(present)throw Error('MCP_REUSE_ARCHIVE_CACHED');uncachedSourceDownloads.push({file,cached:false});}
 return {source:binding.source,version:binding.version,cold,cached,uncachedSourceDownloads,pageErrors:(window.__mcpReuseDeliveryErrors??[]).length,freshContextProved:false,scope:'Existing MCP-managed anonymous context; first navigation timing is not fresh-context proof'};}`;
 fs.writeFileSync(path.join(__dirname,'mcp-reuse-audit-page.function.js'),browser+'\n');result.passed=true;delete result.currentStep;
})().catch(e=>{result.failure=/^[A-Z_0-9]+$/.test(e.message)?e.message:'HTTP_AUDIT_FAILED';process.exitCode=1;}).finally(()=>{
 result.recordedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'mcp-reuse-audit-http.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed,assets:result.assets.length,private404:result.privateRoutes.length,browserLaunched:false,failure:result.failure??null}));});
