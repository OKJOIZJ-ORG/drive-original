'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const b=require('./bind.cjs'),ROOT=path.resolve(__dirname,'../..');
const mockSource='a'.repeat(40),version='1.22.0-rc.34';
function mockGet(source,n){assert.equal(source,mockSource);const bytes=cp.execFileSync('git',['show',`${b.OLD_SOURCE}:${n}`],{cwd:ROOT,maxBuffer:16777216});if(['app.js','sw.js','version.json'].includes(n))return Buffer.from(bytes.toString('utf8').replaceAll(b.OLD_VERSION,version));return bytes;}
test('frozen templates verify exact bytes; build uses explicit Git source and never reads private input',()=>{
 const input=b.templates();assert.equal(Object.keys(input).length,9);const originalRead=fs.readFileSync;fs.readFileSync=function(file,...args){assert.ok(!String(file).includes('q3-target-cua1-1-private'));return originalRead.call(this,file,...args);};let built;try{built=b.build(mockSource,version,{get:mockGet,input});}finally{fs.readFileSync=originalRead;}
 assert.equal(built.binding.sourceCommit,mockSource);assert.equal(built.binding.version,version);assert.equal(built.binding.cache.length,46);assert.deepEqual(built.binding.fixture,JSON.parse(input['binding-observer.json']).fixture);
 for(const[n,bytes]of Object.entries(built.out)){if(n.endsWith('.cjs'))cp.execFileSync(process.execPath,['--check','--input-type=commonjs'],{input:bytes});else if(n.endsWith('.js'))new vm.Script(bytes.toString('utf8'));}
 const manifest=JSON.parse(built.out['observer-manifest.json']);for(const r of manifest.files)assert.equal(r.sha256,b.hash(built.out[r.file]));
 const actor=built.out['android-q3-actor.cjs'].toString(),eof=built.out['android-q3-eof-actor.cjs'].toString(),helper=built.out['eof-observer.function.js'].toString();
 assert.ok(actor.includes(b.hash(built.out['source-proof.expression.js'])));assert.ok(eof.includes(b.hash(built.out['android-q3-actor.cjs'])));assert.ok(eof.includes(b.hash(built.out['eof-observer.function.js'])));
 assert.match(actor,/2604a0f5da6e1d380046b5c3dcc558e372e7e358104d3b5b63d2255c2f663167/);assert.match(eof,/started \+ 300000/);assert.match(eof,/started \+ 345000/);assert.match(eof,/fullOutputQuality: 'NOT_QUALIFIED'/);assert.match(helper,/clockMapping && label/);assert.match(helper,/metrics\?\.decoded === 5400/);assert.match(helper,/literalSourceByteOffsetAtFileSize: 'UNKNOWN'/);assert.match(helper,/cacheHits/);assert.equal(b.hash(built.out['resource-watch.cjs']),b.PINS['resource-watch.cjs']);
});
test('missing/symbolic/rc33 identity and committed version/cache drift fail closed without output',()=>{
 for(const s of [undefined,'HEAD','main','a7101ee',b.OLD_SOURCE])assert.throws(()=>b.identity(s,version),/EXPLICIT_RC34/);assert.throws(()=>b.identity(mockSource,b.OLD_VERSION),/EXPLICIT_RC34/);
 const input=b.templates();assert.throws(()=>b.build(mockSource,version,{input,get:(s,n)=>n==='version.json'?Buffer.from('{"version":"wrong"}'):mockGet(s,n)}),/COMMITTED_VERSION/);
 assert.throws(()=>b.build(mockSource,version,{input,get:(s,n)=>n==='sw.js'?Buffer.from(mockGet(s,n).toString().replace("  './media/general-source.mjs',",'')):mockGet(s,n)}),/CACHE_CONTRACT/);
 assert.throws(()=>b.exact('missing','anchor','replacement'),/UNIQUE_TEMPLATE/);assert.throws(()=>b.exact('twice twice','twice','replacement'),/UNIQUE_TEMPLATE/);
});
test('delivery admission requires canonical future proof and exact SHA; no mock proof is created or adopted',()=>{
 assert.throws(()=>b.delivery(mockSource,version,'elsewhere-safe.json','b'.repeat(64)),/CANONICAL_DELIVERY/);assert.throws(()=>b.delivery(mockSource,version,'qa/candidate-rc34-delivery/source-readiness.json',undefined),/EXPLICIT_DELIVERY_SHA/);
 const originalRead=fs.readFileSync;fs.readFileSync=()=>Buffer.from('{"passed":false}');try{assert.throws(()=>b.delivery(mockSource,version,'qa/candidate-rc34-delivery/source-readiness.json','b'.repeat(64)),/DELIVERY_PROOF_PIN/);const bad=Buffer.from('{"passed":false}');assert.throws(()=>b.delivery(mockSource,version,'qa/candidate-rc34-delivery/source-readiness.json',b.hash(bad)),/EXACT_DELIVERY/);}finally{fs.readFileSync=originalRead;}
 const code=fs.readFileSync(path.join(__dirname,'bind.cjs'),'utf8');assert.doesNotMatch(code,/\['show',.*HEAD|fetch\(|adb\(|connectOverCDP|callTool/);assert.match(code,/NEW_BINDING_ONLY_NO_OVERWRITE/);
});
test('canonical UUID worker identity admits only same-source SHA-pinned deployment/control records; mocks remain in memory',()=>{
 const canonical=JSON.parse(fs.readFileSync(path.join(ROOT,'qa/candidate-rc33-delivery/source-readiness.json'))),worker=canonical.workerVersion;
 assert.match(worker,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.equal(canonical.distributionEvidence.workerVersion,worker);
 function trial(change,pattern){
  const ready={...canonical,sourceCommit:mockSource,version,distributionEvidence:{...canonical.distributionEvidence,sourceCommit:mockSource}},deployed={source:mockSource,workerVersion:worker,passed:true,stable:true,candidateUrl:canonical.distributionEvidence.candidateUrl},control={schema:1,source:mockSource,workerVersion:worker};
  change?.({ready,deployed,control});const files=new Map();
  for(const[n,record,key]of [['deployment.json',deployed,'deploymentRecord'],['redacted-readback.json',control,'controlPlaneRecord']]){const bytes=Buffer.from(JSON.stringify(record)),relative=`qa/candidate-rc34-delivery/${n}`;files.set(path.join(ROOT,relative),bytes);ready.distributionEvidence[key]={path:relative,sha256:b.hash(bytes)};}
  const file='qa/candidate-rc34-delivery/source-readiness.json',bytes=Buffer.from(JSON.stringify(ready));files.set(path.join(ROOT,file),bytes);
  const originalRead=fs.readFileSync;fs.readFileSync=file=>{const value=files.get(String(file));if(!value)throw Error('MOCK_UNEXPECTED_READ');return value;};
  try{if(pattern)assert.throws(()=>b.delivery(mockSource,version,file,b.hash(bytes)),pattern);else{const proof=b.delivery(mockSource,version,file,b.hash(bytes));assert.equal(proof.workerVersion,worker);assert.equal(proof.sourceCommit,mockSource);assert.equal(proof.version,version);assert.equal(proof.deploymentRecord.sha256,b.hash(files.get(path.join(ROOT,'qa/candidate-rc34-delivery/deployment.json'))));}}finally{fs.readFileSync=originalRead;}
 }
 trial();
 for(const change of [({ready})=>{delete ready.workerVersion;},({ready})=>{ready.workerVersion=version;},({ready})=>{ready.distributionEvidence.workerVersion='b'.repeat(8)+'-bbbb-bbbb-bbbb-'+ 'b'.repeat(12);},({ready})=>{ready.distributionEvidence.sourceCommit='b'.repeat(40);},({deployed})=>{deployed.source='b'.repeat(40);},({control})=>{control.source='b'.repeat(40);},({deployed})=>{delete deployed.workerVersion;},({control})=>{control.workerVersion='b'.repeat(8)+'-bbbb-bbbb-bbbb-'+ 'b'.repeat(12);},({deployed})=>{deployed.passed=false;}])trial(change,/EXACT_DELIVERY_WORKER_IDENTITY/);
 trial(({ready})=>{ready.sourceCommit='b'.repeat(40);},/EXACT_DELIVERY_PROOF/);trial(({ready})=>{ready.version=b.OLD_VERSION;},/EXACT_DELIVERY_PROOF/);
});
