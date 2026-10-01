'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'android-same-file-replay.cjs'),current=fs.readFileSync(file,'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const expected='1d730fee60ed98aaaf1cf6c1d3a945fd87da7417dced06920e7e4a8f53543072';
const derivative=path.join(__dirname,'android-same-file-replay-v2.cjs');
if(!fs.existsSync(derivative))fs.writeFileSync(derivative,current);
let prior=current.replace(" if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PRIVATE_INPUT_INVALID');\n",'');
prior=prior.replace(" if(['accountId','authAccountKey'].some(k=>typeof value.account[k]!=='string')\n    ||['id','name','mimeType','modifiedTime','headRevisionId'].some(k=>typeof t[k]!=='string')\n    ||t.parents.some(p=>typeof p!=='string')\n    ||['md5Checksum','sha256Checksum','resourceKey'].some(k=>t[k]!=null&&typeof t[k]!=='string'))throw Error('PRIVATE_INPUT_INVALID');\n",'');
prior=prior.replace('proofSaved=false,navigations=0,cleanupComplete=true','proofSaved=false,navigations=0');
prior=prior.replaceAll('cleanupComplete=false;c.step','c.step');
prior=prior.replace("   c.report.cleanupComplete=cleanupComplete;if(!cleanupComplete)fail('CLEANUP_UNCONFIRMED');\n",'');
if(hash(prior)!==expected)throw Error('EXECUTED_PRODUCER_RECONSTRUCTION_MISMATCH');
fs.writeFileSync(file,prior);
const report={schema:'drive-original.executed-producer-preservation/1',actualDeviceExecutionByThisProducer:false,
 executedV1Sha256:expected,reconstructedExactBytes:true,preparationDerivativePreserved:'android-same-file-replay-v2.cjs',
 derivativeBeforeNewFolderFixSha256:hash(current),existingActualResultModified:false};
fs.writeFileSync(path.join(__dirname,'executed-v1-preservation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
