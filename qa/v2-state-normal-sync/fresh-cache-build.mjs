import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { freshCacheRuntime } from './fresh-cache-runtime.mjs';

export async function buildFreshCacheFactory() {
  const appText = await fs.readFile(new URL('../../app.js', import.meta.url), 'utf8');
  const appHash = createHash('sha256').update(appText).digest('hex');
  const source = `function(deps) {\n'use strict';\nconst runtime = ${freshCacheRuntime.toString()};\nreturn runtime(function(shadow) {\nconst {globalThis,window,document,navigator,location,history,localStorage,fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,console}=shadow;\nconst self=window,top=window;\n${appText}\nstate.token='synthetic-shadow-read-only';state.expiresAt=Date.now()+3600000;\nstate.accountStateWriterId='fresh-cache-read-only-context';\nreturn {initialize:()=>initializeAccountMediaState(),loaded:()=>state.accountStateLoaded,failed:()=>Boolean(state.accountStateSyncError),accountId:()=>state.accountId,projection:()=>JSON.parse(JSON.stringify(state.accountMediaState)),equal:accountMediaStatesEqual,validate:value=>validateRawAccountMediaState(value)};\n},deps,{appHash:${JSON.stringify(appHash)}});\n}`;
  return { source, appHash, appText };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const built = await buildFreshCacheFactory();
  await fs.writeFile(new URL('./fresh-cache-factory.generated.js', import.meta.url), built.source);
  const raw = Buffer.from(built.source, 'utf8');
  const compressed = gzipSync(raw, { level: 9 });
  if (!gunzipSync(compressed).equals(raw)) throw new Error('Factory archive mismatch');
  await fs.writeFile(new URL('./fresh-cache-factory.generated.js.gz', import.meta.url), compressed);
  const archive = { appHash: built.appHash, characters: built.source.length,
    factoryHash: createHash('sha256').update(raw).digest('hex'), archiveBytes: compressed.length,
    archiveHash: createHash('sha256').update(compressed).digest('hex'), roundTripEqual: true,
    scope: 'Exact complete-app producer archived without trimming inherited source whitespace' };
  await fs.writeFile(new URL('./fresh-cache-factory-archive.json', import.meta.url), JSON.stringify(archive, null, 2) + '\n');
  console.log(JSON.stringify(archive));
}
