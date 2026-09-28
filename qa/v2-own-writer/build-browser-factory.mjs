import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import esbuild from '../../worker/node_modules/esbuild/lib/main.js';

export async function buildOwnWriterFactory() {
  const app = await fs.readFile(new URL('../../app.js', import.meta.url), 'utf8');
  const between = (start, end) => {
    const a = app.indexOf(start), b = app.indexOf(end, a);
    if (a < 0 || b <= a) throw new Error('canonical_source_missing');
    return app.slice(a, b);
  };
  const canonical = between('async function createAccountStateFile(', 'async function initializeAccountMediaState(')
    + between('async function flushAccountMediaState(', 'function scheduleAccountStateSyncRetry(');
  const executor = `async (hooks, functions) => {
    const normalizeAccountMediaState=functions.normalize, mergeAccountMediaStates=functions.merge;
    const state={demo:false,accountId:hooks.candidate.accountId,accountMediaState:normalizeAccountMediaState(hooks.candidate.runtimeProjection),
      accountStateRevision:0,accountStateSyncPromise:null,accountStateReadCache:new Map(),accountStateSyncRetryTimer:null};
    const navigator={locks:{request:hooks.lock}}, console={warn(){}},clearTimeout=()=>{};
    const hasUsableToken=hooks.current, getAccountStateWriterId=()=>hooks.candidate.writerId;
    const accountStateWriterFileName=()=> 'drive-original-account-state-v2-'+getAccountStateWriterId()+'.json';
    const captureAccountStateRequest=()=>({options:{signal:hooks.signal},assert(){if(!hooks.current())throw Object.assign(new Error('stale_owner'),{code:'stale_owner'});},current:hooks.current});
    const findAccountStateFile=hooks.catalog,readRemoteAccountMediaState=hooks.remote,driveFetch=hooks.write;
    const applyMergedAccountMediaState=value=>{state.accountMediaState=value;};
    const persistAccountMediaState=()=>{state.accountMediaState=mergeAccountMediaStates(normalizeAccountMediaState(JSON.parse(hooks.candidate.cacheText)),state.accountMediaState);};
    const refreshFavoritePresentation=()=>{},updateAccountSyncStatus=()=>{};
    const scheduleAccountStateSyncRetry=()=>{},queueAccountStateSync=()=>{};
    ${canonical}
    await flushAccountMediaState();
    if(state.accountStateSyncError) throw state.accountStateSyncError;
    if(!hooks.current()) throw Object.assign(new Error('stale_owner'),{code:'stale_owner'});
  }`;
  const result = await esbuild.build({ stdin: {
    contents: "export {createOwnWriterHandle as default} from './migration.mjs';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'own-writer-entry.mjs', loader: 'js' },
    bundle: true, treeShaking: true, format: 'iife', globalName: 'ownWriterFactory', platform: 'browser',
    target: 'es2022', minify: false, write: false, legalComments: 'none' });
  // Append exact source after bundling so the three product function texts are
  // executed byte-for-byte, without esbuild formatting/minification changes.
  return `(()=>{${result.outputFiles[0].text}const execute=${executor};return deps=>ownWriterFactory.default(deps,execute);})()`;
}
