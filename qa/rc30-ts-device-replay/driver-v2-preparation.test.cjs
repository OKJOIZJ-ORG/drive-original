'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const driver=require('./android-same-file-replay-v2.cjs'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function sample(){return{account:{accountId:'private-account',authAccountKey:'private-key'},target:{id:'private-file',name:'example.ts',size:94000,mimeType:'video/mp2t',modifiedTime:'2026-10-01',parents:['private-parent'],version:4,headRevisionId:'private-revision',sha256Checksum:'private-checksum'},folderPath:[{id:'private-parent',name:'folder'}]};}
test('v2 validation returns fixed safe failure for malformed private recovery fields',()=>{
 for(const input of [null,undefined,[],5,{},'private'])assert.throws(()=>driver.validatePrivate(input),/PRIVATE_INPUT_INVALID/);
 for(const key of ['id','name','mimeType','modifiedTime','headRevisionId']){const input=sample();input.target[key]={raw:'never-print'};assert.throws(()=>driver.validatePrivate(input),/PRIVATE_INPUT_INVALID/);}
 const input=sample();input.target.parents=[{raw:'never-print'}];assert.throws(()=>driver.validatePrivate(input),/PRIVATE_INPUT_INVALID/);
 assert.equal(driver.validatePrivate(sample()).folderPath.length,1);
});
test('v2 still imports without loading native browser common',()=>{
 assert.equal(require.cache[path.resolve(__dirname,'../rc30-resume-20261001/android-ui-common-rc30.cjs')],undefined);
});
test('executed v1 producer remains exact and v2 current dependencies are pinned',()=>{
 assert.equal(hash(fs.readFileSync(path.join(__dirname,'android-same-file-replay.cjs'))),'1d730fee60ed98aaaf1cf6c1d3a945fd87da7417dced06920e7e4a8f53543072');
 assert.equal(hash(fs.readFileSync(path.join(__dirname,'single-file-observer.expression.js'))),'c951b0cb694004e1fbd98335669432075164e0f223fdfe4229a55c75fe6380e7');
 assert.equal(hash(fs.readFileSync(path.join(__dirname,'single-file-observer-v2.expression.js'))),'3d5c4c5646f678ce410ed8605e0a327fef6776ebd2cc814b44745b92d297c9b1');
 assert.equal(hash(fs.readFileSync(path.join(__dirname,'native-folder-target.function.js'))),'81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a');
});
test('v2 script uses settled normal folder state and protects pre-existing media owner on failure',()=>{
 const text=fs.readFileSync(path.join(__dirname,'android-same-file-replay-v2.cjs'),'utf8');
 assert.equal(text.includes('data-folder-id'),false);assert.ok(text.includes('state.loadingFiles'));assert.ok(text.includes('state.currentFolderId==='));
 assert.ok(text.includes('if(ownsPlayer)try{await close();}'));assert.ok(text.includes('android-same-file-replay-attempt2-result.json'));
 assert.equal(text.includes('navigateToFolder('),false);assert.equal(text.includes('.click('),false);
});
