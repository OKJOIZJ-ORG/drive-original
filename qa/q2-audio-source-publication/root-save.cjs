'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, maxBuffer: 80 * 1024 * 1024 });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'curated-commit-manifest.json')));
if (git('diff', '--cached', '--name-only').toString().trim()) throw Error('Preserve existing staging; inspect before continuing');
for (const record of manifest.files) {
  const allowed = /^(licenses\/audio-source-|qa\/q2-audio-source-publication\/|scripts\/package-audio-source\.cjs$)/.test(record.path);
  if (!allowed || record.path.split('/').includes('..')) throw Error('Unexpected publication path');
  const bytes = fs.readFileSync(path.join(root, record.path));
  if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw Error('Publication input changed: ' + record.path);
}
const paths = [...manifest.files.map(x => x.path), ...manifest.additionalManifestPaths,
  '.gitattributes', 'memory/Q2-SOURCE-PUBLICATION-20260929.md',
  'qa/q2-audio-source-publication/root-save.cjs'];
if (new Set(paths).size !== paths.length) throw Error('Duplicate staged path');
git('add', '-f', '--', ...paths);
for (const record of manifest.files) {
  const bytes = git('show', ':' + record.path);
  if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw Error('Git changed publication bytes: ' + record.path);
}
const result = { passed: true, verifiedManifestFiles: manifest.files.length,
  preservedWorkingAndStagedBytes: true, archiveSha256: 'e596d3e61c8e8a2e816ebf9c735eada6bd24868a6aaf75e0610bf16889d44e64',
  stagedPaths: paths, scope: 'Local corresponding-source preparation; no public/runtime/deployment readiness claim.' };
fs.writeFileSync(path.join(__dirname, 'root-verification.json'), JSON.stringify(result, null, 2) + '\n');
git('add', '-f', '--', 'qa/q2-audio-source-publication/root-verification.json');
console.log(JSON.stringify({ passed: true, verifiedManifestFiles: manifest.files.length, stagedPaths: paths.length + 1 }));
