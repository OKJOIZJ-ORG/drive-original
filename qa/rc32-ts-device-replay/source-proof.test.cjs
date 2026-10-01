'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const gate=require('./binding-gate.cjs'),{makeBinding}=require('./bind.cjs');
const lookup=file=>Buffer.from(file==='version.json'?JSON.stringify({version:gate.VERSION}):'PUBLIC-FIXTURE-'+file),binding=makeBinding(gate.COMMIT,lookup);
const fn=fs.readFileSync(path.join(__dirname,'source-proof.function.js'),'utf8');
async function qualify(kind){
 const controller={state:'activated',scriptURL:'https://qa.invalid/sw.js'},calls=[];
 const context={APP_VERSION:gate.VERSION,state:{selected:null,authStatus:'online',accountStateLoaded:true,accountId:'PRIVATE-ACCOUNT',authAccountKey:'PRIVATE-KEY',authGeneration:1,driveSessionGeneration:2},
 q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},hasUsableToken:()=>true,navigator:{serviceWorker:{controller,getRegistration:async()=>({active:controller,waiting:null,installing:null})}},
 document:{visibilityState:'visible'},window:{},crypto:webcrypto,URL,AbortController,setTimeout,clearTimeout,Date,
 fetch:async u=>{calls.push(u);if(kind==='account')context.state.authAccountKey='CHANGED';return{ok:true,arrayBuffer:async()=>kind==='source'?lookup('wrong'):lookup(u.slice(1))};},
 caches:{keys:async()=>['drive-original-shell-'+gate.VERSION],open:async()=>({match:async u=>u==='/media/ts-player.mjs'&&kind==='cache'?null:{arrayBuffer:async()=>lookup(u==='/'?'index.html':u.slice(1))}})}};
 vm.createContext(context);const r=await vm.runInContext('('+fn+')('+JSON.stringify(binding)+','+JSON.stringify(binding.cache)+')',context);return{r,context,calls};
}
test('fresh source proof checks40 committed cache blobs, root alias,5 source files and current registration',async()=>{
 const {r,context,calls}=await qualify();assert.equal(r.matchedCache,40);assert.equal(r.matchedCacheAliases,41);assert.equal(calls.length,5);assert.equal(r.version,gate.VERSION);
 assert.equal(context.window.__resumeSwProof.get().sourceCommit,gate.COMMIT);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(r.executingWorkerScriptHashKnown,false);
});
test('wrong served bytes, missing module cache and account drift each reject fresh source qualification',async()=>{
 await assert.rejects(qualify('source'),/QA_SOURCE_BYTES/);await assert.rejects(qualify('cache'),/QA_CACHE_MISSING/);await assert.rejects(qualify('account'),/QA_OWNER/);
});
