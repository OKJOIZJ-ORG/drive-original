'use strict';
// Independent model of addAll's post-fetch cache commit. The platform batch
// step has no AbortSignal input; this is a specification counterexample, not
// evidence of a particular browser's timing or network behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const hash = crypto.createHash('sha256').update(source).digest('hex');
const timers = new Map(); let nextTimer = 0, commit;
const events = [], active = {};
let cached = 'previous-complete-shell';
let batchCount = 0;
const context = { URL, Request, AbortController, Map, Set, Headers, Response,
  setTimeout(callback, ms) { timers.set(++nextTimer, { callback, ms }); return nextTimer; },
  clearTimeout(id) { timers.delete(id); },
  importScripts() {},
  caches: { async open(name) {
    events.push({ kind: 'open', name });
    return { addAll(requests) {
      batchCount++;
      events.push({ kind: 'addAll', count: requests.length, noStore: requests.every(r => r.cache === 'no-store') });
      return new Promise(resolve => { commit = () => {
        const aborted = requests.every(r => r.signal.aborted);
        cached = 'fresh-complete-shell'; events.push({ kind: 'commit', aborted }); resolve();
      }; });
    } };
  } },
  self: { registration: { scope: 'https://app.test/drive-original/', active },
    serviceWorker: active, addEventListener() {}, clients: {} }
};
vm.createContext(context); vm.runInContext(source, context, { filename: 'sw.js' });
(async () => {
  const first = vm.runInContext('refreshKnownAppShell()', context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(batchCount, 1);
  const deadline = [...timers.values()].find(t => t.ms === 15000);
  assert.ok(deadline); deadline.callback();
  const result = await first;
  assert.equal(result.ok, false); assert.equal(result.code, 'timeout');
  assert.equal(cached, 'previous-complete-shell');
  const second = await vm.runInContext('refreshKnownAppShell()', context);
  assert.equal(second.code, 'timeout'); assert.equal(batchCount, 1);
  commit(); await Promise.resolve(); await Promise.resolve();
  assert.equal(cached, 'fresh-complete-shell');
  const output = { level: 'specification-conforming VM cache-commit timing model',
    workerSha256: hash, result: { ...result }, repeatedResult: { ...second },
    batches: batchCount, cachedAfterTimeout: cached, events,
    finding: 'An already pending atomic cache commit can finish after timeout and aborted Request signals. The coalescing latch prevents overlap but does not preserve previous bytes on every timeout.' };
  fs.writeFileSync(path.join(__dirname, 'deadline-counterexample-results.json'), JSON.stringify(output, null, 2) + '\n');
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
