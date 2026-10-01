import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {verifyInputs as verifyFormat} from '../rc32-format-acceptance/build.mjs';
import {verifyInputs as verifyPrefix} from '../rc32-prefix-recovery-preparation/build.mjs';
const base=new URL('./',import.meta.url),root=new URL('../../',base),hash=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/\r\n?/g,'\n').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'').replace(/^export\s+/gm,'');
export const COMMIT='1d79897fd32c569137cab079bfd93107be2ee33f';
const get=p=>readFile(new URL(p,base),'utf8');
export async function build(){
 await verifyFormat();await verifyPrefix();
 const binding=JSON.parse(await get('../rc32-format-acceptance/binding.json'));
 if(binding.sourceCommit!==COMMIT||binding.version!=='1.22.0-rc.32')throw Error('EXACT_RC32_REQUIRED');
 for(const p of ['app.js','sw.js','version.json'])if(hash(execFileSync('git',['show',COMMIT+':'+p],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024}))!==binding.sourceSHA256[p])throw Error('SOURCE_HASH_DRIFT');
 const parts=[
  ['root','../v2-07a-root-inventory/root-inventory.mjs','collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow',''],
  ['inventory','../v2-07a-root-inventory/drive-browser-adapter.mjs','runAuthenticatedRootInventory','const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=root;'],
  ['selector','../v2-07a-representative-selection/representative-selector.mjs','selectRiskRepresentatives',''],
  ['bounded','../v2-07a-bounded-probe/bounded-probe.mjs','runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES',''],
  ['denominators','../rc21-corpus-night/inventory-denominators.mjs','summarizeInventoryDenominators',''],
  ['normalizers','../rc31-corpus-content-continuity/inventory-normalizers.mjs','stableItemRow',''],
  ['scanner','../v2-07a-isobmff-index/isobmff-index.mjs','scanIsoBmffTopLevel',''],
  ['parser','../v2-07a-iso-tracks-rc11/parser.mjs','parseMoov',''],
  ['readCache','../rc21-corpus-night/metadata-read-cache.mjs','createMetadataReadCache',''],
  ['sparse','../rc21-corpus-night/sparse-moov.mjs','readSparseMoov','const {createMetadataReadCache}=readCache;'],
  ['ebml','../rc16-corpus-tracks/ebml-tracks.mjs','readEbmlTracks',''],
  ['windows','../rc31-deeper-coalesced-probe/moov-window-cache.mjs','createMoovWindowCache',''],
  ['tsParser','../v2-07a-container-probe/mpeg-ts-probe.mjs','probeMpegTs',''],
  ['continuity','continuity.mjs','readHeaderState,createHeaderContinuity,clearHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE,EPOCH',''],
  ['selection','selection.mjs','collectHeaderCandidates,planHeaderCohort','const {stableItemRow}=normalizers;const {normalizeProbeIdentity}=bounded;const {identitySame,RETRYABLE}=continuity;'],
  ['classification','classify.mjs','classifyBounded,configurationKey,imageHeader,safeIso,safeTs','const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {createMoovWindowCache}=windows;const {probeMpegTs}=tsParser;'],
  ['probe','probe.mjs','createCorpusOwnerJob,bindingPinned','const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {summarizeInventoryDenominators}=denominators;const {collectHeaderCandidates,planHeaderCohort}=selection;const {readHeaderState,createHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE,EPOCH}=continuity;const {classifyBounded,configurationKey}=classification;']
 ];
 const sources=await Promise.all(parts.map(([,p])=>get(p)));
 const tsIndex=parts.findIndex(x=>x[0]==='tsParser');if(hash(sources[tsIndex])!==hash(execFileSync('git',['show',COMMIT+':qa/v2-07a-container-probe/mpeg-ts-probe.mjs'],{cwd:fileURLToPath(root),maxBuffer:4*1024*1024})))throw Error('IMMUTABLE_RC32_TS_PARSER_REQUIRED');
 let facade=await get('../rc31-corpus-content-continuity/facade.function.js');
 facade=facade.replace("!['phase','maxFiles'].includes(k)","!['phase','maxFiles','recoveryCycle'].includes(k)");
 // Keep the frozen full owner/projection/auth/controller fence. Only add Boolean failure discrimination and recovery stamp plumbing.
 const diagnostic=`()=>({accountChanged:state.accountId!==owner.account,accountKeyChanged:state.authAccountKey!==owner.key,authGenerationChanged:state.authGeneration!==owner.auth,driveGenerationChanged:state.driveSessionGeneration!==owner.drive,tokenChanged:state.token!==owner.token,tokenRevisionChanged:state.tokenRevision!==owner.tokenRevision,expiryChanged:state.expiresAt!==owner.expiry,abortChanged:state.accountStateAbortController!==owner.abort||Boolean(owner.abort?.signal.aborted),controllerChanged:navigator.serviceWorker.controller!==owner.controller,writerChanged:state.accountStateWriterId!==owner.writer,revisionChanged:state.accountStateRevision!==owner.revision,projectionChanged:!accountMediaStatesEqual(state.accountMediaState,projection),syncPromiseActive:state.accountStateSyncPromise!==null,syncTimerActive:state.accountStateSyncTimer!==null,syncRetryActive:state.accountStateSyncRetryTimer!==null,syncErrorPresent:state.accountStateSyncError!==null,sourceChanged:mediaSourceGeneration!==owner.source,mediaChanged:state.mediaSession!==owner.media,playbackChanged:state.playbackSession!==owner.playback,retirementChanged:q1RetirementResult!==owner.retirement,visibilityChanged:document.visibilityState!=='visible',onlineChanged:navigator.onLine!==true})`;
 facade=facade.replace('getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,','getOwnerDiagnostics:'+diagnostic+',getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,');
 const runner=await get('runner.function.js');
 const modules=parts.map(([name,,exports,imports],i)=>`const ${name}=(()=>{${imports}\n${strip(sources[i])}\nreturn {${exports}};})();`).join('\n');
 const expression=`(()=>{'use strict';const __BINDING__=${JSON.stringify(binding)};\n${modules}\nconst create=runtime=>probe.createCorpusOwnerJob(runtime,{binding:__BINDING__});create.clearContinuity=continuity.clearHeaderContinuity;return (${runner.trim()})(create,(${facade.trim()}),__BINDING__);})()\n`;
 new vm.Script(expression);
 const proof=await get('../rc32-format-acceptance/sw-proof.expression.js'),context=await get('../rc32-format-acceptance/derive-context.expression.js');
 const provenance={schema:'drive-original.rc32-corpus-owner-epoch-build/1',binding,producerSHA256:Object.fromEntries([...parts.map(([,p],i)=>[p,hash(sources[i])]),['runner.function.js',hash(runner)],['build.mjs',hash(await get('build.mjs'))]]),frozenFacadeSHA256:hash(await get('../rc31-corpus-content-continuity/facade.function.js')),expressionSHA256:hash(expression),expressionBytes:Buffer.byteLength(expression),proofSHA256:hash(proof),contextSHA256:hash(context),newEpoch:'rc32-bounded-container-config-image-owner-epoch-20261001-1',historicalCrossEpochAttempts:'UNKNOWN',historicalResultsImported:false,parserReaderUnchanged:true,maxFreshAttemptsPerFile:1,recovery:'explicit same evaluated registry; same account/key/drive/controller/writer/source/href; all consumed strong tuples requalified in bounded serial jobs; missing baseline or changed identity terminal',actualRequests:0,actualExecution:false,wholeCorpusComplete:false};
 return {expression,proof,context,provenance};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await build();await writeFile(new URL('installer.expression.js',base),r.expression);await writeFile(new URL('provenance.json',base),JSON.stringify(r.provenance,null,2)+'\n');console.log(JSON.stringify(r.provenance));}
