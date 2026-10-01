import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build as build31} from '../rc31-prefix-recovery-preparation/build.mjs';
const base=new URL('./',import.meta.url),root=new URL('../../',base);
export const COMMITTED32='1d79897fd32c569137cab079bfd93107be2ee33f';
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const get=p=>readFile(new URL(p,base));
const oldVersion='1.22.0-rc.31',oldCommit='4a484e6f839d2e6c3eb83503acb08147362cb011';
export async function verifyInputs(read=get){
 const inputs=JSON.parse(await get('inputs.json'));
 for(const [p,h] of Object.entries(inputs.files)){
  if(!/^\.\.\/[a-z0-9-]+\/[a-zA-Z0-9.-]+$/.test(p)||/backup|private|actual|raw|readback/i.test(p))throw Error('INPUT_SCOPE_REJECTED');
  if(sha256(await read(p))!==h)throw Error('FROZEN_INPUT_DRIFT:'+p);
 }
 return inputs;
}
export async function build(commit=COMMITTED32){
 if(commit!==COMMITTED32)throw Error('EXACT_COMMITTED32_REQUIRED');
 await verifyInputs();
 const binding=JSON.parse(await get('binding.json'));
 if(binding.version!=='1.22.0-rc.32'||binding.sourceCommit!==commit||Object.keys(binding.sourceSHA256).sort().join(',')!=='app.js,sw.js,version.json')throw Error('FIXED32_REQUIRED');
 if(execFileSync('git',['rev-parse',commit+'^{commit}'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim()!==commit)throw Error('COMMITTED_SHA_REQUIRED');
 for(const p of Object.keys(binding.sourceSHA256))if(sha256(execFileSync('git',['show',commit+':'+p],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024}))!==binding.sourceSHA256[p])throw Error('FIXED32_SOURCE_HASH_REQUIRED');
 if(JSON.parse(execFileSync('git',['show',commit+':version.json'],{cwd:fileURLToPath(root)})).version!==binding.version)throw Error('FIXED32_VERSION_REQUIRED');
 const inherited=await build31();
 if(inherited.provenance.factorySHA256!==sha256(await get('../rc31-prefix-recovery-preparation/factory.expression.js'))||inherited.provenance.expressionSHA256!==sha256(await get('../rc31-prefix-recovery-preparation/runner.expression.js')))throw Error('FROZEN31_OUTPUT_REQUIRED');
 const rebind=text=>{
  for(const [a,b] of [[oldVersion,binding.version],[oldCommit,binding.sourceCommit],...Object.keys(binding.sourceSHA256).map(k=>[inherited.provenance.binding.sourceSHA256[k],binding.sourceSHA256[k]]),['rc31-prefix-recovery','rc32-prefix-recovery']])text=text.split(a).join(b);
  if([oldVersion,oldCommit,...Object.values(inherited.provenance.binding.sourceSHA256)].some(x=>text.includes(x)))throw Error('OLD_LITERAL_REMAINS');
  return text;
 };
 for(const p of ['continuity.mjs','selection.mjs','probe.mjs','runner.function.js']){
  const original=await readFile(new URL('../rc31-prefix-recovery-preparation/'+p,base),'utf8'),local=await readFile(new URL(p,base),'utf8');
  if(local!==(p==='runner.function.js'?rebind(original):original))throw Error('INHERITED_LOGIC_CHANGED:'+p);
 }
 const factory=rebind(inherited.factory),expression=rebind(inherited.expression);
 new vm.Script(factory);new vm.Script(expression);
 const proof=await readFile(new URL('../rc32-format-acceptance/sw-proof.expression.js',base),'utf8'),context=await readFile(new URL('../rc32-format-acceptance/derive-context.expression.js',base),'utf8');
 const sourceModules=['media/drive-source.mjs','media/ts-player.mjs','media/general-player.mjs','media/general-admission.mjs','media/general-codec.mjs'];
 const provenance={...inherited.provenance,schema:'drive-original.rc32-prefix-recovery-build/1',binding,producerSHA256:Object.fromEntries(await Promise.all(['build.mjs','inputs.json','binding.json','continuity.mjs','selection.mjs','probe.mjs','runner.function.js'].map(async p=>[p,sha256(await get(p))]))),inputFreezeSHA256:sha256(await get('inputs.json')),sourceModuleSHA256:Object.fromEntries(sourceModules.map(p=>[p,sha256(execFileSync('git',['show',commit+':'+p],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024}))])),factorySHA256:sha256(factory),factoryBytes:Buffer.byteLength(factory),expressionSHA256:sha256(expression),expressionBytes:Buffer.byteLength(expression),inheritedFactorySHA256:inherited.provenance.factorySHA256,inheritedRunnerSHA256:inherited.provenance.expressionSHA256,literalReplacementOnly:true,parserSelectorReaderCapsChanged:false,oldPrivateRegistryImported:false,codecConfigUnionProbed:false,actualImageHeaderCoverage:false,proofSHA256:sha256(proof),contextSHA256:sha256(context),actualExecution:false,actualRequests:0};
 return {factory,expression,proof,context,provenance};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const r=await build(process.argv[2]??COMMITTED32);
 for(const [p,v]of [['factory.expression.js',r.factory],['runner.expression.js',r.expression],['sw-proof.expression.js',r.proof],['derive-context.expression.js',r.context],['provenance.json',JSON.stringify(r.provenance,null,2)+'\n']])await writeFile(new URL(p,base),v);
 console.log(JSON.stringify({factorySHA256:r.provenance.factorySHA256,expressionSHA256:r.provenance.expressionSHA256,expressionBytes:r.provenance.expressionBytes,actualExecution:false}));
}
