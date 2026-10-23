const fs = require('fs');
const root = process.argv[2];
const read = f => fs.readFileSync(`${root}/${f}`, 'utf8').replace(/\r\n/g, '\n');
function fn(src, name) {
  const re = new RegExp(`^(async )?function ${name}[(]`, 'm');
  const m = re.exec(src); if (!m) throw new Error(name);
  const end = src.indexOf('\n}\n', m.index);
  return src.slice(m.index, end + 2);
}
const acct = read('app/account-state.js'), auth = read('app/auth.js');
const body = [
  "const ACCOUNT_STATE_READ_CACHE_PREFIX = 'drive-original.account-state-reads.';",
  'const ACCOUNT_STATE_READ_CONCURRENCY = 16;',
  ...['accountStateReadCacheKey', 'restoreAccountStateReadCache', 'persistAccountStateReadCache', 'readRemoteAccountMediaState', 'initializeAccountMediaState'].map(n => fn(acct, n)),
  fn(auth, 'resumeAfterCredential'),
  'window.__patchApplied = true;'
].join('\n');
const init = `document.addEventListener('DOMContentLoaded', () => { try { (0, eval)(${JSON.stringify(body)}); } catch (e) { window.__patchError = String(e); } }, { once: true });`;
fs.writeFileSync(process.argv[3], init);
console.log(init.length);
