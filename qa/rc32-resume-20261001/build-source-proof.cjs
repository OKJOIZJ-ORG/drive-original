'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const base=__dirname,root=path.resolve(base,'../..'),fixed='1d79897fd32c569137cab079bfd93107be2ee33f',version='1.22.0-rc.32',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=p=>execFileSync('git',['show',fixed+':'+p],{cwd:root,windowsHide:true,maxBuffer:80*1024*1024});
const sourceSHA256=Object.fromEntries(['app.js','sw.js','version.json'].map(p=>[p,sha(git(p))]));assert.equal(JSON.parse(git('version.json')).version,version);
const sw=git('sw.js').toString(),paths=JSON.parse(sw.match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g,'"'));
const distinct=[...new Set(paths.map(p=>p==='./'?'index.html':p.slice(2)))];assert.equal(distinct.length,40);assert.equal(paths.length,41);
const expected=distinct.map(file=>({file,sha256:sha(git(file))}));
const binding={sourceCommit:fixed,version,sourceSHA256};
const old=fs.readFileSync(path.join(base,'../rc30-resume-20261001/source-proof.expression.js'),'utf8');
const factory=old.slice(0,old.indexOf('})({')+2).replaceAll('drive-original.qa.rc30-update-baseline','drive-original.qa.rc32-update-baseline')
 .replace('account=state.accountId;', 'account=state.accountId,accountKey=state.authAccountKey,auth=state.authGeneration,data=state.driveSessionGeneration;')
 .replace("state.accountId===account&&state.authStatus==='online'", "state.accountId===account&&state.authAccountKey===accountKey&&state.authGeneration===auth&&state.driveSessionGeneration===data&&state.authStatus==='online'&&state.accountStateLoaded&&hasUsableToken()")
 .replace(' const reg=await'," const rootAlias=await cache.match('/');if(!same()||!rootAlias||await hash(await rootAlias.arrayBuffer())!==expected.find(r=>r.file==='index.html').sha256)throw Error('QA_CACHE_ROOT_ALIAS');\n const reg=await")
 .replace('matchedCache:result.length,preserved','matchedCache:result.length,matchedCacheAliases:result.length+1,shellRootAliasMatched:true,preserved');
assert.ok(factory.endsWith('})'));fs.writeFileSync(path.join(base,'source-proof.expression.js'),factory+'('+JSON.stringify(binding)+','+JSON.stringify(expected)+')\n');
fs.writeFileSync(path.join(base,'sourcebinding.json'),JSON.stringify({...binding,shellManifestSHA256:sha(Buffer.from(JSON.stringify(expected))),shellExpected:expected,shellPaths:paths,baselineKey:'drive-original.qa.rc32-update-baseline',immutableGitObjects:true,actualExecution:false},null,2)+'\n');
console.log(JSON.stringify({source:fixed,version,distinct:distinct.length,shellManifestSHA256:sha(Buffer.from(JSON.stringify(expected))),expressionSHA256:sha(fs.readFileSync(path.join(base,'source-proof.expression.js')))}));
