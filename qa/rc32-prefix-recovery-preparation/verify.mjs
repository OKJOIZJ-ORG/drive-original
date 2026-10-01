import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build,sha256} from './build.mjs';
const base=new URL('./',import.meta.url),get=p=>readFile(new URL(p,base));
const built=await build();
for(const [p,value]of [['factory.expression.js',built.factory],['runner.expression.js',built.expression],['sw-proof.expression.js',built.proof],['derive-context.expression.js',built.context]]){assert.equal(sha256(await get(p)),sha256(value));new vm.Script(value);}
assert.deepEqual(JSON.parse(await get('provenance.json')),built.provenance);
if(process.argv.includes('--check')){
 const frozen=JSON.parse(await get('freeze.json'));
 for(const [p,h]of Object.entries(frozen.fileSHA256))assert.equal(sha256(await get(p)),h,p);
 for(const [p,h]of Object.entries(frozen.inputSHA256))assert.equal(sha256(await get(p)),h,p);
 console.log(JSON.stringify({frozen:true,files:Object.keys(frozen.fileSHA256).length,inputFiles:Object.keys(frozen.inputSHA256).length,expressionSHA256:built.provenance.expressionSHA256,actualExecution:false}));
}else{
 const tests=['recovery.test.mjs','runner.test.mjs','rebind.test.mjs'];
 const tap=execFileSync(process.execPath,['--test','--test-reporter=tap',...tests.map(p=>fileURLToPath(new URL(p,base)))],{maxBuffer:4*1024*1024,encoding:'utf8'});
 assert.match(tap,/# fail 0(?:\r?\n|$)/);const passed=Number(tap.match(/# tests (\d+)/)?.[1]);assert.equal(passed,21);
 await writeFile(new URL('local-tests.tap',base),tap);
 const cases=[...tap.matchAll(/^ok \d+ - (.+)$/gm)].map(x=>({name:x[1],passed:true}));assert.equal(cases.length,passed);
 const files=['binding.json','inputs.json','build.mjs','continuity.mjs','selection.mjs','probe.mjs','runner.function.js','fixture.mjs',...tests,'verify.mjs','README.md','factory.expression.js','runner.expression.js','sw-proof.expression.js','derive-context.expression.js','provenance.json','local-tests.tap','local-verification.json','curated-savepoint.json','freeze.json'];
 await writeFile(new URL('local-verification.json',base),JSON.stringify({schema:'drive-original.rc32-prefix-recovery-local/1',passed,cases,syntax:true,actualExecution:false,actualRequests:0,privateDataUsed:false,syntheticLexicalInventoryFacade:true,wholeCorpusComplete:false,immutableSource:built.provenance.binding,maxFreshAttemptsPerFile:2,registryMaxUniqueFiles:8192,oldRegistryImported:false,historicalActual63NotImported:true,codecConfigUnionProbed:false,actualImageHeaderCoverage:false},null,2)+'\n');
 await writeFile(new URL('curated-savepoint.json',base),JSON.stringify({schema:'drive-original.rc32-prefix-recovery-savepoint/1',exactOwnedFiles:files.map(p=>'qa/rc32-prefix-recovery-preparation/'+p),commitOwner:'root',actualResultsExcluded:true,privateDataExcluded:true},null,2)+'\n');
 const fileSHA256=Object.fromEntries(await Promise.all(files.filter(p=>p!=='freeze.json').map(async p=>[p,sha256(await get(p))]))),inputs=JSON.parse(await get('inputs.json'));
 await writeFile(new URL('freeze.json',base),JSON.stringify({schema:'drive-original.rc32-prefix-recovery-freeze/1',fileSHA256,inputSHA256:inputs.files,actualExecution:false,actualRequests:0},null,2)+'\n');
 console.log(JSON.stringify({passed,syntax:true,expressionSHA256:built.provenance.expressionSHA256,expressionBytes:built.provenance.expressionBytes,freezeSHA256:sha256(await get('freeze.json')),actualRequests:0}));
}
