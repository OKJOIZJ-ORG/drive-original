'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const guard = require('./delivery-guard.cjs');
guard.assertSource();
assert.equal(guard.SOURCE, 'd3f78f321a804f582668dde1b7cd3e0f949b24c9');
const prior = 'qa/candidate-rc35-delivery/';
let baseline = guard.blob(prior + 'pc-update-baseline.expression.js').toString()
  .replaceAll('rc35', 'rc36').replaceAll('Rc35', 'Rc36').replaceAll('1.22.0-rc.34', '1.22.0-rc.35');
const gate = "|| localStorage.getItem(key)) throw Error('QA_UPDATE_BASELINE_PREFLIGHT');";
assert.equal(baseline.split(gate).length, 2);
baseline = baseline.replace(gate, "|| localStorage.getItem(key) || window.__resumeSwProof || window.__qaRc35PcUpdate"
  + " || state.accountStateSyncPromise || state.accountStateSyncTimer || state.accountStateSyncRetryTimer"
  + " || state.accountStateLoadingPromise || state.accountIdentityPending) throw Error('QA_UPDATE_BASELINE_PREFLIGHT');");
const old = guard.blob(prior + 'pc-source-proof.expression.js').toString(), end = old.indexOf('})({');
assert.ok(end > 0);
const factory = old.slice(0, end + 2).replaceAll('drive-original.qa.rc35-update-baseline', 'drive-original.qa.rc36-update-baseline');
const shell = vm.runInNewContext(guard.blob('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1], {}, {timeout: 1000});
const distinct = [...new Set(shell.map(file => file === './' ? 'index.html' : file.slice(2)))];
assert.equal(distinct.length, 50); assert.ok(distinct.includes('media/native-color.mjs'));
const binding = {sourceCommit: guard.SOURCE, version: guard.VERSION,
  sourceSHA256: Object.fromEntries(['app.js', 'sw.js', 'version.json'].map(file => [file, guard.sha(guard.blob(file))]))};
const expected = distinct.map(file => ({file, sha256: guard.sha(guard.blob(file))}));
const proof = factory + '(' + JSON.stringify(binding) + ',' + JSON.stringify(expected) + ')\n';
new vm.Script(baseline); new vm.Script(proof);
const files = [['pc-update-baseline.expression.js', baseline], ['pc-source-proof.expression.js', proof]];
for (const [name, value] of files) {
  const destination = path.join(__dirname, name);
  if (fs.existsSync(destination)) assert.equal(fs.readFileSync(destination, 'utf8'), value, 'Existing preparation drift');
  else fs.writeFileSync(destination, value, {flag: 'wx'});
}
const record = {...binding, beforeVersion: '1.22.0-rc.35', baselineKey: 'drive-original.qa.rc36-update-baseline',
  shellExpected: expected, rootAliasAdditional: true, executingWorkerBytes: 'NOT_ESTABLISHED_BY_THIS_PROCEDURE',
  actualExecution: false, noProductOrAccountWrites: true,
  prerequisitesBeforeInput: ['Root confirms completed exact-candidate delivery readiness', 'Recheck actual35 player/retirement/account-idle/visibility and current36 banner', 'Install baseline/trusted-click/pagehide observer before normal UI input', 'Retain failures and remove only matching owned helper/baseline/proof'],
  baselineSha256: guard.sha(Buffer.from(baseline)), proofSha256: guard.sha(Buffer.from(proof)),
  reusedProcedure: {baseline: prior + 'pc-update-baseline.expression.js', proof: prior + 'pc-source-proof.expression.js'},
  producerSha256: guard.sha(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(__dirname, 'pc-source-binding.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({prepared: true, cachedDistinct: distinct.length, rootAliasAdditional: true, beforeVersion: record.beforeVersion, version: binding.version}));
