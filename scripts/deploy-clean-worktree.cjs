'use strict';
// D106: deploy the committed HEAD from a detached worktree outside synced and
// mirrored folders. The checkout itself stays hard-linked by the user's backup
// mirror, which the materializer correctly refuses; the worktree has fresh,
// single-link files of the exact same commit. The materializer, the pinned
// wrangler and the deployed bytes are unchanged.
// Usage (from worker/): npm run deploy:release [-- --dry-run]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
// Same inputs the materializer refuses to publish while dirty.
const PUBLICATION_INPUTS = ['.gitattributes', 'scripts', 'worker'];

function deployFromCleanWorktree({ repoRoot = root, dryRun = false, tmpRoot = os.tmpdir(),
  run = (file, args, options) => cp.execFileSync(file, args, { stdio: 'inherit', ...options }),
  read = (file, args, options) => cp.execFileSync(file, args, { encoding: 'utf8', ...options }),
  makeTempDir = (prefix) => fs.mkdtempSync(prefix), log = console.log } = {}) {
  const publicFiles = require(path.join(repoRoot, 'scripts/public-files.cjs'));
  const dirty = read('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', ...PUBLICATION_INPUTS, ...publicFiles], { cwd: repoRoot });
  if (dirty.trim()) throw new Error(`Commit publication inputs before deploying:\n${dirty}`);
  const head = read('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: repoRoot }).trim();
  const wrangler = path.join(repoRoot, 'worker/node_modules/wrangler/bin/wrangler.js');
  const worktree = makeTempDir(path.join(tmpRoot, 'drive-original-deploy-'));
  log(`Deploying ${head} from ${worktree}${dryRun ? ' (dry run)' : ''}`);
  run('git', ['worktree', 'add', '--detach', worktree, head], { cwd: repoRoot });
  try {
    const worker = path.join(worktree, 'worker');
    run(process.execPath, [path.join(worktree, 'scripts/build-pages.cjs')], { cwd: worker });
    run(process.execPath, [path.join(worktree, 'scripts/materialize-committed-pages.cjs')], { cwd: worker });
    run(process.execPath, [wrangler, 'deploy', '--config', 'wrangler.jsonc',
      ...(dryRun ? ['--dry-run', '--outdir', '.wrangler/dry-run'] : [])], { cwd: worker });
  } finally {
    run('git', ['worktree', 'remove', '--force', worktree], { cwd: repoRoot });
  }
  return head;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) throw new Error('Only --dry-run is accepted.');
  deployFromCleanWorktree({ dryRun: args.includes('--dry-run') });
}

module.exports = { deployFromCleanWorktree, PUBLICATION_INPUTS };
