import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = new URL('./', import.meta.url);
const outputUrl = new URL('private-front-sniff-browser-bundle.js', base);

export async function buildBrowserBundleText() {
  const [rootCore, rootAdapter, selector, boundedCore, adapter] = await Promise.all([
    readFile(new URL('../v2-07a-root-inventory/root-inventory.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-root-inventory/drive-browser-adapter.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-representative-selection/representative-selector.mjs', base), 'utf8'),
    readFile(new URL('bounded-probe.mjs', base), 'utf8'),
    readFile(new URL('drive-browser-adapter.mjs', base), 'utf8')
  ]);
  const stripExports = (source) => source.replace(/^export\s+/gm, '');
  const stripImports = (source) => source.replace(
    /^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,
    ''
  );
  const bundledRootCore = stripExports(rootCore);
  const bundledRootAdapter = stripExports(stripImports(rootAdapter));
  const bundledSelector = stripExports(selector);
  const bundledBoundedCore = stripExports(boundedCore);
  const bundledAdapter = stripExports(stripImports(adapter));
  return [
    '(() => {',
    "'use strict';",
    'const rootInventoryCore = (() => {',
    bundledRootCore,
    'return Object.freeze({ collectInventoryPassWithRestart, summarizeRepeatedInventory });',
    '})();',
    'const rootBrowserAdapter = (() => {',
    'const { collectInventoryPassWithRestart, summarizeRepeatedInventory } = rootInventoryCore;',
    bundledRootAdapter,
    'return Object.freeze({ runAuthenticatedRootInventory });',
    '})();',
    'const representativeSelector = (() => {',
    bundledSelector,
    'return Object.freeze({ selectRiskRepresentatives });',
    '})();',
    'const boundedProbeCore = (() => {',
    bundledBoundedCore,
    'return Object.freeze({ BoundedProbeError, DEFAULT_LIMITS, FAILURE_CODES, runBoundedProbeBatch });',
    '})();',
    'const browserAdapter = (() => {',
    'const { runAuthenticatedRootInventory } = rootBrowserAdapter;',
    'const { selectRiskRepresentatives } = representativeSelector;',
    'const { BoundedProbeError, DEFAULT_LIMITS, FAILURE_CODES, runBoundedProbeBatch } = boundedProbeCore;',
    bundledAdapter,
    'return Object.freeze({ createDriveBrowserAdapter });',
    '})();',
    'const liveAdapter = browserAdapter.createDriveBrowserAdapter({',
    "  appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,",
    "  driveFetch: typeof driveFetch === 'function' ? driveFetch : null,",
    "  driveMutationsEnabled: typeof DRIVE_MUTATIONS_ENABLED === 'boolean' ? DRIVE_MUTATIONS_ENABLED : null,",
    "  state: typeof state === 'object' && state ? state : null,",
    "  privateContext: typeof __v207aPrivateContext === 'object' && __v207aPrivateContext ? __v207aPrivateContext : null,",
    '  nativeFetch: globalThis.fetch.bind(globalThis),',
    '  location: globalThis.location,',
    '  navigator: globalThis.navigator,',
    '  top: globalThis.top,',
    '  self: globalThis.self,',
    '  addEventListener: globalThis.addEventListener.bind(globalThis),',
    '  removeEventListener: globalThis.removeEventListener.bind(globalThis)',
    '});',
    'let exposedRunClaimed = false;',
    'function publicRunPrivateFrontSniff() {',
    '  if (!exposedRunClaimed) {',
    '    exposedRunClaimed = true;',
    '    if (globalThis.runPrivateFrontSniff === publicRunPrivateFrontSniff) {',
    '      delete globalThis.runPrivateFrontSniff;',
    '    }',
    '  }',
    '  return liveAdapter.runPrivateFrontSniff();',
    '}',
    "Object.defineProperty(globalThis, 'runPrivateFrontSniff', {",
    '  value: publicRunPrivateFrontSniff,',
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
  console.log('private-front-sniff-browser-bundle.js generated for private in-page execution');
}
