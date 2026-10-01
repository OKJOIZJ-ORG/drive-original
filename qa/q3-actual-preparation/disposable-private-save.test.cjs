'use strict';
// Execute the exact operator branch with synthetic browser state and in-memory fs.
// Never launch the operator or read/write any protected private backup.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'disposable-pc-owned-operator.cjs'),'utf8');
const start=source.indexOf("else if(command.op==='private-save'){");
const end=source.indexOf("else if(command.op==='tool')",start);
assert.ok(start>=0&&end>start,'exact private-save branch required');
const branch=source.slice(start,end).replace(/^else /,'');
const POINTER='drive-original.qa.disposable.q3-180s.cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a.run';
const RUN='synthetic-run-only',LEDGER='drive-original.qa.disposable.'+RUN+'.recovery';
const CANARY='SYNTHETIC_PRIVATE_ID_NAME_ACCOUNT_TOKEN_DO_NOT_EXPORT';
function harness(options={}){
 const reads=[],writes=[],logs=[],evaluations=[];
 const storage=new Map([[POINTER,JSON.stringify({run:RUN})],[LEDGER,JSON.stringify({id:CANARY,run:RUN})],['unrelated-private',CANARY]]);
 const holder={metadata:{id:CANARY,name:CANARY},account:{accountId:CANARY,authAccountKey:CANARY}};
 if(options.missingPointer)storage.delete(POINTER);
 if(options.missingLedger)storage.delete(LEDGER);
 if(options.large)holder.metadata.padding='x'.repeat(1048576);
 const browser=vm.createContext({localStorage:{getItem(key){reads.push(key);return storage.get(key)??null;}},window:options.missingTarget?{}:{__q3ActualTarget33:holder}});
 const mockfs={existsSync(){return !!options.exists;},writeFileSync(out,bytes,flags){assert.equal(flags.flag,'wx');assert.deepEqual(Object.keys(flags),['flag']);if(options.race)throw Error('EEXIST '+CANARY+' '+out);writes.push({out,bytes:Buffer.from(bytes),flags});}};
 const context=vm.createContext({__dirname,fs:mockfs,path,crypto,Buffer,console:{log(text){logs.push(JSON.parse(text));}},evalSafe:async fn=>{evaluations.push(fn);return vm.runInContext('('+fn+')()',browser);}});
 // Reuse the actual command-loop error sanitizer; private fs paths remain private.
 const catchStart=source.indexOf("}catch(error){console.log(JSON.stringify({op:command?.op||null,failed:true,failure:");
 const catchEnd=source.indexOf('\n',catchStart);
 assert.ok(catchStart>=0&&catchEnd>catchStart);
 const catchBody=source.slice(catchStart,catchEnd).trim().replace(/\}\}$/, '}');
 const run=vm.runInContext('(async(command)=>{try{'+branch+catchBody+'})',context);
 return{run,reads,writes,logs,evaluations,holder};
}
const command=(kind='ledger',name='q3-ledger-unit-private.json')=>({op:'private-save',kind,name});
function safeSuccess(h){assert.equal(h.logs.length,1);const r=h.logs[0];assert.deepEqual(Object.keys(r).sort(),['op','result']);assert.deepEqual(Object.keys(r.result).sort(),['bytes','savedPrivately','sha256']);assert.equal(r.result.savedPrivately,true);assert.equal(r.result.bytes,h.writes[0].bytes.length);assert.equal(r.result.sha256,crypto.createHash('sha256').update(h.writes[0].bytes).digest('hex'));assert.ok(!JSON.stringify(r).includes(CANARY));}
test('private-save uses only fixed fixture ledger pointer or exact private target and fixed backup',async()=>{
 const h=harness();await h.run(command());assert.deepEqual(h.reads,[POINTER,LEDGER]);assert.equal(h.writes.length,1);assert.equal(h.writes[0].out,path.resolve(__dirname,'../v2-state-recovery-backup/q3-ledger-unit-private.json'));assert.deepEqual(JSON.parse(h.writes[0].bytes),{pointer:{key:POINTER,value:JSON.stringify({run:RUN})},ledger:{id:CANARY,run:RUN}});safeSuccess(h);
 const t=harness();await t.run(command('target','q3-target-unit-private.json'));assert.deepEqual(t.reads,[]);assert.deepEqual(JSON.parse(t.writes[0].bytes),t.holder);assert.equal(t.writes[0].out,path.resolve(__dirname,'../v2-state-recovery-backup/q3-target-unit-private.json'));safeSuccess(t);
});
test('private-save rejects wrong kind, names, traversal, absolute paths and mismatched kind before reads',async()=>{
 for(const [kind,name] of [['other','q3-ledger-unit-private.json'],['target','q3-ledger-unit-private.json'],['ledger','../q3-ledger-unit-private.json'],['ledger','..\\q3-ledger-unit-private.json'],['ledger','C:\\q3-ledger-unit-private.json'],['ledger','\\\\host\\q3-ledger-unit-private.json'],['ledger','q3-ledger-unit-private.json:stream'],['ledger','q3-ledger-Unit-private.json'],['ledger','q3-ledger-unit-private.json\n'],['ledger','q3-ledger-unit-private.json/other'],['ledger','q3-ledger--private.json'],['ledger',null]]){
  const h=harness();await h.run(command(kind,name));assert.deepEqual(h.reads,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(h.logs,[{op:'private-save',failed:true,failure:'PRIVATE_BACKUP_NAME_REQUIRED'}]);
 }
});
test('private-save prevents overwrite including exists/write race and never prints raw fs errors',async()=>{
 const e=harness({exists:true});await e.run(command());assert.deepEqual(e.evaluations,[]);assert.deepEqual(e.writes,[]);assert.deepEqual(e.logs,[{op:'private-save',failed:true,failure:'PRIVATE_BACKUP_EXISTS'}]);
 const r=harness({race:true});await r.run(command());assert.deepEqual(r.writes,[]);assert.deepEqual(r.logs,[{op:'private-save',failed:true,failure:'OWNED_OPERATION_FAILED'}]);assert.ok(!JSON.stringify(r.logs).includes(CANARY));
});
test('private-save missing private sources and serialized byte overflow create no backup',async()=>{
 for(const [options,kind,failure] of [[{missingPointer:true},'ledger','PRIVATE_LEDGER_MISSING'],[{missingLedger:true},'ledger','PRIVATE_LEDGER_MISSING'],[{missingTarget:true},'target','PRIVATE_TARGET_MISSING'],[{large:true},'target','PRIVATE_BACKUP_BYTE_BOUND']]){
  const h=harness(options);await h.run(command(kind,'q3-'+kind+'-unit-private.json'));assert.deepEqual(h.writes,[]);assert.deepEqual(h.logs,[{op:'private-save',failed:true,failure}]);assert.ok(!JSON.stringify(h.logs).includes(CANARY));
 }
});
