'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs');
assert.equal(guard.git(['rev-parse','HEAD']).toString().trim(),guard.SOURCE);
const report=JSON.parse(fs.readFileSync(path.join(__dirname,'curation-manifest.json')));
const files=[...report.files.map(row=>row.file),'qa/candidate-rc35-delivery/curation-manifest.json'];
assert.equal(files.length,new Set(files).size);
const existing=guard.git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
assert(existing.every(file=>files.includes(file)),'Foreign index paths must be absent');
for(const row of report.files){const bytes=fs.readFileSync(path.join(guard.root,row.file));assert.equal(guard.sha(bytes),row.sha256,'Curated file drift');}
const before=guard.blob('.gitattributes').toString(),after=fs.readFileSync(path.join(guard.root,'.gitattributes'),'utf8');
assert.equal(after.replace(/\r\n/g,'\n'),before);assert(before.includes('/qa/candidate-rc35-delivery/** -text'));
guard.git(['add','-f','--',...files]);
const staged=guard.git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
assert.equal(staged.length,files.length);assert(staged.every(file=>files.includes(file)));
for(const file of files){
 if(file.startsWith('qa/'))assert(guard.git(['show',':'+file]).equals(fs.readFileSync(path.join(guard.root,file))),'Staged QA bytes differ '+file);
 else assert.equal(guard.git(['rev-parse',':'+file]).toString().trim(),guard.git(['hash-object','--path='+file,'--',file]).toString().trim(),'Staged canonical document differs '+file);
}
guard.git(['diff','--cached','--check']);
console.log(JSON.stringify({staged:true,exactPaths:files.length,qaByteEqual:true,documentsCanonicalEqual:true,sourceProduct:guard.SOURCE,publicWorkerRuntimeChanges:false}));
