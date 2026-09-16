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

test('player controls, in-app preview, and selection toolbar remain bound in the shell', () => {
  const app = read('app.js');
  const html = read('index.html');
  for (const id of ['ctrlFramePrev', 'ctrlFrameNext', 'drivePreview', 'selectionToolbar']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
    assert.match(app, new RegExp(`'${id}'`));
  }
  assert.match(html, /id="drivePreview"[^>]*allow="[^"]*autoplay[^"]*fullscreen[^"]*"[^>]*allowfullscreen/);
  assert.match(app, /function buildDrivePreviewUrl\(file\)[\s\S]*?\/preview/);
  assert.match(app, /function showDrivePreview\(file, reason\)/);
  assert.match(app, /state\.mediaAttempt = 'drive-preview-page'/);
  assert.doesNotMatch(app, /function showDriveHandoff\(/);
});

test('video keeps Range primary and uses bounded original buffering before compatibility playback', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');
  const productTruth = read('memory/PRODUCT-TRUTH.md');
  assert.doesNotMatch(
    app,
    /state\.mediaAttempt === 'range'\s*\)\s*\{\s*await startOriginalBlobFallback/
  );
  assert.match(app, /function buildMediaUrl\(file\)[\s\S]*?searchParams\.set\('mediaSession'/);
  assert.match(app, /mediaErrorCode === 2[\s\S]*?offerOriginalBufferFallback/);
  assert.match(app, /navigator\.storage\.getDirectory\(\)/);
  assert.match(app, /typeof handle\.createWritable === 'function'/);
  assert.match(app, /received > hardLimit[\s\S]*?reader\.cancel/);
  assert.match(app, /showDrivePreview\(file, describeVideoPlaybackFailure/);
  assert.match(
    app,
    /function playRandomFile\([\s\S]*?needsCompletePopulation[\s\S]*?enqueuePlaybackNavigation\([\s\S]*?needsCompletePopulation/
  );
  assert.equal((html.match(/<video\b/g) || []).length, 1);
  assert.match(html, /id="mediaSwipeNeighbor"/);
  assert.doesNotMatch(app, /MEDIA_PREFETCH_BYTES|queueMediaPrefetch|__prefetched/);
  assert.match(app, /function suspendBackgroundThumbnailImages\(\)[\s\S]*?removeAttribute\('src'\)/);
  assert.match(app, /playerMediaPriorityActive[\s\S]*?thumbnail\.dataset\.playerDeferredSrc/);
  assert.match(readme, /Drive 원본 파일 · 임시 디스크/);
  assert.match(readme, /Google 호환 재생 · 원본 화질 미확인/);
  assert.doesNotMatch(readme, /영상에는 이 전체 파일 보조 경로를 사용하지 않습니다/);
  assert.match(productTruth, /v1\.16\.0 keeps original-byte Range playback first/);
});

test('playback quality starts unverified and documents only evidence-backed original labels', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');

  assert.match(html, /id="streamModeLabel" data-mode="checking"[\s\S]*?id="streamModeText">원본 확인 중/);
  assert.match(html, /id="qualityBadge" data-quality="checking">원본 확인 중/);
  assert.match(html, /Google 호환 재생 · 원본 화질 미확인/);
  assert.doesNotMatch(html, /id="qualityBadge"[^>]*>100% 원본 화질/);
  assert.doesNotMatch(html, /100% 무인코딩 무손실 화질|1:1 원본 그대로 스트리밍/);
  assert.doesNotMatch(app, /100% 원본|100% 무손실|1:1 무변환/);
  for (const label of [
    'Drive 원본 파일 · Range 무변환 전송',
    'Drive 원본 파일 · 연속 전송',
    'Drive 원본 파일 · 임시 디스크',
    'Drive 원본 파일 · 메모리',
    'Google 호환 재생 · 원본 화질 미확인',
  ]) {
    assert.match(readme, new RegExp(label));
  }
  assert.match(readme, /외부 Drive 페이지는 자동으로 열지 않습니다/);
  assert.match(readme, /원본 확인 중/);
});

test('mobile shell preserves zoom and high-contrast metadata labels', () => {
  const html = read('index.html');
  const styles = read('styles.css');
  const viewport = html.match(/<meta name="viewport" content="([^"]+)">/)?.[1] || '';
  const folderMeta = styles.match(/\.folder-meta \{[\s\S]*?\n\}/)?.[0] || '';
  const fileMeta = styles.match(/\.file-card-meta \{[\s\S]*?\n\}/)?.[0] || '';

  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(viewport, /maximum-scale\s*=\s*1(?:\.0)?/i);
  assert.match(folderMeta, /color:\s*var\(--label-secondary\)/);
  assert.match(fileMeta, /color:\s*var\(--label-secondary\)/);
  assert.doesNotMatch(html, /id="brandButton"[^>]*aria-label=/);
});
