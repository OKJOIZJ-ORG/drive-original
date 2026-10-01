'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['README-v3.md','android-same-file-replay-v3.cjs','native-ui-target-v3.function.js','native-ui-target-v3.test.cjs','native-action-v3.test.cjs','check-preparation-v3.cjs','curate-preparation-v3.cjs','preparation-v3-checks.json'];
const entries=names.map(name=>{const b=fs.readFileSync(path.join(__dirname,name));return{path:'qa/rc30-ts-device-replay/'+name,bytes:b.length,sha256:sha(b)};});
const report={schema:'drive-original.safe-preparation-manifest/3',actualExecutionByChild:false,count:entries.length,totalBytes:entries.reduce((n,e)=>n+e.bytes,0),entries,
 sourceCommit:'aa46bd083ce8c21f55cf7d9a4759f0d6709188c2',privateFilesIncluded:false,priorFrozenFilesModified:false,
 actualAttemptResultsSeparate:true,excludedKinds:['private recovery JSON','private logs','raw state','actual attempt results','prior manifests']};
fs.writeFileSync(path.join(__dirname,'preparation-v3-manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:report.count,totalBytes:report.totalBytes,manifestSha256:sha(fs.readFileSync(path.join(__dirname,'preparation-v3-manifest.json')))},null,2));
