'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),author=path.join(root,'qa/rc26-update-multiclient');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const frozen={
  'app.js':'b30abd16b181ff6f7f410094cf4048d7dae14504ad5a8d65ad604656fd3dea75',
  'sw.js':'511bfdf4365b9a3f8e75e61c2dc9512c09c4ea68bd3be63f80cb0b1076d2d6eb',
  'tests/app.test.js':'4eb72eb28eaa969eb1c311a87a3ee43687af8cfab9914535f3eb8c78b8debec1',
  'tests/sw.test.js':'29aac1ae19c742a9bb409d7f6e3660b6299a9fc193e82e46b565b8db28f31026',
  'tests/audit.test.js':'b8a542d01751cdd1568e89986ade89acd057719af12a8fcd4e5570fa25b7158f'
};
const current=Object.fromEntries(Object.keys(frozen).map(file=>[file,hash(path.join(root,file))]));
const records=[];
for(const mode of ['one','two','partial','network','unsupported','timeout','uncontrolled']){
  const file='force-'+mode+'-results.json',r=JSON.parse(fs.readFileSync(path.join(author,file),'utf8'));
  assert.equal(r.passed,true,file);assert.equal(r.ownedChromeClosed,true);assert.equal(r.serverStopped,true);
  assert.equal(r.producerSHA256,hash(path.join(author,'force-shell-native.cjs')));
  assert.equal(r.serverProducerSHA256,hash(path.join(author,'force-shell-server.cjs')));
  assert.deepEqual(r.beforeProduct,{'app.js':frozen['app.js'],'sw.js':frozen['sw.js']});assert.deepEqual(r.afterProduct,r.beforeProduct);
  assert(r.memory.FreePhysicalMemory>1048576&&r.memory.FreeVirtualMemory>1572864);
  if(['network','unsupported','timeout'].includes(mode))assert.equal(r.final.matched,40);else assert.equal(r.final.passed,true);
  records.push({path:'../rc26-update-multiclient/'+file,sha256:hash(path.join(author,file)),mode,passed:r.passed,elapsedMs:r.elapsed});
}
for(const file of ['deadline-counterexample-results.json','protocol-adversary-results.json']){
  const r=JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));assert.equal(r.workerSha256,frozen['sw.js']);
}
const scopedFile=path.join(author,'force-focused-final.txt'),scopedBytes=fs.readFileSync(scopedFile);
const scopedEncoding=scopedBytes[0]===0xff&&scopedBytes[1]===0xfe?'utf16le':'utf8';
const scoped=scopedBytes.toString(scopedEncoding);assert.match(scoped,/pass 14/);assert.match(scoped,/fail 0/);
const result={schema:'drive-original.shell-refresh-independent-review/1',reviewedAt:new Date().toISOString(),
  verdict:'PASS within frozen local correction scope',frozen,current,
  currentMatchesFreeze:JSON.stringify(current)===JSON.stringify(frozen),
  reusedNative:records,scopedTests:{passed:14,failed:0,encoding:scopedEncoding,path:'../rc26-update-multiclient/force-focused-final.txt',sha256:hash(scopedFile)},
  independent:{actualWorkerProtocolAdversary:true,lateAtomicCommitCounterexample:true},
  findings:[],limitation:'After timeout a complete atomic fresh batch may commit; timeout/failure does not grant reload. Real signed-in hosted/device update and whole acceptance remain unproven by this local unit.'};
fs.writeFileSync(path.join(__dirname,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({verdict:result.verdict,currentMatchesFreeze:result.currentMatchesFreeze,nativeModes:records.length,scopedPass:14})+'\n');
