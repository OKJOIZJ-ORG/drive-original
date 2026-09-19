'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, '_site');
const git = args => execFileSync('git', args, { cwd: root, encoding: args[0] === 'status' ? 'utf8' : null });

if (git(['status', '--porcelain']).trim()) {
  throw new Error('Committed candidate assets require a clean Git worktree.');
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  });
}

let materialized = 0;
for (const absolute of filesBelow(destination)) {
  const relative = path.relative(destination, absolute).replaceAll('\\', '/');
  if (relative === '.nojekyll') {
    fs.writeFileSync(absolute, Buffer.alloc(0));
    continue;
  }
  const committed = git(['show', `HEAD:${relative}`]);
  fs.writeFileSync(absolute, committed);
  materialized++;
}

console.log(`Materialized ${materialized} public assets byte-for-byte from HEAD.`);
