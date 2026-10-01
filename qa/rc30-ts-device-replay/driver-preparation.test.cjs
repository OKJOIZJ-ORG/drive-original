'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const driver=require('./android-same-file-replay.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function sample(){return {account:{accountId:'private-account',authAccountKey:'private-key'},target:{id:'private-file',name:'example [1].ts',size:'94000',mimeType:'video/mp2t',modifiedTime:'2026-10-01',parents:['private-parent'],version:'4',headRevisionId:'private-revision',sha256Checksum:'private-checksum'},folderPath:[{id:'private-parent',name:'folder'}]};}
test('import is preparation only; execute entry is not invoked',()=>{
 assert.equal(typeof driver.execute,'function');assert.equal(typeof driver.loadPrivate,'function');
 // Only built-in modules are loaded on import; common is loaded inside execute.
 const common=path.resolve(__dirname,'../rc30-resume-20261001/android-ui-common-rc30.cjs');assert.equal(require.cache[common],undefined);
});
test('private validation retains only recovery metadata/account/path fields',()=>{
 const input=sample();input.target.token='must-not-retain';input.cookie='must-not-retain';const out=driver.validatePrivate(input);
 assert.equal(out.target.id,input.target.id);assert.equal(out.target.token,undefined);assert.equal(out.cookie,undefined);
});
test('unknown fresh revision/checksum/account and invalid metadata are rejected',()=>{
 // Executed v1 rejects these malformed inputs; additive v2 gives every case a fixed code.
 for(const value of [null,undefined,5,[],{},'private'])assert.throws(()=>driver.validatePrivate(value));
 for(const key of ['id','name','size','mimeType','modifiedTime','parents','version','headRevisionId','sha256Checksum']){const input=sample();delete input.target[key];assert.throws(()=>driver.validatePrivate(input),/PRIVATE_INPUT_INVALID/);}
 const input=sample();input.account.authAccountKey=null;assert.throws(()=>driver.validatePrivate(input),/PRIVATE_INPUT_INVALID/);
});
test('canonical metadata holder is supported without expanding target selection',()=>{
 const input=sample();input.metadata=input.target;delete input.target;assert.equal(driver.validatePrivate(input).target.id,'private-file');
});
test('native ASCII search is shell-quoted; unsupported or injected commands cannot be used',()=>{
 assert.deepEqual(driver.inputCommand('example [1].ts'),['shell','input','text',"'example%s[1].ts'"]);
 for(const name of ['a;echo token.ts','a$(echo token).ts',"a'quoted.ts",'한글.ts','x'.repeat(241)])assert.equal(driver.inputCommand(name),null);
});
test('owned result path resolves inside additive leaf',()=>{
 const common=path.resolve(__dirname,'../rc30-resume-20261001');
 assert.equal(path.join(common,'../rc30-ts-device-replay/android-same-file-replay-result.json'),path.join(__dirname,'android-same-file-replay-result.json'));
});
test('frozen observer and maintained bootstrap hashes match executable dependency pins',()=>{
 const expected={'single-file-observer.expression.js':'c951b0cb694004e1fbd98335669432075164e0f223fdfe4229a55c75fe6380e7'};
 for(const [name,sha]of Object.entries(expected))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),sha);
 const prior=path.resolve(__dirname,'../rc30-resume-20261001');
 assert.equal(hash(fs.readFileSync(path.join(prior,'android-ui-common-rc30.cjs'))),'ffc682d78c276b543867fd8a2101b918927474b2817448e446b4e63e95e60a9e');
 assert.equal(hash(fs.readFileSync(path.join(prior,'source-proof.expression.js'))),'16638995b9660f9d38cabb2d762791d38d47ca6857ad07ba0d8a649cebe631b5');
});
