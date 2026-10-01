'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [commit,version]=process.argv.slice(2),root=path.resolve(__dirname,'../..');
assert.equal(commit,'4a484e6f839d2e6c3eb83503acb08147362cb011');assert.equal(version,'1.22.0-rc.31');
// Bind only immutable Git objects, never working-tree or current-HEAD fallback.
const bytes=Object.fromEntries(['app.js','sw.js','version.json'].map(k=>[k,execFileSync('git',['show',`${commit}:${k}`],{cwd:root,maxBuffer:4*1024**2})]));
const hashes=Object.fromEntries(Object.entries(bytes).map(([k,b])=>[k,crypto.createHash('sha256').update(b).digest('hex')]));
assert.equal(JSON.parse(bytes['version.json']).version,version);assert.ok(bytes['app.js'].includes(version));assert.ok(bytes['sw.js'].includes(version));
const binding={sourceCommit:commit,version,sourceSHA256:hashes};
const factory=fs.readFileSync(path.join(__dirname,'observer.function.js'),'utf8');
fs.writeFileSync(path.join(__dirname,'observer.expression.js'),`(${factory})(${JSON.stringify(binding)},window.__driveNightCorpus.proof)\n`);
fs.writeFileSync(path.join(__dirname,'binding.json'),JSON.stringify(binding,null,2)+'\n');
console.log(JSON.stringify({binding,observerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'observer.expression.js'))).digest('hex')}));
