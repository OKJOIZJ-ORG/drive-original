'use strict';
// Compares every public file served by production with its committed Git blob,
// checks that private repository paths are not served and that the anonymous
// credential endpoint refuses. Usage: node qa/release-1.23.21/served-check.cjs [origin] > served.json
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const origin = (process.argv[2] || 'https://drive-original.jyw-drive.workers.dev').replace(/\/$/, '');
const files = require('../../scripts/public-files.cjs');
const crypto = require('node:crypto');
const PRIVATE = ['app.js', 'app/README.md', 'tests/app-loader.cjs', 'memory/DECISIONS.md', 'scripts/public-files.cjs',
  'worker/index.mjs', '.git/config'];
(async () => {
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
  const rows = [];
  for (const name of files) {
    const committed = execFileSync('git', ['show', `HEAD:${name}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const response = await fetch(`${origin}/${name}`, { cache: 'no-store' });
    const served = Buffer.from(await response.arrayBuffer());
    rows.push({ name, status: response.status, equal: response.ok && served.equals(committed),
      sha256: crypto.createHash('sha256').update(served).digest('hex') });
  }
  const privateRows = [];
  for (const p of PRIVATE) privateRows.push({ path: p, status: (await fetch(`${origin}/${p}`, { cache: 'no-store' })).status });
  const credential = await fetch(`${origin}/api/session/credential`, { method: 'POST', cache: 'no-store' });
  console.log(JSON.stringify({ commit, origin: `${origin}/`, checkedAt: new Date().toISOString(),
    public: { total: rows.length, equal: rows.filter(row => row.equal).length, rows },
    private: privateRows,
    anonymousCredential: { status: credential.status, cacheControl: credential.headers.get('cache-control') } }, null, 2));
})();
