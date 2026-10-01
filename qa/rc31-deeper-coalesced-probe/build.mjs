import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function build(){
  const parts=[
    ['root','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow',''],
    ['inventory','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=root;'],
    ['selector','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
    ['scanner','../v2-07a-isobmff-index/isobmff-index.mjs','scanIsoBmffTopLevel',''],
    ['parser','../v2-07a-iso-tracks-rc11/parser.mjs','parseMoov',''],
    ['readCache','../rc21-corpus-night/metadata-read-cache.mjs','createMetadataReadCache',''],
    ['sparse','../rc21-corpus-night/sparse-moov.mjs','readSparseMoov','const {createMetadataReadCache}=readCache;'],
    ['ebml','../rc16-corpus-tracks/ebml-tracks.mjs','readEbmlTracks',''],
    ['comparison','../v2-07a-current-corpus-probe/comparison-diagnostics.mjs','diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic',''],
    ['denominators','../rc21-corpus-night/inventory-denominators.mjs','summarizeInventoryDenominators,summarizeProbeDenominators',''],
    ['selection','selection.mjs','planDeepCohorts,safeReferences','const {normalizeProbeIdentity}=bounded;'],
    ['windows','moov-window-cache.mjs','createMoovWindowCache',''],
    ['diagnostics','diagnostics.mjs','sanitizeFailureDiagnostic',''],
    ['probe','probe.mjs','createCorpusTracksProbe','const {createMoovWindowCache}=windows;const {sanitizeFailureDiagnostic}=diagnostics;const {planDeepCohorts,safeReferences}=selection;const {summarizeInventoryDenominators,summarizeProbeDenominators}=denominators;const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory,rootFence,stableItemRow}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic}=comparison;']
  ];
  const pin=JSON.parse(await readFile(new URL('binding.json',base)));if(pin.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011'||pin.version!=='1.22.0-rc.31')throw Error('FIXED31_REQUIRED');for(const p of ['app.js','sw.js','version.json'])if(hash(execFileSync('git',['show',pin.sourceCommit+':'+p],{cwd:fileURLToPath(new URL('../../',base))}))!==pin.sourceSHA256[p])throw Error('FIXED31_HASH_REQUIRED');
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8')));
  const frozenBytes=await readFile(new URL('../rc29-deeper-coalesced-probe/provenance.json',base));if(hash(frozenBytes)!=='910fe2a5058c276a81b217aacc34152aa3d8bf9692e38874ce84218976c6aa09'||hash(await readFile(new URL('../rc29-deeper-coalesced-probe/factory.expression.js',base)))!=='09908e9ee8bd3ca3b1e8df5e03112b3a8d02ac62d69a128a4ffe60a11f8daa4b')throw Error('FROZEN29_DELIVERED_SERIALIZER_REQUIRED');const frozen=JSON.parse(frozenBytes);
  for(let i=0;i<parts.length;i++){const p=parts[i][1];if(p==='probe.mjs')continue;if(hash(sources[i])!==frozen.producerSHA256[p])throw Error('FROZEN29_MODULE_HASH_REQUIRED:'+p);}
  const previousProbe=await readFile(new URL('../rc29-deeper-coalesced-probe/probe.mjs',base),'utf8');const normalizeProbe=s=>s.replace(/^export const BINDING=.*$/m,'PIN').replace(/^export const VERSION=.*$/m,'VERSION').replace(/\r\n?/g,'\n');if(normalizeProbe(sources[parts.findIndex(x=>x[0]==='probe')])!==normalizeProbe(previousProbe)||hash(previousProbe)!==frozen.producerSHA256['probe.mjs'])throw Error('FROZEN29_PROBE_LOGIC_REQUIRED');
  const facadePath='facade.function.js',originalFacade=await readFile(new URL(facadePath,base),'utf8');
  if(hash(originalFacade)!==frozen.producerSHA256[facadePath])throw Error('FROZEN29_FACADE_REQUIRED');
  const facadePins=originalFacade.match(/1\.22\.0-rc\.16/g)??[];if(facadePins.length!==2)throw Error('FACADE_PIN_COUNT');
  const facade=originalFacade.replaceAll('1.22.0-rc.16','1.22.0-rc.31');
  const factory=['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`),'return (runtime,witness)=>probe.createCorpusTracksProbe(runtime,{selectionWitness:witness,canonicalNormalizers:{rootFence:root.rootFence,stableItemRow:root.stableItemRow}});','})()'].join('\n');
  const wrapper=await readFile(new URL('entry.function.js',base),'utf8');if(hash(wrapper)!==frozen.producerSHA256['entry.function.js'])throw Error('FROZEN29_ENTRY_REQUIRED');const binding=JSON.parse(await readFile(new URL('binding.json',base)));
  const expression=`(()=>{const create=${factory};const facade=(${facade.trim()});return (${wrapper.trim()})(create,facade,${JSON.stringify(binding)});})()\n`;
  return {expression,provenance:{schema:'drive-original.rc31-deeper-coalesced-probe-build/1',version:'1.22.0-rc.31',derivativeOf:'qa/rc29-deeper-coalesced-probe',additiveDiagnostic:true,validatedMoovWindows:true,perFileVerifiedDeferral:true,generatedSelectionBindingFixed:true,planFunctionChanged:false,safeReferenceRedactionCorrected:true,readOnlyProbeModeEnabled:true,targetMetadataRequestCap:38,navigationMetadataRequestCap:8,targetResponseBytes:32768,targetMs:10000,producerSHA256:Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),[facadePath,hash(originalFacade)],['build.mjs',hash(await readFile(new URL('build.mjs',base)))],['entry.function.js',hash(wrapper)],['binding.json',hash(await readFile(new URL('binding.json',base))) ] ]),
    inheritedSHA256:Object.fromEntries(await Promise.all(['../rc16-corpus-tracks/probe.mjs','../v2-07a-iso-tracks-rc11/sparse-moov.mjs','../rc21-actual-corpus/factory.expression.js','../rc21-actual-corpus/sw-proof.expression.js'].map(async p=>[p,hash(await readFile(new URL(p,base)))]))),
    frozenParentExpressionSHA256:hash(await readFile(new URL('../rc29-deeper-coalesced-probe/factory.expression.js',base))),frozenParentProvenanceSHA256:hash(await readFile(new URL('../rc29-deeper-coalesced-probe/provenance.json',base))),expressionSHA256:hash(expression),facadeVersionPinReplacements:facadePins.length,
    contract:'Authorized bounded read-only probe; finite <=5 ISO/1 EBML/2 other and8 total with unchanged caps/final reserve; exact fresh metadata-qualified normal UI coordinates without UI version injection; private known-folder navigation; unknown HDR/VFR/Q2Q3 presence retained',actualExecution:false}};
}
export async function buildProof(){const binding=JSON.parse(await readFile(new URL('binding.json',base)));if(binding.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011'||binding.version!=='1.22.0-rc.31')throw Error('FIXED31_REQUIRED');for(const p of ['app.js','sw.js','version.json'])if(hash(execFileSync('git',['show',binding.sourceCommit+':'+p],{cwd:fileURLToPath(new URL('../../',base))}))!==binding.sourceSHA256[p])throw Error('FIXED31_HASH_REQUIRED');const fn=await readFile(new URL('sw-proof.function.js',base),'utf8');if(hash(fn)!=='6f6563317a07a88d0fab647f8e3f436cf000b26d2e2aca9b81416f211bb6c7a4')throw Error('FROZEN_SW_PROOF_FUNCTION_REQUIRED');return `(()=>{const binding=${JSON.stringify(binding)};return (${fn.trim()})(binding);})()\n`;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const result=await build();await writeFile(new URL('factory.expression.js',base),result.expression);await writeFile(new URL('sw-proof.expression.js',base),await buildProof());await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify({expressionSHA256:result.provenance.expressionSHA256}));}
