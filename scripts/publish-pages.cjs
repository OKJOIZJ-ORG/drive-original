'use strict';
// Publish the legacy public entrypoint only AFTER the same-origin Worker is
// verified. No repository export, force push, workflow enabling or auth change.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { publicTree, legacyEntries } = require('./pages-public-tree.cjs');
const root = path.resolve(__dirname, '..');
const git = (args, options = {}) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options }).trim();
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--legacy-handoff' || args[1] !== '--execute') throw Error('LEGACY_HANDOFF_EXPLICIT_EXECUTION_REQUIRED');
if (git(['status', '--porcelain']).length || git(['branch', '--show-current']) !== 'main') throw Error('CLEAN_REVIEWED_MAIN_REQUIRED');
const source = git(['rev-parse', 'HEAD']);
const proof = JSON.parse(fs.readFileSync(path.join(root, 'qa/release-1.22.0/served.json')));
if (!proof.passed || proof.source !== source || proof.version !== '1.22.0'
  || proof.base !== 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'
  || proof.productionMode !== true || proof.publicAssets !== 65 || !proof.cleanup?.passed) throw Error('CURRENT_WORKER_SERVING_PROOF_REQUIRED');
const entries = legacyEntries(source, git);
entries.push({ file: '.nojekyll', oid: git(['hash-object', '-w', '--stdin'], { input: '' }) });
const tree = publicTree(entries, git);
const parent = git(['ls-remote', '--heads', 'origin', 'gh-pages']).split(/\s+/)[0];
if (!/^[a-f0-9]{40}$/.test(parent)) throw Error('KNOWN_LEGACY_PAGES_PARENT_REQUIRED');
git(['fetch', 'origin', 'gh-pages']);
if (git(['rev-parse', 'FETCH_HEAD']) !== parent) throw Error('LEGACY_REMOTE_CHANGED');
const commit = git(['commit-tree', tree, '-p', parent], { input: `deploy: Drive Original 1.22.0 legacy entrypoint\n\nSource: ${source}\nVerified same-origin Worker: ${proof.workerVersion}\nPublic handoff only; ${entries.length} files.\n` });
git(['push', 'origin', `${commit}:refs/heads/gh-pages`]);
console.log(JSON.stringify({ source, version: '1.22.0', deploymentCommit: commit, previousDeploymentCommit: parent, publicFiles: entries.length }));
