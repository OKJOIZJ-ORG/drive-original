'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('../../worker/node_modules/esbuild');
const dir = __dirname;
const app = fs.readFileSync(path.join(dir, '../../app.js'), 'utf8');
function section(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  if (a < 0 || b < a) throw new Error('Canonical source boundary missing');
  return app.slice(a, b);
}
const canonical = section("const DRIVE_MUTATION_PREFIX =", 'function summarizeDriveMutationFailures(');
const resourceKeys = section('function buildResourceKeysHeader(', '\nconst state =');
const normalized = section('function normalizedDriveId(', '\nfunction getMoveBlockReason(');
const factory = fs.readFileSync(path.join(dir, 'runner.js'), 'utf8');
// Only the QA ledger prefix changes. Every controller function is byte-identical.
const controller = canonical.replace("'drive-original.mutation.v1.'", 'env.prefix + "controller."');
const source = factory.replace('/* CANONICAL_CONTROLLER */', `${resourceKeys}\n${normalized}\n${controller}`);
const hash = crypto.createHash('sha256').update(canonical).digest('hex');
const entry = `(() => { ${source}\nconst sourceHash=${JSON.stringify(hash)};\nconst read=()=>({accountId:state.accountId,authAccountKey:state.authAccountKey,authGeneration:state.authGeneration,driveSessionGeneration:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,identityPending:state.accountIdentityPending,demo:state.demo,accountSignal:state.accountStateAbortController?.signal,sw:navigator.serviceWorker.controller,productWrites:DRIVE_MUTATIONS_ENABLED,connected:state.authStatus==='online',usable:hasUsableToken(),idle:!state.selected&&!playerMediaPriorityActive&&!q1Playback&&q1RetirementResult?.settled===true});\nreturn Object.freeze({sourceHash,start:(options={})=>createDisposableJob({read,fetch:(url,options)=>fetch(url,options),storage:localStorage,navigator, lifecycle:window},options)});})()`;
module.exports={source:source+'\n;createDisposableJob;',canonical,hash};
if(require.main===module) {
  fs.writeFileSync(path.join(dir, 'browser-expression.js'), esbuild.transformSync(entry, {minify:true,target:'es2022'}).code);
  process.stdout.write(JSON.stringify({canonicalSHA256:hash, publicBytes:fs.statSync(path.join(dir,'browser-expression.js')).size})+'\n');
}
