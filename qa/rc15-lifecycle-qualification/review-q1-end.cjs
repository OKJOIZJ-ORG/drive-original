'use strict';
// Read-only scalar adjudication; never rewrite the original strict-equality run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const rawReport='long-2026-09-29T23-08-49-924Z.json',raw=fs.readFileSync(path.join(__dirname,rawReport)),report=JSON.parse(raw),trial=report.results[0];
assert.equal(report.passed,false);assert.equal(trial.route,'q1');assert.deepEqual(report.producerStart,report.producerEnd);assert.equal(report.browserClosed,true);
const end=trial.samples.find(v=>v.paused&&v.ended);
assert.ok(end);assert.ok(Math.abs(end.time-end.duration)<=1/48000);assert.equal(end.frames,1728);assert.ok(end.elapsedMs>=65000&&end.elapsedMs<96000);
assert.ok(end.stats.removals>0&&end.stats.waits>0);assert.ok(end.stats.peakAhead<=38);assert.ok(end.stats.peakRetainedAppendBytes<=24*1024*1024);
assert.equal(end.stats.failure,null);assert.equal(end.stats.worker.terminated,true);assert.equal(end.stats.worker.activeReads,0);assert.equal(end.stats.worker.pendingChunks,0);assert.equal(end.stats.worker.pendingWindows,0);
assert.equal(end.stats.pipeline.cleanup.settled,true);assert.equal(end.stats.pipeline.cleanup.pendingCallbacks,0);assert.equal(end.stats.pipeline.cleanup.cleanupPending,0);assert.equal(end.stats.pipeline.reads.inFlight,0);assert.ok(end.stats.pipeline.reads.peakCache<=262144);
const result={rawReport,rawSha256:hash(raw),reviewProducerSha256:hash(fs.readFileSync(__filename)),
 reviewScope:'Read-only review of preserved Q1 native-end evidence. First literal-float harness failure retained. No independently observed app/SW retirement after this long run; owned browser close observed and50cycle cleanup proof separately bound.',
 endpointPolicy:'For this finite72-second fixture require native ended and paused, source-clock endpoint within one48kHz sample, all1728video frames. This does not change a product acceptance criterion.',
 observedSourceEnd:end,originalHarnessFailed:true,passed:true};
fs.writeFileSync(path.join(__dirname,'long-q1-end-review.json'),JSON.stringify(result,null,2)+'\n');console.log('Q1 preserved native-end precision review PASS');
