'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function parseIsoBmffTopLevelBoxes(bytes) {
  const boxes = [];
  let offset = 0;
  while (offset < bytes.length) {
    assert(offset + 8 <= bytes.length, 'ISO-BMFF box header must fit inside the fixture');
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      assert(offset + 16 <= bytes.length, 'ISO-BMFF large-size header must fit inside the fixture');
      const size64 = bytes.readBigUInt64BE(offset + 8);
      assert(size64 <= BigInt(Number.MAX_SAFE_INTEGER), 'ISO-BMFF box size must be safe');
      size = Number(size64);
      headerSize = 16;
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }
    assert(size >= headerSize, `ISO-BMFF ${type} box must have a valid size`);
    assert(offset + size <= bytes.length, `ISO-BMFF ${type} box must stay inside the fixture`);
    boxes.push({ type, offset, size, end: offset + size });
    offset += size;
  }
  return boxes;
}

test('release version is synchronized across runtime, shell, HTML, and metadata', () => {
  const app = read('app.js');
  const worker = read('sw.js');
  const html = read('index.html');
  const metadata = JSON.parse(read('version.json'));
  const appVersion = app.match(/const APP_VERSION = '([^']+)'/)?.[1];
  const workerVersion = worker.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(metadata.version, '1.22.0-rc.37');
  assert.equal(appVersion, metadata.version);
  assert.equal(workerVersion, metadata.version);
  assert.match(html, new RegExp(`styles\\.css\\?v=${metadata.version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${metadata.version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`runtime-config\\.js\\?v=${metadata.version.replaceAll('.', '\\.')}`));
  assert.equal((html.match(new RegExp(`v${metadata.version.replaceAll('.', '\\.')}`, 'g')) || []).length, 2);
});

test('authentication setup feedback is a polite atomic live region', () => {
  const html = read('index.html');
  const hint = html.match(/<p class="field-hint" id="authHint"[^>]*>/)?.[0] || '';
  assert.match(hint, /aria-live="polite"/);
  assert.match(hint, /aria-atomic="true"/);
});

test('first paint cannot restart OAuth while the existing session is still being recovered', () => {
  const html = read('index.html');
  const badge = html.match(/<div class="connection-badge" id="connectionBadge"[^>]*>/)?.[0] || '';
  const setup = html.match(/<section class="setup-view" id="setupView"[^>]*>/)?.[0] || '';
  const connect = html.match(/<button class="primary-button full" id="connectButton"[^>]*>/)?.[0] || '';
  assert.match(badge, /data-state="busy"/);
  assert.match(setup, /aria-busy="true"/);
  assert.match(connect, /\bdisabled\b/);
  assert.match(html, /기존 Drive 연결 확인 중…/);
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

test('privacy documentation and shell use the same-origin memory-only credential contract', () => {
  const app = read('app.js');
  const html = read('index.html');
  const readme = read('README.md');
  const routes = read('auth/routes.mjs');
  assert.match(readme, /https:\/\/www\.googleapis\.com\/auth\/drive/);
  assert.match(readme, /https:\/\/www\.googleapis\.com\/auth\/drive\.appdata/);
  assert.match(readme, /\{accessToken, expiresAt, account, revision\}/);
  assert.match(readme, /미디어 바이트를 중계·캐시·변환하지 않/);
  assert.match(readme, /drive\.readonly/);
  assert.match(readme, /capabilities/);
  assert.match(app, /const AUTH_CREDENTIAL_PATH = '\/api\/session\/credential'/);
  assert.match(app, /credentials:\s*'same-origin'/);
  assert.match(app, /\[AUTH_CSRF_HEADER\]: '1'/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*(?:oauth-token|accessToken)/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*sessionCredentialMarker/);
  assert.doesNotMatch(app, /DEFAULT_OAUTH_CLIENT_ID|initTokenClient|requestAccessToken/);
  assert.doesNotMatch(html, /accounts\.google\.com\/gsi\/client|settingsClientId|saveSettingsButton/);
  assert.match(html, /id="logoutButton"/);
  assert.match(html, /id="disconnectButton"/);
  assert.match(routes, /X-Drive-Original-CSRF/);
  assert.match(routes, /Sec-Fetch-Site/);
  assert.match(routes, /Cache-Control': 'no-store'/);
});

test('Q1 public bundles match their exact source manifest and offline shell', () => {
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = JSON.parse(read('media/build.json'));
  const publicFiles = require('../scripts/public-files.cjs');
  assert.equal(new Set(publicFiles).size, publicFiles.length);
  assert.equal(manifest.compiler, '0.28.1');
  assert.equal(manifest.mux, '7.1.0');
  for (const [file, record] of Object.entries(manifest.outputs)) {
    assert.equal(hash(fs.readFileSync(path.join(root, file))), record.sha256, file);
    for (const [input, expected] of Object.entries(record.inputs)) {
      assert.equal(hash(fs.readFileSync(path.join(root, input))), expected, input);
    }
    assert.doesNotMatch(read(file), /(?:from|import)\s*['"][^'"]*(?:qa\/|node_modules|file:|https?:)/);
  }
  assert.equal(hash(fs.readFileSync(path.join(root, 'media/mux-mp4.min.js'))),
    '4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
  for (const file of publicFiles.filter(file => file.startsWith('media/'))) {
    assert.ok(read('sw.js').includes(`'./${file}'`), file);
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  assert.equal(publicFiles.some(file => /(?:qa\/|build\.json|entry\.mjs|memory\/|\.env)/.test(file)), false);
  assert.match(read('scripts/build-pages.cjs'), /require\('\.\/public-files\.cjs'\)/);
  assert.match(read('scripts/publish-pages.cjs'), /require\('\.\/public-files\.cjs'\)/);
});

test('tail-index MP4 QA seed is small, immutable and keeps moov behind mdat', () => {
  const fixture = fs.readFileSync(path.join(root, 'qa', 'tail-index-h264-aac.mp4'));
  assert.equal(fixture.length, 57944, 'tail-index seed size must remain fixed and below 256 KiB');
  assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), 'c3e75a4d8e234a8864940bfe498fb7ee49ad3305bf0790879e636e607fee595f');
  const boxes = parseIsoBmffTopLevelBoxes(fixture);
  const mdat = boxes.find((box) => box.type === 'mdat');
  const moov = boxes.find((box) => box.type === 'moov');
  assert.equal(boxes[0]?.type, 'ftyp');
  assert(mdat);
  assert(moov);
  assert(moov.offset >= mdat.end, 'tail-index fixture must place moov after mdat');
  assert.equal(boxes.some((box) => box.type === 'moof'), false, 'fixture must not be fragmented MP4');
  assert.deepEqual(boxes.map(({ type, offset, size }) => ({ type, offset, size })), [
    { type: 'ftyp', offset: 0, size: 32 },
    { type: 'free', offset: 32, size: 8 },
    { type: 'mdat', offset: 40, size: 55274 },
    { type: 'moov', offset: 55314, size: 2630 }
  ]);
});

test('faststart MP4 QA seed is small, immutable and keeps moov ahead of mdat', () => {
  const fixture = fs.readFileSync(path.join(root, 'qa', 'faststart-h264-aac.mp4'));
  assert.equal(fixture.length, 202253, 'faststart seed size must remain fixed and below 512 KiB');
  assert(fixture.length < 512 * 1024);
  assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), '178d8b884e2668a2da18ffba63960ec192f810b91c151cdab6e3080687328079');
  const boxes = parseIsoBmffTopLevelBoxes(fixture);
  const mdat = boxes.find((box) => box.type === 'mdat');
  const moov = boxes.find((box) => box.type === 'moov');
  assert.equal(boxes[0]?.type, 'ftyp');
  assert(mdat);
  assert(moov);
  assert(moov.end <= mdat.offset, 'faststart fixture must place moov before mdat');
  assert.equal(boxes.some((box) => box.type === 'moof'), false, 'fixture must not be fragmented MP4');
  assert.deepEqual(boxes.map(({ type, offset, size }) => ({ type, offset, size })), [
    { type: 'ftyp', offset: 0, size: 32 },
    { type: 'moov', offset: 32, size: 5542 },
    { type: 'free', offset: 5574, size: 8 },
    { type: 'mdat', offset: 5582, size: 196671 }
  ]);
});

test('seek-range MP4 QA seed is bounded, immutable and keeps moov ahead of mdat', () => {
  const fixture = fs.readFileSync(path.join(root, 'qa', 'seek-range-h264-aac.mp4'));
  assert.equal(fixture.length, 5223316, 'seek-range seed size must remain fixed and below 6 MiB');
  assert(fixture.length < 6 * 1024 * 1024);
  assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), 'e77b2b55a20b403c08fa3edec1371090258b3531b1f41da4ad7f9c6be624a0a6');
  const boxes = parseIsoBmffTopLevelBoxes(fixture);
  const mdat = boxes.find((box) => box.type === 'mdat');
  const moov = boxes.find((box) => box.type === 'moov');
  assert.equal(boxes[0]?.type, 'ftyp');
  assert(mdat);
  assert(moov);
  assert(moov.end <= mdat.offset, 'seek-range fixture must place moov before mdat');
  assert.equal(boxes.some((box) => box.type === 'moof'), false, 'fixture must not be fragmented MP4');
  assert.deepEqual(boxes.map(({ type, offset, size }) => ({ type, offset, size })), [
    { type: 'ftyp', offset: 0, size: 32 },
    { type: 'moov', offset: 32, size: 53361 },
    { type: 'free', offset: 53393, size: 8 },
    { type: 'mdat', offset: 53401, size: 5169915 }
  ]);
});

test('candidate runtime config is loaded before app code and fails closed for Drive writes', () => {
  const app = read('app.js');
  const html = read('index.html');
  const runtime = read('runtime-config.js');
  const worker = read('sw.js');
  assert.ok(html.indexOf('runtime-config.js') < html.indexOf('app.js'));
  assert.match(runtime, /driveMutationsEnabled:\s*false/);
  assert.match(app, /DRIVE_MUTATIONS_ENABLED/);
  assert.match(app, /candidate_read_only/);
  assert.match(worker, /'\.\/runtime-config\.js'/);
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
  assert.match(app, /function showDrivePreview\(file, reason, \{ userInitiated = false \} = \{\}\)/);
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
  const initialRoute = app.match(/function startInitialOriginalPlayback\([\s\S]*?(?=\nfunction startOriginalRangePlayback)/)?.[0] || '';
  assert.match(initialRoute, /route: 'range'[\s\S]*?startOriginalRangePlayback\(file, kind, session\)/);
  assert.doesNotMatch(initialRoute, /resolveOriginalBufferPolicy|startOriginalBlobFallback/);
  assert.match(initialRoute, /shouldProbeOriginalTs[\s\S]*?tryOriginalTsPlayback/);
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
  assert.match(readme, /Google 미리보기 · 재생·화질 미확인/);
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
  assert.match(html, /Google 미리보기 · 재생·화질 미확인/);
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
    'Google 미리보기 · 재생·화질 미확인',
  ]) {
    assert.match(readme, new RegExp(label));
  }
  assert.match(readme, /Drive에서 열기는 사용자가 직접 선택할 때만/);
  assert.match(readme, /원본 확인 중/);
});

test('player chrome hides as one mobile layer and high-frequency motion stays transform based', () => {
  const app = read('app.js');
  const html = read('index.html');
  const styles = read('styles.css');

  assert.match(html, /<details class="player-more-menu" id="playerMoreMenu">[\s\S]*?id="ctrlMove"[\s\S]*?id="ctrlDelete"/);
  assert.doesNotMatch(html, /class="media-info-bar"/);
  assert.match(styles, /\.quality-badge\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.player-modal\.controls-idle \.player-chrome[\s\S]*?opacity:\s*0[\s\S]*?pointer-events:\s*none/);
  assert.match(app, /playerChrome\.inert = !visible/);
  assert.match(app, /playerChrome\.appendChild\(node\)/);
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
