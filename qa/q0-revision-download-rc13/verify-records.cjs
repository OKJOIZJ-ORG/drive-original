'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,name));
const json=name=>JSON.parse(read(name));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const expressionSHA256=sha(read('facade.expression.js'));
assert.equal(expressionSHA256,'f500d16cee5e60031375a57fed91e52ea39e94d4864cde819ac2e30b794ac4b2');
const result=json('live-results.json'),proof=json('live-sw-proof-results.json'),s=result.summary;
assert.equal(result.done,true);assert.equal(s.complete,true);assert.equal(s.failure,null);
assert.equal(s.postRequests,1);assert.equal(s.operationRequests,0);
assert.equal(s.mediaRequests,2);assert.equal(s.mediaBytes,4);assert.equal(s.metadataRequests,4);
assert.equal(s.revisionRequested,true);assert.equal(s.partialAllowed,true);assert.equal(s.identitySafe,true);
assert.equal(s.localReferencesReleased,true);assert.equal(s.sourceCleanup.settled,true);
assert.equal(s.observedUriOrigin.knownHost,'www.googleapis.com');assert.equal(s.observedUriOrigin.allowlisted,true);
assert.equal(s.results.length,3);assert.equal(s.results[0].status,200);
for(const row of s.results.slice(1)){assert.equal(row.kind,'media');assert.equal(row.status,206);assert.equal(row.bodyBytes,2);assert.equal(row.rangeConsistent,true);}
assert.ok(s.payloadBytes+s.metadataBytes<=32768);
assert.equal(proof.done,true);assert.equal(proof.accepted,true);assert.equal(proof.version,'1.22.0-rc.13');
assert.equal(proof.staticAssetGET,1);assert.equal(proof.mediaGET,0);assert.equal(proof.metadataGET,0);
const forbidden=/(?:Bearer\s|https?:\/\/[^\s]+\?|'access_token'|"access_token"|"downloadUri"|"headRevisionId"|"fileId"|"resourceKey"|"operationName")/;
assert.equal(forbidden.test(read('live-results.json').toString()+read('live-sw-proof-results.json').toString()),false);
const summary={scope:'Saved actual-provider records; no new browser reproduction',expressionSHA256,
  liveResultsSHA256:sha(read('live-results.json')),swProofSHA256:sha(read('sw-runtime-proof.expression.js')),
  liveSwProofSHA256:sha(read('live-sw-proof-results.json')),complete:true,
  immutableChangedRevisionProof:false,genericUpstreamCleanup:'unknown'};
fs.writeFileSync(path.join(__dirname,'record-check.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
