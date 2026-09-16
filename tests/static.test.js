'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('release version is synchronized across runtime, shell, HTML, and metadata', () => {
  const app = read('app.js');
  const worker = read('sw.js');
  const html = read('index.html');
  const metadata = JSON.parse(read('version.json'));
  const appVersion = app.match(/const APP_VERSION = '([^']+)'/)?.[1];
  const workerVersion = worker.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(appVersion, metadata.version);
  assert.equal(workerVersion, metadata.version);
  assert.match(html, new RegExp(`styles\\.css\\?v=${metadata.version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${metadata.version.replaceAll('.', '\\.')}`));
  assert.equal((html.match(new RegExp(`v${metadata.version.replaceAll('.', '\\.')}`, 'g')) || []).length, 2);
});

test('every bound element ID exists once in index.html', () => {
  const app = read('app.js');
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'index.html contains a duplicate id');
  const bindBlock = app.match(/const ids = \[([\s\S]*?)\];\s*ids\.forEach/)?.[1] || '';
  const boundIds = [...bindBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const missing = boundIds.filter((id) => !ids.includes(id));
  assert.deepEqual(missing, []);
});

test('manifest icons and service-worker shell assets exist', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  manifest.icons.forEach((icon) => {
    assert.equal(fs.existsSync(path.join(root, icon.src.replace(/^\.\//, ''))), true, icon.src);
  });

  const worker = read('sw.js');
  const shellBlock = worker.match(/const SHELL_FILES = \[([\s\S]*?)\];/)?.[1] || '';
  const shellFiles = [...shellBlock.matchAll(/'\.\/([^']+)'/g)].map((match) => match[1]);
  shellFiles.forEach((file) => {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  });
});

test('brand surfaces use the rounded navy app icon without the legacy blue mark', () => {
  const html = read('index.html');
  const styles = read('styles.css');
  const icon = read('icons/app-icon.svg');
  const maskable = read('icons/app-icon-maskable.svg');
  const brandMarkup = html.match(/<span class="brand-icon"[\s\S]*?<\/span>/)?.[0] || '';
  const brandStyles = styles.match(/\.brand-icon \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(brandMarkup, /<img src="\.\/icons\/icon-192\.png" alt="" width="32" height="32">/);
  assert.doesNotMatch(brandMarkup, /<svg|#0a84ff|#0066cc/);
  assert.match(brandStyles, /border-radius:\s*22%/);
  assert.match(brandStyles, /overflow:\s*hidden/);
  assert.match(icon, /rx="116"/);
  assert.match(icon, /fill="#192235"/);
  assert.match(icon, /stroke="#F7F8FC"/);
  assert.doesNotMatch(`${icon}\n${maskable}`, /#0a84ff|#0066cc|#5aa2f2/i);
});

test('resource keys remain raw in the service-worker header', () => {
  const worker = read('sw.js');
  assert.match(worker, /X-Goog-Drive-Resource-Keys/);
  assert.doesNotMatch(worker, /encodeURIComponent\(resourceKey\)/);
});

test('privacy documentation matches the requested OAuth scope and token storage', () => {
  const readme = read('README.md');
  assert.match(readme, /https:\/\/www\.googleapis\.com\/auth\/drive/);
  assert.match(readme, /로컬 저장소/);
  assert.doesNotMatch(readme, /drive\.readonly/);
  assert.doesNotMatch(readme, /액세스 토큰: 메모리에만/);
});
