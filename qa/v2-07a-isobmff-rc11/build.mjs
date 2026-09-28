import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base=new URL('./',import.meta.url), hash=value=>createHash('sha256').update(value).digest('hex');
const strip=source=>source.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
const once=(source,from,to)=>{if(source.split(from).length!==2)throw new Error('SOURCE_BINDING_NOT_UNIQUE');return source.replace(from,to);};
export async function buildFirstIsoBundle() {
  const parts=[
    ['core','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow',''],
    ['inventory','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=core;'],
    ['selector','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
    ['scanner','../v2-07a-isobmff-index/isobmff-index.mjs','scanIsoBmffTopLevel',''],
    ['diagnostics','../v2-07a-current-corpus-probe/comparison-diagnostics.mjs','diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic',''],
    ['metadata','../v2-07a-current-corpus-probe/metadata-catalog-driver.mjs','createMetadataCatalogComparison',
      `const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',VERSION='1.22.0-rc.11',CAPS={dispatches:512,runMs:600000,metadataResponseBytes:2097152,metadataBytes:67108864};
       const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=core;const {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic}=diagnostics;`],
    ['probe','probe.mjs','createFirstIsoProbe',
      'const {createMetadataCatalogComparison}=metadata;const {runAuthenticatedRootInventory}=inventory;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;'],
  ];
  const inputs=await Promise.all(parts.map(([,path])=>readFile(new URL(path,base),'utf8')));
  const factory=['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(inputs[i])}\nreturn {${exports}};})();`),
    'return runtime=>probe.createFirstIsoProbe(runtime,{canonicalNormalizers:{rootFence:core.rootFence,stableItemRow:core.stableItemRow}});','})()',''].join('\n');
  const facadePath='../v2-07a-current-corpus-probe/metadata-catalog-rc11-facade.function.js';
  const originalFacade=await readFile(new URL(facadePath,base),'utf8');
  let facade=originalFacade.replace(/\r\n?/g,'\n');
  facade=once(facade,'function (privateContextText)','function (privateContextText, swProof)');
  facade=facade.replaceAll('rc11-metadata-only','rc11-first-iso-headers');
  facade=once(facade,'hasUsableToken, getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,',
    'hasUsableToken, getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,\n      getSWIdentity: () => swProof?.get?.(), getQ1Playback: () => q1Playback,\n      getQ1RetirementResult: () => q1RetirementResult, getMediaSourceGeneration: () => mediaSourceGeneration,\n      getPlayerMediaPriorityActive: () => playerMediaPriorityActive,');
  facade=once(facade,'freshSWRuntimeVersionVerified: false, ...handle.progress(),','...handle.progress(),');
  const bundle=`(()=>{\nconst factory=${factory.trim()};\nconst facade=(${facade.trim()});\nreturn (privateContextText,swProof)=>facade.call(factory,privateContextText,swProof);\n})()\n`;
  const producerSHA256=Object.fromEntries(parts.map(([,path],i)=>[path,hash(inputs[i])]));
  producerSHA256[facadePath]=hash(originalFacade);
  producerSHA256['build.mjs']=hash(await readFile(new URL('build.mjs',base)));
  return {factory,bundle,facade,provenance:{schema:'drive-original.v2-07a-first-iso-rc11-build/1',version:'1.22.0-rc.11',
    metadataDriverVersionBinding:'explicit lexical rc11 binding; original rc10 source unchanged',
    producerSHA256,factorySHA256:hash(factory),facadeSHA256:hash(facade),bundleSHA256:hash(bundle)}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const result=await buildFirstIsoBundle();
  await writeFile(new URL('browser.generated.js',base),result.bundle,'utf8');
  await writeFile(new URL('facade.generated.function.js',base),result.facade,'utf8');
  await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n','utf8');
  console.log(JSON.stringify(result.provenance));
}
