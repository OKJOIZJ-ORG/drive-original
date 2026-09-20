import { readFile, writeFile } from 'node:fs/promises';

const base = new URL('./', import.meta.url);
const core = await readFile(new URL('root-inventory.mjs', base), 'utf8');
const adapter = await readFile(new URL('drive-browser-adapter.mjs', base), 'utf8');

const bundledCore = core.replace(/^export\s+/gm, '');
const bundledAdapter = adapter
  .replace(/^import\s+\{[\s\S]*?\}\s+from\s+'\.\/root-inventory\.mjs';\s*/m, '')
  .replace(/^export\s+/gm, '');

const output = [
  '(() => {',
  "'use strict';",
  bundledCore,
  bundledAdapter,
  'window.__driveOriginalRootInventory = Object.freeze({ runAuthenticatedRootInventory });',
  '})();',
  ''
].join('\n');

await writeFile(new URL('private-browser-bundle.js', base), output, 'utf8');
console.log('private-browser-bundle.js generated for local authenticated execution');
