'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {inputFile}=require('./android-observer-session.cjs');
test('reject API destinations before reading or executing self-registering scripts',()=>{
 for(const dest of ['__q3ActualReplay33','__q3PcSeekTargets33'])
  assert.throws(()=>inputFile({path:path.join(__dirname,'not-created.expression.js'),mode:'script',dest,sha:'unused'}),/OWNED_HELPER_ADMISSION_DEST_REQUIRED/);
});
test('separate admission destination preserves an installed cleanup API',async()=>{
 const file=path.join(__dirname,'.load-guard-test-'+crypto.randomUUID()+'.js');
 const source='(()=>{window.__q3ActualReplay33=Object.freeze({stop:()=>({removed:true})});return {installed:true};})()';
 fs.writeFileSync(file,source,{flag:'wx'});
 try{
  const fn=inputFile({path:file,mode:'script',dest:'__q3ObserverAdmission33',sha:crypto.createHash('sha256').update(source).digest('hex')});
  const window={};await vm.runInNewContext('('+fn+')()',{window});
  assert.equal(window.__q3ObserverAdmission33.installed,true);
  assert.equal(window.__q3ActualReplay33.stop().removed,true);
 }finally{fs.unlinkSync(file);}
});
