'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,prior=path.resolve(dir,'../rc30-resume-20261001');
const input=JSON.parse(fs.readFileSync(path.join(prior,'sourcebinding.json'),'utf8'));
const binding={sourceCommit:input.sourceCommit,version:input.version,sourceSHA256:input.sourceSHA256,
  immutableGitObjects:input.immutableGitObjects,actualExecution:false};
if(binding.sourceCommit!=='aa46bd083ce8c21f55cf7d9a4759f0d6709188c2'||binding.version!=='1.22.0-rc.30')throw Error('BINDING_DRIFT');
fs.writeFileSync(path.join(dir,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const source=fs.readFileSync(path.join(dir,'single-file-observer.function.js'),'utf8');
fs.writeFileSync(path.join(dir,'single-file-observer.expression.js'),'('+source+')('+JSON.stringify(binding)+')\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={actualExecution:false,sourceCommit:binding.sourceCommit,files:{},maintainedDependencies:{}};
for(const name of ['binding.json','single-file-observer.function.js','single-file-observer.expression.js']){
 const b=fs.readFileSync(path.join(dir,name));report.files[name]={bytes:b.length,sha256:sha(b)};
}
for(const name of ['sourcebinding.json','android-ui-common-rc30.cjs','source-proof.expression.js']){
 const b=fs.readFileSync(path.join(prior,name));report.maintainedDependencies['qa/rc30-resume-20261001/'+name]={bytes:b.length,sha256:sha(b)};
}
fs.writeFileSync(path.join(dir,'preparation-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
