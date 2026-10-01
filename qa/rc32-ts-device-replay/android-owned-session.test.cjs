'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {inputFile,nativeInput}=require('./android-owned-session.cjs');
test('imports are inert and native commands have bounded coordinates and keys',()=>{
 assert.deepEqual(nativeInput({op:'tap',x:10,y:20},100,200),['shell','input','tap','10','20']);
 assert.deepEqual(nativeInput({op:'swipe',x:10,y:180,toX:10,toY:20,ms:500},100,200),['shell','input','swipe','10','180','10','20','500']);
 for(const c of [{op:'tap',x:100,y:20},{op:'swipe',x:10,y:180,toX:10,toY:20,ms:3001},{op:'key',key:'KEYCODE_HOME'},{op:'shell',key:'KEYCODE_BACK'}])assert.throws(()=>nativeInput(c,100,200),/BOUNDED_NATIVE_INPUT_REQUIRED/);
});
test('source loading rejects outside files, destination injection and hash drift',()=>{
 const file=path.join(__dirname,'android-owned-session.test.cjs'),bytes=fs.readFileSync(file),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.throws(()=>inputFile({path:path.resolve(__dirname,'../../app.js'),dest:'__own',mode:'script',sha}),/OWNED_QA_INPUT_REQUIRED/);
 assert.throws(()=>inputFile({path:file,dest:'x;alert(1)',mode:'script',sha}),/OWNED_QA_INPUT_REQUIRED/);
 assert.throws(()=>inputFile({path:file,dest:'__own',mode:'script',sha:'0'.repeat(64)}),/OWNED_SOURCE_DRIFT/);
 assert.match(inputFile({path:file,dest:'__own',mode:'script',sha}),/^async\(\)=>/);
});
