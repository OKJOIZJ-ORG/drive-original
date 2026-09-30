'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const names=['run-product-tests.cjs','product-tests.json','product-tests.log','prepare-delivery.cjs','preparation.json','deploy-candidate.cjs','deployment.json','readback-candidate.cjs','redact-readback.cjs','redacted-readback.json','audit-with-memory-guard.cjs','audit-memory-guard.json','audit-output.log','results.json','build-release.py','package.json','finalize-source-readiness.py','source-readiness.json','actual-pc-source.json','README.md'];
const entries=names.map(file=>{const b=fs.readFileSync(path.join(__dirname,file));return{file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
fs.writeFileSync(path.join(__dirname,'curation.json'),JSON.stringify({source:'9cd94b8caae8f0e5269bf1df7d413b4e8bbdd303',workerVersion:'e3217cbb-8c9c-49f1-b6ed-b462a836cb72',files:entries,privateCliReadbackExcluded:true,scope:'Exact allowlist of safe fixed22 delivery evidence; no private raw CLI output'},null,2)+'\n');
console.log(JSON.stringify({safeFiles:entries.length}));
