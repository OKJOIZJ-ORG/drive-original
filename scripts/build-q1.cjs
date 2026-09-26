'use strict';
// Local deterministic compiler only. No installs, network, media or deployment.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const esbuild=require('../worker/node_modules/esbuild');
if(esbuild.version!=='0.28.1')throw new Error('Unexpected Q1 compiler version');
const mux=path.join(root,'qa/v2-07b-ts-q1/node_modules/mux.js');
if(JSON.parse(fs.readFileSync(path.join(mux,'package.json'))).version!=='7.1.0'
  ||sha(fs.readFileSync(path.join(mux,'dist/mux-mp4.min.js')))!=='4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f')
  throw new Error('Unexpected Q1 mux artifact');
const outputs={};
(async()=>{
for(const [entry,output] of [['media/core-entry.mjs','media/q1-core.mjs'],['media/worker-entry.mjs','media/transmux-worker.mjs']]){
  const result=await esbuild.build({absWorkingDir:root,entryPoints:[entry],bundle:true,platform:'browser',format:'esm',
    target:['es2022'],write:false,metafile:true,minify:true,legalComments:'inline',outdir:'media',
    plugins:[{name:'pinned-mux-asset',setup(build){build.onResolve({filter:/^\.\/node_modules\/mux\.js\/dist\/mux-mp4\.min\.js$/},
      ()=>({path:'./mux-mp4.min.js',external:true}));}}]});
  for(const input of Object.keys(result.metafile.inputs)){
    if(!/^(media\/(?:core|worker)-entry\.mjs|qa\/v2-07b-ts-q1\/(?:[a-z-]+\.mjs|node_modules\/mux\.js\/dist\/mux-mp4\.min\.js)|qa\/v2-07a-(?:bounded-probe\/bounded-probe|container-probe\/mpeg-ts-probe)\.mjs)$/.test(input)
      ||/(?:-probe|\.test|browser|synthetic-)/.test(path.basename(input))&& !['bounded-probe.mjs','mpeg-ts-probe.mjs'].includes(path.basename(input)))
      throw new Error(`Unexpected Q1 public dependency: ${input}`);
  }
  const bytes=result.outputFiles[0].contents;fs.writeFileSync(path.join(root,output),bytes);
  outputs[output]={sha256:sha(bytes),bytes:bytes.length,inputs:Object.fromEntries(Object.keys(result.metafile.inputs).sort().map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]))};
}
fs.copyFileSync(path.join(mux,'LICENSE'),path.join(root,'media/mux-LICENSE.txt'));
fs.copyFileSync(path.join(mux,'dist/mux-mp4.min.js'),path.join(root,'media/mux-mp4.min.js'));
fs.writeFileSync(path.join(root,'media/build.json'),JSON.stringify({compiler:esbuild.version,mux:'7.1.0',outputs},null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([key,value])=>[key,value.bytes]))));
})().catch(error=>{console.error(error);process.exitCode=1;});
