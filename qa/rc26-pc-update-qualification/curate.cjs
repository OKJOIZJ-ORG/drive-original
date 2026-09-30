'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const names=['journal.function.js','reader.function.js','cache-reader.function.js','cleanup.function.js','bind.cjs','binding.json','init.expression.js','late-attach.expression.js','protocol-requests.json','check.cjs','local-checks.json','README.md','coordination-failure.json','curate.cjs'];
const files=names.map(file=>{const b=fs.readFileSync(path.join(__dirname,file));return {file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
const result={schema:'drive-original.actual-https-update-preparation-curation/1',preparedOnly:true,browserExecuted:false,source25:'7ba8e654fa38def8c8e00efcbf1600a4c8730c53',source26:'3eea49a4853052275582979ab205eee8026c4691',files,manifestSelfExcludedFromHashes:true};
fs.writeFileSync(path.join(__dirname,'curated-files.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({files:files.length,init:files.find(f=>f.file==='init.expression.js'),lateAttach:files.find(f=>f.file==='late-attach.expression.js')}));
