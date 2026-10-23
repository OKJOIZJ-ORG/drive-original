const fs = require('fs');
const root = process.argv[2];
const read = f => fs.readFileSync(`${root}/${f}`, 'utf8').replace(/\r\n/g, '\n');
function fn(src, name) {
  const m = new RegExp(`^(async )?function ${name}[(]`, 'm').exec(src); if (!m) throw new Error(name);
  return src.slice(m.index, src.indexOf('\n}\n', m.index) + 2);
}
function line(src, name) { const m = new RegExp(`^const ${name} = .*$`, 'm').exec(src); if (!m) throw new Error(name); return m[0]; }
const core = read('app/core.js'), acct = read('app/account-state.js'), auth = read('app/auth.js'), list = read('app/library-list.js'),
  pin = read('app/original-pin.js'), pres = read('app/player-presentation.js');
const body = [
  line(core, 'ACCOUNT_STATE_READ_CACHE_PREFIX'), line(core, 'ACCOUNT_STATE_READ_CONCURRENCY'), line(core, 'LISTED_FILE_FIELDS'), line(core, 'DRIVE_FIRST_PAGE_SIZE'),
  fn(core, 'folderListingParams'),
  ...['accountStateReadCacheKey', 'restoreAccountStateReadCache', 'persistAccountStateReadCache', 'readRemoteAccountMediaState', 'initializeAccountMediaState'].map(n => fn(acct, n)),
  fn(auth, 'resumeAfterCredential'), fn(list, 'loadFiles'),
  ...['isPrewarmableMedia', 'prewarmRevisionPin', 'installCardPinPrewarm', 'prewarmNextPlaybackPin'].map(n => fn(pin, n)),
  fn(pres, 'completeVideoFramePresentation'), fn(pres, 'onMediaReady'),
  'window.__patchApplied = true;'
].join('\n');
fs.writeFileSync(process.argv[3], `document.addEventListener('DOMContentLoaded', () => { try { (0, eval)(${JSON.stringify(body)}); } catch (e) { window.__patchError = String(e); } }, { once: true });`);
fs.writeFileSync(process.argv[3] + '.body.js', body);
