'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const input=fs.readFileSync(path.join(__dirname,'../q0-conditional-v2-rc13/facade.expression.js'),'utf8');
if(sha(input)!=='9d37720018030d7304d17ff7debb34d5df1fa8ab2a4d38879d73cfb4574e867c')throw Error('BASE_CHANGED');
let prefix=input.slice(0,input.indexOf('  let etag=null;'));
prefix=prefix.replace('Number(fileSnapshot.size)<=2','Number(fileSnapshot.size)<=3')
 .replace('drive-original.q0-conditional-v2-rc13/1','drive-original.q0-revision-download-rc13/1')
 .replace(/results:\[\],v2MetadataRequests:0,.*?sourceCleanup:null,/,"results:[],postRequests:0,operationRequests:0,payloadBytes:0,partialAllowed:null,revisionRequested:false,identitySafe:false,pinQualification:'unproven',sourceCleanup:null,")
 .replace('summary.metadataRequests>6','summary.metadataRequests>4')
 .replace('summary.metadataBytes>32768','summary.metadataBytes+summary.payloadBytes>32768')
 .replace('60000);','40000);');
const body=fs.readFileSync(path.join(__dirname,'body.js'),'utf8');
const output=prefix+body+')';new(require('vm').Script)(output);
fs.writeFileSync(path.join(__dirname,'facade.expression.js'),output);
fs.writeFileSync(path.join(__dirname,'provenance.json'),JSON.stringify({gitSource:'7f3ef0f0bd7bac4ec8c9d725f89d6cf0f69be704',deployedSource:'570f9c38506d1e426c33cf65b73836d32bf872c0',baseSHA256:sha(input),bodySHA256:sha(body),producerSHA256:sha(fs.readFileSync(__filename)),outputSHA256:sha(output),bytes:Buffer.byteLength(output)},null,2)+'\n');console.log(sha(output));
