import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {rebind,verifyInputs,sha256,templates,build} from './build.mjs';
const base=new URL('./',import.meta.url),root=new URL('../../',base);
const cases=[];async function check(name,fn){await fn();cases.push({name,passed:true});}
const fake={schema:'drive-original.corpus-header-source-binding/1',version:'1.22.0-rc.32',sourceCommit:'3'.repeat(40),sourceSHA256:{'app.js':'a'.repeat(64),'sw.js':'b'.repeat(64),'version.json':'c'.repeat(64)}};
await check('frozen-safe-template-and-all-producer-pins',()=>verifyInputs());
await check('frozen-drift-refused-without-touching-historical-input',()=>assert.rejects(verifyInputs(async p=>Buffer.concat([await readFile(new URL(p,root)),Buffer.from('changed')])),/FROZEN_INPUT_DRIFT/));
await check('all-four-expressions-syntax-and-literal-rebinding',async()=>{
 for(const [p,input]of Object.entries(templates)){const result=rebind(await readFile(new URL(input,root),'utf8'),fake);new vm.Script(p.endsWith('.function.js')?'('+result+')':result);assert(result.includes(fake.sourceCommit));assert(!result.includes('1.22.0-rc.31'));assert(!result.includes('__rc31'));}
});
await check('aliases-short-SHA-and-wrong-version-refused-before-Git',async()=>{
 for(const x of ['HEAD','codex/v2-kickoff-diagnostics','3'.repeat(7),null])await assert.rejects(build(x),/LITERAL_FULL_COMMIT_REQUIRED/);
 await assert.rejects(build('3'.repeat(40)),/EXACT_COMMITTED32_REQUIRED/);
 assert.throws(()=>rebind('mock',{...fake,version:'1.22.0-rc.33'}),/LITERAL_FIXED32_BINDING_REQUIRED/);
});
await check('generated-runtime-refuses-old-proof-before-any-account-read',async()=>{
 const text=rebind(await readFile(new URL(templates['deeper.expression.js'],root),'utf8'),fake);
 const entry=vm.runInNewContext(text,{}),job=entry('{}',{get:()=>({version:'1.22.0-rc.31'})},{cohort:2,mode:'probe'});
 const r=job.poll();assert.equal(r.done,true);assert.equal(r.summary.failure,'SOURCE_BINDING_REJECTED');assert.equal(r.summary.mediaRequests,0);entry.cleanup();
});
await check('context-mock-two-GETs-safe-four-key-private-retention',async()=>{
 const text=rebind(await readFile(new URL(templates['derive-context.expression.js'],root),'utf8'),fake),c={state:'activated'},calls=[];
 const env={APP_VERSION:fake.version,state:{accountId:'MOCK_PRIVATE_ACCOUNT',driveSessionGeneration:7,token:'MOCK_PRIVATE_TOKEN',tokenRevision:3,authStatus:'online',selected:null},q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},document:{visibilityState:'visible'},navigator:{serviceWorker:{controller:c}},hasUsableToken:()=>true,URL,AbortController,setTimeout,clearTimeout,window:{__rc32DeeperPriorityName:'MOCK_PRIVATE_NAME',__rc32DeeperSwProof:{get:()=>({...fake,controller:c})}},fetch:async u=>{calls.push(u);return Response.json(calls.length===1?{files:[{id:'MOCK_PRIVATE_FILE',parents:['MOCK_PRIVATE_ROOT']}],incompleteSearch:false}:{id:'MOCK_PRIVATE_ROOT',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canListChildren:true}});}};
 const r=await vm.runInNewContext(text,env);assert.equal(calls.length,2);assert.equal(r.privateContextExported,false);assert(!JSON.stringify(r).includes('MOCK_PRIVATE'));assert.deepEqual(Object.keys(JSON.parse(env.window.__rc32DeeperContext)).sort(),['accountKey','generation','priorityFileId','rootId']);assert.equal(env.window.__rc32DeeperPriorityName,undefined);
 env.window.__rc32DeeperPriorityName='MOCK_PRIVATE_NAME';env.window.__rc32DeeperSwProof={get:()=>({...fake,sourceCommit:'0'.repeat(40),controller:c})};await assert.rejects(vm.runInNewContext(text,env),/QA_CONTEXT_PREFLIGHT/);assert.equal(calls.length,2);
});
let committed32BindingGenerated=false;
try{
 const binding=JSON.parse(await readFile(new URL('binding.json',base))),built=await build(binding.sourceCommit);
 await check('generated32-four-output-bytes-equal-committed-build',async()=>{
  assert.deepEqual(binding,built.binding);for(const [p,v]of Object.entries(built.outputs))assert.equal(await readFile(new URL(p,base),'utf8'),v);
  assert.deepEqual(JSON.parse(await readFile(new URL('provenance.json',base))),built.provenance);
 });
 await check('generated32-source-proof-offline-four-static-GETs-and-controller-drift',async()=>{
  const controller={state:'activated'},calls=[],env={APP_VERSION:binding.version,URL,Uint8Array,crypto:globalThis.crypto,location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',href:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'},navigator:{serviceWorker:{controller}}};let runtime=null;
  env.caches={keys:async()=>['drive-original-shell-'+binding.version],open:async()=>({match:async()=>runtime})};
  env.fetch=async url=>{calls.push(url);const p=new URL(url).pathname.slice(1),bytes=p==='runtime-config.js'?new Uint8Array([1,2,3]):execFileSync('git',['show',binding.sourceCommit+':'+p],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024});const r=new Response(bytes);Object.defineProperty(r,'url',{value:url});if(p==='runtime-config.js')runtime=r;return r;};
  const proof=vm.runInNewContext(built.outputs['sw-proof.expression.js'],env);for(let i=0;i<500&&!proof.poll().done;i++)await new Promise(r=>setTimeout(r,1));assert.equal(proof.poll().accepted,true);assert.equal(calls.length,4);assert.equal(proof.poll().mediaGET,0);assert.equal(proof.get().sourceCommit,binding.sourceCommit);
  env.navigator.serviceWorker.controller={state:'activated'};assert.equal(proof.get(),null);proof.clear();assert.equal(proof.get(),null);
 });
 committed32BindingGenerated=true;
}catch(error){if(error.code!=='ENOENT')throw error;}
const frozenPaths=(await readdir(base)).filter(p=>!['freeze.json','local-verification.json','curated-savepoint.json'].includes(p)).sort();
const files=Object.fromEntries(await Promise.all(frozenPaths.map(async p=>[p,sha256(await readFile(new URL(p,base)))])));
if(process.argv.includes('--check')){
 const freeze=JSON.parse(await readFile(new URL('freeze.json',base)));assert.deepEqual(files,freeze.files);
}else{
 await writeFile(new URL('freeze.json',base),JSON.stringify({schema:'drive-original.rc32-format-preparation-freeze/1',files,actualRequests:0,actualExecution:false},null,2)+'\n');
 await writeFile(new URL('local-verification.json',base),JSON.stringify({cases,passed:cases.length,mockRuntimeOnly:true,committed32BindingGenerated,actualExecution:false,actualRequests:0},null,2)+'\n');
 await writeFile(new URL('curated-savepoint.json',base),JSON.stringify({exactOwnedFiles:[...frozenPaths,'freeze.json','local-verification.json','curated-savepoint.json'].map(p=>'qa/rc32-format-acceptance/'+p),commitOwner:'root',actualResultsExcluded:true,privateDataExcluded:true},null,2)+'\n');
}
console.log(JSON.stringify({passed:cases.length,frozenFiles:Object.keys(files).length,mockRuntimeOnly:true,committed32BindingGenerated,actualRequests:0}));
