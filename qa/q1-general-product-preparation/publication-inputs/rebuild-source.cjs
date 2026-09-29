'use strict';
// Rebuild the corresponding Source Code Form already included in this archive.
// Windows x64; no npm install or lifecycle script is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = __dirname;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireThat = (value, reason) => { if (!value) throw new Error(reason); };
async function main() {
  requireThat(process.platform === 'win32' && process.arch === 'x64', 'The pinned build tool is Windows x64.');
  const source = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json'), 'utf8'));
  for (const row of source.files) {
    const location = path.resolve(root, row.path);
    requireThat(location.startsWith(root + path.sep), 'Source path escaped archive root.');
    const bytes = fs.readFileSync(location);
    requireThat(bytes.length === row.bytes && digest(bytes) === row.sha256, 'Source hash mismatch: ' + row.path);
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'media/mediabunny-q1-build.json'), 'utf8'));
  const work = path.join(root, 'rebuild');
  fs.mkdirSync(work, {recursive: true});
  let binary = process.env.ESBUILD_BINARY;
  if (!binary) {
    const archive = path.join(work, 'esbuild-0.25.1.tgz');
    let bytes;
    if (fs.existsSync(archive)) bytes = fs.readFileSync(archive);
    else {
      const response = await fetch(provenance.esbuild.registry.tarball);
      requireThat(response.ok, 'Build tool download failed: ' + response.status);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    requireThat(digest(bytes) === provenance.esbuild.sha256, 'Build tool archive hash mismatch.');
    fs.writeFileSync(archive, bytes);
    cp.execFileSync('tar', ['-xzf', archive, '-C', work]);
    binary = path.join(work, 'package/esbuild.exe');
  }
  requireThat(digest(fs.readFileSync(binary)) === provenance.esbuild.binarySha256, 'Build tool binary hash mismatch.');
  const output = path.join(work, 'mediabunny-q1.mjs');
  cp.execFileSync(binary, [path.join(root, 'package/src/index.ts'), '--bundle', '--format=esm', '--platform=browser', '--outfile=' + output, '--minify'], {cwd: root, stdio: 'inherit'});
  const actual = digest(fs.readFileSync(output));
  requireThat(actual === source.runtime.sha256, 'Runtime differs from the tested product bundle.');
  const result = {passed: true, runtimeSha256: actual, runtimeBytes: fs.statSync(output).size,
    checkedSourceFiles: source.files.length, preferredSourceVersion: source.version,
    buildToolBinarySha256: provenance.esbuild.binarySha256};
  fs.writeFileSync(path.join(work, 'rebuild-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
