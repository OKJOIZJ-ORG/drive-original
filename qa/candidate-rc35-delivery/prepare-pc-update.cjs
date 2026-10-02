'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs');guard.assertSource();
const ready=JSON.parse(fs.readFileSync(path.join(__dirname,'source-readiness.json')));assert(ready.passed&&ready.sourceCommit===guard.SOURCE);
const prior=path.join(guard.root,'qa/rc32-resume-20261001');
let baseline=fs.readFileSync(path.join(prior,'pc-update-baseline.expression.js'),'utf8')
 .replaceAll('rc32','rc35').replaceAll('Rc32','Rc35').replaceAll('1.22.0-rc.31','1.22.0-rc.34');
baseline=baseline.replace('|| !state.accountStateLoaded || !hasUsableToken()',"|| (typeof playerTracksOwner!=='undefined'&&playerTracksOwner) || !state.accountStateLoaded || !hasUsableToken()");
assert(baseline.includes('1.22.0-rc.34')&&baseline.includes('__qaRc35PcUpdate'));
let old=fs.readFileSync(path.join(prior,'source-proof.expression.js'),'utf8');
const factory=old.slice(0,old.indexOf('})({')+2).replaceAll('drive-original.qa.rc32-update-baseline','drive-original.qa.rc35-update-baseline')
 .replace("||state.authStatus!=='online'", "||playerTracksOwner||state.authStatus!=='online'");
assert(factory.endsWith('})')&&factory.includes('||playerTracksOwner||'));
const cached=vm.runInNewContext(guard.blob('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1],{}, {timeout:1000});
const distinct=[...new Set(cached.map(file=>file==='./'?'index.html':file.slice(2)))];assert.equal(distinct.length,49);
const binding={sourceCommit:guard.SOURCE,version:guard.VERSION,sourceSHA256:Object.fromEntries(['app.js','sw.js','version.json'].map(file=>[file,guard.sha(guard.blob(file))]))};
const expected=distinct.map(file=>({file,sha256:guard.sha(guard.blob(file))}));
const expression=factory+'('+JSON.stringify(binding)+','+JSON.stringify(expected)+')\n';
for(const [name,bytes]of [['pc-update-baseline.expression.js',baseline],['pc-source-proof.expression.js',expression]]){
 assert(!fs.existsSync(path.join(__dirname,name)),'Fresh PC preparation required');fs.writeFileSync(path.join(__dirname,name),bytes);
}
const report={...binding,shellExpected:expected,priorProcedureSource:'qa/rc32-resume-20261001',
 beforeVersion:'1.22.0-rc.34',baselineKey:'drive-original.qa.rc35-update-baseline',actualExecution:false,
 baselineSha256:guard.sha(Buffer.from(baseline)),proofSha256:guard.sha(Buffer.from(expression)),producerSha256:guard.sha(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(__dirname,'pc-source-binding.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({prepared:true,source:guard.SOURCE,version:guard.VERSION,cached:49,baselineVersion:report.beforeVersion}));
