import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = new URL('./', import.meta.url);
const outputUrl = new URL('private-identity-reconciliation-browser-bundle.js', base);

export async function buildBrowserBundleText() {
  const [rootCore, rootAdapter, selector, reconciliation] = await Promise.all([
    readFile(new URL('../v2-07a-root-inventory/root-inventory.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-root-inventory/drive-browser-adapter.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-representative-selection/representative-selector.mjs', base), 'utf8'),
    readFile(new URL('drive-identity-reconciliation.mjs', base), 'utf8')
  ]);
  const stripExports = (source) => source.replace(/^export\s+/gm, '');
  const stripImports = (source) => source.replace(
    /^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,
    ''
  );
  return [
    '(() => {',
    "'use strict';",
    'const rootInventoryCore = (() => {',
    stripExports(rootCore),
    'return Object.freeze({ collectInventoryPassWithRestart, summarizeRepeatedInventory });',
    '})();',
    'const rootBrowserAdapter = (() => {',
    'const { collectInventoryPassWithRestart, summarizeRepeatedInventory } = rootInventoryCore;',
    stripExports(stripImports(rootAdapter)),
    'return Object.freeze({ runAuthenticatedRootInventory });',
    '})();',
    'const representativeSelector = (() => {',
    stripExports(selector),
    'return Object.freeze({ selectRiskRepresentatives });',
    '})();',
    'const reconciliationModule = (() => {',
    'const { runAuthenticatedRootInventory } = rootBrowserAdapter;',
    'const { selectRiskRepresentatives } = representativeSelector;',
    stripExports(stripImports(reconciliation)),
    'return Object.freeze({ createDriveIdentityReconciliation });',
    '})();',
    'const liveReconciliation = reconciliationModule.createDriveIdentityReconciliation({',
    "  appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,",
    "  driveFetch: typeof driveFetch === 'function' ? driveFetch : null,",
    "  driveMutationsEnabled: typeof DRIVE_MUTATIONS_ENABLED === 'boolean' ? DRIVE_MUTATIONS_ENABLED : null,",
    "  state: typeof state === 'object' && state ? state : null,",
    "  privateContext: typeof __v207aPrivateContext === 'object' && __v207aPrivateContext ? __v207aPrivateContext : null,",
    '  location: globalThis.location,',
    '  navigator: globalThis.navigator,',
    '  top: globalThis.top,',
    '  self: globalThis.self,',
    '  addEventListener: globalThis.addEventListener.bind(globalThis),',
    '  removeEventListener: globalThis.removeEventListener.bind(globalThis)',
    '});',
    'let exposedRunClaimed = false;',
    'function publicRunPrivateIdentityReconciliation() {',
    '  if (!exposedRunClaimed) {',
    '    exposedRunClaimed = true;',
    '    if (globalThis.runPrivateIdentityReconciliation === publicRunPrivateIdentityReconciliation) {',
    '      delete globalThis.runPrivateIdentityReconciliation;',
    '    }',
    '  }',
    '  return liveReconciliation.runPrivateIdentityReconciliation();',
    '}',
    "Object.defineProperty(globalThis, 'runPrivateIdentityReconciliation', {",
    '  value: publicRunPrivateIdentityReconciliation,',
    '  enumerable: false,',
    '  configurable: true,',
    '  writable: false',
    '});',
    '})();',
    ''
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeFile(outputUrl, await buildBrowserBundleText(), 'utf8');
  console.log('private-identity-reconciliation-browser-bundle.js generated for private in-page execution');
}
