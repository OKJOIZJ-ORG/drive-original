'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifiedDownload}=require('./verified-download.cjs');
test('one exact streamed source has bounded size and all timers/reader cleaned',async()=>{
 let cancelled=0;const expected=Buffer.from('abcd'),parts=[expected.subarray(0,2),expected.subarray(2)];
 const result=await verifiedDownload('https://example.test/',expected,{fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>parts.length?{value:parts.shift(),done:false}:{done:true},cancel:async()=>cancelled++})}})});
 assert.equal(result.bytes,4);assert.equal(cancelled,1);
});
test('an actually aborted HTTP reader settles with rejection and preserves its deadline cause',async()=>{
 const http=require('node:http');let socket;
 const server=http.createServer((request,response)=>{response.writeHead(200);response.write('a');});
 server.on('connection',connection=>socket=connection);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(verifiedDownload('http://127.0.0.1:'+server.address().port+'/',Buffer.from('ab'),{progressMs:80,totalMs:1000}),error=>error.message==='DELIVERY_NO_PROGRESS'&&error.delivery.bytesRead===1&&error.delivery.cleanup===undefined);}
 finally{socket?.destroy();await new Promise(resolve=>server.close(resolve));}
});
test('unexpected bytes fail instead of trusting status or Content-Length',async()=>{
 let cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.from('a'),{fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>({value:Buffer.from('too big'),done:false}),cancel:async()=>cancelled++})}})}),/DELIVERY_SIZE_EXCEEDED/);
 assert.equal(cancelled,1);
});
test('no-progress aborts/cancels the pending reader and preserves byte count',async()=>{
 let aborted=false,cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.from('a'),{progressMs:10,totalMs:100,fetchImpl:async(_,options)=>{
  options.signal.addEventListener('abort',()=>aborted=true);return{status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>cancelled++})}};
 }}),error=>error.message==='DELIVERY_NO_PROGRESS'&&error.delivery.bytesRead===0);
 assert.equal(aborted,true);assert.equal(cancelled,1);
});
test('continued progress cannot exceed the total deadline even if a reader ignores abort',async()=>{
 let cancelled=0;await assert.rejects(verifiedDownload('https://example.test/',Buffer.alloc(10000),{progressMs:100,totalMs:20,fetchImpl:async()=>({status:200,body:{getReader:()=>({read:async()=>{await new Promise(resolve=>setTimeout(resolve,3));return{value:Buffer.from('a'),done:false};},cancel:async()=>cancelled++})}})}),error=>error.message==='DELIVERY_TOTAL_DEADLINE'&&error.delivery.bytesRead>0);
 assert.equal(cancelled,1);
});
