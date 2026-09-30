import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { AccountCredentialOwner, SESSION_IDLE_MS, SESSION_ABSOLUTE_MS } from '../../auth/session-owner.mjs';
import { REQUESTED_GOOGLE_SCOPES } from '../../auth/scope-policy.mjs';
import { createWorkerHandler } from '../../worker/index.mjs';
import { createAuthCrypto, base64urlEncode } from '../../worker/crypto.mjs';

// Synthetic sessions only. No HTTP, real credential, account, grant or DO write.
const origin='https://synthetic.example',initial=1800000000000,account='a'.repeat(43);
const key=b=>base64urlEncode(new Uint8Array(32).fill(b));
const env={AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'false',PUBLIC_ORIGIN:origin,GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',AUTH_HMAC_KEY:key(1),ACCOUNT_KEY:key(2),CREDENTIAL_ENCRYPTION_KEY_V1:key(3),AUTH_OBJECTS:{idFromName(){},get(){}},ASSETS:{fetch:async()=>new Response('synthetic asset')}};
const result={schema:'drive-original.rc21-synthetic-owner/1',recordedAt:new Date().toISOString(),producerSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),scope:'local synthetic integrated Worker route + actual AccountCredentialOwner; not hosted authenticated proof',networkRequests:0,realSessionWrites:0,cases:[]};
let now=initial,state={},quota=false,index=new Map(),refreshes=0,revokes=0;
const storage={async transaction(fn){if(quota)throw new Error('synthetic storage exhausted');const draft=structuredClone(state),ret=fn(draft);if(ret?.then)throw new Error('async mutation');state=draft;return structuredClone(ret);}};
const owner=new AccountCredentialOwner({storage,account,clock:()=>now,refresh:async()=>{refreshes++;throw new Error('synthetic provider unavailable');},revoke:async()=>{revokes++;},encrypt:async value=>({synthetic:value}),decrypt:async value=>value.synthetic,hash:async value=>crypto.createHash('sha256').update(value).digest('hex')});
const crypt=createAuthCrypto(env);
async function fresh(){now=initial;quota=false;state={};index=new Map();const created=await owner.establishVerifiedSession({account,accessToken:'synthetic-access-only',expiresAt:now+3600000,refreshToken:'synthetic-refresh-only',grantedScopes:REQUESTED_GOOGLE_SCOPES});index.set(await crypt.sessionIndexKey(created.sessionId),{accountKey:account});return created.sessionId;}
const handler=createWorkerHandler(env,{clock:()=>now,callObject:async(name,payload)=>{if(name.startsWith('session:'))return index.get(name.slice(8))||null;if(name===`account:${account}`&&payload.operation==='credential')return owner.credential(payload.args.input);throw new Error('synthetic unexpected path');}});
async function probe(name,{session,headers={},body={},expectedStatus,expectedCode=null}={}){const r=await handler(new Request(origin+'/api/session/credential',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Drive-Original-CSRF':'1','Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty',...(session?{Cookie:`__Host-drive_original_session=${session}`}:{ }),...headers},body:JSON.stringify(body)}));const j=await r.json();assert.equal(r.status,expectedStatus);if(expectedCode)assert.deepEqual(j,{error:{code:expectedCode,retryable:expectedCode==='auth_unavailable'}});else{assert.equal(j.account,account);assert.equal(j.accessToken,'synthetic-access-only');assert.equal('refreshToken'in j,false);assert.equal('clientSecret'in j,false);}assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Pragma'),'no-cache');assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('Set-Cookie'),null);result.cases.push({name,status:r.status,errorCode:expectedCode,noStore:true,passed:true});}
let session=await fresh();
await probe('authenticated-positive-control',{session,body:{expectedAccount:account,credentialProtocol:2},expectedStatus:200});
await probe('authenticated-wrong-account',{session,body:{expectedAccount:'b'.repeat(43),credentialProtocol:2},expectedStatus:409,expectedCode:'account_mismatch'});
await probe('authenticated-invalid-protocol',{session,body:{credentialProtocol:3},expectedStatus:409,expectedCode:'client_update_required'});
await probe('authenticated-future-revision',{session,body:{rejectedRevision:999,credentialProtocol:2},expectedStatus:409,expectedCode:'stale_revision'});
await probe('authenticated-wrong-origin',{session,headers:{Origin:'https://other.example'},expectedStatus:403,expectedCode:'forbidden'});
await probe('authenticated-wrong-csrf',{session,headers:{'X-Drive-Original-CSRF':'wrong'},expectedStatus:403,expectedCode:'forbidden'});
await probe('authenticated-cross-site-context',{session,headers:{'Sec-Fetch-Site':'cross-site'},expectedStatus:403,expectedCode:'forbidden'});
await probe('unknown-session',{session:'f'.repeat(64),expectedStatus:401,expectedCode:'unauthorized'});
session=await fresh();now=initial+SESSION_IDLE_MS;await probe('expired-idle-session',{session,expectedStatus:401,expectedCode:'unauthorized'});
session=await fresh();now=initial+SESSION_ABSOLUTE_MS;await probe('expired-absolute-session',{session,expectedStatus:401,expectedCode:'unauthorized'});
session=await fresh();await owner.logout({sessionId:session});await probe('logged-out-session',{session,expectedStatus:401,expectedCode:'unauthorized'});
session=await fresh();quota=true;await probe('storage-quota-failure',{session,expectedStatus:503,expectedCode:'auth_unavailable'});quota=false;
session=await fresh();now=initial+3600000;await probe('provider-unavailable',{session,expectedStatus:503,expectedCode:'auth_unavailable'});
result.providerRefreshAttempts=refreshes;result.providerRevokeCalls=revokes;result.complete=result.cases.every(c=>c.passed);result.sourceHashes=Object.fromEntries(['auth/session-owner.mjs','auth/routes.mjs','worker/index.mjs','worker/crypto.mjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+p,import.meta.url))).digest('hex')]));
fs.writeFileSync(new URL('./synthetic-owner.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:result.complete,cases:result.cases.length,networkRequests:0,scope:result.scope}));
