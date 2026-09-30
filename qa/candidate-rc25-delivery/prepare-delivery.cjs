'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source='7ba8e654fa38def8c8e00efcbf1600a4c8730c53',oldSource='8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7';
if(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim()!==source)throw Error('FIXED_SOURCE_REQUIRED');
if(JSON.parse(cp.execFileSync('git',['show',source+':version.json'],{cwd:root})).version!=='1.22.0-rc.25')throw Error('VERSION_REQUIRED');
const names=['deploy-candidate.cjs','build-release.py','redact-readback.cjs','finalize-source-readiness.py','readback-candidate.cjs','audit-with-memory-guard.cjs'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),derived=[];
for(const file of names){const before=fs.readFileSync(path.join(root,'qa/candidate-rc24-delivery',file));const body=before.toString('utf8').replaceAll(oldSource,source).replaceAll('rc24','rc25').replaceAll('rc.24','rc.25').replaceAll('Fixed24','Fixed25');const dest=path.join(__dirname,file);if(fs.existsSync(dest))throw Error('PRESERVED_PRODUCER_EXISTS');if(body.includes(oldSource))throw Error('OLD_SOURCE_REMAINS');fs.writeFileSync(dest,body);derived.push({file,sha256:sha(Buffer.from(body)),inheritedSha256:sha(before)});}
fs.writeFileSync(path.join(__dirname,'preparation.json'),JSON.stringify({source,version:'1.22.0-rc.25',producerSha256:sha(fs.readFileSync(__filename)),derived,scope:'New exact-source free candidate25 producers from preserved corrected24; no production deployment'},null,2)+'\n');
console.log(JSON.stringify({source,prepared:derived.length}));