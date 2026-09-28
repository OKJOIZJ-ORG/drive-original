'use strict';
// Aggregates existing package/delivery records; does not rebuild or deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source='570f9c38506d1e426c33cf65b73836d32bf872c0',version='1.22.0-rc.13';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const packageBytes=fs.readFileSync(path.join(__dirname,'package-results.json')),record=JSON.parse(packageBytes);
const deliveryBytes=fs.readFileSync(path.join(root,'qa/candidate-rc13-delivery/results.json')),delivery=JSON.parse(deliveryBytes);
assert.equal(record.source,source);assert.equal(record.version,version);assert.equal(record.zipBytes,872854);assert.equal(record.zipSha256,'419e33bb30c64f1b92bb6b969bfec700e116d0f1489a98b7407fa19a5d005c4b');assert.equal(record.entries.length,19);
for(const field of ['publicAllowlist','gitBytes','zipCrc','savedReread'])assert.equal(record.verified[field],true);
assert.equal(record.originalMediaOrPrivateEvidenceIncluded,false);assert.equal(record.productionChanged,false);
assert.equal(record.producerSha256,hash(fs.readFileSync(path.join(__dirname,'build-static-package.py'))));
assert.equal(record.deliveryRecordSha256,hash(deliveryBytes));assert.equal(hash(deliveryBytes),'6b6d5117ca21fae9548b59327ab742ae6e3d8a36de33dd90ac4c530b5406cf4b');
assert.equal(delivery.source,source);assert.equal(delivery.version,version);assert.equal(delivery.passed,true);assert.equal(delivery.assets.length,19);assert.equal(delivery.cached.length,17);assert.equal(delivery.privateRoutes.length,4);assert.equal(delivery.pageErrors,0);assert.equal(delivery.cold.controlled,true);assert.equal(delivery.cold.accountPresent,false);assert.equal(delivery.cold.candidate,true);assert.equal(delivery.cold.writes,false);assert.equal(delivery.offline.version,version);assert.equal(delivery.offline.controlled,true);
const testBytes=fs.readFileSync(path.join(root,'qa/candidate-privacy-rc13/full-product-tests.log')),log=testBytes.toString('utf8');assert.match(log,/ℹ tests 387\b/);assert.match(log,/ℹ pass 387\b/);assert.match(log,/ℹ fail 0\b/);
fs.writeFileSync(path.join(__dirname,'qualification-summary.json'),JSON.stringify({source,version,producerSha256:hash(fs.readFileSync(__filename)),package:{bytes:record.zipBytes,sha256:record.zipSha256,entries:19,recordSha256:hash(packageBytes),packageProducerSha256:record.producerSha256,existingVerification:record.verified,privateEvidenceIncluded:false},delivery:{recordSha256:hash(deliveryBytes),publicAssets:19,cachedResponses:17,private404Routes:4,pageErrors:0,coldControlled:true,anonymous:true,candidate:true,driveWrites:false,offlineControlled:true},nextLocalPrivacyUnit:{tests:387,pass:387,fail:0,logSha256:hash(testBytes),includedInFixedCandidate:false},limits:['Record-only verification; public/cache/browser audit not rerun','Package does not contain server bindings or secrets','Next local privacy repair and 387-test run are not the deployed fixed385 unit']},null,2));
console.log(JSON.stringify({packageBytes:record.zipBytes,packageEntries:19,publicAssets:19,cachedResponses:17,pageErrors:0,nextLocalPrivacyTests:387}));
