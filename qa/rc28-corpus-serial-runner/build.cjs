'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const base=__dirname,old=path.resolve(base,'../rc28-corpus-content-continuity'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const factory=fs.readFileSync(path.join(old,'factory.expression.js'),'utf8'),binding=JSON.parse(fs.readFileSync(path.join(old,'binding.json'))),fn=fs.readFileSync(path.join(base,'runner.function.js'),'utf8');
assert.equal(hash(factory),'dec051d9464ada76d96392e0ade15d5247bdfe6820819bc14a254af3f84a655c');assert.equal(binding.sourceCommit,'944f00607cf05e586b1c88e2876dd796ce114e82');assert.equal(binding.version,'1.22.0-rc.28');
assert(factory.includes(JSON.stringify(binding)),'EXACT_FACTORY_BINDING_REQUIRED');
// Root supplies private context and accepted current proof as direct function arguments.
const expression=`(()=>{'use strict';const factory=${factory.trim()};const runner=(${fn.trim()});return (privateContextText,proof)=>runner(factory,privateContextText,proof,${JSON.stringify(binding)});})()\n`;
fs.writeFileSync(path.join(base,'runner.expression.js'),expression);
const provenance={schema:'drive-original.rc28-serial-runner-build/1',binding,factorySHA256:hash(factory),factoryBytes:Buffer.byteLength(factory),runnerFunctionSHA256:hash(fn),expressionSHA256:hash(expression),expressionBytes:Buffer.byteLength(expression),actualExecution:false,wholeCorpusComplete:false};fs.writeFileSync(path.join(base,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');console.log(JSON.stringify(provenance));
