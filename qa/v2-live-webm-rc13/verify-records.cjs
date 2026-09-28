const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = __dirname;
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const source = '570f9c38506d1e426c33cf65b73836d32bf872c0';
const version = '1.22.0-rc.13';
const start=read('start-results.json');
assert.equal(start.source,source); assert.equal(start.version,version);
assert.equal(start.sample.playbackMode,'original-range');
assert.equal(start.sample.q1,false); assert.equal(start.sample.blobSource,false);
assert.equal(start.sample.temporaryStorageActive,false); assert.equal(start.sample.errorCode,null);
assert.ok(start.trace.events.some(e=>e.stage==='first-decoded-frame'));
assert.equal(start.ended.ended,true); assert.ok(start.sample.decodedFrames>=3);
for(const [p,fraction] of [['mid-seek-results.json',.5],['end-seek-results.json',.9]]) {
  const r=read(p); assert.equal(r.source,source); assert.equal(r.version,version);
  const rows=r.trace.rows, seeked=rows.find(e=>e.kind==='seeked');
  assert.ok(seeked); assert.ok(Math.abs(seeked.currentTime-start.sample.duration*fraction)<.001);
  assert.ok(seeked.frames>start.sample.decodedFrames);
  assert.ok(rows.some(e=>e.kind==='presented'&&e.elapsedMs>=seeked.elapsedMs&&Math.abs(e.mediaTime-seeked.currentTime)<.11));
  assert.equal(r.sample.errorCode,null); assert.equal(r.sample.playbackMode,'original-range');
}
for(const p of ['mid-resume-end-results.json','end-resume-results.json']) {
  const r=read(p); assert.equal(r.ended,true); assert.equal(r.errorCode,null);
  assert.ok(Math.abs(r.time-r.duration)<.001);
  const before=read(p==='mid-resume-end-results.json'?'mid-seek-results.json':'end-seek-results.json');
  assert.ok(r.frames>before.sample.decodedFrames);
}
const close=read('close-results.json');
assert.equal(close.result.srcAttributePresent,false); assert.equal(close.result.sourceChildren,0);
assert.equal(close.result.readyState,0); assert.equal(close.result.selected,false);
assert.equal(close.result.q1,false); assert.equal(close.result.retirementSettled,true);
assert.equal(close.allTemporaryHelpersCleared,true); assert.equal(close.allObjectGroupsReleased,true);
const provenance={};
for(const [own,old] of [['trace.expression.js','trace.expression.js'],['native.expression.js','native-events.expression.js'],['sample.expression.js','sample.expression.js'],['seek.expression.js','seek-presentation.expression.js']]) {
  const previous=path.join(base,'..','v2-live-format-playback-rc12',old);
  assert.equal(hash(path.join(base,own)),hash(previous)); provenance[own]=hash(path.join(base,own));
}
const record={source,version,scope:'Saved actual short WebM observations; no new browser/device/integrity proof',passed:true,
  producers:provenance,producerSha256:hash(__filename),startupFirstFrameMs:start.trace.events.find(e=>e.stage==='first-decoded-frame').elapsedMs,
  duration:start.sample.duration,checks:['native original startup and EOF','trusted50%target frame and resumedEOF','trusted90%target frame and resumedEOF','normalclose and root helper release attestation']};
fs.writeFileSync(path.join(base,'qualification-summary.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
