import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {bindingPinned} from './probe.mjs';
const base=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function build(){
  const parts=[
    ['root','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow',''],
    ['inventory','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=root;'],
    ['selector','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
    ['denominators','../rc21-corpus-night/inventory-denominators.mjs','summarizeInventoryDenominators',''],
    ['normalizers','inventory-normalizers.mjs','stableItemRow',''],
    ['selection','selection.mjs','collectHeaderCandidates,planHeaderCohort','const {stableItemRow}=normalizers;const {normalizeProbeIdentity}=bounded;'],
    ['continuity','continuity.mjs','readHeaderContinuity,createHeaderContinuity,clearHeaderContinuity,identitySame,contentSame,evidenceEpoch',''],
    ['probe','probe.mjs','createHeaderCohort,bindingPinned','const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {summarizeInventoryDenominators}=denominators;const {collectHeaderCandidates,planHeaderCohort}=selection;const {readHeaderContinuity,createHeaderContinuity,identitySame,contentSame,evidenceEpoch}=continuity;']
  ];
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8'))),facade=await readFile(new URL('facade.function.js',base),'utf8'),sw=await readFile(new URL('sw-proof.function.js',base),'utf8'),bindingBytes=await readFile(new URL('binding.json',base)),binding=JSON.parse(bindingBytes);
  const frozenBytes=await readFile(new URL('../rc28-corpus-content-continuity/provenance.json',base));if(hash(frozenBytes)!=='81a80177566d5262f424f789051b01cd4a134057ebfa1c6b8bb7c2d119bf605e'||hash(await readFile(new URL('../rc28-corpus-content-continuity/factory.expression.js',base)))!=='dec051d9464ada76d96392e0ade15d5247bdfe6820819bc14a254af3f84a655c')throw Error('FROZEN28_SERIALIZER_REQUIRED');const frozen=JSON.parse(frozenBytes);for(let i=0;i<parts.length;i++)if(hash(sources[i])!==frozen.producerSHA256[parts[i][1]])throw Error('FROZEN28_MODULE_REQUIRED');for(const [p,b]of [['facade.function.js',facade],['sw-proof.function.js',sw]])if(hash(b)!==frozen.producerSHA256[p])throw Error('FROZEN28_FACADE_PROOF_REQUIRED');
  if(binding.schema!=='drive-original.corpus-header-source-binding/1'||binding.version!=='1.22.0-rc.31')throw Error('EXPLICIT_EXPECTED_VERSION_REQUIRED');
  if(binding.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011')throw Error('FIXED31_SOURCE_REQUIRED');
  for(const p of ['app.js','sw.js','version.json'])if(hash(execFileSync('git',['show',binding.sourceCommit+':'+p],{cwd:fileURLToPath(new URL('../../',base)),maxBuffer:4*1024*1024}))!==binding.sourceSHA256[p])throw Error('FIXED31_SOURCE_HASH_REQUIRED');
  const pin=`const __BINDING__=Object.freeze({...${JSON.stringify(binding)},sourceSHA256:Object.freeze(${JSON.stringify(binding.sourceSHA256)})});`;
  const modules=parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`).join('\n');
  const expression=`(()=>{'use strict';${pin}\n${modules}\nconst facade=(${facade.trim()});const create=runtime=>probe.createHeaderCohort(runtime,{binding:__BINDING__});const entry=(privateContextText,swProof,priorCapsule=null,options={phase:'representatives',maxFiles:8})=>facade.call(create,privateContextText,swProof,priorCapsule,options);entry.clearContinuity=continuity.clearHeaderContinuity;return entry;})()\n`;
  const swProof=`(()=>{'use strict';${pin}return (${sw.trim()})(__BINDING__);})()\n`;
  const producerSHA256=Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),['facade.function.js',hash(facade)],['sw-proof.function.js',hash(sw)],['binding.json',hash(bindingBytes)],['build.mjs',hash(await readFile(new URL('build.mjs',base)))]]);
  const forkedSourceSHA256=Object.fromEntries(await Promise.all(['probe.mjs','continuity.mjs','build.mjs','facade.function.js','sw-proof.function.js','selection.mjs','inventory-normalizers.mjs'].map(async p=>['../rc22-corpus-headers/'+p,hash(await readFile(new URL('../rc22-corpus-headers/'+p,base)))])));
  return {expression,swProof,provenance:{schema:'drive-original.content-continuity-build/1',binding,bound:bindingPinned(binding),producerSHA256,forkedSourceSHA256,carryAdmission:'same-current-complete-catalog-nonempty-monotonic-file-version-plus-prior-pre-post-immutable-proof',freshHeadChecksForCarry:0,expressionSHA256:hash(expression),swProofSHA256:hash(swProof),inheritedDiagnosticSHA256:hash(await readFile(new URL('../rc21-corpus-night/probe-v3-diagnostic.mjs',base))),frozenParentExpressionSHA256:hash(await readFile(new URL('../rc28-corpus-content-continuity/factory.expression.js',base))),frozenParentProvenanceSHA256:hash(frozenBytes),actualExecution:false}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const result=await build();await writeFile(new URL('factory.expression.js',base),result.expression);await writeFile(new URL('sw-proof.expression.js',base),result.swProof);await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify({bound:result.provenance.bound,expressionSHA256:result.provenance.expressionSHA256,swProofSHA256:result.provenance.swProofSHA256}));}
