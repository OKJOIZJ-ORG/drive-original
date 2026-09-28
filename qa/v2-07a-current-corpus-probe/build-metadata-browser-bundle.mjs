import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ORIGIN,VERSION,CAPS} from './probe.mjs';
const base=new URL('./',import.meta.url);
const strip=source=>source.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function buildMetadataBrowserBundleText(){
  const paths=['../v2-07a-root-inventory/root-inventory.mjs','../v2-07a-root-inventory/drive-browser-adapter.mjs','comparison-diagnostics.mjs','metadata-catalog-driver.mjs'];
  const sources=await Promise.all(paths.map(path=>readFile(new URL(path,base),'utf8')));
  return ['(()=>{',"'use strict';",`const rootCore=(()=>{${strip(sources[0])}\nreturn {collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow};})();`,
    `const inventory=(()=>{const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=rootCore;${strip(sources[1])}\nreturn {runAuthenticatedRootInventory};})();`,
    `const diagnostics=(()=>{${strip(sources[2])}\nreturn {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic};})();`,
    `const driver=(()=>{const ORIGIN=${JSON.stringify(ORIGIN)},VERSION=${JSON.stringify(VERSION)},CAPS=${JSON.stringify(CAPS)};const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=rootCore;const {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic}=diagnostics;${strip(sources[3])}\nreturn {createMetadataCatalogComparison};})();`,
    'return runtime=>driver.createMetadataCatalogComparison(runtime,{canonicalNormalizers:{rootFence:rootCore.rootFence,stableItemRow:rootCore.stableItemRow}});','})()',''].join('\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){await writeFile(new URL('metadata-catalog-browser-bundle.js',base),await buildMetadataBrowserBundleText(),'utf8');console.log('Public metadata-only factory generated.');}
