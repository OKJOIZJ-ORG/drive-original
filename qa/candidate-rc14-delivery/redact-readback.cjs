'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const input=path.join(__dirname,'version-readback.json'),raw=fs.readFileSync(input),record=JSON.parse(raw);
const expected='e8f5f5c7-5f09-46c5-919a-faacfa4d02ac';assert.equal(record.id,expected);
const expectedTypes={ACCOUNT_KEY:'secret_text',ASSETS:'assets',AUTH_DIAGNOSTICS:'plain_text',AUTH_ENABLED:'plain_text',AUTH_HMAC_KEY:'secret_text',AUTH_OBJECTS:'durable_object_namespace',CANDIDATE_DRIVE_WRITES_ENABLED:'plain_text',CREDENTIAL_ENCRYPTION_KEY_V1:'secret_text',GOOGLE_CLIENT_ID:'plain_text',GOOGLE_CLIENT_SECRET:'secret_text',PUBLIC_ORIGIN:'plain_text'};
const flags={AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'};
const bindings=Object.entries(expectedTypes).map(([name,type])=>{
 const item=record.resources.bindings.find(binding=>binding.name===name);assert.equal(item?.type,type);
 if(name in flags)assert.equal(item.text,flags[name]);
 return{name,type,...(type==='secret_text'?{secretConfigured:true}:{})};
});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const safe={schema:1,source:'067bcb94329a99f6dcec78657ca3882dbf9d8aad',workerVersion:expected,publicFlags:flags,bindings,
 rawInputSha256:hash(raw),producerSha256:hash(fs.readFileSync(__filename)),
 omitted:['account and namespace identifiers','author metadata','client ID and origin binding values','secret values','raw deployment logs'],hostedLogContentsRead:false};
fs.writeFileSync(path.join(__dirname,'redacted-readback.json'),JSON.stringify(safe,null,2)+'\n');
process.stdout.write(JSON.stringify({workerVersion:expected,bindings:bindings.length,publicFlags:flags})+'\n');
