'use strict';
// Publish an explicit public tree through GitHub Pages' branch deployment.
// No workflow-file permission is required. Source and audit history stay on main.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = (args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim();
const runNode = (args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (git(['status', '--porcelain']).length) throw new Error('Commit or preserve all source changes before publishing.');
runNode(['--check', 'app.js']);
runNode(['--check', 'sw.js']);
runNode(['--test', '--test-concurrency=1', ...fs.readdirSync(path.join(root, 'tests')).filter(name => /\.test\.m?js$/.test(name)).map(name => `tests/${name}`)]);
const source = git(['rev-parse', 'HEAD']);
const version = JSON.parse(git(['show', `${source}:version.json`])).version;
const publicFiles = require('./public-files.cjs');
const rootEntries = [], iconEntries = [], mediaEntries = [];
for (const file of publicFiles) {
  const oid = git(['rev-parse', `${source}:${file}`]);
  const entry = `100644 blob ${oid}\t${path.posix.basename(file)}\n`;
  (file.startsWith('icons/') ? iconEntries : file.startsWith('media/') ? mediaEntries : rootEntries).push(entry);
}
const icons = git(['mktree'], { input: iconEntries.join('') });
const media = git(['mktree'], { input: mediaEntries.join('') });
const empty = git(['hash-object', '-w', '--stdin'], { input: '' });
rootEntries.push(`040000 tree ${icons}\ticons\n`, `040000 tree ${media}\tmedia\n`, `100644 blob ${empty}\t.nojekyll\n`);
const tree = git(['mktree'], { input: rootEntries.join('') });
const existing = git(['ls-remote', '--heads', 'origin', 'gh-pages']).split(/\s+/)[0];
let parent = null;
if (/^[a-f0-9]{40}$/.test(existing)) {
  git(['fetch', 'origin', 'gh-pages']);
  parent = git(['rev-parse', 'FETCH_HEAD']);
}
const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : [])], {
  input: `deploy: Drive Original v${version}\n\nSource: ${source}\nVerified public shell only; ${publicFiles.length + 1} files; syntax and regression gate passed.\n`
});
// Normal fast-forward push: never overwrite unrelated deployment history.
git(['push', 'origin', `${commit}:refs/heads/gh-pages`]);
console.log(JSON.stringify({ version, sourceCommit: source, deploymentCommit: commit, publicFiles: publicFiles.length + 1 }, null, 2));
