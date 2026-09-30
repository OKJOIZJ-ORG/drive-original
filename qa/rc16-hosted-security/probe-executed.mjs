import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import https from 'node:https';
const root=new URL('../../',import.meta.url),leaf=new URL('./',import.meta.url);
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const version='1.22.0-rc.16',source='e57d7b5b3154a2a838d01f631cf71fa063044280',worker='cbbafb96-b39b-4cf7-bbf8-888ed3856370';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const read=async p=>readFile(new URL(p,root));
const json=async p=>JSON.parse(await read(p));
const save=async(p,x)=>writeFile(new URL(p,leaf),JSON.stringify(x,null,2)+'\n');
const config=JSON.parse(await read('worker/wrangler.jsonc'));
let privateRecord=await json('qa/candidate-rc16-delivery/version-readback-private.json');
const publicReadback=await json('qa/candidate-rc16-delivery/redacted-readback.json');
assert.equal(privateRecord.id,worker);assert.equal(publicReadback.workerVersion,worker);assert.equal(publicReadback.source,source);
assert.equal(hash(await read('qa/candidate-rc16-delivery/version-readback-private.json')),publicReadback.rawInputSha256);
const candidates=[privateRecord.observability,privateRecord.resources?.observability,privateRecord.resources?.script?.observability,privateRecord.resources?.script_runtime?.observability].filter(x=>x&&typeof x==='object');
const observed=candidates.length===1?candidates[0]:null;
const bool=x=>typeof x==='boolean'?x:null,number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1?x:null;
const flags=Object.fromEntries(['AUTH_ENABLED','AUTH_DIAGNOSTICS','CANDIDATE_DRIVE_WRITES_ENABLED'].map(name=>{const b=privateRecord.resources?.bindings?.find(x=>x.name===name&&x.type==='plain_text');return [name,b?.text==='true'?true:b?.text==='false'?false:null];}));
const settings={schema:'drive-original.rc16-hosted-security-settings/1',source,version,retainedWorkerVersionMatched:true,privateReadbackIntegrityMatched:true,
 checkedIn:{observabilityEnabled:bool(config.observability?.enabled),sampling:number(config.observability?.head_sampling_rate),logsEnabled:bool(config.observability?.logs?.enabled),invocationLogs:bool(config.observability?.logs?.invocation_logs),persist:bool(config.observability?.logs?.persist),tracesEnabled:bool(config.observability?.traces?.enabled),publicLoggingFlag:config.vars?.AUTH_DIAGNOSTICS==='true'},
 retainedDeployedMetadata:{observabilityFieldsPresent:candidates.length>0,unambiguous:candidates.length<=1,enabled:bool(observed?.enabled),sampling:number(observed?.head_sampling_rate),logsEnabled:bool(observed?.logs?.enabled),invocationLogs:bool(observed?.logs?.invocation_logs),persist:bool(observed?.logs?.persist),tracesEnabled:bool(observed?.traces?.enabled),publicFlags:flags},
 customerPlanVerified:false,hostedLogsRead:false,currentSettingsRead:false,historicalSecretAbsenceProven:false};
assert.equal(settings.checkedIn.observabilityEnabled,false);assert.equal(flags.AUTH_DIAGNOSTICS,true);assert.equal(flags.CANDIDATE_DRIVE_WRITES_ENABLED,false);
privateRecord=null;
const paths=['worker/index.mjs','worker/google.mjs','worker/durable-object.mjs','worker/crypto.mjs','worker/wrangler.jsonc','auth/routes.mjs','auth/session-owner.mjs','tests/cloudflare-auth-worker.test.mjs','tests/auth-session.test.mjs'];
settings.sourceFiles=[];
for(const path of paths){const bytes=await read(path),fixed=execFileSync('git',['show',source+':'+path],{maxBuffer:2*1024*1024}),normalized=x=>x.toString('utf8').replace(/\r\n/g,'\n');settings.sourceFiles.push({path,sha256:hash(bytes),fixedGitSHA256:hash(fixed),exactGitBytesMatched:hash(bytes)===hash(fixed),sourceContentMatchedIgnoringCRLF:hash(normalized(bytes))===hash(normalized(fixed))});}
assert.ok(settings.sourceFiles.every(x=>x.sourceContentMatchedIgnoringCRLF));
const previous=await json('qa/candidate-rc16-delivery/product-tests.json');
assert.equal(previous.passed,true);assert.equal(previous.counts.pass,558);assert.equal(previous.counts.fail,0);
for(const item of settings.sourceFiles){const old=previous.before.find(x=>x.file===item.path);item.exactPriorTestSourceMatched=old?old.sha256===item.sha256:null;if(old)assert.equal(item.exactPriorTestSourceMatched,true);}
settings.reusedLocalTests={record:'qa/candidate-rc16-delivery/product-tests.json',recordSHA256:hash(await read('qa/candidate-rc16-delivery/product-tests.json')),counts:previous.counts,rerun:false,scope:'Existing fixed-source worker/auth local contracts; no new full-suite run'};
await save('settings.json',settings);
let resumed=null;
try{const old=JSON.parse(await readFile(new URL('live-results.json',leaf)));if(old.failure==='NEGATIVE_CONTRACT_FAILED'&&old.versionBefore===version&&old.cases.length===8&&old.cases.slice(0,7).every(x=>x.passed)&&old.cases[7].label==='wrong-mode'&&old.cases[7].status===401&&old.requests===9)resumed=old;}catch{}
let requestCount=resumed?.requests??0,totalBytes=resumed?.responseBytes??0;const start=Date.now();
async function request(path,{method='GET',headers={},body,maxBytes=4096}={}){
 if(!['/version.json','/api/session/credential'].includes(path)||!['GET','POST'].includes(method)||Object.keys(headers).some(x=>/authorization|cookie/i.test(x))||requestCount>=16||Date.now()-start>120000)throw fail('REQUEST_SCOPE_REJECTED');
 requestCount++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let reader;
 try{const response=await new Promise((resolve,reject)=>{const req=https.request(origin+path,{method,headers,signal:controller.signal},resolve);req.once('error',reject);req.end(body);});reader=response;let n=0;const chunks=[];
  for await(const chunk of reader){n+=chunk.length;totalBytes+=chunk.length;if(n>maxBytes||totalBytes>65536)throw fail('BODY_LIMIT');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),h=new Headers();for(const [k,v] of Object.entries(response.headers)){if(Array.isArray(v)){for(const x of v)h.append(k,x);}else if(v!==undefined)h.set(k,v);}return {response:{status:response.statusCode,headers:h},data:JSON.parse(bytes.toString('utf8')),bytes:n,sha256:hash(bytes)};
 }finally{clearTimeout(timer);controller.abort();reader?.destroy();}
}
const envelope={Origin:origin,'X-Drive-Original-CSRF':'1','Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty','Content-Type':'application/json'};
const without=k=>Object.fromEntries(Object.entries(envelope).filter(([x])=>x!==k));
const cases=[
 ['no-browser-envelope',{},'GET',null,403,'forbidden'],
 ['no-session-cookie',envelope,'POST','{}',401,'unauthorized'],
 ['missing-origin',without('Origin'),'POST','{}',403,'forbidden'],
 ['wrong-origin',{...envelope,Origin:'https://negative-auth.invalid'},'POST','{}',403,'forbidden'],
 ['missing-csrf',without('X-Drive-Original-CSRF'),'POST','{}',403,'forbidden'],
 ['wrong-csrf',{...envelope,'X-Drive-Original-CSRF':'0'},'POST','{}',403,'forbidden'],
 ['cross-site',{...envelope,'Sec-Fetch-Site':'cross-site'},'POST','{}',403,'forbidden'],
 ['wrong-mode',{...envelope,'Sec-Fetch-Mode':'navigate'},'POST','{}',403,'forbidden'],
 ['wrong-destination',{...envelope,'Sec-Fetch-Dest':'document'},'POST','{}',403,'forbidden'],
 ['wrong-method',envelope,'GET',null,400,'bad_request'],
 ['malformed-json',envelope,'POST','{',400,'bad_request'],
 ['unexpected-field',envelope,'POST','{"unexpected":true}',400,'bad_request'],
];
const output={schema:'drive-original.rc16-hosted-security-live/1',recordedAt:new Date().toISOString(),origin,expectedVersion:version,source,versionBefore:null,versionAfter:null,versionStable:false,cases:resumed?resumed.cases.slice(0,7):[],complete:false,failure:null,
 authority:{anonymous:true,cookiesSent:0,bearerRequests:0,authenticatedRequests:0,mutationEndpoints:0,oauthStartCallbackRequests:0,mediaRequests:0,settingsWrites:0,stateWritePathsReached:0},bounds:{requestCap:16,responseBytes:4096,totalBytes:65536,requestMs:10000,runMs:120000},requests:0,responseBytes:0};
if(resumed)output.transportCorrection={initialRecordedAt:resumed.recordedAt,reusedPassedCases:7,initialRequests:9,invalidWrongModeAttempt:{requested:'navigate',actualFetchMode:'cors',observedStatus:401,interpretation:'Node fetch overwrote the header; invalid negative-mode discriminator'},rawHttpsRetry:true};
try{const before=await request('/version.json');output.versionBefore=typeof before.data.version==='string'&&/^1\.22\.0-rc\.\d+$/.test(before.data.version)?before.data.version:null;assert.equal(output.versionBefore,version);output.versionBeforeSHA256=before.sha256;if(resumed)assert.equal(before.sha256,resumed.versionBeforeSHA256);
 for(const [label,headers,method,body,status,code] of cases.slice(resumed?7:0)){const r=await request('/api/session/credential',{headers,method,...(body===null?{}:{body})});const exact=Object.keys(r.data??{}).join(',')==='error'&&Object.keys(r.data.error??{}).sort().join(',')==='code,retryable'&&r.data.error.code===code&&r.data.error.retryable===false;
  const row={label,status:r.response.status,expectedStatus:status,expectedCode:code,statusMatched:r.response.status===status,exactFixedErrorEnvelope:exact,noStore:r.response.headers.get('cache-control')==='no-store',pragmaNoCache:r.response.headers.get('pragma')==='no-cache',nosniff:r.response.headers.get('x-content-type-options')==='nosniff',jsonContentType:r.response.headers.get('content-type')?.startsWith('application/json')===true,setCookieAbsent:!r.response.headers.has('set-cookie'),redirectAbsent:!r.response.headers.has('location'),corsAllowOriginAbsent:!r.response.headers.has('access-control-allow-origin'),bodyBytes:r.bytes};
  row.passed=row.statusMatched&&exact&&row.noStore&&row.pragmaNoCache&&row.nosniff&&row.jsonContentType&&row.setCookieAbsent&&row.redirectAbsent&&row.corsAllowOriginAbsent;output.cases.push(row);if(!row.passed)throw fail('NEGATIVE_CONTRACT_FAILED');
 }
 const after=await request('/version.json');output.versionAfter=typeof after.data.version==='string'&&/^1\.22\.0-rc\.\d+$/.test(after.data.version)?after.data.version:null;output.versionAfterSHA256=after.sha256;output.versionStable=output.versionAfter===version&&after.sha256===output.versionBeforeSHA256;assert.ok(output.versionStable);output.complete=true;
}catch(e){output.failure=['REQUEST_SCOPE_REJECTED','BODY_MISSING','BODY_LIMIT','NEGATIVE_CONTRACT_FAILED'].includes(e?.code)?e.code:'LIVE_CHECK_FAILED';}
output.requests=requestCount;output.responseBytes=totalBytes;output.elapsedMs=Date.now()-start;
await save('live-results.json',output);
console.log(JSON.stringify({complete:output.complete,failure:output.failure,versionBefore:output.versionBefore,versionAfter:output.versionAfter,versionStable:output.versionStable,negativeCases:output.cases.length,passed:output.cases.filter(x=>x.passed).length,requests:requestCount,observabilityFieldsPresent:settings.retainedDeployedMetadata.observabilityFieldsPresent}));
if(!output.complete)process.exitCode=1;
