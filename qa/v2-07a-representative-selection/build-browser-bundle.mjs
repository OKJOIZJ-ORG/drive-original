import { readFile, writeFile } from 'node:fs/promises';

const base = new URL('./', import.meta.url);
const source = await readFile(new URL('representative-selector.mjs', base), 'utf8');
const bundled = source.replace(/^export\s+/gm, '');
const output = [
  '(() => {',
  "'use strict';",
  bundled,
  'window.__driveOriginalRepresentativeSelector = Object.freeze({ selectRiskRepresentatives });',
  '})();',
  ''
].join('\n');

await writeFile(new URL('private-browser-bundle.js', base), output, 'utf8');
console.log('private-browser-bundle.js generated for local authenticated execution');
