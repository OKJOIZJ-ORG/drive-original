import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildMetadataBrowserBundleText } from './build-metadata-browser-bundle.mjs';
const base = new URL('./', import.meta.url);
const hash = text => createHash('sha256').update(text).digest('hex');
export async function buildRc11MetadataBundle() {
  const historical = await buildMetadataBrowserBundleText();
  const pin = 'VERSION="1.22.0-rc.10"';
  if (historical.split(pin).length !== 2) throw new Error('RC10_PIN_NOT_UNIQUE');
  const factory = historical.replace(pin, 'VERSION="1.22.0-rc.11"');
  const facade = (await readFile(new URL('metadata-catalog-rc11-facade.function.js', base), 'utf8')).replace(/\r\n?/g, '\n');
  const bundle = `(()=>{\n'use strict';\nconst factory=${factory.trim()};\nconst facade=(${facade.trim()});\nreturn privateContextText=>facade.call(factory,privateContextText);\n})()\n`;
  const producerPaths = ['metadata-catalog-rc11-build.mjs', 'build-metadata-browser-bundle.mjs', 'probe.mjs',
    'metadata-catalog-driver.mjs', 'comparison-diagnostics.mjs',
    '../v2-07a-root-inventory/root-inventory.mjs', '../v2-07a-root-inventory/drive-browser-adapter.mjs'];
  const producerSHA256 = Object.fromEntries(await Promise.all(producerPaths.map(async path =>
    [path, hash(await readFile(new URL(path, base)))])));
  return { bundle, provenance: { schema: 'drive-original.rc11-metadata-builder/1',
    sourceVersion: '1.22.0-rc.10', generatedVersion: '1.22.0-rc.11', explicitVersionPinReplacements: 1,
    historicalFactorySHA256: hash(historical), pinnedFactorySHA256: hash(factory),
    facadeSHA256: hash(facade), bundleSHA256: hash(bundle), producerSHA256,
    scope: 'metadata-only; no fresh SW runtime VERSION claim; no media or writes' } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { bundle, provenance } = await buildRc11MetadataBundle();
  await writeFile(new URL('metadata-catalog-rc11.generated.js', base), bundle, 'utf8');
  await writeFile(new URL('metadata-catalog-rc11-provenance.json', base), JSON.stringify(provenance, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(provenance));
}
