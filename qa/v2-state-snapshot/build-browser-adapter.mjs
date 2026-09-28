import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Public source only. Generated function executes in the app's main-world lexical
// environment; credentials and snapshots never cross the DevTools result boundary.
export async function buildBrowserFunction() {
  const [core, adapter, version] = await Promise.all([
    readFile(new URL('./snapshot.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./browser-adapter.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../version.json', import.meta.url), 'utf8')
  ]);
  const strip = source => source.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
  return `async () => {
    const core = (() => { ${strip(core)}
      return {collectSnapshot, compareSnapshots, canonical, SnapshotError}; })();
    const adapter = (() => { const {collectSnapshot, compareSnapshots, canonical, SnapshotError} = core;
      ${strip(adapter)} return {createBrowserStateAudit}; })();
    const audit = adapter.createBrowserStateAudit({
      appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,
      expectedVersion: ${JSON.stringify(JSON.parse(version).version)},
      mutationsEnabled: typeof DRIVE_MUTATIONS_ENABLED === 'boolean' ? DRIVE_MUTATIONS_ENABLED : null,
      state: typeof state === 'object' ? state : null,
      credentialUsable: () => hasUsableToken(),
      readDriveResponse: (url, options) => fetch(url, { ...options, cache: 'no-store',
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: {Authorization: 'Bearer ' + state.token} }),
      normalize: normalizeAccountMediaState, merge: mergeAccountMediaStates,
      location, navigator, document,
      mediaIdle: () => state.mediaAttempt === 'idle' && !q1Playback && !state.mediaAbortController
        && !state.mediaBlobUrl && !state.mediaTempStorage && !state.pendingOriginalBuffer,
      readLocalReplica: () => {
        const raw = localStorage.getItem(accountStateCacheKey());
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch { throw new core.SnapshotError('invalid_local_replica'); }
      },
      addEventListener: globalThis.addEventListener.bind(globalThis),
      removeEventListener: globalThis.removeEventListener.bind(globalThis)
    });
    return audit.run();
  }`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeFile(new URL('./browser-function.generated.js', import.meta.url), await buildBrowserFunction(), 'utf8');
  console.log('Generated public-source in-page function; no private state stored');
}
