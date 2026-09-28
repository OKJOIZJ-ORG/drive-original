import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { freshCacheRuntime } from './fresh-cache-runtime.mjs';

// The sole input is the protected, token-free state recovery envelope. No live
// browser or remote endpoint is used, and no private value is reported.
const envelopePath = process.argv[2];
if (!envelopePath) throw new Error('Private recovery envelope path is required');
const envelope = JSON.parse(await fs.readFile(envelopePath, 'utf8'));
const backup = JSON.parse(envelope.privateBackupText);
const rollbackCommit = 'e08989a6caecc51bc2fdd37f538619fa8ed5900d';
const oldBytes = execFileSync('git', ['show', `${rollbackCommit}:app.js`], { maxBuffer: 4 * 1024 * 1024 });
const oldText = oldBytes.toString('utf8');
const launch = new Function('shadow', `
  const {globalThis,window,document,navigator,location,history,localStorage,fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,console}=shadow;
  const self=window,top=window;
  ${oldText}
  state.token='synthetic-shadow-read-only';state.expiresAt=Date.now()+3600000;
  state.accountStateWriterId='fresh-cache-read-only-context';
  return {initialize:()=>initializeAccountMediaState(),loaded:()=>state.accountStateLoaded,
    failed:()=>Boolean(state.accountStateSyncError),accountId:()=>state.accountId,
    projection:()=>JSON.parse(JSON.stringify(state.accountMediaState)),equal:accountMediaStatesEqual,
    validate:normalizeAccountMediaState};
`);
let reads = 0, writes = 0;
const newFieldFence = "url.searchParams.get('fields') === 'nextPageToken,incompleteSearch,files(id,name,modifiedTime)'";
const oldFieldFence = "url.searchParams.get('fields') === 'nextPageToken,files(id,name,modifiedTime)'";
const wrapperText = freshCacheRuntime.toString();
if (wrapperText.split(newFieldFence).length !== 2) throw new Error('Old-reader metadata pin is not unique');
const oldReaderRuntime = new Function(`return (${wrapperText.replace(newFieldFence, oldFieldFence)});`)();
const job = oldReaderRuntime(launch, {
  expectedAccountId: backup.remote.accountId,
  expectedProjection: backup.remote.remote,
  isCurrent: () => true,
  read(address, options) {
    if (options.method !== 'GET') { writes++; throw new Error('write_rejected'); }
    reads++;
    const url = new URL(address);
    let data;
    if (url.pathname === '/drive/v3/about') data = { user: { permissionId: backup.remote.accountId } };
    else if (url.pathname === '/drive/v3/files') data = { incompleteSearch: false,
      files: backup.remote.files.map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })) };
    else {
      const file = backup.remote.files.find(file => file.id === url.pathname.split('/').pop());
      if (!file || url.searchParams.get('alt') !== 'media') throw new Error('unrecognized_read');
      data = file.raw;
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
}, { appHash: createHash('sha256').update(oldBytes).digest('hex') });
const summary = await job.run();
if (!summary.passed || writes !== 0) throw new Error(`Rollback schema check failed: ${summary.code || 'write'}`);
const result = { passed: true, checkedAt: new Date().toISOString(), rollbackCommit,
  rollbackAppHash: job.sourceHash,
  scope: 'Exact production v1.21.0 app code, isolated empty storage, local protected rc.11 snapshot provider',
  liveNetworkRequests: 0, writes, providerReads: reads, summary,
  comparison: 'Full current private remote projection; identity equality, not count-only',
  transportAdapter: 'Local-only GET field fence pinned to the exact older reader without incompleteSearch; product source untouched',
  limits: { productionDeployment: false, oldOriginOAuthFlow: false, physicalDevice: false },
};
job.clear();
await fs.writeFile(new URL('./rollback-schema-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
