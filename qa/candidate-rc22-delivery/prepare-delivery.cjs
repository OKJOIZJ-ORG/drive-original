'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(source||'')||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim()!==source)throw Error('FIXED_SOURCE_REQUIRED');
if(JSON.parse(cp.execFileSync('git',['show',`${source}:version.json`],{cwd:root})).version!=='1.22.0-rc.22')throw Error('VERSION_REQUIRED');
const oldSource='3ebd97df80144fb8ebbaf1f945394a796d4425b8',oldWorker='b1021a42-fb32-47d5-92be-7fd92736faf7',files=['deploy-candidate.cjs','build-release.py','redact-readback.cjs','finalize-source-readiness.py'];
const hashes=[];
for(const name of files){const inherited=fs.readFileSync(path.join(root,'qa/candidate-rc21-delivery',name),'utf8');let body=inherited.replaceAll(oldSource,source).replaceAll('rc21','rc22').replaceAll('rc.21','rc.22');
  if(name==='redact-readback.cjs')body=body.replace(`const expected = '${oldWorker}';`,"const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json'),'utf8')).workerVersion;");
  if(name==='finalize-source-readiness.py')body=body.replace(`WORKER = '${oldWorker}'`,"WORKER = json.loads((HERE / 'deployment.json').read_text(encoding='utf-8'))['workerVersion']");
  if(body.includes(oldSource)||body.includes(oldWorker))throw Error('OLD_IDENTITY_REMAINS');
  const dest=path.join(__dirname,name);if(fs.existsSync(dest))throw Error('PRESERVED_PRODUCER_EXISTS');fs.writeFileSync(dest,body);hashes.push({path:name,sha256:crypto.createHash('sha256').update(body).digest('hex'),inheritedSha256:crypto.createHash('sha256').update(inherited).digest('hex')});}
fs.writeFileSync(path.join(__dirname,'preparation.json'),JSON.stringify({source,version:'1.22.0-rc.22',producerSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),derived:hashes,scope:'Only newly named fixed-source free-candidate producers; no deployment run'},null,2)+'\n');
console.log(JSON.stringify({source,prepared:hashes.length}));
