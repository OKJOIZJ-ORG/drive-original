import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=new URL('./',import.meta.url),parent=new URL('../rc31-corpus-content-continuity/',base),hash=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function build(){
  const old=JSON.parse(await readFile(new URL('provenance.json',parent))),bindingBytes=await readFile(new URL('binding.json',parent)),binding=JSON.parse(bindingBytes);
  if(hash(await readFile(new URL('factory.expression.js',parent)))!=='a16b13a76a74c38fce71c27d2e1666683798f1bc5626a1cc12d4453aab3d5bea'||binding.version!=='1.22.0-rc.31'||binding.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011')throw Error('FROZEN31_REQUIRED');
  if(hash(await readFile(new URL('../rc31-corpus-serial-runner/runner.expression.js',base)))!=='932a2e06be0d9db8b29b62e7ba4d8ceb7fae4e6f557bbf4ed63c37751aeebb5d'||hash(await readFile(new URL('../rc31-corpus-serial-runner/runner.function.js',base)))!=='8e3073394a10a9454737bfee192ad9b5f7fcbe7a45dc3eed5454df4bf652b166')throw Error('FROZEN31_STRICT_RUNNER_REQUIRED');
  for(const [p,h]of Object.entries(old.producerSHA256))if(hash(await readFile(new URL(p,parent)))!==h)throw Error('FROZEN31_DEPENDENCY_REQUIRED');
  for(const p of ['app.js','sw.js','version.json'])if(hash(execFileSync('git',['show',binding.sourceCommit+':'+p],{cwd:fileURLToPath(new URL('../../',base)),maxBuffer:4*1024*1024}))!==binding.sourceSHA256[p])throw Error('FIXED31_SOURCE_HASH_REQUIRED');
  const parts=[
    ['root','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow',''],
    ['inventory','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=root;'],
    ['selector','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
    ['denominators','../rc21-corpus-night/inventory-denominators.mjs','summarizeInventoryDenominators',''],
    ['normalizers','../rc31-corpus-content-continuity/inventory-normalizers.mjs','stableItemRow',''],
    ['continuity','continuity.mjs','readHeaderState,readHeaderContinuity,createHeaderContinuity,clearHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE',''],
    ['selection','selection.mjs','collectHeaderCandidates,planHeaderCohort','const {stableItemRow}=normalizers;const {normalizeProbeIdentity}=bounded;const {identitySame,RETRYABLE}=continuity;'],
    ['probe','probe.mjs','createHeaderCohort,bindingPinned','const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {summarizeInventoryDenominators}=denominators;const {collectHeaderCandidates,planHeaderCohort}=selection;const {readHeaderState,createHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE}=continuity;']
  ];
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8'))),facade=await readFile(new URL('facade.function.js',parent),'utf8'),fn=await readFile(new URL('runner.function.js',base),'utf8');
  const pin=`const __BINDING__=Object.freeze({...${JSON.stringify(binding)},sourceSHA256:Object.freeze(${JSON.stringify(binding.sourceSHA256)})});`;
  const modules=parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`).join('\n');
  const factory=`(()=>{'use strict';${pin}\n${modules}\nconst facade=(${facade.trim()});const create=runtime=>probe.createHeaderCohort(runtime,{binding:__BINDING__});const entry=(privateContextText,swProof,priorCapsule=null,options={phase:'representatives',maxFiles:8})=>facade.call(create,privateContextText,swProof,priorCapsule,options);entry.clearContinuity=continuity.clearHeaderContinuity;return entry;})()\n`;
  const expression=`(()=>{'use strict';const factory=${factory.trim()};const runner=(${fn.trim()});return (privateContextText,proof)=>runner(factory,privateContextText,proof,${JSON.stringify(binding)});})()\n`;
  const provenance={schema:'drive-original.rc31-prefix-recovery-build/1',binding,producerSHA256:Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),['../rc31-corpus-content-continuity/facade.function.js',hash(facade)],['../rc31-corpus-content-continuity/binding.json',hash(bindingBytes)],['runner.function.js',hash(fn)],['build.mjs',hash(await readFile(new URL('build.mjs',base)))]]),factorySHA256:hash(factory),factoryBytes:Buffer.byteLength(factory),expressionSHA256:hash(expression),expressionBytes:Buffer.byteLength(expression),frozenParentFactorySHA256:hash(await readFile(new URL('factory.expression.js',parent))),frozenParentRunnerSHA256:hash(await readFile(new URL('../rc31-corpus-serial-runner/runner.expression.js',base))),actualExecution:false,actualRequests:0,wholeCorpusComplete:false,freshRegistry:true,historicalActual63NotImported:true,maxFreshAttemptsPerFile:2,metadataFileDeadlineMs:10000,metadataDefaultDeadlineMs:25000,fileDeadlineMs:50000,jobDeadlineMs:600000,burstMaxJobs:8,burstDeadlineMaxMs:4800000,registryMaxUniqueFiles:8192,retryAdmission:'transient-only; immutable-preflight-baseline-required; same-current-catalog-identity-and-fresh-strong-tuple; max-one-extra-fresh-attempt'};
  return {factory,expression,provenance};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const r=await build();for(const [p,v]of [['factory.expression.js',r.factory],['runner.expression.js',r.expression],['provenance.json',JSON.stringify(r.provenance,null,2)+'\n']])await writeFile(new URL(p,base),v);console.log(JSON.stringify({factorySHA256:r.provenance.factorySHA256,expressionSHA256:r.provenance.expressionSHA256,expressionBytes:r.provenance.expressionBytes,actualExecution:false}));}
