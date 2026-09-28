import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = new URL('./',import.meta.url);
const strip = source => source.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function buildBrowserBundleText() {
  const parts = [
    ['rootCore','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart, summarizeRepeatedInventory, rootFence, stableItemRow',''],
    ['rootAdapter','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=rootCore;'],
    ['selection','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe, createBatchBudget, normalizeProbeIdentity, FAILURE_CODES',''],
    ['tsParser','../v2-07a-container-probe/mpeg-ts-probe.mjs','probeMpegTs',''],
    ['tsSummary','ts-summary.mjs','summarizeMpegTs, TS_OUTCOMES',''],
    ['comparison','comparison-diagnostics.mjs','diagnoseComparisonFailure, emptyComparisonDiagnostic, sanitizeComparisonDiagnostic',''],
    ['current','probe.mjs','createCurrentCorpusProbe',
      'const {runAuthenticatedRootInventory}=rootAdapter; const {summarizeRepeatedInventory}=rootCore; const {selectRiskRepresentatives}=selection; const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded; const {probeMpegTs}=tsParser; const {summarizeMpegTs,TS_OUTCOMES}=tsSummary; const {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic}=comparison;']
  ];
  const sources = await Promise.all(parts.map(([,path])=>readFile(new URL(path,base),'utf8')));
  return ['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{\n${imports}\n${strip(sources[i])}\nreturn Object.freeze({${exports}});\n})();`),
    'return runtime=>current.createCurrentCorpusProbe(runtime,{canonicalNormalizers:{rootFence:rootCore.rootFence,stableItemRow:rootCore.stableItemRow}});','})()',''].join('\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  await writeFile(new URL('current-corpus-diagnostic-browser-bundle.js',base),await buildBrowserBundleText(),'utf8');
  console.log('Public factory bundle generated; no private inputs or page globals.');
}
