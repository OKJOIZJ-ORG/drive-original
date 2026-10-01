// Controlled local guard-omission counterfactual; no product mutation or network.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(new URL('../../media/drive-source.mjs',import.meta.url),'utf8');
assert.equal(sha(source),'cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a');
const guard='if(edge&&data&&data.epoch===retentionEpoch&&sameRetainedIdentity(pre,post)';
assert.ok(source.includes(guard));
const before=source.replace(guard,'if(edge&&data&&sameRetainedIdentity(pre,post)');
const load=s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
async function run(module,phase){
 const cache=module.createDriveQ1ProbeRetention(),body=new Uint8Array(188).fill(7);let cleared=false;
 const metadata={id:'fixture',size:'188',mimeType:'video/mp2t',modifiedTime:'A',version:'1',headRevisionId:'A',
 sha256Checksum:'a'.repeat(64),trashed:false,capabilities:{canDownload:true}};
 const reader=await module.openDriveQ1Source({fileId:'fixture',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>true,
 readMetadata:async({phase:p})=>{if(p===phase){cache.clear();cleared=true;}return metadata;},
 readRange:async()=>{if(phase==='body'){cache.clear();cleared=true;}return new Response(body,{status:206,
 headers:{'Content-Range':'bytes 0-187/188','Content-Length':'188'}});}});
 const returned=await reader.read({start:0,end:187,probeRetention:cache});
 const result={phase,cleared,returnedBytes:returned.length,returnedSHA256:sha(returned),retainedBytes:cache.stats().retainedBytes,
 readsCompleted:reader.stats().readsCompleted,rangeRequests:reader.stats().rangeRequests};
 assert.deepEqual(returned,body);await reader.abort();cache.clear();return result;
}
const old=await load(before),current=await load(source),cases=[];
for(const phase of ['preflight','body','postflight']){const a=await run(old,phase),b=await run(current,phase);
 assert.equal(a.retainedBytes,188);assert.equal(b.retainedBytes,0);assert.equal(a.returnedSHA256,b.returnedSHA256);
 cases.push({phase,guardOmittedCounterfactual:a,currentWithEpochFence:b});}
const report={schema:'drive-original.rc32-probe-retention-epoch-regression/1',sourceSHA256:sha(source),
 label:'controlled local guard-omitted counterfactual vs current guard; not old public/browser/device evidence',
 actualCalls:false,productModified:false,cases};
writeFileSync(new URL('./epoch-clear-regression.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:3,beforeRetainedBytes:188,afterRetainedBytes:0,originalReturnedBytesEqual:true,actualCalls:false}));
