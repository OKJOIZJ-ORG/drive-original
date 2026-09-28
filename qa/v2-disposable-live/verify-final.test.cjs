'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, 'verify-final.js'), 'utf8');
function fixture({ drift, oversized, stale, bodyOwner, ledgerBad,networkFailure,invalidUTF8,folderAdvance=false,secondPassDrift=null,invalidVersion=null } = {}) {
  const run = '12345678-1234-4234-8234-123456789abc', roles = ['folder-a','folder-b','test-file'];
  const state = { accountId:'private-account',authAccountKey:'private-auth',authGeneration:1,driveSessionGeneration:1,token:'private-token',tokenRevision:1,authStatus:'online' };
  const created = roles.map((role, i) => ({ role, id:`private-drive-id-${i}`, metadata:{
    id:`private-drive-id-${i}`,version:'7',parents:['private-parent'],trashed:role==='test-file',
    mimeType:role==='test-file'?'text/plain':'application/vnd.google-apps.folder',ownedByMe:true,
    appProperties:{qaRun:run,qaRole:role}
  }}));
  const ledger = {schema:1,run,accountId:state.accountId,accountKey:state.authAccountKey,status:'recovery-verified',created,
    planned:created.map(row=>({id:row.id,role:row.role,sent:true}))};
  if(ledgerBad)ledger.created[0].metadata.ownedByMe=false;
  const calls = [], reads = [], writes = [];
  const ctx = { state, AbortController, AbortSignal, URLSearchParams, TextDecoder, Uint8Array, setTimeout, clearTimeout,
    DRIVE_MUTATIONS_ENABLED:false,hasUsableToken:()=>true,playerMediaPriorityActive:false,q1Playback:null,q1RetirementResult:{settled:true},
    navigator:{serviceWorker:{controller:{}}},window:{addEventListener(){},removeEventListener(){}},
    localStorage:{getItem(key){reads.push(key);return JSON.stringify(ledger);},setItem(...args){writes.push(args);throw new Error('forbidden');}},
    fetch:async(url,options)=>{
      calls.push({url,options});const id=new URL(url).pathname.split('/').at(-1);
      if(networkFailure)throw new TypeError('untrusted server message private-token');
      const row=created.find(row=>row.id===id);const after=structuredClone(row.metadata);
      if(folderAdvance&&row.role!=='test-file')after.version='9';
      if(drift==='version'&&row.role==='test-file')after.version='8';if(drift==='tag')after.appProperties.qaRun='other';if(drift==='owned')after.ownedByMe=false;
      if(secondPassDrift===row.role&&calls.length>3)after.version=String(Number(after.version)+1);
      if(invalidVersion!==null&&row.role==='folder-a')after.version=invalidVersion;
      if(oversized)return new Response(new Uint8Array(32769));
      if(invalidUTF8)return new Response(new Uint8Array([255,255]));
      if(bodyOwner){let step=0;return new Response(new ReadableStream({pull(controller){if(step++===0)controller.enqueue(new TextEncoder().encode('{'));else{state.tokenRevision++;controller.enqueue(new TextEncoder().encode('}'));}}}));}
      return Response.json(after);
    }};
  const verify = vm.runInNewContext('('+code+')',ctx);
  if(stale)ctx.q1Playback={};
  return {result:verify.call({job:{recoveryRun:run}}),calls,reads,writes,state,ctx};
}
test('final verifier compares 3 fresh final snapshots and 3 stability reads with no writes or private output',async()=>{
  const f=fixture();const result=await f.result;
  assert.equal(result.ok,true);assert.equal(result.requests,6);assert.equal(result.targetsVerified,3);assert.equal(result.ownerStable,true);
  assert.deepEqual(Array.from(result.rows,row=>row.role),['folder-a','folder-b','test-file']);
  assert.equal(f.reads.length,1);assert.equal(f.writes.length,0);assert.equal(f.calls.length,6);
  assert.ok(result.rows.every(row=>row.snapshotStable&&row.httpStatus===200&&row.secondHttpStatus===200));
  for(const call of f.calls){assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');assert.equal(new URL(call.url).origin,'https://www.googleapis.com');}
  const output=JSON.stringify(result);
  for(const secret of ['private-account','private-auth','private-token','private-drive-id','private-parent','12345678','appProperties'])assert.ok(!output.includes(secret));
});
for(const drift of ['version','tag','owned'])test(`fresh ${drift} drift fails closed`,async()=>{
  const f=fixture({drift});const result=await f.result;
  assert.equal(result.ok,false);assert.equal(result.code,'QA_FINAL_DRIFT');assert.equal(f.calls.length,drift==='version'?3:1);assert.equal(f.writes.length,0);
});
test('owner or ledger preflight failure sends zero requests',async()=>{
  for(const options of [{stale:true},{ledgerBad:true}]){const f=fixture(options);assert.equal((await f.result).ok,false);assert.equal(f.calls.length,0);}
});
test('oversized byte body and owner switch during body are bounded failures',async()=>{
  const big=fixture({oversized:true});assert.equal((await big.result).code,'QA_FINAL_BODY');assert.equal(big.calls.length,1);
  const owner=fixture({bodyOwner:true});const result=await owner.result;assert.equal(result.code,'QA_FINAL_OWNER');assert.equal(result.ownerStable,false);assert.equal(owner.calls.length,1);
});
test('network loss and invalid UTF8 fail without retries or raw errors',async()=>{
  for(const options of [{networkFailure:true},{invalidUTF8:true}]){
    const f=fixture(options),result=await f.result;
    assert.equal(result.ok,false);assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);
    assert.ok(!JSON.stringify(result).includes('private-token'));assert.ok(!JSON.stringify(result).includes('untrusted'));
  }
});
test('folder creation version advancement is accepted only with stable later snapshots',async()=>{
  const f=fixture({folderAdvance:true});const result=await f.result;
  assert.equal(result.ok,true);assert.equal(result.requests,6);
  assert.ok(result.rows.filter(row=>row.role!=='test-file').every(row=>row.creationVersionMatches===false&&row.snapshotStable));
  assert.ok(result.rows.every(row=>row.stateMatches));
});
for(const role of ['folder-a','folder-b','test-file'])test(`${role} version drift between passes fails closed`,async()=>{
  const f=fixture({folderAdvance:true,secondPassDrift:role});const result=await f.result;
  assert.equal(result.ok,false);assert.equal(result.code,'QA_FINAL_SNAPSHOT_DRIFT');assert.equal(f.writes.length,0);
  assert.equal(result.rows.find(row=>row.role===role).snapshotStable,false);
});
test('folder versions must be valid int64 decimal strings and nondecreasing',async()=>{
  for(const invalidVersion of ['6','-1','01','7.0','NaN','9223372036854775808']){
    const f=fixture({invalidVersion});const result=await f.result;
    assert.equal(result.ok,false);assert.equal(result.code,'QA_FINAL_DRIFT');assert.equal(result.requests,1);
  }
});
