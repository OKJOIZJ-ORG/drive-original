import test from 'node:test';
import assert from 'node:assert/strict';
import {repairFilename} from '../qa/media-format-repair.mjs';

const original=()=>({id:'file-id',name:'movie.mp4',mimeType:'video/mp4',size:'1234',headRevisionId:'revision-7',modifiedTime:'2026-10-29T00:00:00.000Z',version:'12',md5Checksum:'md5-value',sha256Checksum:'sha-value',parents:['parent-id'],trashed:false,capabilities:{canRename:true,canEdit:true}});
const clone=value=>structuredClone(value);
function harness({initial=original(),patchAction=async()=>{},collisions=[]}={}){
 let current=clone(initial);let reads=0,writes=0,collisionChecks=0;
 const adapters={
  read:async id=>{assert.equal(id,'file-id');reads++;return clone(current);},
  patch:async(id,body)=>{writes++;assert.equal(id,'file-id');assert.deepEqual(body,{name:'movie.ts'});await patchAction({current,set:value=>{current=clone(value);}});},
  findCollisions:async query=>{collisionChecks++;assert.deepEqual(query,{name:'movie.ts',parents:['parent-id'],excludeId:'file-id'});return clone(collisions);}
 };
 return {adapters,counts:()=>({reads,writes,collisionChecks}),current:()=>clone(current)};
}
const execute=(expected,adapters)=>repairFilename({expected,name:'movie.ts'},adapters);

test('stale source metadata is blocked before collision lookup or write',async()=>{
 const old=original(),stale=original();stale.headRevisionId='revision-8';
 const h=harness({initial:stale});
 const result=await execute(old,h.adapters);
 assert.equal(result.status,'blocked');assert.equal(result.reason,'preflight-metadata-or-capability-mismatch');
 assert.equal(h.counts().writes,0);assert.equal(h.counts().collisionChecks,0);
});

test('a case and Unicode normalized sibling collision is blocked without PATCH',async()=>{
 const h=harness({collisions:[{id:'other-id',name:'MOVIE.TS'.normalize('NFD')}]});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'blocked');assert.equal(result.reason,'name-collision');assert.equal(h.counts().writes,0);
});

test('a committed rename is verified as applied even when PATCH reports a network error',async()=>{
 const h=harness({patchAction:async({current,set})=>{set({...current,name:'movie.ts',version:'13',modifiedTime:'2026-10-30T01:00:00.000Z'});throw Object.assign(new Error('response lost'),{status:503});}});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'applied');assert.equal(result.error,'http-503');assert.equal(result.after.name,'movie.ts');
 assert.equal(result.after.version,'13');assert.equal(h.counts().writes,1);assert.equal(h.counts().reads,3);
});

test('a failed PATCH with unchanged metadata is classified unchanged and is never retried',async()=>{
 const h=harness({patchAction:async()=>{throw new Error('rejected');}});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'unchanged');assert.equal(result.after.name,'movie.mp4');assert.equal(result.error,'operation-error');
 assert.equal(h.counts().writes,1);assert.equal(h.counts().reads,3);
});

test('post-read content drift is uncertain even if the requested name appeared',async()=>{
 const h=harness({patchAction:async({current,set})=>set({...current,name:'movie.ts',mimeType:'video/quicktime'})});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'uncertain');assert.equal(result.reason,'post-read-identity-or-metadata-drift');assert.equal(h.counts().writes,1);
});

test('ordinary modifiedTime and version updates are allowed when stable metadata matches',async()=>{
 const h=harness({patchAction:async({current,set})=>set({...current,name:'movie.ts',modifiedTime:'2026-10-30T02:00:00.000Z',version:'14'})});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'applied');assert.equal(result.after.modifiedTime,'2026-10-30T02:00:00.000Z');assert.equal(result.after.version,'14');
});

test('parent changes remain uncertain after PATCH',async()=>{
 const h=harness({patchAction:async({current,set})=>set({...current,name:'movie.ts',parents:['different-parent']})});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'uncertain');assert.equal(result.after.parents[0],'different-parent');
});

test('a changed SHA-256 is rejected on post-readback',async()=>{
 const h=harness({patchAction:async({current,set})=>set({...current,name:'movie.ts',sha256Checksum:'different-sha'})});
 const result=await execute(original(),h.adapters);
 assert.equal(result.status,'uncertain');assert.equal(result.reason,'post-read-identity-or-metadata-drift');
});
