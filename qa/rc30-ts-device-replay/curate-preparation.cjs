'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const names=['README.md','binding.json','build.cjs','build-v2.cjs','check-preparation.cjs','curate-preparation.cjs',
 'single-file-observer.function.js','single-file-observer.expression.js','observer.test.cjs',
 'single-file-observer-v2.function.js','single-file-observer-v2.expression.js','observer-v2.test.cjs',
 'android-same-file-replay.cjs','driver-preparation.test.cjs','android-same-file-replay-v2.cjs','driver-v2-preparation.test.cjs',
 'native-folder-target.function.js','native-folder-target.test.cjs','preparation-provenance.json','preparation-v2-provenance.json',
 'preserve-executed-v1.cjs','executed-v1-preservation.json','preparation-v2-checks.json'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const entries=names.map(name=>{const b=fs.readFileSync(path.join(__dirname,name));return{path:'qa/rc30-ts-device-replay/'+name,bytes:b.length,sha256:sha(b)};});
const report={schema:'drive-original.safe-preparation-manifest/2',actualExecutionByChild:false,
 sourceCommit:'aa46bd083ce8c21f55cf7d9a4759f0d6709188c2',count:entries.length,totalBytes:entries.reduce((n,x)=>n+x.bytes,0),entries,
 privateFilesIncluded:false,screenshotsIncluded:false,unrelatedArtifactsIncluded:false,
 parentOwnedActualEvidenceSeparate:['actual-pc-same-ts-replay-safe.json','actual-pc-same-ts-replay-summary.json','android-same-file-replay-result.json'],
 excludedKinds:['private recovery input','private output logs','raw identifiers or state','future actual attempts'],
 note:'V1 exact executed source and attempt1 failure remain preserved. V2 entries are preparation only until a separate actual result is created.'};
fs.writeFileSync(path.join(__dirname,'preparation-manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({count:report.count,totalBytes:report.totalBytes,manifestSha256:sha(fs.readFileSync(path.join(__dirname,'preparation-manifest.json'))),entries:entries.filter(e=>/v2.cjs$|v2.expression.js$|folder-target.function.js$/.test(e.path))},null,2));
