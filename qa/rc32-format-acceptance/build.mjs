import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const base=new URL('./',import.meta.url),root=new URL('../../',base);
export const COMMITTED32='1d79897fd32c569137cab079bfd93107be2ee33f';
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const old={version:'1.22.0-rc.31',sourceCommit:'4a484e6f839d2e6c3eb83503acb08147362cb011',sourceSHA256:{'app.js':'f92f9440b25781c8c6f144688d96d58612747f148bb6ded0bf31d4a35bb6193e','sw.js':'e65e51527fad4df7633e2a10d36f2d90966e47fb8c73e23d5ebb78b7059a747a','version.json':'d8903d703880dbb1ef1068575974d70e5666a127cb2970cfb951cfd3ff5bff06'}};
export const templates={
  'deeper.expression.js':'qa/rc31-deeper-coalesced-probe/factory.expression.js',
  'sw-proof.expression.js':'qa/rc31-deeper-coalesced-probe/sw-proof.expression.js',
  'derive-context.expression.js':'qa/rc31-deeper-coalesced-probe/derive-context.expression.js',
  'image-observer.function.js':'qa/rc31-actual-image-observation/image-observer.function.js'
};
export function rebind(text,binding){
  if(binding.version!=='1.22.0-rc.32'||!/^[a-f0-9]{40}$/.test(binding.sourceCommit)||binding.sourceCommit===old.sourceCommit||Object.keys(old.sourceSHA256).some(k=>!/^[a-f0-9]{64}$/.test(binding.sourceSHA256?.[k])))throw Error('LITERAL_FIXED32_BINDING_REQUIRED');
  for(const [a,b] of [[old.version,binding.version],[old.sourceCommit,binding.sourceCommit],...Object.keys(old.sourceSHA256).map(k=>[old.sourceSHA256[k],binding.sourceSHA256[k]]),['__rc31Deeper','__rc32Deeper'],['installRc31ImageObservation','installRc32ImageObservation'],['__rc31ImageObservation','__rc32ImageObservation']])text=text.split(a).join(b);
  if([old.version,old.sourceCommit,...Object.values(old.sourceSHA256)].some(x=>text.includes(x)))throw Error('OLD_LITERAL_REMAINS');
  return text;
}
export async function verifyInputs(read=path=>readFile(new URL(path,root))){
  const pins=JSON.parse(await readFile(new URL('inputs.json',base)));
  for(const [p,h] of Object.entries(pins.files)){
    if(!p.startsWith('qa/')||p.includes('..')||/backup|private|actual-.*safe|raw|ledger|readback/i.test(p))throw Error('INPUT_SCOPE_REJECTED');
    if(sha256(await read(p))!==h)throw Error('FROZEN_INPUT_DRIFT:'+p);
  }
  return pins;
}
export async function build(commit){
  if(!/^[a-f0-9]{40}$/.test(commit??''))throw Error('LITERAL_FULL_COMMIT_REQUIRED');
  if(commit!==COMMITTED32)throw Error('EXACT_COMMITTED32_REQUIRED');
  await verifyInputs();
  const git=p=>execFileSync('git',['show',commit+':'+p],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024});
  if(execFileSync('git',['rev-parse',commit+'^{commit}'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim()!==commit)throw Error('COMMITTED_SHA_REQUIRED');
  const version=JSON.parse(git('version.json'));
  if(version.version!=='1.22.0-rc.32')throw Error('COMMITTED32_REQUIRED');
  const binding={schema:'drive-original.corpus-header-source-binding/1',version:'1.22.0-rc.32',sourceCommit:commit,sourceSHA256:Object.fromEntries(Object.keys(old.sourceSHA256).map(p=>[p,sha256(git(p))]))};
  const sourceModules=['media/drive-source.mjs','media/ts-player.mjs','media/general-player.mjs','media/general-admission.mjs','media/general-codec.mjs'];
  const outputs={};
  for(const [p,input]of Object.entries(templates)){
    const text=rebind(await readFile(new URL(input,root),'utf8'),binding);
    new vm.Script(p.endsWith('.function.js')?'('+text+')':text);
    outputs[p]=text;
  }
  const provenance={schema:'drive-original.rc32-format-acceptance/1',binding,sourceModuleSHA256:Object.fromEntries(sourceModules.map(p=>[p,sha256(git(p))])),inputFreezeSHA256:sha256(await readFile(new URL('inputs.json',base))),outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,{sha256:sha256(v),bytes:Buffer.byteLength(v)}])),literalReplacementOnly:true,parserSelectorReaderCapsChanged:false,oldPrivateRegistryImported:false,actualExecution:false,actualRequests:0};
  return {outputs,binding,provenance};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const result=await build(process.argv[2]);
  for(const [p,v]of Object.entries(result.outputs))await writeFile(new URL(p,base),v);
  await writeFile(new URL('binding.json',base),JSON.stringify(result.binding,null,2)+'\n');
  await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');
  console.log(JSON.stringify({sourceCommit:result.binding.sourceCommit,version:result.binding.version,outputs:result.provenance.outputs,actualExecution:false}));
}
