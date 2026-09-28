'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const read = name => fs.readFileSync(path.join(__dirname, name));
const json = name => JSON.parse(read(name));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const p = json('provenance.json');
assert.equal(sha(read('body.js')), p.bodySHA256);
assert.equal(sha(read('build.cjs')), p.producerSHA256);
assert.equal(sha(read('facade.expression.js')), p.outputSHA256);
assert.equal(p.outputSHA256, 'db2914bd344da2b3837c4e0f8c4d3d055108c7000ec71cd006d3ec8ef75d15df');
const result = json('live-results.json'), s = result.summary, proof = json('live-sw-proof-results.json');
assert.equal(result.done, true); assert.equal(s.schema, 'drive-original.disposable-revision-pin/2');
for (const key of ['complete','createdVerified','beforeA','revisionChanged','latestB','oldUriStillA','restoredVerified','trashVerified','localCleanupSettled','localReferencesReleased','initialDone','operationNameAccepted']) assert.equal(s[key], true, key);
for (const key of ['oldUriDenied','recoveryRequired']) assert.equal(s[key], false, key);
assert.equal(s.failure, null); assert.equal(s.cleanupFailure, null);
assert.equal(s.requests, 17); assert.equal(s.writeRequests, 4); assert.equal(s.downloadPosts, 1); assert.equal(s.operationRequests, 0);
assert.equal(s.mediaBytes, 64); assert.equal(s.jsonBytes, 4933); assert.ok(s.elapsedMs <= 90000);
assert.equal(s.uriProfile.sameFilePath, true); assert.equal(s.uriProfile.revisionPathMatched, true);
assert.equal(s.results.filter(row => row.status === 206).length, 4);
assert.equal(proof.done, true); assert.equal(proof.accepted, true); assert.equal(proof.version, '1.22.0-rc.13');
assert.equal(proof.staticAssetGET, 1); assert.equal(proof.mediaGET, 0); assert.equal(proof.metadataGET, 0);
const old = JSON.parse(fs.readFileSync(path.join(__dirname, '../q0-revision-pin-disposable-rc13/live-results.json'))).summary;
assert.equal(old.failure, 'OPERATION_NAME'); assert.equal(old.revisionChanged, false);
assert.equal(old.restoredVerified, true); assert.equal(old.trashVerified, true); assert.equal(old.recoveryRequired, false);
const forbidden = /(?:Bearer\s|https?:\/\/[^\s]+\?|'access_token'|"access_token"|"downloadUri"|"headRevisionId"|"fileId"|"resourceKey"|"operationName")/;
assert.equal(forbidden.test(read('live-results.json') + read('live-sw-proof-results.json')), false);
const record = { scope: 'Saved actual disposable-provider records; no new browser run', expressionSHA256: p.outputSHA256,
  liveResultsSHA256: sha(read('live-results.json')), liveSwProofSHA256: sha(read('live-sw-proof-results.json')),
  swProofExpressionSHA256: sha(read('sw-runtime-proof.expression.js')), complete: true, originalMediaWrites: 0,
  changedRevisionProof: true, physicalDeviceProof: false, genericUpstreamCleanup: 'unknown' };
fs.writeFileSync(path.join(__dirname, 'record-check.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
