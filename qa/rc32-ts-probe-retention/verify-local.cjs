'use strict';
// Local synthetic/read-only inputs. Never reads protected files or contacts a
// browser/device/network; no commit, deployment or version mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const product=['media/drive-source.mjs','media/ts-player.mjs','tests/q1-probe-retention.test.mjs'];
for(const p of product)cp.execFileSync(process.execPath,['--check',p],{cwd:root,stdio:'pipe'});
const files=['tests/q1-source.test.mjs','tests/q1-probe-reuse.test.mjs','tests/q1-probe-retention.test.mjs'];
const run=cp.spawnSync(process.execPath,['--test',...files],{cwd:root,encoding:'utf8'});
if(run.status!==0)throw Error('FOCUSED_CHECK_FAILED');
const m=/tests (\d+)[\s\S]*?pass (\d+)[\s\S]*?fail (\d+)/.exec(run.stdout);
if(!m||Number(m[1])!==49||Number(m[2])!==49||Number(m[3])!==0)throw Error('CHECK_RECEIPT_INVALID');
const rows=product.map(p=>{const b=fs.readFileSync(path.join(root,p));return{path:p,bytes:b.length,sha256:sha(b)};});
const base='ae21f8ac6b34497b3690aef9bc67ecee86a7e927';
const binding={baseHEAD:base,publicReference:'4a484e6f839d2e6c3eb83503acb08147362cb011',product:rows,
 unchangedPrimitives:['qa/v2-07b-ts-q1/ts-seek.mjs','qa/v2-07b-ts-q1/seek-input.mjs','qa/v2-07b-ts-q1/seek-bootstrap.mjs','media/q1-core.mjs'].map(p=>{
 const b=fs.readFileSync(path.join(root,p)),old=cp.execFileSync('git',['show',base+':'+p],{cwd:root,maxBuffer:4*1024**2});
 if(sha(b)!==sha(old))throw Error('PRIMITIVE_DRIFT');return{path:p,sha256:sha(b)};}),fixture:{path:'qa/v2-07b-ts-q1/synthetic-bframes-audiolead.ts',sha256:sha(fs.readFileSync(path.join(root,'qa/v2-07b-ts-q1/synthetic-bframes-audiolead.ts')))}};
const result={schema:'drive-original.rc32-probe-retention-local/1',actualDeviceBrowserRun:false,privateInputRead:false,networkCalls:false,
 productEdited:true,committed:false,deployed:false,command:['node','--test',...files],tests:49,passed:49,failed:0,
 syntaxFiles:3,maxRetainedRawProbeBytes:2097152,controls:{canonicalPositionsSeconds:[0,5,11.95],probePlanEqual:true,bootstrapBytesEqual:true,synchronousMuxOutputEqual:true,nativeDecode:'NOT_TESTED',performanceGain:'NOT_MEASURED'},
 limitations:['Node MSE-boundary substitute is controlled lifecycle proof only.','Metadata SHA256 is not a per-range byte hash or immutable server snapshot.','No cached chosen-window/continuous-loop range, persisted cache or old async/worker/MSE sharing.','Actual31 v1/v2 timings and15s failures are preserved.']};
fs.writeFileSync(path.join(__dirname,'source-binding.json'),JSON.stringify(binding,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'local-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({localOnly:true,tests:49,passed:49,failed:0,product:rows}));
