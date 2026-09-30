import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildRecoveryBackupFactory} from '../v2-state-recovery-backup/build-browser-factory.mjs';
import {freshCacheRuntime} from '../v2-state-normal-sync/fresh-cache-runtime.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const read=p=>fs.readFile(new URL('../../'+p,import.meta.url),'utf8');
const put=(p,s)=>fs.writeFile(new URL(p,import.meta.url),s);
const APP_HASH='2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377',PIN='944f00607cf05e586b1c88e2876dd796ce114e82';
export async function build(){
 const app=await read('app.js');if(hash(app)!==APP_HASH)throw Error('APP28_HASH');
 const proof=JSON.parse(await read('qa/rc28-resume-20261001/current-source-proof.json'));if(proof.source!==PIN||!proof.sourcePinned)throw Error('SOURCE_PROOF');
 const adapter=await fs.readFile(new URL('./read-adapter.function.js',import.meta.url),'utf8');
 const proofGuard=`swProof.get()?.controller === owner.controller && swProof.get()?.version === APP_VERSION && swProof.get()?.sourceCommit === '${PIN}' && swProof.get()?.sourceSHA256?.['app.js'] === '${APP_HASH}'`;
 let capture=await read('qa/v2-state-recovery-backup/runtime-facade.function.js');
 capture=capture.replace("APP_VERSION === '1.22.0-rc.10'", "APP_VERSION === '1.22.0-rc.28'")
 .replace("swProof.get()?.version === APP_VERSION",proofGuard)
 .replace('writerId: state.accountStateWriterId,','writerId: state.accountStateWriterId, stateRevision: state.accountStateRevision,')
 .replace('&& !state.accountStateSyncPromise','&& !state.accountStateLoadingPromise && !state.accountStateSyncTimer && !state.accountStateSyncRetryTimer && !state.accountStateSyncError && hasAuthCapability(\'appData\') && !state.accountStateSyncPromise')
 .replace('&& state.accountStateWriterId === owner.writerId && idle()', '&& state.accountStateWriterId === owner.writerId && state.accountStateRevision === owner.stateRevision && idle()');
 const a=capture.indexOf('  let nativeDispatches = 0;'),b=capture.indexOf('  let handle;',a);
 capture=capture.slice(0,a)+`  const adapter=(${adapter})(current, rootAbort.signal, []);\n  const read=adapter.read;\n`+capture.slice(b);
 capture=capture.replace("evidence: { projectClientBinding: 'unknown' }", "limits: {milliseconds: 30000,requests: 80,bytes: 8*1024*1024,files: 64,pages: 16}, evidence: { projectClientBinding: 'unknown' }")
 .replace('done, nativeDispatches, summary:', 'done, nativeDispatches: adapter.summary().requests, transport: adapter.summary(), summary:')
 .replace('privateText: () => handle.readPrivateText(),','privateText: () => handle.readPrivateText(),\n    privateEnvelope: () => handle.readPrivatePayload(),');
 let fresh=await read('qa/v2-state-normal-sync/fresh-cache-facade.function.js');
 fresh=fresh.replace('allowedFileIds, budgetMs)', 'allowedFileIds, budgetMs, swProof)')
 .replace("APP_VERSION === '1.22.0-rc.11'", "APP_VERSION === '1.22.0-rc.28'")
 .replace("runtime: APP_VERSION", `sourceProof: ${proofGuard},\n      capability: hasAuthCapability('appData'),\n      runtime: APP_VERSION`);
 const fa=fresh.indexOf('  let nativeGets = 0;'),fb=fresh.indexOf('  let job;',fa);
 fresh=fresh.slice(0,fa)+`  const adapter=(${adapter})(current, aborter.signal, allowedFileIds);\n  const read=adapter.read;\n`+fresh.slice(fb);
 fresh=fresh.replace('nativeGets, ownerCurrent:', 'nativeGets: adapter.summary().requests, transport: adapter.summary(), ownerCurrent:');
 // Exact complete app remains untouched; only QA-owned shadow state is initialized.
 const factory=`function(deps){'use strict';const runtime=${freshCacheRuntime.toString()};return runtime(function(shadow){const {globalThis,window,document,navigator,location,history,localStorage,fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,console}=shadow;const self=window,top=window;\n${app}\nstate.token='synthetic-shadow-read-only';state.expiresAt=Date.now()+3600000;state.authStatus='online';state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:true};state.accountStateWriterId='fresh-cache-read-only-context';return {initialize:()=>initializeAccountMediaState(),loaded:()=>state.accountStateLoaded,failed:()=>Boolean(state.accountStateSyncError),accountId:()=>state.accountId,projection:()=>JSON.parse(JSON.stringify(state.accountMediaState)),equal:accountMediaStatesEqual,validate:value=>validateRawAccountMediaState(value)};},deps,{appHash:'${APP_HASH}'});}`;
 const backup=await buildRecoveryBackupFactory();
 const outputs={'capture-facade.function.js':capture,'fresh-facade.function.js':fresh,'fresh-factory.generated.js':factory,'backup-factory.expression.js':backup};
 for(const [p,s] of Object.entries(outputs))await put(p,s);
 const record={source:PIN,version:'1.22.0-rc.28',appSHA256:APP_HASH,exactCompleteAppEmbedded:factory.includes(app),actualRun:false,projectClientBindingVerified:false,sourceProofSHA256:hash(await read('qa/rc28-resume-20261001/current-source-proof.json')),outputs:Object.entries(outputs).map(([path,text])=>({path,sha256:hash(text),bytes:Buffer.byteLength(text)})),reuse:['Maintained raw snapshot/backup validation and comparator bundled unchanged','Maintained freshCacheRuntime unchanged','Facades adapted for exact28 source/capability/revision and bounded canonical read only; no live readRemote cache mutation']};
 await put('build.json',JSON.stringify(record,null,2)+'\n');return {app,factory,capture,fresh,record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify((await build()).record));
