'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {transform,once,INPUT_SHA256,CATCH,IMPORT,SAR_CODES}=require('./transform.cjs');
const input=fs.readFileSync(path.join(__dirname,'../../media/transmux-worker.mjs'));
test('exact worker transformation contains only the two declared substitutions',()=>{
  const {output,provenance}=transform(input,'https://candidate.example');
  const replacement='try{V=xe(T.initSegment,A).initSegment}catch(error){G('+JSON.stringify(SAR_CODES)+'.includes(error?.message)?error.message:"SESSION_INIT_INVALID")}';
  assert.equal(output.toString(),input.toString().replace(CATCH,replacement).replace(IMPORT,'import"https://candidate.example/media/mux-mp4.min.js";'));
  assert.equal(provenance.inputSHA256,INPUT_SHA256);assert.notEqual(provenance.outputSHA256,INPUT_SHA256);
});
test('wrong source and ambiguous or missing replacement sites fail closed',()=>{
  for(const bytes of [Buffer.concat([input,Buffer.from(' ')]),Buffer.from(input.toString().replace(CATCH,CATCH+CATCH)),Buffer.from(input.toString().replace(IMPORT,IMPORT+IMPORT))])assert.throws(()=>transform(bytes,'https://candidate.example'),/WORKER_SOURCE_SHA/);
  for(const needle of [CATCH,IMPORT])for(const text of ['',needle+needle])assert.throws(()=>once(text,needle,'replacement'),/REPLACEMENT_COUNT/);
});
test('non-origin URLs cannot redirect the fixed mux path or carry credentials',()=>{
  for(const origin of ['http://candidate.example','https://u:p@candidate.example','https://candidate.example/?x=1','https://candidate.example/#x','https://candidate.example/nested/'])assert.throws(()=>transform(input,origin),/CANDIDATE_ORIGIN/);
});
test('only known init condition names are surfaced; unexpected errors remain generic',()=>{
  const select=new Function('error','G', 'G('+JSON.stringify(SAR_CODES)+'.includes(error?.message)?error.message:"SESSION_INIT_INVALID")');
  for(const code of SAR_CODES){let actual;select(new Error(code),v=>actual=v);assert.equal(actual,code);}
  for(const error of [null,{},new Error('private string'),new Error('SAR_UNKNOWN')]){let actual;select(error,v=>actual=v);assert.equal(actual,'SESSION_INIT_INVALID');}
});
