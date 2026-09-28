import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base=new URL('./',import.meta.url),hash=v=>createHash('sha256').update(v).digest('hex');
const strip=s=>s.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export async function build(){
  const parts=[
    ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
    ['scanner','../v2-07a-isobmff-index/isobmff-index.mjs','scanIsoBmffTopLevel',''],
    ['parser','parser.mjs','parseMoov,MAX_MOOV_BYTES',''],
    ['sparse','sparse-moov.mjs','readSparseMoov',''],
    ['probe','probe.mjs','createIsoTracksProbe','const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov,MAX_MOOV_BYTES}=parser;const {readSparseMoov}=sparse;']
  ];
  const inputs=await Promise.all(parts.map(([,p])=>readFile(new URL(p,base),'utf8'))),facade=await readFile(new URL('facade.function.js',base),'utf8');
  const factory=['(()=>{',"'use strict';",...parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(inputs[i])}\nreturn {${exports}};})();`),'return probe.createIsoTracksProbe;','})()'].join('\n');
  const bundle=`(()=>{const factory=${factory};const facade=(${facade.trim()});return (selected,swProof)=>facade.call(factory,selected,swProof);})()\n`;
  const producerSHA256=Object.fromEntries(parts.map(([,p],i)=>[p,hash(inputs[i])]));producerSHA256['facade.function.js']=hash(facade);producerSHA256['build.mjs']=hash(await readFile(new URL('build.mjs',base)));
  return {bundle,factory,provenance:{schema:'drive-original.iso-tracks-build/1',version:'1.22.0-rc.11',producerSHA256,bundleSHA256:hash(bundle)}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const v=await build();await writeFile(new URL('browser.generated.js',base),v.bundle);await writeFile(new URL('provenance.json',base),JSON.stringify(v.provenance,null,2)+'\n');console.log(JSON.stringify(v.provenance));}
