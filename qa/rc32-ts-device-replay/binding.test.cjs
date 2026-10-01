'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const gate=require('./binding-gate.cjs'),{makeBinding}=require('./bind.cjs');
function lookup(file){return Buffer.from(file==='version.json'?JSON.stringify({version:gate.VERSION}):'synthetic-public-'+file);}
test('full exact committed SHA is mandatory, never HEAD/branch/abbreviation',()=>{
 for(const c of ['HEAD','codex/x',gate.COMMIT.slice(0,7),'a'.repeat(40),undefined])assert.throws(()=>makeBinding(c,lookup),/IMMUTABLE32_BINDING_REQUIRED/);
 const b=makeBinding(gate.COMMIT,lookup);assert.equal(b.cache.length,40);assert.equal(b.sourceSHA256['media/ts-player.mjs'],gate.sha(lookup('media/ts-player.mjs')));
});
test('wrong committed version and inconsistent public module hashes fail closed',()=>{
 assert.throws(()=>makeBinding(gate.COMMIT,f=>f==='version.json'?Buffer.from('{"version":"1.22.0-rc.31"}'):lookup(f)),/COMMITTED_VERSION_REQUIRED/);
 const b=makeBinding(gate.COMMIT,lookup);b.sourceSHA256['media/drive-source.mjs']='b'.repeat(64);assert.throws(()=>gate.validateBinding(b),/MODULE_HASH_REQUIRED/);
});
test('driver import has no private read, device or execution side effect',()=>{
 const d=require('./android-replay.cjs');assert.equal(typeof d.execute,'function');assert.equal(d.inputCommand('synthetic-file.ts')[2],'text');assert.equal(d.inputCommand("unsafe'"),null);
 assert.throws(()=>d.validatePrivate({}),/PRIVATE_INPUT_INVALID/);
});
test('unbound execute refuses before nonexistent protected input can be read',async()=>{
 // A fake empty base demonstrates the gate itself, without changing frozen files.
 assert.throws(()=>gate.verifyBound(path.join(__dirname,'DOES-NOT-EXIST')),/FREEZE_REQUIRED/);
});
test('existing safe receipt is refused before protected input read or actual transport',async()=>{
 // Exercise the admission prefix with only its freeze call replaced by a fixture.
 const text=fs.readFileSync(path.join(__dirname,'android-replay.cjs'),'utf8');
 const prefix=text.slice(text.indexOf(' const binding=gate.verifyBound();'),text.indexOf(" const observer=fs.readFileSync"));
 const admission=new Function('gate','fs','path','__dirname','loadPrivate','privateFile','resultName',prefix);
 assert.throws(()=>admission({verifyBound:()=>({})},fs,path,__dirname,()=>{throw Error('PRIVATE_WAS_READ');},'DOES-NOT-EXIST','cache-files.json'),/RESULT_ALREADY_EXISTS/);
 assert.throws(()=>admission({verifyBound:()=>({})},fs,path,__dirname,()=>{throw Error('PRIVATE_WAS_READ');},'DOES-NOT-EXIST','../bad.json'),/RESULT_NAME_INVALID/);
});
test('all browser functions are syntax valid; no product invocation in observer',()=>{
 for(const f of ['observer.function.js','source-proof.function.js','native-folder-target.function.js','native-ui-target-v3.function.js'])new vm.Script('('+fs.readFileSync(path.join(__dirname,f),'utf8')+')');
 const s=fs.readFileSync(path.join(__dirname,'android-replay.cjs'),'utf8');assert.ok(s.indexOf('gate.verifyBound()')<s.indexOf('const privateInput=loadPrivate(privateFile)'));assert.ok(!s.includes('syntheticSearchSetup:!'));
 assert.ok(!s.includes('navigateToFolder('));assert.ok(!s.includes('togglePlayPause('));assert.ok(s.includes("waitFrame('startup',30000)"));assert.ok(s.includes('waitFrame(label,35000)'));
});
