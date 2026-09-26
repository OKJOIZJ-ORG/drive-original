import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = new URL('./', import.meta.url);
const outputUrl = new URL('private-mpeg-ts-browser-bundle.js', base);

function stripExports(source) {
  return source.replace(/^export\s+/gm, '');
}

function stripImports(source) {
  return source.replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm, '');
}

export async function buildBrowserBundleText() {
  const [rootCore, rootAdapter, selector, boundedCore, mpegTsCore, adapter] = await Promise.all([
    readFile(new URL('../v2-07a-root-inventory/root-inventory.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-root-inventory/drive-browser-adapter.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-representative-selection/representative-selector.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-bounded-probe/bounded-probe.mjs', base), 'utf8'),
    readFile(new URL('../v2-07a-container-probe/mpeg-ts-probe.mjs', base), 'utf8'),
    readFile(new URL('drive-browser-adapter.mjs', base), 'utf8')
  ]);
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
    'const boundedProbeCore = (() => {',
    stripExports(boundedCore),
    'return Object.freeze({ BoundedProbeError, DEFAULT_LIMITS, FAILURE_CODES, runBoundedProbeBatch });',
    '})();',
    'const mpegTsProbeCore = (() => {',
    stripExports(mpegTsCore),
    'return Object.freeze({ probeMpegTs });',
    '})();',
    'const browserProbe = (() => {',
    'const { runAuthenticatedRootInventory } = rootBrowserAdapter;',
    'const { selectRiskRepresentatives } = representativeSelector;',
    'const { BoundedProbeError, DEFAULT_LIMITS, FAILURE_CODES, runBoundedProbeBatch } = boundedProbeCore;',
    'const { probeMpegTs } = mpegTsProbeCore;',
    stripExports(stripImports(adapter)),
    'return Object.freeze({ createMpegTsBrowserProbe });',
    '})();',
    'const liveProbe = browserProbe.createMpegTsBrowserProbe({',
    "  appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,",
    "  driveFetch: typeof driveFetch === 'function' ? driveFetch : null,",
    "  nativeFetch: typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,",
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
    'function publicRunPrivateMpegTsProbe() {',
    '  if (!exposedRunClaimed) {',
    '    exposedRunClaimed = true;',
    '    if (globalThis.runPrivateMpegTsProbe === publicRunPrivateMpegTsProbe) {',
    '      delete globalThis.runPrivateMpegTsProbe;',
    '    }',
    "    if (Object.prototype.hasOwnProperty.call(globalThis, '__v207aPrivateContext')) {",
    '      delete globalThis.__v207aPrivateContext;',
    '    }',
    '  }',
    '  return liveProbe.runPrivateMpegTsProbe();',
    '}',
    "Object.defineProperty(globalThis, 'runPrivateMpegTsProbe', {",
    '  value: publicRunPrivateMpegTsProbe,',
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
  console.log('private-mpeg-ts-browser-bundle.js generated for private in-page execution');
}
