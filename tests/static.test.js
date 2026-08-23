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

test('Pages workflow uses the current Node 24 action majors', () => {
  const workflow = read('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
});
