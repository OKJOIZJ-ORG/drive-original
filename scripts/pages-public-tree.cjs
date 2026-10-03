'use strict';
const path = require('node:path');
function publicTree(entries, git) {
  const root = { files: new Map(), directories: new Map() }, seen = new Set();
  for (const { file, oid } of entries) {
    if (!file || path.posix.normalize(file) !== file || path.win32.isAbsolute(file) || /[\\:\x00-\x1f]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..') || seen.has(file.toLowerCase())
      || !/^[a-f0-9]{40,64}$/.test(oid)) throw Error('INVALID_PUBLIC_TREE_ENTRY');
    seen.add(file.toLowerCase()); let directory = root;
    const parts = file.split('/'); const name = parts.pop();
    for (const part of parts) {
      if (directory.files.has(part)) throw Error('PUBLIC_TREE_PATH_COLLISION');
      if (!directory.directories.has(part)) directory.directories.set(part, { files: new Map(), directories: new Map() });
      directory = directory.directories.get(part);
    }
    if (directory.directories.has(name)) throw Error('PUBLIC_TREE_PATH_COLLISION');
    directory.files.set(name, oid);
  }
  function emit(directory) {
    const rows = [...directory.files].map(([name, oid]) => `100644 blob ${oid}\t${name}\n`);
    for (const [name, child] of directory.directories) rows.push(`040000 tree ${emit(child)}\t${name}\n`);
    return git(['mktree'], { input: rows.sort().join('') });
  }
  return emit(root);
}
function legacyEntries(source, git) {
  const files = ['index.html', 'handoff.js', 'sw.js', 'version.json'];
  const publicFiles = ['manifest.webmanifest', 'icons/app-icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
  return [...files.map(file => ({ file, source: `deployment/legacy-pages/${file}` })), ...publicFiles.map(file => ({ file, source: file }))]
    .map(row => ({ ...row, oid: git(['rev-parse', `${source}:${row.source}`]) }));
}
module.exports = { publicTree, legacyEntries };
