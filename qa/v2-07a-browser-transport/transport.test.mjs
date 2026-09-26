import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildTransport } from './build-transport.mjs';
import { CANDIDATE_ORIGIN, createBundleTransport } from './bundle-registry.mjs';
import { BUNDLES as CHECKED_IN_BUNDLES } from './generated-bundles.mjs';

const PUBLIC_SOURCE = '/* Drive Original V2-07A public QA bundle */\nexport const endpoint = "https://example.test/x";\nexport const checked = 7;\n';

async function buildFixture(artifacts = [{ role: 'bounded-adapter', name: 'adapter.mjs', source: PUBLIC_SOURCE }]) {
  const directory = await mkdtemp(join(tmpdir(), 'drive-original-v2-07a-transport-'));
  const inputs = [];
  for (const artifact of artifacts) {
    const sourcePath = join(directory, artifact.name);
    await writeFile(sourcePath, artifact.source, 'utf8');
    inputs.push({ role: artifact.role, sourcePath });
  }
  const result = await buildTransport({ artifacts: inputs, outDirectory: directory });
  const generated = await import(`${new URL('./generated-bundles.mjs', `file:///${directory.replace(/\\/g, '/')}/`).href}?run=${Date.now()}`);
  return { directory, generated, ...result };
}

function request(path, { method = 'GET', origin = CANDIDATE_ORIGIN } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set('Origin', origin);
  return new Request(`https://qa-public.example${path}`, { method, headers });
}

test('builds a deterministic redacted manifest and SHA-named public path', async (t) => {
  const fixture = await buildFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.equal(fixture.manifest.artifacts.length, 1);
  const [artifact] = fixture.manifest.artifacts;
  assert.equal(artifact.role, 'bounded-adapter');
  assert.match(artifact.path, /^\/v2-07a\/bounded-adapter-[a-f0-9]{64}\.js$/);
  assert.equal(artifact.sha256, createHash('sha256').update(PUBLIC_SOURCE).digest('hex'));
  assert.equal(artifact.byteLength, Buffer.byteLength(PUBLIC_SOURCE));
  assert.deepEqual(fixture.generated.BUNDLES.map(({ source, ...bundle }) => bundle), [artifact]);
  const manifestText = await readFile(join(fixture.directory, 'manifest.redacted.json'), 'utf8');
  assert.doesNotMatch(manifestText, /adapter\.mjs|PRIVATE_|cookie|token/i);
});

test('serves only exact-origin GET and HEAD with exact bytes, hash and length', async (t) => {
  const fixture = await buildFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const [artifact] = fixture.generated.BUNDLES;
  const serve = createBundleTransport(fixture.generated.BUNDLES);
  const get = await serve(request(artifact.path));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('Access-Control-Allow-Origin'), CANDIDATE_ORIGIN);
  assert.equal(get.headers.get('Access-Control-Expose-Headers'), 'Content-Length, X-Content-Type-Options');
  assert.equal(get.headers.get('Content-Length'), String(Buffer.byteLength(PUBLIC_SOURCE)));
  assert.equal(get.headers.get('Cache-Control'), 'no-store');
  assert.equal(get.headers.get('X-Content-Type-Options'), 'nosniff');
  const body = await get.text();
  assert.equal(body, PUBLIC_SOURCE);
  assert.equal(createHash('sha256').update(body).digest('hex'), artifact.sha256);

  const head = await serve(request(artifact.path, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), String(Buffer.byteLength(PUBLIC_SOURCE)));
  assert.equal(await head.text(), '');
});

test('fails closed for origin, method, path and query mismatches without CORS', async (t) => {
  const fixture = await buildFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const [artifact] = fixture.generated.BUNDLES;
  const serve = createBundleTransport(fixture.generated.BUNDLES);
  for (const rejected of [
    request(artifact.path, { origin: null }),
    request(artifact.path, { origin: 'https://candidate.example' }),
    request(artifact.path, { method: 'POST' }),
    request(artifact.path, { method: 'OPTIONS' }),
    request('/v2-07a/not-a-bundle.js'),
    request(`${artifact.path}?cache=1`)
  ]) {
    const response = await serve(rejected);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(response.headers.get('Content-Length'), '0');
    assert.equal(await response.text(), '');
  }
});

test('permits only the five named roles and never duplicates final bytes', async (t) => {
  const fixture = await buildFixture([
    { role: 'root-inventory', name: 'root.mjs', source: `${PUBLIC_SOURCE}export const root = true;\n` },
    { role: 'representative-selector', name: 'selector.mjs', source: `${PUBLIC_SOURCE}export const selector = true;\n` },
    { role: 'bounded-adapter', name: 'adapter.mjs', source: `${PUBLIC_SOURCE}export const adapter = true;\n` },
    { role: 'identity-reconciler', name: 'reconciler.mjs', source: `${PUBLIC_SOURCE}export const reconciler = true;\n` },
    { role: 'mpegts-probe', name: 'mpegts.mjs', source: `${PUBLIC_SOURCE}export const mpegts = true;\n` }
  ]);
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.deepEqual(fixture.manifest.artifacts.map(({ role }) => role), [
    'bounded-adapter', 'identity-reconciler', 'mpegts-probe', 'representative-selector', 'root-inventory'
  ]);
  const serveAll = createBundleTransport(fixture.generated.BUNDLES);
  const reconciler = fixture.generated.BUNDLES.find(({ role }) => role === 'identity-reconciler');
  const reconcilerResponse = await serveAll(request(reconciler.path));
  assert.equal(reconcilerResponse.status, 200);
  assert.equal(await reconcilerResponse.text(), reconciler.source);
  const mpegts = fixture.generated.BUNDLES.find(({ role }) => role === 'mpegts-probe');
  assert.equal(await serveAll(request(mpegts.path)).text(), mpegts.source);
  await assert.rejects(
    () => buildTransport({ artifacts: [{ role: 'unexpected', sourcePath: join(fixture.directory, 'adapter.mjs') }], outDirectory: fixture.directory }),
    /unsupported artifact role/
  );
  await assert.rejects(
    () => buildTransport({ artifacts: [
      { role: 'root-inventory', sourcePath: join(fixture.directory, 'adapter.mjs') },
      { role: 'bounded-adapter', sourcePath: join(fixture.directory, 'adapter.mjs') }
    ], outDirectory: fixture.directory }),
    /duplicate artifact bytes/
  );
  const trusted = fixture.generated.BUNDLES[0];
  assert.throws(
    () => createBundleTransport([{ ...trusted, sha256: '0'.repeat(64) }]),
    /generated V2-07A bundles/
  );
  assert.throws(
    () => createBundleTransport([{ ...trusted, path: trusted.path.replace('bounded-adapter-', 'root-inventory-') }]),
    /generated V2-07A bundles/
  );
});

test('rejects private content, wildcard CORS and binding-like source before generating output', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'drive-original-v2-07a-transport-reject-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const source of [
    'export const id = "PRIVATE_ID_SENTINEL";\n',
    'export const wildcard = "Access-Control-Allow-Origin: *";\n',
    'export const bound = process.env.SECRET;\n',
    'export const cookie = document.cookie;\n',
    'export const localPath = "C:\\\\qa\\\\secret.js";\n'
  ]) {
    const input = join(fixture, `${createHash('sha256').update(source).digest('hex')}.mjs`);
    await writeFile(input, source, 'utf8');
    await assert.rejects(
      () => buildTransport({ artifacts: [{ role: 'bounded-adapter', sourcePath: input }], outDirectory: fixture }),
      /forbidden private or bound content/
    );
  }
});

test('worker and deployment config have no bindings, secrets, cookies or logging', async () => {
  const worker = await readFile(new URL('./transport-worker.mjs', import.meta.url), 'utf8');
  const configText = await readFile(new URL('./wrangler.v2-07a-transport.json', import.meta.url), 'utf8');
  const config = JSON.parse(configText);
  assert.doesNotMatch(worker, /\benv\b|console\.|cookie|secret|binding/i);
  assert.deepEqual(Object.keys(config).sort(), [
    '$schema', 'compatibility_date', 'main', 'name', 'observability', 'preview_urls', 'workers_dev'
  ].sort());
  assert.doesNotMatch(configText, /\b(?:vars|kv_namespaces|r2_buckets|d1_databases|services|secrets?|bindings?)\b/i);
  assert.equal(config.main, 'transport-worker.mjs');
});

test('checked-in registry and manifest preserve exact reviewed artifact bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.redacted.json', import.meta.url), 'utf8'));
  const publicBundles = CHECKED_IN_BUNDLES.map(({ source, ...bundle }) => bundle);
  assert.deepEqual(publicBundles, manifest.artifacts);
  assert.deepEqual(publicBundles.map(({ role }) => role), ['bounded-adapter', 'identity-reconciler', 'mpegts-probe']);
  for (const bundle of CHECKED_IN_BUNDLES) {
    assert.equal(Buffer.byteLength(bundle.source), bundle.byteLength);
    assert.equal(createHash('sha256').update(bundle.source).digest('hex'), bundle.sha256);
  }
  const serve = createBundleTransport(CHECKED_IN_BUNDLES);
  for (const bundle of CHECKED_IN_BUNDLES) {
    const response = await serve(request(bundle.path));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), bundle.source);
  }
});

test('the checked-in reviewed registry still rejects every unlisted path', async () => {
  const worker = await import(`./transport-worker.mjs?reviewed-registry=${Date.now()}`);
  const response = await worker.default.fetch(request('/v2-07a/bounded-adapter-not-generated.js'));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(await response.text(), '');
});
