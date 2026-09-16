'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

test('brand surfaces use the canonical rounded navy icon with the restored blue dot', () => {
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
  assert.match(icon, /href="icon-512\.png"/);
  assert.match(maskable, /href="maskable-512\.png"/);

  const expectedHashes = {
    'icons/icon-192.png': '4B50C9E83CBDA9FD46E4756B04F1C1DF46E6BB6E52F6EBED6F88ADB447D6FA99',
    'icons/icon-512.png': 'C5A7C3F4533935F608904533C2A88B61E78D6960AB2D528FA029F6EAF37FDA9F',
    'icons/apple-touch-icon.png': '9DEDA4D464FE25D066D952DE58C42054F5797FBBD5D0057576B405B86D4B5061',
    'icons/maskable-512.png': '02EFEC2B1C34F99ECE7AFB129AE414396F884D8E53EF2292AE2ECC318C437DE7'
  };
  Object.entries(expectedHashes).forEach(([name, expected]) => {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex').toUpperCase();
    assert.equal(actual, expected, name);
  });
});

test('resource keys remain raw in the service-worker header', () => {
  const worker = read('sw.js');
  assert.match(worker, /X-Goog-Drive-Resource-Keys/);
  assert.doesNotMatch(worker, /encodeURIComponent\(resourceKey\)/);
});

test('privacy documentation matches the requested OAuth scope and token storage', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');
  assert.match(readme, /https:\/\/www\.googleapis\.com\/auth\/drive/);
  assert.match(readme, /https:\/\/www\.googleapis\.com\/auth\/drive\.appdata/);
  assert.match(readme, /로컬 저장소/);
  assert.doesNotMatch(readme, /drive\.readonly/);
  assert.doesNotMatch(readme, /액세스 토큰: 메모리에만/);
  assert.match(app, /const DEFAULT_OAUTH_CLIENT_ID = '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l\.apps\.googleusercontent\.com'/);
  assert.doesNotMatch(html, /id="clientIdInput"|id="pasteClientId"/);
  assert.match(html, /OAuth 클라이언트 ID 재정의 \(선택\)/);
  assert.match(readme, /첫 화면에서 ID를 입력할 필요 없이/);
  assert.match(readme, /입력란을 비우거나 앱 기본 ID를 저장하면 custom override가 제거/);
  assert.match(app, /const DRIVE_SCOPES = `\$\{DRIVE_SCOPE\} \$\{DRIVE_APPDATA_SCOPE\}`/);
  assert.match(app, /scope:\s*DRIVE_SCOPES/);
  assert.match(app, /scopeVersion:\s*OAUTH_SCOPE_VERSION/);
});

test('player controls, in-app preview, and selection toolbar remain bound in the shell', () => {
  const app = read('app.js');
  const html = read('index.html');
  for (const id of ['ctrlFramePrev', 'ctrlFrameNext', 'drivePreview', 'selectionToolbar']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
    assert.match(app, new RegExp(`'${id}'`));
  }
  assert.match(html, /id="drivePreview"[^>]*allow="[^"]*autoplay[^"]*fullscreen[^"]*"/);
  assert.match(app, /function buildDrivePreviewUrl\(file\)[\s\S]*?\/preview/);
  assert.match(app, /function showDrivePreview\(file, reason\)/);
  assert.match(app, /state\.mediaAttempt = 'drive-preview-page'/);
  assert.doesNotMatch(app, /function showDriveHandoff\(/);
});

test('account-synced favorites and viewed history are wired into the existing library and player surfaces', () => {
  const app = read('app.js');
  const html = read('index.html');
  const styles = read('styles.css');
  assert.match(app, /const ACCOUNT_STATE_FILE_NAME = 'drive-original-account-state\.json'/);
  assert.match(app, /spaces: 'appDataFolder'/);
  assert.match(app, /parents: \['appDataFolder'\]/);
  assert.match(app, /function mergeAccountMediaStates\(/);
  assert.match(app, /function prioritizeUnseenFiles\(/);
  assert.match(app, /function setupLibraryEdgeBackGesture\(/);
  assert.match(app, /resetMediaElements\(\)[\s\S]*?clearDirectMediaSources\(\);[\s\S]*?updatePlayPauseUI\(\)/);
  for (const id of ['topbarFavoriteBtn', 'ctrlFavorite', 'shortsFavoriteBtn', 'favoriteFeedback', 'edgeBackIndicator']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(html, /data-filter="favorites"/);
  assert.match(html, /<button type="button" data-filter="favorites" aria-pressed="false">좋아요<\/button>/);
  assert.match(app, /el\.deepScanToggle\.hidden = state\.filter === 'favorites'/);
  assert.match(app, /\/files\/\$\{encodeURIComponent\(fileId\)\}\?\$\{params\.toString\(\)\}/);
  assert.match(app, /function beginLibraryStatus\(/);
  assert.match(app, /token !== state\.libraryStatusToken/);
  assert.match(styles, /\.file-card-favorite\.is-favorite/);
  assert.match(styles, /\.favorite-feedback\.active/);
});

test('mobile overflow actions stack above the trigger and favorite feedback is visually icon-only', () => {
  const app = read('app.js');
  const html = read('index.html');
  const styles = read('styles.css');
  assert.match(styles, /\.shorts-expand-row\s*\{[\s\S]*?left:\s*auto;[\s\S]*?right:\s*16px;[\s\S]*?bottom:\s*calc\(var\(--safe-bottom\) \+ 84px\);[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*flex-end;/);
  assert.match(styles, /\.shorts-expand-row\s*\{[\s\S]*?transform-origin:\s*bottom right;/);
  assert.match(html, /class="favorite-feedback-label">좋아요<\/span>/);
  assert.match(styles, /\.favorite-feedback\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.favorite-feedback-label\s*\{[\s\S]*?clip-path:\s*inset\(50%\);/);
  assert.match(styles, /\.favorite-feedback\.is-removing svg\s*\{[\s\S]*?fill:\s*none;/);
  assert.match(app, /feedback\.querySelector\('\.favorite-feedback-label'\)/);
});

test('video adaptively chooses exact-original transport and exhausts original paths before compatibility playback', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');
  const productTruth = read('memory/PRODUCT-TRUTH.md');
  assert.match(app, /function chooseInitialOriginalPlaybackRoute\([\s\S]*?policy\?\.mode === 'disk'[\s\S]*?PLAYBACK_MODE\.OPFS[\s\S]*?PLAYBACK_MODE\.RANGE/);
  assert.match(app, /function startInitialOriginalPlayback\([\s\S]*?resolveOriginalBufferPolicy\(file\)[\s\S]*?chooseInitialOriginalPlaybackRoute[\s\S]*?rangeFallbackOnFailure: true/);
  assert.match(app, /rangeFallbackOnFailure[\s\S]*?startOriginalRangePlayback\(file, kind, session/);
  assert.match(app, /mediaExhaustedOriginalModes\.add\(PLAYBACK_MODE\.OPFS\)[\s\S]*?startOriginalRangePlayback/);
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
  assert.match(readme, /적응형 판단은 \*\*전송 방식만\*\* 선택/);
  assert.match(readme, /같은 파일의 전체 다운로드와 Range 요청을 동시에 중복 실행하지 않습니다/);
  assert.match(productTruth, /v1\.17\.0 keeps every viable original-byte path ahead of Google compatibility playback/);
});

test('playback quality starts unverified and documents only evidence-backed original labels', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');

  assert.match(html, /id="streamModeLabel" data-mode="checking"[\s\S]*?id="streamModeText">원본 확인 중/);
  assert.match(html, /id="qualityBadge" data-quality="checking"[^>]*>원본 확인 중/);
  assert.match(html, /Google 호환 재생 · 원본 화질 미확인/);
  assert.doesNotMatch(html, /id="qualityBadge"[^>]*>100% 원본 화질/);
  assert.doesNotMatch(html, /100% 무인코딩 무손실 화질|1:1 원본 그대로 스트리밍/);
  assert.doesNotMatch(app, /100% 원본|100% 무손실|1:1 무변환/);
  assert.match(app, /state\.demo[\s\S]*?데모 미리보기[\s\S]*?원본 재생 아님[\s\S]*?저장 파일 정보/);
  assert.match(app, /데모 화면은 저장 파일 정보를 예시로 보여 주며 실제 원본 바이트를 재생하지 않습니다\./);
  assert.match(app, /setStreamMode\('drive', qualityLabel\)[\s\S]*?qualityBadge\.textContent = '· 원본 화질 미확인'/);
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

test('player chrome hides as one mobile layer and high-frequency motion stays transform based', () => {
  const app = read('app.js');
  const html = read('index.html');
  const styles = read('styles.css');

  assert.match(html, /<details class="player-more-menu" id="playerMoreMenu">[\s\S]*?id="ctrlMove"[\s\S]*?id="ctrlDelete"/);
  assert.doesNotMatch(html, /class="media-info-bar"/);
  assert.match(styles, /\.quality-badge\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.player-modal\.controls-idle \.mobile-shorts-overlay[\s\S]*?opacity:\s*0[\s\S]*?pointer-events:\s*none/);
  assert.match(app, /seekBarPlayed\.style\.transform = `scaleX\(\$\{ratio\}\)`/);
  assert.match(app, /mobileShortsProgressBar\.style\.transform = `scaleX\(\$\{ratio\}\)`/);
  assert.doesNotMatch(app, /seekBarPlayed\.style\.width|seekBarThumb\.style\.left|mobileShortsProgressBar\.style\.width/);
  const shortsExpand = styles.match(/\.shorts-expand-row \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.doesNotMatch(shortsExpand, /transition:[^;]*(?:max-height|height)/);
  assert.match(shortsExpand, /max-height:\s*calc\(100dvh/);
  assert.match(shortsExpand, /overflow-y:\s*auto/);
  assert.match(app, /requestVideoFrameCallback[\s\S]*?hideSwipeNeighbor/);
  assert.match(app, /function playFrozenSwipeTarget\(targetId, direction\)/);
  assert.match(app, /function hasOpenPlayerControlsMenu\([\s\S]*?mobileShortsOverlay\?\.classList\.contains\('expanded'\)/);
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
