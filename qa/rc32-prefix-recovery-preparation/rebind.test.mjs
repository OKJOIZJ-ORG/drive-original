import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build,verifyInputs,COMMITTED32} from './build.mjs';
import {binding} from './fixture.mjs';
test('exact immutable32 inputs reject drift and aliases; signature-only scope stays explicit',async()=>{
 for(const commit of ['HEAD',COMMITTED32.slice(0,8),'4a484e6f839d2e6c3eb83503acb08147362cb011'])await assert.rejects(build(commit),/EXACT_COMMITTED32_REQUIRED/);
 await assert.rejects(verifyInputs(async p=>{const b=await readFile(new URL(p,import.meta.url));return p.endsWith('sw-proof.expression.js')?Buffer.concat([b,Buffer.from('drift')]):b;}),/FROZEN_INPUT_DRIFT/);
 const a=await build();assert.equal(a.provenance.binding.sourceCommit,COMMITTED32);assert.equal(a.provenance.codecConfigUnionProbed,false);assert.equal(a.provenance.actualImageHeaderCoverage,false);assert.equal(a.provenance.actualRequests,0);
 for(const text of [a.factory,a.expression,a.proof,a.context]){assert(!text.includes('1.22.0-rc.31'));assert(!text.includes('4a484e6f839d2e6c3eb83503acb08147362cb011'));}
});
test('current32 installer rejects old proof and each source-hash mismatch before any provider activity',async()=>{
 const a=await build(),entry=vm.runInNewContext(a.expression,{setTimeout,clearTimeout}),controller={state:'activated'},ctx=JSON.stringify({accountKey:'PRIVATE_ACCOUNT',rootId:'PRIVATE_ROOT',priorityFileId:'PRIVATE_FILE',generation:1});
 const proof=b=>({get:()=>({...b,controller})});
 assert.throws(()=>entry(ctx,proof({...binding,version:'1.22.0-rc.31'})),/RUNNER_PROOF/);
 for(const k of ['app.js','sw.js','version.json'])assert.throws(()=>entry(ctx,proof({...binding,sourceSHA256:{...binding.sourceSHA256,[k]:'a'.repeat(64)}})),/RUNNER_PROOF/);
 const runner=entry(ctx,proof(binding));assert.equal(runner.read().jobs.length,0);assert.equal(runner.read().freshRegistry,true);assert.equal(runner.read().active,false);runner.cleanup();assert.equal(runner.read().disposed,true);
});
