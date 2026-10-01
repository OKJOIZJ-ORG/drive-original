import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const base=new URL('./',import.meta.url),root=fileURLToPath(new URL('../../',base));
const sha=x=>createHash('sha256').update(x).digest('hex');
const esbuild=createRequire(import.meta.url)('../../worker/node_modules/esbuild');
const commit='10f1dd2ee9550866933e693dbf41c62e1fb2daad';
if(esbuild.version!=='0.28.1')throw Error('COMPILER_PIN');
const result=await esbuild.build({absWorkingDir:root,entryPoints:['qa/rc29-ts-gop-diagnostic/analyzer.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'diagnostic',target:['es2022'],write:false,metafile:true,minify:false});
const paths=Object.keys(result.metafile.inputs).sort(),hashes={};
for(const p of [...paths,'media/q1-core.mjs','media/transmux-worker.mjs','app.js','sw.js','version.json']){
  const bytes=await readFile(new URL('../../'+p,base));hashes[p]=sha(bytes);
  if(!p.startsWith('qa/rc29-ts-gop-diagnostic/')&&sha(execFileSync('git',['show',commit+':'+p],{cwd:root}))!==hashes[p])throw Error('SOURCE29_MISMATCH');
}
const binding={version:'1.22.0-rc.29',sourceCommit:commit,sourceSHA256:hashes};
const expression=`(()=>{\n${result.outputFiles[0].text}\nreturn Object.freeze({analyze:diagnostic.analyzeTsGops,binding:Object.freeze(${JSON.stringify(binding)})});\n})()\n`;
await writeFile(new URL('factory.expression.js',base),expression);
await writeFile(new URL('provenance.json',base),JSON.stringify({...binding,compiler:esbuild.version,
  expressionSHA256:sha(expression),expressionBytes:Buffer.byteLength(expression),buildSHA256:sha(await readFile(new URL('build.mjs',base))),
  scope:'Pure bounded head/tail analyzer, no live GETs or playback proof'},null,2)+'\n');
console.log(JSON.stringify({sha256:sha(expression),bytes:Buffer.byteLength(expression)}));
const collector=await esbuild.build({absWorkingDir:root,entryPoints:['qa/rc29-ts-gop-diagnostic/collector.mjs'],bundle:true,
  platform:'browser',format:'iife',globalName:'collector',target:['es2022'],write:false,minify:false});
const facade=await readFile(new URL('facade.function.js',base),'utf8');
const collectorExpression=`(()=>{const api=${expression.trim()};\n${collector.outputFiles[0].text}\nreturn (${facade.trim()})(collector.createCollector,api.analyze,api.binding);\n})()\n`;
await writeFile(new URL('collector.expression.js',base),collectorExpression);
await writeFile(new URL('collector-provenance.json',base),JSON.stringify({version:binding.version,sourceCommit:commit,
  expressionSHA256:sha(collectorExpression),expressionBytes:Buffer.byteLength(collectorExpression),analyzerExpressionSHA256:sha(expression),
  collectorSHA256:sha(await readFile(new URL('collector.mjs',base))),facadeSHA256:sha(facade),buildSHA256:sha(await readFile(new URL('build.mjs',base))),
  maxMediaRequests:2,maxMetadataRequests:5,maxTotalBytes:2097152,actualExecution:false},null,2)+'\n');
console.log(JSON.stringify({collectorSHA256:sha(collectorExpression),bytes:Buffer.byteLength(collectorExpression)}));
