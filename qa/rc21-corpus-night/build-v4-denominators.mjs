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
    ['readCache','metadata-read-cache.mjs','createMetadataReadCache',''],
    ['sparse','sparse-moov.mjs','readSparseMoov','const {createMetadataReadCache}=readCache;'],
    ['ebml','../rc16-corpus-tracks/ebml-tracks.mjs','readEbmlTracks',''],
    ['comparison','../v2-07a-current-corpus-probe/comparison-diagnostics.mjs','diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic',''],
    ['denominators','inventory-denominators.mjs','summarizeInventoryDenominators,summarizeProbeDenominators',''],
    ['probe','probe-v4-denominators.mjs','createCorpusTracksProbe','const {summarizeInventoryDenominators,summarizeProbeDenominators}=denominators;const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory,rootFence,stableItemRow}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic}=comparison;']
  ];
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8')));
  const facadePath='../rc16-corpus-tracks/facade.function.js',originalFacade=await readFile(new URL(facadePath,base),'utf8');
  const facadePins=originalFacade.match(/1\.22\.0-rc\.16/g)??[];if(facadePins.length!==2)throw Error('FACADE_PIN_COUNT');
  const facade=originalFacade.replaceAll('1.22.0-rc.16','1.22.0-rc.21');
  const factory=['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`),'return runtime=>probe.createCorpusTracksProbe(runtime,{canonicalNormalizers:{rootFence:root.rootFence,stableItemRow:root.stableItemRow}});','})()'].join('\n');
  const expression=`(()=>{const create=${factory};const facade=(${facade.trim()});return (privateContextText,swProof,privatePriorText=null,mode='probe')=>facade.call(create,privateContextText,swProof,privatePriorText,mode);})()\n`;
  return {expression,provenance:{schema:'drive-original.rc21-corpus-night-denominator-build/1',version:'1.22.0-rc.21',producerSHA256:Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),[facadePath,hash(originalFacade)],['build-v4-denominators.mjs',hash(await readFile(new URL('build-v4-denominators.mjs',base)))] ]),
    inheritedSHA256:Object.fromEntries(await Promise.all(['../rc16-corpus-tracks/probe.mjs','../v2-07a-iso-tracks-rc11/sparse-moov.mjs','../rc21-actual-corpus/factory.expression.js','../rc21-actual-corpus/sw-proof.expression.js'].map(async p=>[p,hash(await readFile(new URL(p,base)))]))),
    expressionSHA256:hash(expression),facadeVersionPinReplacements:facadePins.length,
    contract:'Existing8-sample plan and per-file64GET/2MiB+8192/1MiB request/50s/10s headers/no-progress unchanged; known metadata spans only, no sample-table/unknown payload prefetch',actualExecution:false}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const result=await build();await writeFile(new URL('factory-v4-denominators.expression.js',base),result.expression);await writeFile(new URL('provenance-v4-denominators.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify({expressionSHA256:result.provenance.expressionSHA256}));}
