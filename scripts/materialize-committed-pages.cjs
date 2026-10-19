'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const governing = ['.gitattributes', 'scripts/build-pages.cjs', 'scripts/public-files.cjs',
  'scripts/materialize-committed-pages.cjs', 'scripts/publish-pages.cjs'];

// A second hard link is the one condition a Windows sync client (e.g. Google Drive
// for desktop staging an upload in .tmp.driveupload) creates and later removes on
// its own. Only that condition may be retried; aliasing and content checks never are.
function hardlinkError(message) {
  return Object.assign(new Error(message), { transientHardlink: true });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function materializeCommittedPages({ hardlinkWaitMs = 0, sleep = sleepSync, now = Date.now, onRetry, ...options } = {}) {
  const deadline = now() + hardlinkWaitMs;
  for (;;) {
    try {
      return materializeOnce(options);
    } catch (error) {
      if (!error?.transientHardlink || now() >= deadline) throw error;
      onRetry?.(error);
      sleep(Math.min(1000, Math.max(0, deadline - now())));
    }
  }
}

function materializeOnce({ repoRoot = root, fsApi = fs, gitApi } = {}) {
  repoRoot = fsApi.realpathSync(repoRoot);
  const git = gitApi || (args => execFileSync('git', args, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 }));
  const text = args => git(args).toString('utf8');
  const head = text(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error('Invalid committed candidate identity.');
  const destination = path.join(repoRoot, '_site');
  const assertHead = () => {
    if (text(['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head) throw new Error('HEAD changed during materialization.');
  };
  const clean = paths => {
    if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths]).length) {
      throw new Error('Committed candidate publication inputs must be clean (public/build/worker paths).');
    }
  };
  clean([...governing, 'worker']);
  const listModule = { exports: null };
  vm.runInNewContext(text(['show', `${head}:scripts/public-files.cjs`]), { module: listModule }, { timeout: 1000 });
  const publicFiles = listModule.exports;
  if (!Array.isArray(publicFiles) || !publicFiles.length || publicFiles.some(name =>
    typeof name !== 'string' || !name || name === '.nojekyll' || name.includes('\\')
    || path.posix.isAbsolute(name) || path.posix.normalize(name) !== name
    || name.split('/').some(part => !part || part === '..' || part === '.') || /[\u0000-\u001f\u007f:]/.test(name))
    || new Set(publicFiles.map(name => name.toLowerCase())).size !== publicFiles.length) {
    throw new Error('Invalid committed public allowlist.');
  }
  const protectedPaths = [...new Set([...governing, ...publicFiles])];
  const statusPaths = [...protectedPaths, 'worker'];
  clean(statusPaths);
  const entries = text(['ls-tree', '-r', '-z', '--full-tree', head, '--', ...statusPaths])
    .split('\0').filter(Boolean).map(row => {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(row);
      if (!match) throw new Error('Invalid committed publication tree.');
      return { mode: match[1], type: match[2], oid: match[3], name: match[4] };
    });
  const byName = new Map(entries.map(entry => [entry.name, entry]));
  if (protectedPaths.some(name => !byName.has(name)) || !entries.some(entry => entry.name.startsWith('worker/'))) {
    throw new Error('Publication input is missing from captured HEAD.');
  }
  function assertInputs() { for (const entry of entries) {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error('Linked publication source is forbidden.');
    const absolute = path.join(repoRoot, entry.name), stat = fsApi.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || fsApi.realpathSync(absolute) !== absolute) {
      throw new Error('Linked publication source is forbidden.');
    }
    if (stat.nlink > 1) throw hardlinkError('Linked publication source is forbidden.');
    // Git normalization permits clean CRLF checkouts and detects changes hidden
    // by assume-unchanged/skip-worktree or a cached stat result.
    if (text(['hash-object', `--path=${entry.name}`, '--', entry.name]).trim() !== entry.oid) {
      throw new Error('Publication input differs from captured HEAD.');
    }
  } }
  assertInputs();
  const expected = new Set([...publicFiles, '.nojekyll']), directories = new Set();
  for (const name of publicFiles) {
    let parent = path.posix.dirname(name);
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
  }
  function inspectOutput() {
    const baseStat = fsApi.lstatSync(destination);
    if (!baseStat.isDirectory() || baseStat.isSymbolicLink() || fsApi.realpathSync(destination) !== destination) {
      throw new Error('Linked or invalid _site directory.');
    }
    const found = new Set();
    function walk(directory) {
      for (const name of fsApi.readdirSync(directory)) {
        const absolute = path.join(directory, name), relative = path.relative(destination, absolute).replaceAll('\\', '/');
        const stat = fsApi.lstatSync(absolute);
        if (stat.isSymbolicLink()) throw new Error('Linked _site entry is forbidden.');
        if (stat.isDirectory()) {
          if (!directories.has(relative)) throw new Error('Extra _site directory.');
          walk(absolute);
        } else {
          if (!stat.isFile() || !expected.has(relative)) throw new Error('Extra or linked _site file.');
          if (stat.nlink > 1) throw hardlinkError('Extra or linked _site file.');
          found.add(relative);
        }
      }
    }
    walk(destination);
    if (found.size !== expected.size || [...expected].some(name => !found.has(name))) throw new Error('Missing _site asset.');
  }
  inspectOutput();
  // Read all fixed-revision blobs before writing; never delete or export a tree.
  const bytes = new Map(publicFiles.map(name => [name, git(['show', `${head}:${name}`])]));
  bytes.set('.nojekyll', Buffer.alloc(0));
  assertHead(); clean(statusPaths); inspectOutput();
  for (const [name, committed] of bytes) {
    if (name === '.nojekyll') assertHead();
    const absolute = path.join(destination, name), fd = fsApi.openSync(absolute, 'r+');
    try {
      const stat = fsApi.fstatSync(fd), current = fsApi.lstatSync(absolute);
      if (!stat.isFile() || current.isSymbolicLink()
        || stat.dev !== current.dev || stat.ino !== current.ino || fsApi.realpathSync(absolute) !== absolute) {
        throw new Error('Output entry changed or became linked.');
      }
      if (stat.nlink > 1) throw hardlinkError('Output entry changed or became linked.');
      fsApi.ftruncateSync(fd, 0); fsApi.writeFileSync(fd, committed);
    } finally { fsApi.closeSync(fd); }
  }
  inspectOutput();
  for (const [name, committed] of bytes) {
    if (!fsApi.readFileSync(path.join(destination, name)).equals(committed)) throw new Error('Materialized asset verification failed.');
  }
  clean(statusPaths); assertInputs(); assertHead();
  return { head, materialized: publicFiles.length };
}

module.exports = { materializeCommittedPages };
if (require.main === module) {
  const result = materializeCommittedPages({
    hardlinkWaitMs: 120_000,
    onRetry: () => console.log('A public file has a temporary second hard link (sync client upload); waiting…')
  });
  console.log(`Materialized ${result.materialized} public assets byte-for-byte from ${result.head}.`);
}
