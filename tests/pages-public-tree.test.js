'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { publicTree } = require('../scripts/pages-public-tree.cjs');
const oid = '1'.repeat(40);
test('public tree preserves nested licenses and the distinct root index', () => {
  const emitted = []; const git = (args, { input }) => { assert.deepEqual(args, ['mktree']); emitted.push(input); return String(emitted.length).repeat(40); };
  publicTree([{ file: 'index.html', oid }, { file: 'licenses/index.html', oid }, { file: 'licenses/audio-source-v1.tar.gz.part001', oid }], git);
  assert.equal(emitted.length, 2);
  assert.match(emitted[0], /audio-source-v1\.tar\.gz\.part001/);
  assert.match(emitted[1], /040000 tree .*\tlicenses\n/);
  assert.equal((emitted[1].match(/\tindex\.html\n/g) || []).length, 1);
});
test('public tree rejects traversal, duplicate and file-directory collisions', () => {
  for (const files of [['../memory/x'], ['index.html', 'INDEX.html'], ['licenses', 'licenses/index.html'], ['licenses/index.html', 'licenses']]) {
    assert.throws(() => publicTree(files.map(file => ({ file, oid })), () => oid));
  }
});
