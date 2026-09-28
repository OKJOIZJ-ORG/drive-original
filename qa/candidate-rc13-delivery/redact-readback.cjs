'use strict';
// Reads the local control-plane record; never copies raw binding values/metadata.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const input=path.join(__dirname,'version-readback.json'),out=path.join(__dirname,'redacted-readback.json');
const raw=fs.readFileSync(input),record=JSON.parse(raw),expected='9008980b-9a99-4e57-b36c-dfd987013baa';
assert.equal(record.id,expected);
const bindings={ACCOUNT_KEY:'secret_text',ASSETS:'assets',AUTH_DIAGNOSTICS:'plain_text',AUTH_ENABLED:'plain_text',AUTH_HMAC_KEY:'secret_text',AUTH_OBJECTS:'durable_object_namespace',CANDIDATE_DRIVE_WRITES_ENABLED:'plain_text',CREDENTIAL_ENCRYPTION_KEY_V1:'secret_text',GOOGLE_CLIENT_ID:'plain_text',GOOGLE_CLIENT_SECRET:'secret_text',PUBLIC_ORIGIN:'plain_text'};
const flags={AUTH_ENABLED:'true',AUTH_DIAGNOSTICS:'true',CANDIDATE_DRIVE_WRITES_ENABLED:'false'};
const safe=Object.entries(bindings).map(([name,type])=>{const item=record.resources.bindings.find(b=>b.name===name);assert.equal(item?.type,type);if(name in flags)assert.equal(item.text,flags[name]);return{name,type,...(type==='secret_text'?{secretConfigured:true}:{})};});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(out,JSON.stringify({schema:1,workerVersion:expected,publicFlags:flags,bindings:safe,rawInputSha256:hash(raw),producerSha256:hash(fs.readFileSync(__filename)),omitted:['account identifiers','namespace identifiers','author metadata','client ID value','public-origin binding value','secret values','deployment logs'],hostedLogContentsRead:false},null,2));
console.log(JSON.stringify({workerVersion:expected,bindings:safe.length,publicFlags:flags,secretConfigured:safe.filter(b=>b.secretConfigured).length}));
