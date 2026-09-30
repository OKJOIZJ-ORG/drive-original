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
    ['continuity','continuity.mjs','readHeaderContinuity,createHeaderContinuity,clearHeaderContinuity,identitySame,contentSame,validationEpoch',''],
    ['probe','probe.mjs','createHeaderCohort,bindingPinned','const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {summarizeInventoryDenominators}=denominators;const {collectHeaderCandidates,planHeaderCohort}=selection;const {readHeaderContinuity,createHeaderContinuity,identitySame,contentSame,validationEpoch}=continuity;']
  ];
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8'))),facade=await readFile(new URL('facade.function.js',base),'utf8'),sw=await readFile(new URL('sw-proof.function.js',base),'utf8'),bindingBytes=await readFile(new URL('binding.json',base)),binding=JSON.parse(bindingBytes);
  if(binding.schema!=='drive-original.corpus-header-source-binding/1'||binding.version!=='1.22.0-rc.24')throw Error('EXPLICIT_EXPECTED_VERSION_REQUIRED');
  const pin=`const __BINDING__=Object.freeze({...${JSON.stringify(binding)},sourceSHA256:Object.freeze(${JSON.stringify(binding.sourceSHA256)})});`;
  const modules=parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`).join('\n');
  const expression=`(()=>{'use strict';${pin}\n${modules}\nconst facade=(${facade.trim()});const create=runtime=>probe.createHeaderCohort(runtime,{binding:__BINDING__});const entry=(privateContextText,swProof,priorCapsule=null,options={phase:'representatives',maxFiles:8})=>facade.call(create,privateContextText,swProof,priorCapsule,options);entry.clearContinuity=continuity.clearHeaderContinuity;return entry;})()\n`;
  const swProof=`(()=>{'use strict';${pin}return (${sw.trim()})(__BINDING__);})()\n`;
  const producerSHA256=Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),['facade.function.js',hash(facade)],['sw-proof.function.js',hash(sw)],['binding.json',hash(bindingBytes)],['build.mjs',hash(await readFile(new URL('build.mjs',base)))]]);
  return {expression,swProof,provenance:{schema:'drive-original.bounded-corpus-headers-build/1',binding,bound:bindingPinned(binding),producerSHA256,expressionSHA256:hash(expression),swProofSHA256:hash(swProof),inheritedDiagnosticSHA256:hash(await readFile(new URL('../rc21-corpus-night/probe-v3-diagnostic.mjs',base))),actualExecution:false}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const result=await build();await writeFile(new URL('factory.expression.js',base),result.expression);await writeFile(new URL('sw-proof.expression.js',base),result.swProof);await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify({bound:result.provenance.bound,expressionSHA256:result.provenance.expressionSHA256,swProofSHA256:result.provenance.swProofSHA256}));}
