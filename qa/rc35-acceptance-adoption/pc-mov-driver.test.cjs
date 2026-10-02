'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const driver=require('./pc-mov-driver.cjs');
test('initial15 criterion preserves failure for late frame, fence loss and zero dimensions',()=>{assert(driver.phasePass({firstTargetFrame:{elapsedMs:14999,width:1,height:1}}));for(const p of [{firstTargetFrame:{elapsedMs:15001,width:1,height:1}},{firstTargetFrame:{elapsedMs:1,width:0,height:1}},{firstTargetFrame:{elapsedMs:1,width:1,height:1},fenceFailure:true}])assert.equal(driver.phasePass(p),false);new vm.Script('('+driver.isoHeaderFunction()+')');});
test('full CDP header tuple remains mandatory; mismatch/truncated event history cannot pass and domain cleans',async()=>{
 for(const mode of ['good','wrong-range','truncated']){const file=path.join(__dirname,'.pc-mov-driver-test-'+process.pid+'-'+mode+'.json'),target={id:'synthetic',headRevisionId:'r',size:75947300},url='https://www.googleapis.com/drive/v3/files/synthetic/revisions/r?alt=media',calls=[];let reads=0;
  const cdp={send:async(m,p)=>{calls.push(m);if(m==='Runtime.evaluate')return{result:{value:{normalIsoMovie:true,bytes:16384}}};return{};},readEvents:async()=>reads++?{cursor:2,truncated:mode==='truncated',hasMore:false,events:[{method:'Network.requestWillBeSent',params:{requestId:'synthetic',request:{url,method:'GET'}}},{method:'Network.responseReceived',params:{requestId:'synthetic',response:{url,status:206,headers:{'Content-Range':mode==='wrong-range'?'wrong':'bytes 0-16383/75947300','Content-Length':'16384'}}}}]}:{cursor:1,events:[],hasMore:false,truncated:false}};
  try{const c=await driver.create({tab:{},cdp,target,binding:{sourceCommit:'synthetic',version:'fixture'},observerText:'fixture',resultFile:file});if(mode==='good')assert((await c.header()).rangeMatched);else await assert.rejects(c.header(),/UNQUALIFIED/);assert(calls.includes('Network.disable'));}finally{if(fs.existsSync(file))fs.unlinkSync(file);}
 }
});
test('content admission identifies strict 188-byte TS independent of MOV name and rejects broken sync',async()=>{
 const crypto=require('node:crypto').webcrypto,fn=driver.isoHeaderFunction();
 for(const kind of ['ts','broken','iso']){const b=new Uint8Array(16384);if(kind==='iso'){new DataView(b.buffer).setUint32(0,20);b.set(Buffer.from('ftypqt  '),4);b.set(Buffer.from('qt  '),16);}else{for(let p=0;p<b.length;p+=188)b[p]=0x47;if(kind==='broken')b[376]=0;}
  const ctx={state:{token:'synthetic'},URL,AbortController,setTimeout,clearTimeout,crypto,Uint8Array,DataView,fetch:async()=>({status:206,headers:{get:()=>null},body:{getReader:()=>{let sent=false;return{read:async()=>sent?{done:true}:(sent=true,{done:false,value:b}),cancel:async()=>{},releaseLock(){}};}}})};
  const page=await vm.runInNewContext('('+fn+')({target:{id:"synthetic.mov",headRevisionId:"r",size:75947300}})',ctx);
  assert.equal(page.normalTransportStream,kind==='ts');assert.equal(page.normalIsoMovie,kind==='iso');assert.equal(page.bytes,16384);
 }
});
