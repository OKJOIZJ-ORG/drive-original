'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),vm=require('node:vm'),crypto=require('node:crypto');const h=require('./bounded-header.cjs');
const page={normalIsoMp4:true,bytes:16384},wire={requests:1,unexpectedRequests:0,responses:1,requestRangeExact:true,status:206,contentRange:'bytes 0-16383/2147483648',contentLength:'16384'};
test('hidden page header never substitutes for exact independent CDP response',()=>{assert(h.qualify(page,wire,2147483648));for(const w of [{...wire,requests:2},{...wire,responses:0},{...wire,requestRangeExact:false},{...wire,status:200},{...wire,contentRange:null},{...wire,contentRange:'bytes 0-16383/2147483649'},{...wire,contentLength:'16385'}])assert.equal(h.qualify(page,w,2147483648),false);assert.equal(h.qualify({...page,normalIsoMp4:false},wire,2147483648),false);});
test('bounded page read accepts hidden header provisionally and still rejects excess bytes and QuickTime',async()=>{
 for(const mode of ['normal','oversize','quicktime']){const bytes=new Uint8Array(mode==='oversize'?16385:16384);new DataView(bytes.buffer).setUint32(0,20);bytes.set(Buffer.from('ftyp'),4);bytes.set(Buffer.from(mode==='quicktime'?'qt  ':'isom'),8);bytes.set(Buffer.from('mp42'),16);let reads=0,cancelled=0;
  const ctx={URL,AbortController,Uint8Array,DataView,Array,Error,crypto:crypto.webcrypto,state:{token:'synthetic'},setTimeout:()=>1,clearTimeout:()=>{},fetch:async()=>({status:206,headers:{get:()=>null},body:{getReader:()=>({read:async()=>reads++?{done:true}:{done:false,value:bytes},cancel:async()=>cancelled++,releaseLock:()=>{}})}})};vm.createContext(ctx);const f=vm.runInContext('('+h.browserHeader.toString()+')',ctx),input={target:{id:'synthetic',headRevisionId:'r',size:2147483648}};
  if(mode==='oversize')await assert.rejects(f(input),/BOUND/);else{const r=await f(input);assert.equal(r.rangeMatched,false);assert.equal(r.requiresIndependentCdpRange,true);assert.equal(r.normalIsoMp4,mode==='normal');}assert.equal(cancelled,1);
 }
});
test('owned CDP header listeners and private correlation clear on both pass and rejection',async()=>{
 for(const valid of [true,false]){const s=new EventEmitter(),calls=[];s.send=async m=>calls.push(m);const steps=[],input={target:{id:'synthetic',headRevisionId:'r',size:2147483648}},url='https://www.googleapis.com/drive/v3/files/synthetic/revisions/r?alt=media';
  const c={wait:async()=>{},step:(n,d)=>steps.push([n,d]),evaluateNative:async()=>{s.emit('Network.requestWillBeSent',{requestId:'synthetic',request:{url,method:'GET',headers:{Range:'bytes=0-16383'}}});s.emit('Network.requestWillBeSent',{requestId:'preflight',type:'Preflight',request:{url,method:'OPTIONS',headers:{}}});s.emit('Network.responseReceived',{requestId:'synthetic',response:{url,status:206,headers:{'Content-Range':valid?wire.contentRange:'wrong','Content-Length':'16384'}}});return{ok:true,page};}};
  if(valid)assert((await h.read(c,s,input)).rangeMatched);else await assert.rejects(h.read(c,s,input),/CDP_RANGE/);
  assert.equal(s.listenerCount('Network.requestWillBeSent'),0);assert.equal(s.listenerCount('Network.responseReceived'),0);assert(calls.includes('Network.disable'));assert(steps.at(-1)[1].privateRequestCorrelationCleared);
 }
});
test('duplicate media GET and unexpected methods still fail; only explicit OPTIONS Preflight is separate',()=>{assert.equal(h.qualify(page,{...wire,requests:2},2147483648),false);assert.equal(h.qualify(page,{...wire,unexpectedRequests:1},2147483648),false);assert(h.qualify(page,{...wire,preflightRequests:1},2147483648));});
test('actual Other/OPTIONS/initiator-preflight requires requested GET; unrelated OPTIONS remains unexpected',()=>{
 const e={type:'Other',initiator:{type:'preflight'},request:{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}}};assert(h.preflight(e));assert.equal(h.preflight({...e,initiator:{type:'script'}}),false);assert.equal(h.preflight({...e,request:{method:'OPTIONS',headers:{}}}),false);assert.equal(h.preflight({...e,request:{method:'GET',headers:{}}}),false);
});
