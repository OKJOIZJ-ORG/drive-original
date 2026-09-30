'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),commit='e57d7b5b3154a2a838d01f631cf71fa063044280',dest=path.join(__dirname,'public');
const bytes=f=>execFileSync('git',['show',`${commit}:${f}`],{cwd:root,maxBuffer:80*1024*1024});
const publicModule=new Module(path.join(root,'scripts/public-files.cjs'),module);publicModule.filename=path.join(root,'scripts/public-files.cjs');publicModule.paths=module.paths;publicModule._compile(bytes('scripts/public-files.cjs').toString('utf8'),publicModule.filename);
const files=publicModule.exports,hash=x=>crypto.createHash('sha256').update(x).digest('hex'),rows=[];
for(const name of files){const target=path.resolve(dest,name);if(!target.startsWith(dest+path.sep))throw Error('SNAPSHOT_PATH');const data=bytes(name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);rows.push({path:name,bytes:data.length,sha256:hash(data)});}
fs.writeFileSync(path.join(__dirname,'snapshot-provenance.json'),JSON.stringify({sourceCommit:commit,publicFilesModuleSha256:hash(bytes('scripts/public-files.cjs')),files:rows},null,2)+'\n');
console.log(JSON.stringify({sourceCommit:commit,files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0)}));
