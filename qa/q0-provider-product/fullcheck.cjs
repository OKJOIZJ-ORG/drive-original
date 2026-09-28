'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawnSync, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const files = ['tests/acceptance.test.js','tests/account-state.test.js','tests/app.test.js','tests/audit.test.js',
  'tests/auth-scopes.test.mjs','tests/auth-session.test.mjs','tests/cloudflare-auth-worker.test.mjs',
  'tests/immersive.test.js','tests/mutations.test.js','tests/presentation-state.test.js','tests/q1-source.test.mjs',
  'tests/shell.test.js','tests/static.test.js','tests/sw.test.js','tests/revision-pin.test.js','tests/q0-proxy.test.js'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const watched = ['app.js','sw.js','index.html','version.json','media/revision-pin.js',
  'scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs', ...files];
const snapshot = () => Object.fromEntries(watched.map(file => [file, hash(fs.readFileSync(path.join(root,file)))]));
const before = snapshot(), startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, ['--test', ...files], {cwd: root, encoding:'utf8', maxBuffer:8*1024*1024});
fs.writeFileSync(path.join(__dirname,'full-product-rc14.log'), result.stdout + result.stderr);
const counts = Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key =>
  [key, Number(result.stdout.match(new RegExp(`(?:ℹ|#) ${key} (\\d+)`))?.[1] ?? NaN)]));
const record = {scope:'Complete explicit existing product suite plus Q0 snapshot protocol tests; synthetic contract evidence',
  startedAt, completedAt:new Date().toISOString(), headAtRun:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  version:JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version,
  producer:hash(fs.readFileSync(__filename)), hashes:before, sourceUnchanged:JSON.stringify(before)===JSON.stringify(snapshot()),
  exitCode:result.status, ...counts, passed:result.status===0 && counts.fail===0 && counts.cancelled===0};
fs.writeFileSync(path.join(__dirname,'full-product-rc14.json'), JSON.stringify(record,null,2)+'\n');
process.stdout.write(JSON.stringify({exitCode:record.exitCode,...counts,sourceUnchanged:record.sourceUnchanged,passed:record.passed})+'\n');
process.exitCode = record.passed && record.sourceUnchanged ? 0 : 1;
