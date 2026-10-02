'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const ui=require('./cdp-ui.cjs'),fs=require('node:fs'),path=require('node:path');
test('CSS input accepts only a present in-viewport target, before any input',async()=>{
 const viewport={width:824,height:1191};assert.deepEqual(ui.point({available:true,x:411,y:20},viewport),{x:411,y:20});
 for(const g of [{available:false,x:1,y:1},{available:true,x:-1,y:1},{available:true,x:824,y:1},{available:true,x:1,y:1191},{available:true,x:NaN,y:1}]){let calls=0;await assert.rejects(ui.click({send:async()=>calls++},g,viewport),/POINT/);assert.equal(calls,0);}
});
test('pressed mouse input releases on success and on a failed command',async()=>{
 const g={available:true,x:2,y:3},v={width:10,height:10},calls=[];await ui.click({send:async(m,p)=>calls.push([m,p])},g,v);assert.deepEqual(calls.map(x=>x[1].type),['mousePressed','mouseReleased']);assert.equal(calls[0][1].x,2);
 const failed=[];await assert.rejects(ui.click({send:async(m,p)=>{failed.push(p.type);if(failed.length===1)throw Error('synthetic');}},g,v),/synthetic/);assert.deepEqual(failed,['mousePressed','mouseReleased']);
});
test('query replacement uses selection and key release; text never returned',async()=>{
 const calls=[],r=await ui.replaceText({send:async(m,p)=>calls.push([m,p])},'fixture.mp4');assert.equal(calls[0][1].modifiers,2);assert.deepEqual(calls.map(x=>x[0]),['Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.insertText']);assert.equal(r.rawTextExported,false);
 await assert.rejects(ui.replaceText({send:async()=>{throw Error('should not call');}},'x'.repeat(241)),/BOUND/);
});
test('passive card proof rejects untrusted/wrong-point events and removes its listener',()=>{
 let listener;const node={closest:()=>({dataset:{fileId:'synthetic'}}),contains:()=>false},ctx={window:{__resumeReplayTarget30:{target:{id:'synthetic'}}},document:{querySelectorAll:()=>[node],addEventListener:(t,f)=>listener=f,removeEventListener:(t,f)=>{assert.equal(f,listener);listener=null;}}};vm.createContext(ctx);vm.runInContext('('+ui.observeCard.toString()+')({x:2,y:3})',ctx);
 listener({target:node,isTrusted:false,clientX:2,clientY:3});assert.equal(ctx.window.__q0CdpInput.read().trusted,false);
 listener({target:node,isTrusted:true,clientX:8,clientY:3});assert.equal(ctx.window.__q0CdpInput.read().pointMatched,false);
 listener({target:node,isTrusted:true,clientX:2,clientY:3});assert(ctx.window.__q0CdpInput.read().trusted&&ctx.window.__q0CdpInput.read().pointMatched);assert(ctx.window.__q0CdpInput.stop().listenerRemoved);assert.equal(listener,null);
});
test('generated driver uses the prepared owned session and preserves original cold gate',()=>{
 new vm.Script('('+ui.observeCard.toString()+')');const s=fs.readFileSync(path.join(__dirname,'android-cdp-ui.cjs'),'utf8');new vm.Script(s);
 assert(s.includes('await cdpUi.click(transport.pageSession,g,finalViewport)'));assert(s.includes('Q0_CDP_CARD_HIT_UNCONFIRMED'));assert(s.includes('cold.qualifyCold('));assert(!s.includes("'shell','input','tap'"));assert(s.includes('network.arm();'));assert(s.includes('await network.verifyScripts()'));assert(s.includes('owned trusted card input cleanup'));
});
test('all generated metadata calls obey the frozen observer label contract across both lifetimes',()=>{
 const observer=fs.readFileSync(path.join(__dirname,'../rc32-q0-byte-acceptance/observer.function.js'),'utf8');assert(observer.includes("['before','after'].includes(label)"));
 const calls=[...fs.readFileSync(path.join(__dirname,'android-cdp-ui.cjs'),'utf8').matchAll(/__q0Byte\.metadata\("([^"]+)"\)/g)].map(x=>x[1]);assert.deepEqual(calls,['before','after','before','after']);
});
