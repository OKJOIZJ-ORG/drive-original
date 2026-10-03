'use strict';
// Package the corresponding MPL Source Code Form. No npm lifecycle scripts.
// First run build-general-q1.cjs --check; then run this entry [--check] [--verify].
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const leaf = path.join(root, 'qa/playback-build-source');
const source = path.join(root, 'qa/q1-general-product-preparation/reproducible-build/package');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'media/mediabunny-q1-build.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const demand = (value, reason) => { if (!value) throw new Error(reason); };
const read = name => fs.readFileSync(path.join(root, name));
function readTar(bytes) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) break;
    const string = (start, length) => header.subarray(start, start + length).toString().split('\0')[0];
    const name = [string(345, 155), string(0, 100)].filter(Boolean).join('/');
    const size = parseInt(string(124, 12), 8) || 0;
    if (header[156] === 0 || header[156] === 48) entries.set(name, bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
function filesUnder(directory, prefix = '') {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? filesUnder(path.join(directory, entry.name), name + '/') : [name];
  }).sort();
}
function deterministicTar(files) {
  const chunks = [];
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    demand(Buffer.byteLength(name) <= 100, 'USTAR filename is too long: ' + name);
    const header = Buffer.alloc(512);
    header.write(name, 0);
    const octal = (value, offset, length) => header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length);
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks), {level: 9, mtime: 0});
}
function main() {
  const archive = read('qa/q1-general-product-preparation/reproducible-build/mediabunny-1.60.0.tgz');
  demand(sha(archive) === manifest.archiveSha256, 'Original archive hash mismatch.');
  const original = readTar(zlib.gunzipSync(archive));
  const originals = [...original].filter(([name]) => name.startsWith('package/src/'));
  const changes = new Map(manifest.changes.map(row => [row.path, row]));
  const files = new Map();
  demand(originals.length === 66 && changes.size === 8 && manifest.shared.length === 5, 'Source coverage changed.');
  for (const [name, before] of originals) {
    const relative = name.slice('package/'.length);
    const bytes = fs.readFileSync(path.join(source, relative));
    const change = changes.get(relative);
    if (change) {
      demand(sha(before) === change.beforeSha256 && sha(bytes) === change.afterSha256, 'Modified source mismatch: ' + relative);
    } else demand(bytes.equals(before), 'Unmodified source mismatch: ' + relative);
    files.set(name, bytes);
  }
  demand(JSON.stringify(originals.map(([name]) => name.slice('package/src/'.length)).sort()) === JSON.stringify(filesUnder(path.join(source, 'src'))), 'Source inventory mismatch.');
  for (const name of ['LICENSE', 'README.md', 'package.json']) {
    const bytes = fs.readFileSync(path.join(source, name));
    demand(bytes.equals(original.get('package/' + name)), 'Original metadata mismatch: ' + name);
    files.set('package/' + name, bytes);
  }
  for (const row of manifest.shared) {
    const name = row.url.split('/').at(-1), bytes = fs.readFileSync(path.join(source, 'shared', name));
    demand(sha(bytes) === row.sha256, 'Shared source mismatch: ' + name);
    files.set('package/shared/' + name, bytes);
  }
  demand(JSON.stringify(filesUnder(path.join(source, 'shared'))) === JSON.stringify(manifest.shared.map(row => row.url.split('/').at(-1)).sort()), 'Shared inventory mismatch.');
  const tsconfig = fs.readFileSync(path.join(source, 'tsconfig.json'));
  demand(JSON.stringify(JSON.parse(tsconfig)) === JSON.stringify({compilerOptions: {target: 'ESNext', useDefineForClassFields: true}}), 'Source tsconfig changed.');
  files.set('package/tsconfig.json', tsconfig);
  for (const name of ['media/mediabunny-q1-build.json', 'media/mediabunny-q1-source.patch', 'media/mediabunny-q1.LICENSE', 'scripts/build-general-q1.cjs']) files.set(name, read(name));
  demand(sha(files.get('media/mediabunny-q1-source.patch')) === manifest.patchSha256, 'Patch hash mismatch.');
  demand(files.get('media/mediabunny-q1.LICENSE').equals(files.get('package/LICENSE')), 'License mismatch.');
  for (const name of ['rebuild-source.cjs', 'README.md']) files.set(name, read('scripts/general-q1-source/' + name));
  const runtime = read('media/mediabunny-q1.mjs');
  const record = {version: 'mediabunny-1.60.0-drive-original-q1', upstreamCommit: manifest.commit,
    upstreamArchiveSha256: manifest.archiveSha256, patchSha256: manifest.patchSha256, buildTarget: manifest.target,
    runtime: {path: 'media/mediabunny-q1.mjs', sha256: sha(runtime), bytes: runtime.length},
    sourceCoverage: {upstreamSrcFiles: originals.length, modifiedFiles: changes.size, sharedFiles: manifest.shared.length,
      unmodifiedSourceMatchesPinnedArchive: true, allModifiedSourceMatchesManifest: true},
    files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => ({path: name, sha256: sha(bytes), bytes: bytes.length})),
    selfHashPolicy: 'SOURCE-MANIFEST.json is excluded from its own inventory; the outer distribution archive SHA-256 binds it.'};
  files.set('SOURCE-MANIFEST.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
  const packed = deterministicTar(files), destination = path.join(root, 'licenses/mediabunny-q1-preferred-source.tgz');
  if (process.argv.includes('--check')) demand(fs.readFileSync(destination).equals(packed), 'Source repack differs.');
  else fs.writeFileSync(destination, packed);
  const report = {path: 'licenses/mediabunny-q1-preferred-source.tgz', sha256: sha(packed), bytes: packed.length,
    files: files.size, runtime: record.runtime, sourceCoverage: record.sourceCoverage, buildTarget: manifest.target, deterministicHeaders: true};
  fs.mkdirSync(leaf, {recursive: true});
  fs.writeFileSync(path.join(leaf, 'package-result.json'), JSON.stringify(report, null, 2) + '\n');
  if (process.argv.includes('--verify')) {
    const fresh = fs.mkdtempSync(path.join(leaf, 'extracted-'));
    cp.execFileSync('tar', ['-xzf', destination, '-C', fresh]);
    const result = cp.execFileSync(process.execPath, [path.join(fresh, 'rebuild-source.cjs')], {
      env: {...process.env, ESBUILD_BINARY: path.join(root, 'qa/q1-general-product-preparation/reproducible-build/tool/package/esbuild.exe')}, encoding: 'utf8'});
    const rebuild = JSON.parse(result.trim());
    fs.writeFileSync(path.join(leaf, 'extraction-verification.json'), JSON.stringify({recordedAt: new Date().toISOString(),
      scope: 'Local corresponding-source packaging and fresh extraction only; no account, device, publication or deployment proof.',
      archive: report, rebuild, directExtractedSourceRebuildMatchedTestedRuntime: true}, null, 2) + '\n');
  }
  console.log(JSON.stringify(report));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
