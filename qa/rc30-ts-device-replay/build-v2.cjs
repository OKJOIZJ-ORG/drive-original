'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),dir=__dirname;
const original=fs.readFileSync(path.join(dir,'single-file-observer.function.js'),'utf8');
if(sha(Buffer.from(original))!=='9bad9e5170afae6db6ef5f1a2d5fdfcb84080ead108e129ae94323595dc881b3')throw Error('FROZEN_V1_DRIFT');
const needle="const pipelineReady = !s.pipeline || ['ready', 'ended'].includes(s.pipeline.phase);";
if(original.split(needle).length!==2)throw Error('V2_REPLACEMENT_CONTRACT');
const v2=original.replace(needle,"// A presented target frame can precede adapter readiness. Record that discriminator,\n        // while rejecting a retired/failed current pipeline. Watchdog/readiness remain separate.\n        const pipelineReady = !s.pipeline || (!['failed', 'cancelled'].includes(s.pipeline.phase) && !s.pipeline.disposed);");
fs.writeFileSync(path.join(dir,'single-file-observer-v2.function.js'),v2);
const binding=JSON.parse(fs.readFileSync(path.join(dir,'binding.json'),'utf8'));
fs.writeFileSync(path.join(dir,'single-file-observer-v2.expression.js'),'('+v2+')('+JSON.stringify(binding)+')\n');
const report={actualExecution:false,sourceCommit:binding.sourceCommit,parentV1FunctionSha256:sha(Buffer.from(original)),
 change:'Current fenced presented target frames may qualify before adapter ready; readiness and watchdog remain separate; failed/cancelled/disposed pipelines still fail.',files:{}};
for(const name of ['single-file-observer-v2.function.js','single-file-observer-v2.expression.js','native-folder-target.function.js']){
 const b=fs.readFileSync(path.join(dir,name));report.files[name]={bytes:b.length,sha256:sha(b)};
}
fs.writeFileSync(path.join(dir,'preparation-v2-provenance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
