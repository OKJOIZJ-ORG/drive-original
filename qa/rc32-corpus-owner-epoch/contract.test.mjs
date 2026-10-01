import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fixture,binding} from '../rc32-prefix-recovery-preparation/fixture.mjs';
import {createCorpusOwnerJob,ORIGIN,CAPS} from './probe.mjs';
import {readHeaderState,EPOCH,createHeaderContinuity,CONTINUITY_LIMIT} from './continuity.mjs';
import {classifyBounded,imageHeader} from './classify.mjs';
import {sniffMagic} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {build} from './build.mjs';
import {runStrongInventory,compareStrongInventories,STRONG_FIELDS,hasStrong} from './strong-inventory.mjs';
import {box,cat} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
import {buildPriorityLikeH264AacTs,makeNullPacket,concatBytes} from '../v2-07a-container-probe/synthetic-mpeg-ts-fixtures.mjs';
const source=await build();
function currentFixture(count=3){
 const f=fixture(count);f.runtime.options={phase:'videos',maxFiles:64};delete f.dependencies.inventoryRunner;delete f.dependencies.compareInventory;
 const original=f.runtime.nativeFetch;
 f.runtime.nativeFetch=async(v,o)=>{const url=new URL(v);if(url.origin!==ORIGIN){if(url.pathname.endsWith('/files')){f.calls.push({url,init:o});return Response.json({files:f.files.map(row=>({...row,data:undefined})),incompleteSearch:false});}if(url.pathname.endsWith('/'+f.context.rootId)){f.calls.push({url,init:o});return Response.json(f.pass.rootBefore);}return original(v,o);}f.calls.push({url,init:o});const row=f.files.find(x=>url.pathname.endsWith('/'+x.id));const m=/^bytes=(\d+)-(\d+)$/.exec(o.headers.Range);assert(m);const a=Number(m[1]),b=Number(m[2]);assert(a>0||b<row.data.length-1,'no whole media GET');return new Response(row.data.subarray(a,b+1),{status:206,headers:{'Content-Range':`bytes ${a}-${b}/${row.size}`,'Content-Length':String(b-a+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'}});};
 f.make=()=>createCorpusOwnerJob(f.runtime,f.dependencies);return f;
}
const adopt=(f,j,options={phase:'videos',maxFiles:64})=>{f.runtime.priorCapsule=j.continuity();f.runtime.options=options;};
function png(){const b=Buffer.alloc(1200);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(640,16);b.writeUInt32BE(360,20);b[24]=8;b[25]=6;return b;}
test('bounded real ISO parser extracts actual avc/AAC configurations and carries one-attempt records without replay',async()=>{
 const f=currentFixture();for(const row of f.files){row.data=cat(row.data.subarray(0,16),box('free',Buffer.alloc(2000)),row.data.subarray(16));row.size=String(row.data.length);}const j=f.make(),s=await j.run();assert.equal(s.complete,true,JSON.stringify(s));assert.equal(s.catalogStable,true);assert.equal(s.coverage.classified,3);assert.equal(s.coverage.configurationRepresentatives.length,1);assert.equal(s.files[0].tracks.tracks[0].descriptions[0].avcProfile,100);assert.equal(s.files[0].tracks.tracks[1].descriptions[0].aacObjectType,2);assert(s.mediaRequests>3);assert(s.mediaBytes>3*940);assert.equal(s.coverage.maxFreshAttemptsPerFile,1);assert(!JSON.stringify(s).includes('PRIVATE_'));
 adopt(f,j);const q=f.make(),r=await q.run();assert.equal(r.mediaRequests,0);assert.equal(r.coverage.classified,3);assert.equal(r.coverage.ledgerEntries,3);assert.equal(readHeaderState(q.continuity(),f.context,binding).attempts[0].count,1);
});
test('true MIME-or-extension union includes images and TS names with nonvideo MIME; unsupported structural scope remains unknown',async()=>{
 const f=currentFixture(3);Object.assign(f.files[1],{mimeType:'application/octet-stream',name:'PRIVATE_NAME.ts',fullFileExtension:'ts',data:Buffer.alloc(1200)});f.files[1].data[0]=f.files[1].data[188]=0x47;f.files[1].size='1200';Object.assign(f.files[2],{mimeType:'image/png',name:'PRIVATE_NAME.png',fullFileExtension:'png',data:png(),size:'1200'});
 const s=await f.make().run();assert.equal(s.complete,true,JSON.stringify(s));assert.deepEqual([s.coverage.denominator,s.coverage.videoMimeOrExtensionUnion,s.coverage.imageMimeOrExtensionUnion,s.coverage.classified,s.coverage.unknown],[3,2,1,2,1]);assert.equal(s.files[1].reason,'TS_TRACK_CONFIG_UNQUALIFIED');assert.equal(s.files[1].tracks.status,'incomplete');assert.equal(s.files[2].image.width,640);assert.equal(s.coverage.structuralClassificationComplete,false);
});
test('fatal owner drift preserves consumed immutable baseline and quarantines partial body observations; explicit strong recovery makes no new media GET',async()=>{
 const f=currentFixture(4),original=f.runtime.nativeFetch;let drift=false;
 f.runtime.nativeFetch=async(v,o)=>{const r=await original(v,o);if(new URL(v).origin===ORIGIN&&!drift){drift=true;f.state.tokenRevision++;}return r;};
 const first=f.make(),s=await first.run();assert.equal(s.complete,false);assert.equal(s.released,true);const saved=readHeaderState(first.continuity(),f.context,binding);assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].count,1);assert(saved.attempts[0].content);assert.equal(s.coverage.ledgerEntries,1);assert.equal(s.coverage.unattempted,3);
 f.runtime.nativeFetch=original;adopt(f,first,{phase:'revalidate-videos',maxFiles:64,recoveryCycle:1});const recovery=f.make(),r=await recovery.run();assert.equal(r.complete,true,JSON.stringify(r));assert.equal(r.recoveryQualified,true);assert.equal(r.mediaRequests,0);adopt(f,recovery);const next=f.make(),n=await next.run();assert.equal(n.coverage.ledgerEntries,4);assert.equal(n.coverage.failed,1);assert.equal(n.coverage.classified,3);assert(n.files.every(x=>x.sample!=='sample-0'));const ledger=readHeaderState(next.continuity(),f.context,binding);assert(ledger.attempts.every(x=>x.count===1));
});
test('missing immutable preflight baseline, changed strong tuple, safe JSON handle import and changed source fail closed',async()=>{
 const f=currentFixture(2),original=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{if(new URL(v).pathname.endsWith('/'+f.files[0].id)&&new URL(v).origin!==ORIGIN&&new URL(v).searchParams.get('fields')!==STRONG_FIELDS){f.state.tokenRevision++;throw Error('SYNTHETIC_DRIFT');}return original(v,o);};
 const j=f.make();await j.run();assert.equal(readHeaderState(j.continuity(),f.context,binding).attempts[0].content,null);f.runtime.nativeFetch=original;adopt(f,j,{phase:'revalidate-videos',maxFiles:64,recoveryCycle:1});const r=await f.make().run();assert.equal(r.failure,'RECOVERY_UNSAFE');assert.equal(r.mediaRequests,0);
 assert.throws(()=>readHeaderState(JSON.parse(JSON.stringify(j.continuity())),f.context,binding),/CONTINUITY_REJECTED/);
 const g=currentFixture(2),q=g.make();await q.run();g.files[0].headRevisionId='CHANGED_REV';adopt(g,q,{phase:'revalidate-videos',maxFiles:64,recoveryCycle:1});assert.equal((await g.make().run()).failure,'CONTINUITY_CONTENT_CHANGED');g.dependencies.binding={...binding,sourceCommit:'0'.repeat(40)};assert.equal((await g.make().run()).failure,'SOURCE_BINDING_REJECTED');
});
test('scale recovery qualifies every consumed tuple through complete strong inventory without per-record head replay',async()=>{
 const f=currentFixture(65);const identity=row=>({accountKey:f.state.authAccountKey,fileId:row.id,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
 f.runtime.priorCapsule=createHeaderContinuity(f.context,binding,[],f.files.map(x=>({identity:identity(x),content:{headRevisionId:x.headRevisionId,sha256Checksum:x.sha256Checksum,resourceKey:null},count:1,failure:'HEADER_TIMEOUT'})));f.runtime.options={phase:'revalidate-videos',maxFiles:64,recoveryCycle:1};
 const j=f.make(),s=await j.run();assert.equal(s.complete,true,JSON.stringify(s));assert.equal(s.recoveryQualified,true);assert.equal(s.recoveryRemaining,0);assert.equal(s.mediaRequests,0);assert.equal(s.strongCarry.inventoryQualified,65);assert.equal(s.strongCarry.fallbackHeads,0);assert(s.metadataRequests<32);assert.equal(s.coverage.failed,65);assert.equal(s.coverage.unattempted,0);
});
test('corpus jobs cap at 64 files in eight serial subbatches; omitted candidates keep truthful unattempted denominator',async()=>{
 const f=currentFixture(65),j=f.make(),s=await j.run();assert.equal(s.files.length,64);assert.equal(s.batches.length,8);assert(s.batches.every(x=>x.planned===8&&x.attempted===8));assert.deepEqual([s.coverage.denominator,s.coverage.classified,s.coverage.unattempted],[65,64,1]);assert(s.metadataRequests<=160);assert(s.metadataBytes<=67108864);
 adopt(f,j);const r=await f.make().run();assert.equal(r.files.length,1);assert.equal(r.coverage.classified,65);assert.equal(r.coverage.unattempted,0);assert.equal(r.coverage.ledgerEntries,65);
});
test('range/body mismatch consumes once, preserves failed denominator, and never resets exhaustion',async()=>{
 const f=currentFixture(2),original=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>new URL(v).origin===ORIGIN?new Response(new Uint8Array(1),{status:206,headers:{'Content-Range':'bytes 0-939/1','Content-Length':'1','Accept-Ranges':'bytes','Cache-Control':'no-store'}}):original(v,o);
 const j=f.make(),s=await j.run();assert.equal(s.coverage.failed,2);adopt(f,j);const r=await f.make().run();assert.equal(r.mediaRequests,0);assert.equal(r.coverage.failed,2);assert.equal(r.coverage.queuedFresh,0);assert.equal(r.coverage.maxFreshAttemptsPerFile,1);
});
test('focused image headers parse PNG/JPEG/GIF/WebP/BMP without decode and never infer rotation/animation absence',async()=>{
 assert.equal(imageHeader('png',png()).width,640);const gif=Buffer.alloc(13);gif.write('GIF89a');gif.writeUInt16LE(7,6);gif.writeUInt16LE(9,8);assert.equal(imageHeader('gif',gif).animationKnown,false);
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,9,0,7,3,1,2,3]);assert.equal(imageHeader('jpeg',jpeg).height,9);
 const webp=Buffer.alloc(30);webp.write('RIFF');webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp[20]=2;webp[24]=6;webp[27]=8;assert.deepEqual([imageHeader('webp',webp).width,imageHeader('webp',webp).animated],[7,true]);
 const bmp=Buffer.alloc(54);bmp.write('BM');bmp.writeUInt32LE(40,14);bmp.writeInt32LE(7,18);bmp.writeInt32LE(-9,22);bmp.writeUInt16LE(24,28);assert.equal(imageHeader('bmp',bmp).height,9);
 assert.equal(imageHeader('png',new Uint8Array(10)).status,'incomplete');
});
test('bounded immutable TS parser observes PMT/H264 SPS/AAC ADTS config; missing elementary config and broken PSI never become known codec union',async()=>{
 const bytes=concatBytes(buildPriorityLikeH264AacTs(),makeNullPacket(),makeNullPacket());
 const calls=[];const classify=b=>classifyBounded({size:b.length,sniffMagic,read:async({start,end})=>{calls.push([start,end]);assert(start>0||end<b.length-1);assert(end-start+1<=1024*1024);return new Uint8Array(b.slice(start,end+1));}});
 const known=await classify(bytes);assert.equal(known.classification,'video-structural',JSON.stringify(known));assert.deepEqual(known.tracks.tracks.map(t=>t.codec),['h264','aac']);assert.equal(known.tracks.tracks[0].profileIdc,100);assert.equal(known.tracks.tracks[0].width,1280);assert.equal(known.tracks.tracks[0].color.primariesCode,1);assert.equal(known.tracks.tracks[1].aacObjectType,2);assert.equal(known.tracks.codecConfigOutsideSample,'unknown');
 const absent=concatBytes(buildPriorityLikeH264AacTs({includeElementaryHeaders:false}),makeNullPacket(),makeNullPacket());assert.equal((await classify(absent)).classification,'unknown');
 const broken=new Uint8Array(bytes);const p=188+4+((broken[191]&32)?1+broken[192]:0);broken[p+1+broken[p]+6]^=1;assert.equal((await classify(broken)).classification,'unknown');assert(calls.length>0);
});
test('maintained EBML reader parses real VP9/Opus fixture tracks with private config presence kept explicitly unparsed',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('../rc16-corpus-tracks/fixtures/synthetic-vp9-opus.webm',import.meta.url)));
 const out=await classifyBounded({size:bytes.length,sniffMagic,read:async({start,end})=>{assert(start>0||end<bytes.length-1);return bytes.slice(start,end+1);}});
 assert.equal(out.classification,'video-structural',JSON.stringify(out));assert.deepEqual(out.tracks.tracks.map(t=>t.codec),['vp9','opus']);assert(out.tracks.limitations.includes('codec-private-unparsed'));
});
function syntheticSandbox(){
 const f=currentFixture(3),s=f.state,self={},timers=new Map();let next=0;
 Object.assign(s,{accountMediaState:{liked:[]},accountStateWriterId:'PRIVATE_WRITER',accountStateRevision:1,accountStateLoaded:true,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,playbackSession:3});
 const sandbox={state:s,APP_VERSION:binding.version,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,navigator:f.runtime.navigator,location:f.runtime.location,document:f.runtime.document,top:self,self,q1RetirementResult:f.runtime.getQ1RetirementResult(),q1Playback:null,mediaSourceGeneration:5,playerMediaPriorityActive:false,hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{addEventListener(){},removeEventListener(){}},URL,Headers,TextDecoder,Uint8Array,AbortController,DOMException,performance,Date,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),fetch:async(v,o)=>{const url=new URL(v);if(url.origin!==ORIGIN){if(url.pathname.endsWith('/files'))return Response.json({files:f.files.map(row=>({...row,data:undefined})),incompleteSearch:false});if(url.pathname.endsWith('/'+f.context.rootId))return Response.json(f.pass.rootBefore);}return f.runtime.nativeFetch(v,o);}};
 const install=vm.runInNewContext(source.expression,sandbox),proof={get:()=>({...binding,controller:f.runtime.navigator.serviceWorker.controller})},context=JSON.stringify({accountKey:s.accountId,generation:s.driveSessionGeneration,rootId:f.context.rootId,priorityFileId:f.context.priorityFileId});
 const runner=install(context,proof,EPOCH),opts=()=>({maxJobs:1,deadlineMs:10000,stopBeforeAt:Date.now()+11000});
 async function settle(){for(let n=0;n<400&&runner.read().active;n++){await new Promise(r=>setImmediate(r));for(const [id,t]of [...timers])if(t.ms===100){timers.delete(id);t.fn();}}assert.equal(runner.read().active,false);return runner.read();}
 return {...f,sandbox,install,proof,context,runner,opts,settle,timers};
}
test('generated installer runs maintained real inventory/facade; Boolean projection drift diagnostics and explicit same-registry recovery preserve consumed attempt',async()=>{
 const f=syntheticSandbox(),original=f.runtime.nativeFetch;let changed=false;
 f.runtime.nativeFetch=async(v,o)=>{const r=await original(v,o);if(new URL(v).origin===ORIGIN&&!changed){changed=true;f.state.accountMediaState.liked.push('PRIVATE_VALUE');f.state.accountStateRevision++;}return r;};
 f.runner.start(f.opts());const first=await f.settle();assert.equal(first.stopped,'OWNER_CHANGED',JSON.stringify(first));const diag=first.jobs[0].summary.ownerDiagnostic;assert.equal(diag.projectionChanged,true);assert.equal(diag.revisionChanged,true);assert(Object.values(diag).every(x=>typeof x==='boolean'));assert(!JSON.stringify(first).includes('PRIVATE_'));
 assert.throws(()=>f.runner.start(f.opts()),/EXPLICIT_RECOVERY_REQUIRED/);f.runtime.nativeFetch=original;f.runner.recover(f.opts());const recovered=await f.settle();assert.equal(recovered.needsRecovery,false,JSON.stringify(recovered));assert.equal(recovered.jobs[1].summary.mediaRequests,0);f.runner.start(f.opts());const done=await f.settle();assert.equal(done.jobs[2].summary.coverage.ledgerEntries,3);assert.equal(done.jobs[2].summary.coverage.failed,1);assert(!JSON.stringify(done).includes('PRIVATE_'));f.runner.cleanup();assert.equal(f.runner.read().disposed,true);assert.equal(f.timers.size,0);assert.throws(()=>f.install(f.context,f.proof,EPOCH),/EPOCH_ALREADY_ALLOCATED_NO_RESET/);
});
test('generated facade records visibility loss as a Boolean owner cause while account/auth/projection remain unchanged',async()=>{
 const f=syntheticSandbox(),original=f.runtime.nativeFetch;let hidden=false;f.runtime.nativeFetch=async(v,o)=>{const r=await original(v,o);if(new URL(v).origin===ORIGIN&&!hidden){hidden=true;f.runtime.document.visibilityState='hidden';}return r;};f.runner.start(f.opts());const s=await f.settle();assert.equal(s.stopped,'OWNER_CHANGED');assert.equal(s.burst.done,true);const d=s.jobs[0].summary.ownerDiagnostic;assert.equal(d.visibilityChanged,true);assert.equal(d.projectionChanged,false);assert.equal(d.authGenerationChanged,false);assert.equal(s.jobs[0].summary.coverage.quarantinedConsumedAttempts,1);f.runtime.document.visibilityState='visible';f.runner.cleanup();
});
test('runner-first cancellation of pending Range retains Boolean drift witness, safe live progress and explicit recovery after inner CANCELLED',async()=>{
 const f=syntheticSandbox(),original=f.runtime.nativeFetch;let release=null;
 f.runtime.nativeFetch=async(v,o)=>{if(new URL(v).origin===ORIGIN)await new Promise(r=>{release=r;});return original(v,o);};
 f.runner.start(f.opts());for(let n=0;n<400&&!release;n++)await new Promise(r=>setImmediate(r));assert(release);
 const p=f.runner.read().progress;assert.deepEqual(Object.keys(p).sort(),['done','mediaBytes','mediaRequests','metadataBytes','metadataRequests','phase','processed','started']);assert.equal(p.started,true);assert.equal(p.done,false);assert.equal(p.phase,'structural-and-image-headers');assert.equal(p.mediaRequests,1);assert.equal(p.processed,0);assert(p.metadataRequests>0);assert(!JSON.stringify(p).includes('PRIVATE_'));
 f.state.accountMediaState.liked.push('PRIVATE_CHANGED');f.state.accountStateRevision++;f.runtime.document.visibilityState='hidden';
 // Fire only the runner's 100ms tick while transport is unresolved. No facade request/current check gets to fail first.
 const scheduled=[...f.timers].find(([,t])=>t.ms===100);assert(scheduled);f.timers.delete(scheduled[0]);scheduled[1].fn();release();
 const stopped=await f.settle();assert.equal(stopped.stopped,'OWNER_CHANGED');assert.equal(stopped.burst.done,true);assert.equal(stopped.jobs[0].summary.failure,'CANCELLED');const d=stopped.jobs[0].summary.ownerDiagnostic;assert.equal(d.projectionChanged,true);assert.equal(d.revisionChanged,true);assert.equal(d.visibilityChanged,true);assert(Object.values(d).every(x=>typeof x==='boolean'));assert.equal(stopped.jobs[0].summary.coverage.quarantinedConsumedAttempts,1);assert.equal(stopped.progress,null);
 f.runtime.nativeFetch=original;f.runtime.document.visibilityState='visible';f.runner.recover(f.opts());const recovered=await f.settle();assert.equal(recovered.needsRecovery,false);assert.equal(recovered.jobs[1].summary.mediaRequests,0);f.runner.cleanup();assert.equal(f.runner.read().disposed,true);
});
test('runner requires explicit finite burst and root deadline; changed controller/drive cannot recover',async()=>{
 const f=syntheticSandbox();assert.throws(()=>f.runner.start({...f.opts(),maxJobs:9}),/BURST_OPTIONS/);assert.throws(()=>f.runner.start({...f.opts(),stopBeforeAt:0}),/BURST_OPTIONS/);f.runner.start(f.opts());await f.settle();f.state.driveSessionGeneration++;f.runner.start(f.opts());assert.equal(f.runner.read().stopped,'OWNER_CHANGED');assert.throws(()=>f.runner.recover(f.opts()),/RECOVERY_STABLE_IDENTITY_REJECTED/);f.runner.cleanup();assert.equal(CAPS.metadataRequests,512);assert.equal(CAPS.runMs,600000);assert.equal(CAPS.mediaBytes,2*1024*1024+8192);
});
test('deterministic builder preserves immutable RC32 source and frozen parser/reader source hashes',async()=>{
 const again=await build();assert.equal(again.expression,source.expression);assert.equal(again.provenance.actualExecution,false);assert.equal(again.provenance.maxFreshAttemptsPerFile,1);assert.equal(again.provenance.producerSHA256['../v2-07a-iso-tracks-rc11/parser.mjs'],'9a620a12b9d1080c78aaec30cb8709fa130729c8ae38192508d9b27d9393e5f2');assert.equal(again.provenance.producerSHA256['../rc16-corpus-tracks/ebml-tracks.mjs'],'0a38c154d7f08229ef5f981af09f1d9aba821169f5bceeba6b751cadee2b3b61');
});
test('finite registry covers the actual >8192 image/video inventory and rejects beyond 16384 without any reset',()=>{
 const f=currentFixture(1),row=f.files[0],identity={accountKey:f.state.authAccountKey,fileId:row.id,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true};
 const attempts=Array.from({length:8596},(_,i)=>({identity:{...identity,fileId:'SYNTHETIC_'+i},content:{headRevisionId:'SYNTHETIC_REV',sha256Checksum:'e'.repeat(64)},count:1,failure:'HEADER_TIMEOUT'}));
 const handle=createHeaderContinuity(f.context,binding,[],attempts);assert.equal(readHeaderState(handle,f.context,binding).attempts.length,8596);assert.equal(CONTINUITY_LIMIT,16384);
 assert.throws(()=>createHeaderContinuity(f.context,binding,[],Array.from({length:16385},(_,i)=>({...attempts[0],identity:{...identity,fileId:'SYNTHETIC_'+i}}))),/CONTINUITY_LIMIT/);
});

test('strong wrapper captures full raw list/root/priority/shortcut routes, rejects duplicate conflicts and preserves swallowed errors',async()=>{
 const f=currentFixture(2),target={...f.files[1],resourceKey:'SYNTHETIC_KEY',data:undefined},shortcut={id:'SYNTHETIC_SHORTCUT',name:'shortcut',mimeType:'application/vnd.google-apps.shortcut',version:'1',modifiedTime:'synthetic',parents:[f.context.rootId],trashed:false,shortcutDetails:{targetId:target.id,targetMimeType:target.mimeType,targetResourceKey:target.resourceKey}};
 let targetReads=0,drift=false,duplicate=false,fieldChecks=0;
 const options={rootId:f.context.rootId,priorityFileId:f.context.priorityFileId,expectedAccountKey:f.state.accountId,driveFetch:async value=>{
  const u=new URL(value);if(u.pathname.endsWith('/about'))return Response.json({user:{permissionId:f.state.accountId}});
  const list=u.pathname.endsWith('/files');assert.equal(u.searchParams.get('fields'),list?`nextPageToken,incompleteSearch,files(${STRONG_FIELDS})`:STRONG_FIELDS);fieldChecks++;
  if(list){const rows=[{...f.files[0],data:undefined},shortcut];if(duplicate)rows.push({...rows[0],sha256Checksum:'a'.repeat(64)});return Response.json({files:rows,incompleteSearch:false});}
  if(u.pathname.endsWith('/'+f.context.rootId))return Response.json(f.pass.rootBefore);
  if(u.pathname.endsWith('/'+target.id)){targetReads++;return Response.json({...target,...(drift&&targetReads===2?{sha256Checksum:'b'.repeat(64)}:{})});}
  return Response.json({...f.files[0],data:undefined});
 }};
 const a=await runStrongInventory(options);assert.equal(a.strongInventory.uniqueRows,4);assert.equal(a.report.completeness.shortcutClassificationComplete,true);assert(fieldChecks>4);assert.equal(hasStrong(a.strongInventory.rows.get(target.id).tuple),true);
 target.sha256Checksum='c'.repeat(64);targetReads=0;const b=await runStrongInventory(options);assert.throws(()=>compareStrongInventories(a,b),/STRONG_CATALOG_DRIFT/);
 drift=true;targetReads=0;await assert.rejects(runStrongInventory(options),/STRONG_INVENTORY_CONFLICT/);drift=false;duplicate=true;await assert.rejects(runStrongInventory(options),/STRONG_INVENTORY_CONFLICT/);
 await assert.rejects(runStrongInventory(options,{inventoryRunner:async({driveFetch})=>{try{await(await driveFetch('https://www.googleapis.com/drive/v3/files')).json();}catch{}throw Error('wrapped');}}),/STRONG_INVENTORY_CONFLICT/);
});

test('normal carry rejects same-version strong hash/resource-key drift and deletion before counting or new media',async()=>{
 for(const change of [f=>{f.files[1].sha256Checksum='a'.repeat(64);},f=>{f.files[1].resourceKey='SYNTHETIC_KEY';},f=>{f.files.splice(1,1);}]){
  const f=currentFixture(3);delete f.dependencies.selector;const j=f.make();assert.equal((await j.run()).complete,true);change(f);adopt(f,j);const q=f.make(),s=await q.run();assert.equal(s.failure,'CONTINUITY_CONTENT_CHANGED');assert.equal(s.mediaRequests,0);assert.equal(s.coverage.classified,0);assert.equal(s.coverage.quarantinedConsumedAttempts,3);assert(readHeaderState(q.continuity(),f.context,binding).attempts.every(a=>a.count===1));
 }
});

test('missing list strong tuples use paired bounded heads; unavailable heads and >32 missing carry tuples stop honestly',async()=>{
 for(const [count,unavailable]of [[4,false],[4,true],[34,false]]){
  const f=currentFixture(count),j=f.make();assert.equal((await j.run()).complete,true);const original=f.runtime.nativeFetch;
  f.runtime.nativeFetch=async(v,o)=>{const u=new URL(v);if(u.origin!==ORIGIN&&u.pathname.endsWith('/files'))return Response.json({files:f.files.map((x,i)=>({...x,data:undefined,...(i?{headRevisionId:undefined,sha256Checksum:undefined}:{})})),incompleteSearch:false});
   const r=await original(v,o);if(unavailable&&u.origin!==ORIGIN&&u.pathname.endsWith('/'+f.files[1].id)&&u.searchParams.get('fields')!==STRONG_FIELDS)return Response.json({...f.files[1],data:undefined,headRevisionId:undefined,sha256Checksum:undefined});return r;};
  adopt(f,j);const q=f.make(),s=await q.run();assert.equal(s.mediaRequests,0);assert(s.strongCarry.fallbackHeads<=64);
  if(count===4&&!unavailable){assert.equal(s.complete,true,JSON.stringify(s));assert.equal(s.strongCarry.inventoryQualified,1);assert.equal(s.strongCarry.fallbackHeads,6);assert.equal(s.coverage.classified,4);}
  else{assert.equal(s.failure,unavailable?'IDENTITY_MISMATCH':'STRONG_METADATA_UNQUALIFIED');assert.equal(s.coverage.classified,0);assert.equal(s.coverage.quarantinedConsumedAttempts,count);}
 }
});

test('idle credential rebind changes only token/revision/expiry and keeps one-attempt registry across the next explicit burst',async()=>{
 const f=syntheticSandbox();assert.throws(()=>f.runner.rebindCredentials(),/INACTIVE_STABLE_REQUIRED/);f.runner.start(f.opts());assert.throws(()=>f.runner.rebindCredentials(),/INACTIVE_STABLE_REQUIRED/);const first=await f.settle();assert.equal(first.jobs[0].summary.complete,true);
 f.state.token='SYNTHETIC_RENEWED_TOKEN';f.state.tokenRevision++;f.state.expiresAt+=3600000;const rebound=f.runner.rebindCredentials();assert.equal(rebound.credentialRebinds,1);assert(!JSON.stringify(rebound).includes('SYNTHETIC_RENEWED_TOKEN'));f.runner.start(f.opts());const next=await f.settle();assert.equal(next.jobs[1].summary.mediaRequests,0);assert.equal(next.jobs[1].summary.coverage.classified,3);assert.equal(next.jobs[1].summary.strongCarry.inventoryQualified,3);assert.equal(next.jobs[1].summary.coverage.ledgerEntries,3);f.runner.cleanup();assert.throws(()=>f.runner.rebindCredentials(),/INACTIVE_STABLE_REQUIRED/);
});

test('credential-only rebind rejects each other owner/projection/source/writer/idle drift without changing the anchor',async()=>{
 const f=syntheticSandbox();f.runner.start(f.opts());await f.settle();
 const cases=[['authGeneration',f.state.authGeneration+1],['driveSessionGeneration',f.state.driveSessionGeneration+1],['accountId','SYNTHETIC_OTHER'],['authAccountKey','SYNTHETIC_OTHER'],['accountStateWriterId','SYNTHETIC_OTHER'],['accountStateRevision',f.state.accountStateRevision+1],['accountStateAbortController',new AbortController()],['mediaSession',f.state.mediaSession+1],['playbackSession',f.state.playbackSession+1],['accountMediaState',{liked:['SYNTHETIC_OTHER']}],['accountStateSyncPromise',{}],['accountStateSyncTimer',1],['accountStateSyncRetryTimer',1],['accountStateSyncError',{}],['selected',{}],['mediaAttempt','active'],['mediaAbortController',new AbortController()],['pendingOriginalBuffer',{}],['pendingPlay',true],['mediaTransportStarted',true],['authStatus','offline'],['accountStateLoaded',false],['expiresAt',Date.now()-1],['token','']];
 for(const [key,value]of cases){const old=f.state[key];f.state[key]=value;assert.throws(()=>f.runner.rebindCredentials(),/OWNER_REJECTED/,key);f.state[key]=old;}
 for(const [object,key,value]of [[f.sandbox,'mediaSourceGeneration',6],[f.sandbox,'q1RetirementResult',{settled:true}],[f.sandbox,'q1Playback',{}],[f.sandbox,'playerMediaPriorityActive',true],[f.sandbox.location,'href',ORIGIN+'/changed'],[f.sandbox.document,'visibilityState','hidden'],[f.sandbox.navigator,'onLine',false],[f.sandbox.navigator.serviceWorker,'controller',{...f.runtime.navigator.serviceWorker.controller}],[f.sandbox.navigator.serviceWorker.controller,'scriptURL',ORIGIN+'/sw.js?changed'],[f.sandbox,'APP_VERSION','wrong'],[f.sandbox,'hasUsableToken',()=>false]]){const old=object[key];object[key]=value;assert.throws(()=>f.runner.rebindCredentials(),/OWNER_REJECTED/,key);object[key]=old;}
 const oldProof=f.proof.get;f.proof.get=()=>({...oldProof(),sourceSHA256:{...binding.sourceSHA256,'app.js':'0'.repeat(64)}});assert.throws(()=>f.runner.rebindCredentials(),/OWNER_REJECTED/);f.proof.get=oldProof;
 assert.equal(f.runner.read().credentialRebinds,0);f.state.tokenRevision++;f.runner.rebindCredentials();assert.equal(f.runner.read().credentialRebinds,1);f.runner.cleanup();
});

test('active token drift cannot rebind and still cancels/quarantines before explicit metadata-only recovery',async()=>{
 const f=syntheticSandbox(),original=f.runtime.nativeFetch;let release;
 f.runtime.nativeFetch=async(v,o)=>{if(new URL(v).origin===ORIGIN)await new Promise(r=>{release=r;});return original(v,o);};f.runner.start(f.opts());for(let n=0;n<400&&!release;n++)await new Promise(r=>setImmediate(r));assert(release);
 f.state.token='SYNTHETIC_CHANGED';f.state.tokenRevision++;assert.throws(()=>f.runner.rebindCredentials(),/INACTIVE_STABLE_REQUIRED/);const t=[...f.timers].find(([,x])=>x.ms===100);f.timers.delete(t[0]);t[1].fn();release();const s=await f.settle();assert.equal(s.stopped,'OWNER_CHANGED');assert.equal(s.jobs[0].summary.coverage.quarantinedConsumedAttempts,1);assert.equal(s.jobs[0].summary.ownerDiagnostic.tokenChanged,true);assert.equal(s.jobs[0].summary.ownerDiagnostic.tokenRevisionChanged,true);assert.throws(()=>f.runner.rebindCredentials(),/INACTIVE_STABLE_REQUIRED/);
 f.runtime.nativeFetch=original;f.runner.recover(f.opts());const r=await f.settle();assert.equal(r.needsRecovery,false);assert.equal(r.jobs[1].summary.mediaRequests,0);assert.equal(r.jobs[1].summary.coverage.ledgerEntries,1);f.runner.cleanup();
});

test('strong root duplicate and final catalog hash drift reject even when version/base fields are unchanged',async()=>{
 const f=currentFixture(3),original=f.runtime.nativeFetch;let rootReads=0;
 const options={rootId:f.context.rootId,priorityFileId:f.context.priorityFileId,expectedAccountKey:f.state.accountId,driveFetch:async(v,o)=>{if(new URL(v).pathname.endsWith('/'+f.context.rootId)){rootReads++;return Response.json({...f.pass.rootBefore,sha256Checksum:(rootReads===1?'a':'b').repeat(64)});}return original(v,o);}};
 await assert.rejects(runStrongInventory(options),/STRONG_INVENTORY_CONFLICT/);
 let lastHeads=0;f.runtime.nativeFetch=async(v,o)=>{const r=await original(v,o),u=new URL(v);if(u.origin!==ORIGIN&&u.pathname.endsWith('/'+f.files[2].id)&&u.searchParams.get('fields')!==STRONG_FIELDS&&++lastHeads===2)f.files[1].sha256Checksum='a'.repeat(64);return r;};
 const j=f.make(),s=await j.run();assert.equal(s.failure,'STRONG_CATALOG_DRIFT');assert.equal(s.catalogStable,false);assert.equal(s.coverage.classified,0);assert.equal(s.coverage.quarantined,3);assert.equal(s.coverage.quarantinedConsumedAttempts,3);assert.equal(s.released,true);
});

test('8596-entry complete paginated strong inventory requalifies all consumed attempts within one bounded job',async(t)=>{
 const f=currentFixture(8596),original=f.runtime.nativeFetch;
 f.runtime.nativeFetch=async(v,o)=>{const u=new URL(v);if(u.origin!==ORIGIN&&u.pathname.endsWith('/files')){const start=Number(u.searchParams.get('pageToken')??0);return Response.json({files:f.files.slice(start,start+1000).map(x=>({...x,data:undefined})),incompleteSearch:false,...(start+1000<f.files.length?{nextPageToken:String(start+1000)}:{})});}return original(v,o);};
 f.runtime.priorCapsule=createHeaderContinuity(f.context,binding,[],f.files.map(x=>({identity:{accountKey:f.state.authAccountKey,fileId:x.id,version:x.version,size:x.size,modifiedTime:x.modifiedTime,mimeType:x.mimeType,canDownload:true},content:{headRevisionId:x.headRevisionId,sha256Checksum:x.sha256Checksum,resourceKey:null},count:1,failure:'HEADER_TIMEOUT'})));f.runtime.options={phase:'revalidate-videos',maxFiles:64,recoveryCycle:1};
 const j=f.make(),s=await j.run();assert.equal(s.complete,true,JSON.stringify(s));assert.equal(s.recoveryQualified,true);assert.equal(s.strongCarry.inventoryQualified,8596);assert.equal(s.strongCarry.fallbackHeads,0);assert.equal(s.coverage.denominator,8596);assert.equal(s.coverage.failed,8596);assert.equal(s.coverage.ledgerEntries,8596);assert.equal(s.mediaRequests,0);assert(s.metadataRequests<=64);assert(s.metadataBytes<=CAPS.metadataBytes);assert(!JSON.stringify(s).includes('PRIVATE_'));
 t.diagnostic(JSON.stringify({syntheticEntries:8596,metadataRequests:s.metadataRequests,metadataBytes:s.metadataBytes,fallbackHeads:s.strongCarry.fallbackHeads,mediaRequests:s.mediaRequests,ledgerEntries:s.coverage.ledgerEntries}));
});
