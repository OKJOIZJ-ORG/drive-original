'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source='8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7',oldSource='7591044adc1149391265b0e56a93a47252088a47';
if(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim()!==source)throw Error('FIXED_SOURCE_REQUIRED');
if(JSON.parse(cp.execFileSync('git',['show',source+':version.json'],{cwd:root})).version!=='1.22.0-rc.24')throw Error('VERSION_REQUIRED');
const names=['deploy-candidate.cjs','build-release.py','redact-readback.cjs','finalize-source-readiness.py','readback-candidate.cjs','audit-with-memory-guard.cjs'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),derived=[];
for(const file of names){const before=fs.readFileSync(path.join(root,'qa/candidate-rc23-delivery',file));const body=before.toString('utf8').replaceAll(oldSource,source).replaceAll('rc23','rc24').replaceAll('rc.22','rc.24').replaceAll('Fixed22Source','Fixed24Source');const dest=path.join(__dirname,file);if(fs.existsSync(dest))throw Error('PRESERVED_PRODUCER_EXISTS');if(body.includes(oldSource))throw Error('OLD_SOURCE_REMAINS');fs.writeFileSync(dest,body);derived.push({file,sha256:sha(Buffer.from(body)),inheritedSha256:sha(before)});}
fs.writeFileSync(path.join(__dirname,'preparation.json'),JSON.stringify({source,version:'1.22.0-rc.24',producerSha256:sha(fs.readFileSync(__filename)),derived,scope:'New exact-source free candidate producers derived from preserved23; no production deployment'},null,2)+'\n');
console.log(JSON.stringify({source,prepared:derived.length}));
