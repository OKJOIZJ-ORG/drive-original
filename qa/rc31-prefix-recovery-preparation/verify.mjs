import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from './build.mjs';
const base=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex'),get=p=>readFile(new URL(p,base));
const built=await build();assert.equal(hash(await get('factory.expression.js')),built.provenance.factorySHA256);assert.equal(hash(await get('runner.expression.js')),built.provenance.expressionSHA256);assert.deepEqual(JSON.parse(await get('provenance.json')),built.provenance);
new vm.Script(await get('factory.expression.js'));new vm.Script(await get('runner.expression.js'));
if(process.argv.includes('--check')){
 const frozen=JSON.parse(await get('freeze.json'));for(const [p,h]of Object.entries(frozen.fileSHA256))assert.equal(hash(await get(p)),h,p);for(const [p,h]of Object.entries(frozen.historicalFileSHA256))assert.equal(hash(await get(p)),h,p);
 console.log(JSON.stringify({frozen:true,files:Object.keys(frozen.fileSHA256).length,historicalFiles:Object.keys(frozen.historicalFileSHA256).length,expressionSHA256:built.provenance.expressionSHA256,actualExecution:false}));
}else{
 const tap=execFileSync(process.execPath,['--test','--test-reporter=tap',fileURLToPath(new URL('recovery.test.mjs',base)),fileURLToPath(new URL('runner.test.mjs',base))],{maxBuffer:4*1024*1024,encoding:'utf8'});
 assert.match(tap,/# fail 0(?:\r?\n|$)/);const count=Number(tap.match(/# tests (\d+)/)?.[1]);assert.equal(count,19);await writeFile(new URL('local-tests.tap',base),tap);
 const cases=[...tap.matchAll(/^ok \d+ - (.+)$/gm)].map(x=>({name:x[1],passed:true}));assert.equal(cases.length,19);
 const files=['build.mjs','continuity.mjs','selection.mjs','probe.mjs','runner.function.js','fixture.mjs','recovery.test.mjs','runner.test.mjs','verify.mjs','README.md','factory.expression.js','runner.expression.js','provenance.json','local-tests.tap','local-verification.json','curated-savepoint.json','freeze.json'];
 await writeFile(new URL('local-verification.json',base),JSON.stringify({schema:'drive-original.rc31-prefix-recovery-local/1',passed:count,cases,syntax:true,actualExecution:false,actualRequests:0,privateDataUsed:false,syntheticLexicalInventoryFacade:true,wholeCorpusComplete:false,immutableSource:built.provenance.binding,maxFreshAttemptsPerFile:2,registryMaxUniqueFiles:8192,oldRegistryImported:false,historicalActual63NotImported:true},null,2)+'\n');
 await writeFile(new URL('curated-savepoint.json',base),JSON.stringify({schema:'drive-original.rc31-prefix-recovery-savepoint/1',exactOwnedFiles:files.map(p=>'qa/rc31-prefix-recovery-preparation/'+p),commitOwner:'root',actualResultsExcluded:true,privateDataExcluded:true},null,2)+'\n');
 const history={};for(const leaf of ['rc31-corpus-content-continuity','rc31-corpus-serial-runner'])for(const p of await readdir(new URL('../'+leaf+'/',base))){const rel='../'+leaf+'/'+p;try{history[rel]=hash(await get(rel));}catch(e){if(e.code!=='EISDIR')throw e;}}
 const fileSHA256=Object.fromEntries(await Promise.all(files.filter(p=>p!=='freeze.json').map(async p=>[p,hash(await get(p))])));await writeFile(new URL('freeze.json',base),JSON.stringify({schema:'drive-original.rc31-prefix-recovery-freeze/1',fileSHA256,historicalFileSHA256:history,actualExecution:false,actualRequests:0},null,2)+'\n');
 console.log(JSON.stringify({passed:count,syntax:true,expressionSHA256:built.provenance.expressionSHA256,expressionBytes:built.provenance.expressionBytes,freezeSHA256:hash(await get('freeze.json')),actualRequests:0}));
}
