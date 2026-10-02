'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=fs.readdirSync(root).filter(f=>!['savepoint-manifest.json','.gitattributes'].includes(f)).sort();
if(files.some(f=>!fs.lstatSync(path.join(root,f)).isFile()||fs.lstatSync(path.join(root,f)).isSymbolicLink()||!/^[-a-zA-Z0-9.]+\.(?:json|cjs|js|md)$/.test(f)))throw Error('SAFE_FLAT_EVIDENCE_ONLY');
const rows=files.map(f=>{const b=fs.readFileSync(path.join(root,f));if(/Bearer\s+eyJ|ya29\.[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,}/.test(b.toString()))throw Error('PRIVATE_TOKEN_NOT_ALLOWED');return{path:f,bytes:b.length,sha256:sha(b)};});
fs.writeFileSync(path.join(root,'savepoint-manifest.json'),JSON.stringify({schema:'rc36-color-integration-savepoint/1',runtimeSource:'d3f78f321a804f582668dde1b7cd3e0f949b24c9',integrationPassed:false,productInventoryCause:'Q1_SOURCE_HEADERS_CORS_HIDDEN_CONTENT_RANGE',originalMediaWrite:false,files:rows,totalFiles:rows.length,totalBytes:rows.reduce((n,r)=>n+r.bytes,0)},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(root,'.gitattributes'),[...files,'savepoint-manifest.json'].map(f=>f+' -text').join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),manifestSha256:sha(fs.readFileSync(path.join(root,'savepoint-manifest.json')))}));
