'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, '_site');
// This is an allowlist, not a repository export. Internal memory, tests and
// operational records must never become part of the public Pages artifact.
const files = ['index.html', 'app.js', 'styles.css', 'sw.js', 'version.json', 'manifest.webmanifest',
  'icons/app-icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
if (fs.existsSync(destination)) {
  if (fs.realpathSync(destination) !== destination) throw new Error('Refusing a linked _site output directory');
  fs.rmSync(destination, { recursive: true });
}
fs.mkdirSync(destination, { recursive: true });
for (const file of files) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
fs.writeFileSync(path.join(destination, '.nojekyll'), '');
console.log(`Prepared ${files.length + 1} public files in ${destination}`);
