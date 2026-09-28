import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import esbuild from '../../worker/node_modules/esbuild/lib/main.js';

// These functions contain public source only. Do not insert private arguments
// into generated files or output. Invoke reader/comparator in CUA memory, retain
// the private reader payload there, and display only the comparator's aggregates.
async function publicBundle(compare = false) {
  // Resolve the maintained imports and tree-shake unused collectors/helpers.
  // No generated files, source maps, private values, or dependency installation.
  const result = await esbuild.build({
    stdin: { contents: `export { ${compare ? 'compareLegacyReplica' : 'readLegacyReplica'}, safeLegacyFailure }
      from './legacy-replica.mjs'; ${compare ? "export {canonical} from './snapshot.mjs';" : ''}`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'legacy-public-entry.mjs', loader: 'js' },
    bundle: true, treeShaking: true, format: 'iife', globalName: 'helper',
    platform: 'browser', target: 'es2022', minify: true, write: false, legalComments: 'none'
  });
  return result.outputFiles[0].text;
}
async function compact(source) {
  // A bare function expression is removable as unused. Keep an assignment during
  // transform, then remove only its fixed public prefix before returning source.
  const prefix = '__legacyPublicFunction=';
  const result = await esbuild.transform(`__legacyPublicFunction = (${source})`,
    {loader: 'js', target: 'es2022', minify: true, legalComments: 'none'});
  const transformed = result.code.trim();
  if (!transformed.startsWith(prefix)) throw new Error('Unexpected public source transform');
  return transformed.slice(prefix.length).replace(/;$/, '');
}

// Exact production inert version.json only; no app startup, fetch or enumeration.
export async function buildLegacyReadFunction() {
  return compact(`({expectedAccountId, fence, readWriter = true} = {}) => {
    ${await publicBundle()}
    try { return helper.readLegacyReplica({storage: localStorage, origin: location.origin,
      pathname: location.pathname, expectedAccountId, fence, readWriter}); }
    catch (cause) { return helper.safeLegacyFailure(cause); }
  }`);
}

// Candidate can be background: no visibility/online/token-expiry policy is
// borrowed from remote capture. All operations below are synchronous local reads.
export async function buildLegacyCompareFunction() {
  const version = JSON.parse(await readFile(new URL('../../version.json', import.meta.url), 'utf8')).version;
  return compact(`({payload, expectedOwner} = {}) => {
    ${await publicBundle(true)}
    try {
      const accountId = expectedOwner?.accountId;
      if (typeof accountId !== 'string' || !accountId) return helper.safeLegacyFailure({code: 'invalid_contract'});
      if (state.accountId !== accountId) return helper.safeLegacyFailure({code: 'account_mismatch'});
      if (DRIVE_MUTATIONS_ENABLED !== false) return helper.safeLegacyFailure({code: 'read_only_required'});
      const controller = navigator.serviceWorker?.controller;
      const eligible = () => location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
        && APP_VERSION === ${JSON.stringify(version)} && DRIVE_MUTATIONS_ENABLED === false
        && expectedOwner?.current === true && state.accountId === accountId
        && state.authAccountKey === expectedOwner.authAccountKey
        && state.authGeneration === expectedOwner.authGeneration
        && state.driveSessionGeneration === expectedOwner.driveSessionGeneration
        && state.accountStateLoaded === true && !state.accountIdentityPending && !state.demo
        && controller && navigator.serviceWorker.controller === controller
        && q1RetirementResult?.settled === true && !q1Playback && state.mediaAttempt === 'idle'
        && !state.mediaAbortController && !state.mediaBlobUrl && !state.mediaTempStorage && !state.pendingOriginalBuffer;
      if (!eligible()) return helper.safeLegacyFailure({code: 'stale_owner'});
      const initialProjection = helper.canonical(state.accountMediaState);
      const key = 'drive-original.account-state.' + accountId;
      const initialCache = localStorage.getItem(key);
      const initialWriter = localStorage.getItem('drive-original.account-writer');
      const current = () => eligible() && helper.canonical(state.accountMediaState) === initialProjection
        && localStorage.getItem(key) === initialCache
        && localStorage.getItem('drive-original.account-writer') === initialWriter;
      return helper.compareLegacyReplica({payload, expectedAccountId: accountId,
        fence: {accountId: state.accountId, current: Boolean(current()), readOnly: DRIVE_MUTATIONS_ENABLED === false},
        candidateProjection: state.accountMediaState, candidateWriterId: initialWriter,
        normalize: normalizeAccountMediaState, merge: mergeAccountMediaStates, isCurrent: current});
    } catch (cause) { return helper.safeLegacyFailure(cause); }
  }`);
}
