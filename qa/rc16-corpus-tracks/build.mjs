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
    ['sparse','../v2-07a-iso-tracks-rc11/sparse-moov.mjs','readSparseMoov',''],
    ['ebml','ebml-tracks.mjs','readEbmlTracks',''],
    ['comparison','../v2-07a-current-corpus-probe/comparison-diagnostics.mjs','diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic',''],
    ['probe','probe.mjs','createCorpusTracksProbe','const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory,rootFence,stableItemRow}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic}=comparison;']
  ];
  const sources=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8'))),facade=await readFile(new URL('facade.function.js',base),'utf8');
  const factory=['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`),'return runtime=>probe.createCorpusTracksProbe(runtime,{canonicalNormalizers:{rootFence:root.rootFence,stableItemRow:root.stableItemRow}});','})()'].join('\n');
  const expression=`(()=>{const create=${factory};const facade=(${facade.trim()});return (privateContextText,swProof,privatePriorText=null,mode='probe')=>facade.call(create,privateContextText,swProof,privatePriorText,mode);})()\n`;
  const oldProof=await readFile(new URL('../v2-07a-iso-tracks-rc11/sw-runtime-proof.expression.js',base),'utf8'),matches=oldProof.match(/1\.22\.0-rc\.11/g)??[];
  if(matches.length!==3)throw new Error('SW_PROOF_PIN_COUNT');const swProof=oldProof.replaceAll('1.22.0-rc.11','1.22.0-rc.16');
  return {factory,expression,swProof,provenance:{schema:'drive-original.rc16-corpus-tracks-build/1',version:'1.22.0-rc.16',producerSHA256:Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),['facade.function.js',hash(facade)],['build.mjs',hash(await readFile(new URL('build.mjs',base)))] ]),expressionSHA256:hash(expression),swProofSHA256:hash(swProof),priorSwProofSHA256:hash(oldProof),explicitVersionPinReplacements:matches.length}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const result=await build();await writeFile(new URL('browser.generated.js',base),result.expression);await writeFile(new URL('sw-runtime-proof.expression.js',base),result.swProof);await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify(result.provenance));}
