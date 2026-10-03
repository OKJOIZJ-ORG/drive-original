import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './general-q1-fixture.mjs';
import {inspectGeneralMoov} from '../media/general-admission.mjs';

const kind=b=>Buffer.from(b.subarray(4,8)).toString('ascii');
function box(type,body){const b=Buffer.alloc(body.length+8);b.writeUInt32BE(b.length);b.write(type,4);Buffer.from(body).copy(b,8);return b;}
function children(bytes){const result=[];for(let p=0;p<bytes.length;){const n=Buffer.from(bytes).readUInt32BE(p);assert.ok(n>=8&&p+n<=bytes.length);result.push(Buffer.from(bytes.subarray(p,p+n)));p+=n;}return result;}
const moov=children(fixture).find(b=>kind(b)==='moov');
function modify(bytes,transform){const t=kind(bytes);const parts=['moov','trak','mdia','minf','dinf'].includes(t)?children(bytes.subarray(8)).map(b=>modify(b,transform)):null;return transform(t,parts?box(t,Buffer.concat(parts)):bytes);}
const handler=box('hdlr',Buffer.concat([Buffer.alloc(4),Buffer.from('dhlrurl '),Buffer.alloc(12)]));

test('QuickTime minf data handler does not overwrite the mdia media handler',()=>{
 const baseline=inspectGeneralMoov(moov);
 const withDataHandler=modify(moov,(t,b)=>t==='minf'?box(t,Buffer.concat([handler,b.subarray(8)])):b);
 const actual=inspectGeneralMoov(withDataHandler);
 assert.deepEqual(actual.trackInfo,baseline.trackInfo);
 assert.deepEqual(actual.samples,baseline.samples);
 assert.equal(actual.boxes,baseline.boxes+1);
});

test('a second media handler in mdia remains malformed',()=>{
 const duplicate=modify(moov,(t,b)=>t==='mdia'?box(t,Buffer.concat([b.subarray(8),handler])):b);
 assert.throws(()=>inspectGeneralMoov(duplicate),/GENERAL_TRACK_HANDLER/);
});

test('a minf data handler cannot replace a missing mdia media handler',()=>{
 const missing=modify(moov,(t,b)=>{
  if(t==='minf')return box(t,Buffer.concat([handler,b.subarray(8)]));
  if(t==='mdia')return box(t,Buffer.concat(children(b.subarray(8)).filter(x=>kind(x)!=='hdlr')));
  return b;
 });
 assert.throws(()=>inspectGeneralMoov(missing),/GENERAL_TRACK_HANDLER/);
});

function dataReference(type,flags=1){return modify(moov,(t,b)=>{
 if(t!=='dref')return b;
 const copy=Buffer.from(b);copy.write(type,20);copy.writeUInt32BE(flags,24);return copy;
});}
test('self-contained QuickTime alias reference retains exact sample admission',()=>{
 assert.deepEqual(inspectGeneralMoov(dataReference('alis')),inspectGeneralMoov(moov));
});
for(const [type,flags] of [['alis',0],['url ',0],['alis',2],['rsrc',1]])test(`external/unqualified data reference stays rejected: ${type}/${flags}`,()=>{
 assert.throws(()=>inspectGeneralMoov(dataReference(type,flags)),/GENERAL_EXTERNAL_REFERENCE_UNQUALIFIED/);
});
