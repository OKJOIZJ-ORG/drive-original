'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=n=>fs.readFileSync(path.join(__dirname,n)),load=n=>JSON.parse(read(n));
const http=load('mcp-reuse-audit-http.json'),binding=load('mcp-reuse-audit-binding.json');
assert.equal(http.source,'7ba8e654fa38def8c8e00efcbf1600a4c8730c53');assert.equal(http.source,binding.source);assert.equal(http.version,binding.version);
assert(http.passed&&http.assets.length===52&&http.privateRoutes.length===6&&!http.browserLaunched);
assert.equal(http.producerSha256,hash(read('mcp-reuse-audit-http.cjs')));assert.equal(binding.cached.length,40);assert.equal(binding.archives.length,8);
for(const row of http.assets){const bytes=row.file==='.nojekyll'?Buffer.alloc(0):execFileSync('git',['show',`${http.source}:${row.file}`],{cwd:root,maxBuffer:12*1024**2});assert.equal(hash(bytes),row.sha256);assert.equal(bytes.length,row.bytes);assert(row.gitEqual);}
for(const row of binding.cached)assert.equal(row.sha256,http.assets.find(x=>x.file===row.file)?.sha256);
for(const name of ['mcp-reuse-audit-preflight.function.js','mcp-reuse-audit-page.function.js','mcp-reuse-audit-offline.function.js','mcp-reuse-audit-cleanup.function.js']){
 const text=read(name).toString();assert(!/\bfetch\s*\(|\.launch\s*\(|deleteCookie|clearCache/.test(text));vm.runInNewContext('('+text+')',{}, {timeout:1000});}
new vm.Script(read('mcp-reuse-audit-init.js').toString());
const floor=load('audit-memory-guard.json');assert.equal(floor.memory.freeVirtualKiB,748084);assert.equal(floor.memory.existingLaunchFloorPassed,false);assert.equal(floor.memory.virtualFloorKiBExclusive,1572864);
const report={passed:true,publicGitHashesRechecked:52,cacheExpectedHashes:40,uncachedArchivesExpected:8,functionSyntaxChecks:4,
 originalFloorPreserved:true,browserExecuted:false,scope:'Local bindings/provenance/syntax only; root MCP runtime remains separate'};
fs.writeFileSync(path.join(__dirname,'mcp-reuse-audit-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
