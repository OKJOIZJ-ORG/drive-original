import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createCorpusTracksProbe,planTrackSamples,VERSION,ORIGIN,CAPS} from './probe.mjs';
import {parseEbmlTracks,readEbmlTracks} from './ebml-tracks.mjs';
import {build} from './build.mjs';
import {box,cat,moovFixture} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const eb=(id,payload)=>{let n=1;while(payload.length>=(2**(7*n)-1))n++;const size=Buffer.alloc(n);let value=BigInt(payload.length)|(1n<<BigInt(7*n));for(let i=n-1;i>=0;i--){size[i]=Number(value&255n);value>>=8n;}let hex=id.toString(16);if(hex.length%2)hex='0'+hex;return Buffer.concat([Buffer.from(hex,'hex'),size,payload]);};
const u=n=>Buffer.from([n]);
const f=n=>{const b=Buffer.alloc(8);b.writeDoubleBE(n);return b;};
const tracks=()=>eb(0xae,cat(eb(0x83,u(1)),eb(0x86,Buffer.from('V_VP9')),eb(0xe0,cat(eb(0xb0,u(160)),eb(0xba,u(90))))));
const webm=()=>cat(eb(0x1a45dfa3,eb(0x4282,Buffer.from('webm'))),eb(0x18538067,cat(eb(0x1654ae6b,tracks()),eb(0x1f43b675,Buffer.alloc(3000)))));
function fixture(){
  const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_AUTHKEY',token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authGeneration:1,driveSessionGeneration:2,tokenRevision:3,mediaSession:4,
    accountStateAbortController:new AbortController(),authStatus:'online',demo:false,accountIdentityPending:false,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const iso=(extra=0)=>cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),moovFixture({audio:true}),box('mdat',Buffer.alloc(4000+extra)));
  const files=[{id:'PRIVATE_PRIORITY',ext:'mp4',mime:'video/mp4',data:iso()},...Array.from({length:6},(_,i)=>({id:`PRIVATE_ISO_${i}`,ext:'mp4',mime:'video/mp4',data:iso(i+1)})),{id:'PRIVATE_WEBM',ext:'webm',mime:'video/webm',data:webm()},{id:'PRIVATE_BMP',ext:'bmp',mime:'application/octet-stream',data:cat([66,77],Buffer.alloc(2000))}];
  const rows=files.map(f=>({fileId:f.id,version:'123456789',size:String(f.data.length),modifiedTime:'PRIVATE_DATE',mimeType:f.mime,extension:f.ext,visibleReferences:[{fileId:f.id,resourceKey:null}]}));
  const context={accountKey:state.accountId,authAccountKey:state.authAccountKey,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:files[0].id,priorityVersion:'123456789'};
  const selection={privateManifest:{schema:'drive-original.v2-07a-risk-selection-private/1',prioritySample:{fileId:context.priorityFileId,version:context.priorityVersion},selected:rows},report:{coverage:{requiredCategoryCount:1,coveredCategoryCount:1,uncoveredCategoryCount:0},selection:{prioritySampleSelected:true,allRareMkvAviBmpSelected:true,allGe4GiBSelected:true}}};
  const controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},retirement={settled:true},calls=[],listeners=new Set();let fileReads=0;
  const runtime={appVersion:VERSION,readState:()=>state,privateContext:context,navigator:{onLine:true,serviceWorker:{controller}},location:{origin:ORIGIN,href:ORIGIN+'/'},document:{visibilityState:'visible'},top:1,self:1,
    getSWIdentity:()=>({controller,version:VERSION}),getMutationsEnabled:()=>false,getQ1Playback:()=>null,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>5,getPlayerMediaPriorityActive:()=>false,hasUsableToken:()=>true,
    addEventListener:t=>listeners.add(t),removeEventListener:t=>listeners.delete(t),nativeFetch:async(v,init)=>{
      const url=new URL(v);calls.push({url,init});if(url.origin!==ORIGIN){if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:state.accountId}});const file=files.find(f=>url.pathname.endsWith('/'+f.id));fileReads++;return Response.json({id:file.id,version:'123456789',size:String(file.data.length),modifiedTime:'PRIVATE_DATE',mimeType:file.mime,trashed:false,headRevisionId:'PRIVATE_REV',sha256Checksum:'PRIVATE_CHECKSUM',capabilities:{canDownload:true}});}
      const file=files.find(f=>url.pathname.endsWith('/'+f.id));const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(init.headers.Range),start=+a,end=+b;return new Response(file.data.subarray(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${file.data.length}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'}});
    }};
  const dependencies={selector:()=>selection,inventoryRunner:async({driveFetch})=>{await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();return {report:{completeness:{repeatedPrivateInventoryMatched:true,shortcutClassificationComplete:true,containmentComplete:true}},privatePasses:{secondPass:{items:[{id:context.priorityFileId,version:context.priorityVersion}]}}};},compareInventory:()=>{}};
  return {state,files,rows,context,selection,runtime,dependencies,calls,listeners,make:()=>createCorpusTracksProbe(runtime,dependencies)};
}
test('pure private plan caps5ISO/1WebM/2unknown and defers unproven largest without old magic assertions',()=>{
  const f=fixture(),p=planTrackSamples(f.selection,f.context);assert.equal(p.plan.length,7);assert.equal(p.summary.isoPlanned,5);assert.equal(p.summary.webmPlanned,1);assert.equal(p.summary.unknownPlanned,1);assert.equal(p.summary.continuity,'unknown');assert.equal(p.summary.deferredLargestIsoIdentityUnproven,true);
  assert.ok(!p.plan.some(x=>x.expected.fileId==='PRIVATE_ISO_5'));assert.ok(!p.plan.some(x=>x.expected.fileId===f.context.priorityFileId));
});
test('exact private account/root/content identity excludes proven ISO and known TS; wrong-account map fails before read',()=>{
  const f=fixture(),identity=row=>({accountKey:f.context.authAccountKey,fileId:row.fileId,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
  const prior={schema:'drive-original.corpus-tracks-private-continuity/1',accountKey:f.context.authAccountKey,rootId:f.context.rootId,rows:[{identity:identity(f.rows[6]),kind:'iso-bmff',tracksProven:true},{identity:identity(f.rows[1]),kind:'mpeg-ts',tracksProven:false}]};
  const p=planTrackSamples(f.selection,f.context,prior);assert.equal(p.summary.exactProvenIsoExcluded,1);assert.equal(p.summary.deferredLargestIsoIdentityUnproven,false);assert.equal(p.summary.isoPlanned,4);assert.ok(!p.plan.some(x=>['PRIVATE_ISO_0','PRIVATE_ISO_5'].includes(x.expected.fileId)));
  prior.accountKey='WRONG_ACCOUNT';assert.throws(()=>planTrackSamples(f.selection,f.context,prior),/SELECTION_FAILED/);
});
test('structural WebM Tracks reports safe codecs/dimensions/audio and no arbitrary CodecID/name/UID',async()=>{
  const payload=cat(tracks(),eb(0xae,cat(eb(0x83,u(2)),eb(0x86,Buffer.from('A_OPUS')),eb(0xe1,cat(eb(0xb5,f(48000)),eb(0x9f,u(2)))),eb(0x536e,Buffer.from('PRIVATE_TRACK_NAME')),eb(0x63c5,Buffer.from('PRIVATE_UID')))));
  const parsed=parseEbmlTracks(payload);assert.equal(parsed.status,'parsed');assert.equal(parsed.tracks[0].codec,'vp9');assert.equal(parsed.tracks[0].width,160);assert.equal(parsed.tracks[1].channels,2);assert.equal(parsed.tracks[1].sampleRate,48000);assert.ok(!JSON.stringify(parsed).includes('PRIVATE_'));
  const data=webm(),calls=[];const r=await readEbmlTracks({size:data.length,prefix:data.subarray(0,940),read:async({start,end})=>{calls.push([start,end]);return data.subarray(start,end+1);}});assert.equal(r.status,'parsed');assert.equal(r.docType,'webm');assert.equal(calls.length,0);
});
test('EBML malformed nested bounds, duplicate scalar, unknown nested size and oversize Tracks fail bounded',async()=>{
  for(const payload of [Buffer.from([0xae,0x8a,0x83,0x81,1]),eb(0xae,cat(eb(0x83,u(1)),eb(0x83,u(1)),eb(0x86,Buffer.from('V_VP9')))),Buffer.from([0xae,0xff])])assert.notEqual(parseEbmlTracks(payload).status,'parsed');
  const data=cat(eb(0x1a45dfa3,eb(0x4282,Buffer.from('webm'))),eb(0x18538067,cat(eb(0x1654ae6b,Buffer.alloc(262145)),eb(0x1f43b675,Buffer.alloc(2000))))),calls=[];
  const r=await readEbmlTracks({size:data.length,prefix:data.subarray(0,940),read:async({start,end})=>{calls.push([start,end]);return data.subarray(start,end+1);}});assert.equal(r.code,'EBML_TRACKS_SIZE_LIMIT');assert.equal(calls.length,0);
});
test('actual existing reader+ISO sparse and new EBML wrapper only reads planned files and fully redacts output',async()=>{
  const f=fixture(),job=f.make(),r=await job.run();assert.equal(r.complete,true);assert.equal(r.catalogStable,true);assert.equal(r.inventoryRuns,2);assert.equal(r.files.length,7);assert.equal(r.plan.isoPlanned,5);assert.equal(r.files.filter(x=>x.tracks?.status==='parsed').length,6);
  const media=f.calls.filter(x=>x.url.origin===ORIGIN);assert.ok(media.length<64*7);assert.ok(media.every(x=>!x.url.pathname.endsWith('PRIVATE_ISO_5')&&!x.url.pathname.endsWith('PRIVATE_PRIORITY')));
  for(const c of media){const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(c.init.headers.Range);assert.ok(!(+a===0&&+b===Number(c.url.searchParams.get('size'))-1));assert.equal(c.init.priority,'low');}
  assert.equal(f.listeners.size,0);assert.equal(r.released,true);assert.ok(!JSON.stringify({r,p:job.poll(),cancel:job.cancel()}).includes('PRIVATE_'));assert.equal(job.run(),job.run());
});
test('metadata-only reconstructs and compares full inventory but reads zero media and preserves unknown continuity',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';const r=await f.make().run();assert.equal(r.complete,true);assert.equal(r.plan.continuity,'unknown');assert.equal(r.mediaRequests,0);assert.equal(r.files.length,0);assert.equal(r.inventoryRuns,2);
});
test('catalog comparison rejection and content identity drift never publish complete',async()=>{
  const f=fixture();f.dependencies.compareInventory=()=>{throw Error('PRIVATE_CATALOG_ERROR');};const r=await f.make().run();assert.equal(r.failure,'CATALOG_DRIFT');assert.equal(r.complete,false);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
  const g=fixture(),fetch=g.runtime.nativeFetch;let n=0;g.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).pathname.endsWith('/PRIVATE_ISO_4')&&new URL(v).origin!==ORIGIN&&++n===2){const data=await r.json();data.headRevisionId='CHANGED';return Response.json(data);}return r;};const s=await g.make().run();assert.equal(s.complete,false);assert.ok(s.files.some(x=>x.failure==='POSTFLIGHT_FAILED'));assert.equal(s.files.length,1);
});
test('stale app/SW/account, unsettled retirement or foreground ownership rejects before body; owner changes stop all later files',async()=>{
  for(const mutate of [f=>f.runtime.appVersion='1.22.0-rc.15',f=>f.runtime.getSWIdentity=()=>({}),f=>f.runtime.getQ1RetirementResult=()=>({settled:false}),f=>f.runtime.document.visibilityState='hidden',f=>f.runtime.getMutationsEnabled=()=>true]){const f=fixture();mutate(f);const r=await f.make().run();assert.equal(r.complete,false);assert.equal(f.calls.length,0);}
  const f=fixture(),fetch=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).origin===ORIGIN)f.state.tokenRevision++;return r;};const r=await f.make().run();assert.equal(r.complete,false);assert.equal(f.calls.filter(x=>x.url.origin===ORIGIN).length,1);assert.equal(r.files.length,1);
});
test('metadata dispatch cap512 and response/batch limits are not waived by inventory reconstruction',async()=>{
  const f=fixture();f.dependencies.inventoryRunner=async({driveFetch})=>{for(let i=0;i<513;i++)await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();};const r=await f.make().run();assert.equal(r.failure,'METADATA_LIMIT');assert.equal(r.metadataRequests,512);assert.equal(r.mediaRequests,0);
  const g=fixture();g.runtime.nativeFetch=async()=>new Response('x'.repeat(CAPS.metadataResponseBytes+1));const s=await g.make().run();assert.equal(s.failure,'METADATA_LIMIT');assert.equal(s.mediaRequests,0);
});
test('exact per-file metadata retains32KiB response cap before any media read',async()=>{
  const f=fixture(),fetch=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).pathname.includes('/files/'))return new Response((await r.text())+' '.repeat(32769));return r;};
  const r=await f.make().run();assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.equal(f.calls.filter(x=>x.url.origin===ORIGIN).length,0);
});
test('cancel waits for late metadata cancellation; rejected/unknown cleanup is terminal',async()=>{
  const f=fixture();let resolve;f.runtime.nativeFetch=()=>new Promise(r=>resolve=r);const job=f.make(),p=job.run();job.cancel();resolve({body:{cancel:()=>Promise.reject(Error('PRIVATE_CLEANUP'))}});const r=await p;assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.mediaRequests,0);assert.equal(r.released,true);
});
test('standalone bundle is deterministic, lexical and rejects absent private inputs without global mutation',async()=>{
  const a=await build(),b=await build();assert.equal(a.expression,b.expression);const sandbox={};const fn=vm.runInNewContext(a.expression,sandbox);assert.equal(typeof fn,'function');assert.deepEqual(Object.keys(sandbox),[]);
  const j=fn(null,null);assert.equal(j.poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(a.swProof.includes('1.22.0-rc.11'),false);assert.equal(a.provenance.explicitVersionPinReplacements,3);
});
test('strict actual lexical facade retains equal read refresh but refuses projection/writer/token/controller/foreground changes',async()=>{
  const source=await readFile(new URL('facade.function.js',import.meta.url),'utf8');
  for(const mutate of [v=>v.s.accountMediaState={liked:['changed']},v=>v.s.accountStateWriterId='changed',v=>v.s.tokenRevision++,v=>v.ctx.navigator.serviceWorker.controller={},v=>v.ctx.document.visibilityState='hidden']){
    const f=fixture(),s=f.state,c=f.runtime.navigator.serviceWorker.controller,self={};Object.assign(s,{accountMediaState:{liked:[]},accountStateWriterId:'writer',accountStateRevision:1,accountStateLoaded:true,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,playbackSession:3});
    const ctx={state:s,APP_VERSION:VERSION,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,navigator:f.runtime.navigator,location:f.runtime.location,document:f.runtime.document,top:self,self,
      q1RetirementResult:f.runtime.getQ1RetirementResult(),q1Playback:null,mediaSourceGeneration:5,playerMediaPriorityActive:false,hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{addEventListener(){},removeEventListener(){}},fetch(){throw Error('unexpected');}};
    const facade=vm.runInNewContext(`(${source})`,ctx),proof={get:()=>({controller:c,version:VERSION})};let owned;
    const job=facade.call(runtime=>{owned=runtime;return {run:()=>new Promise(()=>{}),poll:()=>({done:false}),cancel:()=>({cancelled:true})};},JSON.stringify({accountKey:s.accountId,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:'PRIVATE_PRIORITY'}),proof);
    assert.equal(job.poll().done,false);assert.equal(owned.readState(),s);s.accountMediaState={liked:[]};assert.equal(owned.readState(),s);mutate({s,ctx});assert.throws(()=>owned.readState(),/OWNER_CHANGED/);
  }
});
test('EBML sparse scan skips a multi-MiB known Cluster and never requests its whole payload',async()=>{
  const data=cat(eb(0x1a45dfa3,eb(0x4282,Buffer.from('webm'))),eb(0x18538067,cat(eb(0x1f43b675,Buffer.alloc(3*1024*1024)),eb(0x1654ae6b,tracks())))),calls=[];
  const parsed=await readEbmlTracks({size:data.length,prefix:data.subarray(0,940),read:async({start,end})=>{calls.push([start,end]);return data.subarray(start,end+1);}});assert.equal(parsed.status,'parsed');assert.ok(calls.every(([a,b])=>b-a+1<256));assert.ok(calls.reduce((n,[a,b])=>n+b-a+1,0)<512);
});
test('new EBML sparse parser independently agrees with FFprobe on generated VP9/Opus seed',async()=>{
  const dir=new URL('./fixtures/',import.meta.url);await mkdir(dir,{recursive:true});const name=new URL('synthetic-vp9-opus.webm',dir),path=decodeURIComponent(name.pathname).replace(/^\/(\w:)/,'$1');
  const args=['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=12','-f','lavfi','-i','sine=frequency=400:sample_rate=48000','-t','1','-c:v','libvpx-vp9','-threads','1','-c:a','libopus','-ac','2',path];execFileSync('ffmpeg',args,{timeout:30000});
  const data=await readFile(name),inputHash=hash(data),calls=[],parsed=await readEbmlTracks({size:data.length,prefix:data.subarray(0,940),read:async({start,end})=>{calls.push([start,end]);return data.subarray(start,end+1);}}),oracle=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,width,height,sample_rate,channels','-of','json',path],{encoding:'utf8',timeout:10000}));
  assert.equal(hash(data),inputHash,'The scanner must not clear caller-owned prefix/read buffers');
  assert.equal(parsed.status,'parsed');const video=parsed.tracks.find(t=>t.type==='video'),audio=parsed.tracks.find(t=>t.type==='audio'),ov=oracle.streams.find(t=>t.codec_type==='video'),oa=oracle.streams.find(t=>t.codec_type==='audio');
  assert.equal(video.codec,ov.codec_name);assert.equal(video.width,ov.width);assert.equal(video.height,ov.height);assert.equal(audio.codec,oa.codec_name);assert.equal(audio.sampleRate,+oa.sample_rate);assert.equal(audio.channels,oa.channels);assert.ok(calls.length<=64);
  await writeFile(new URL('../seed-oracle-results.json',name),JSON.stringify({schema:'drive-original.rc16-ebml-seed-oracle/1',fixtureSHA256:hash(data),fixtureBytes:data.length,ffmpegVersion:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split(/\r?\n/)[0],ffprobeVersion:execFileSync('ffprobe',['-version'],{encoding:'utf8'}).split(/\r?\n/)[0],ffmpegArgs:args.slice(0,-1),ffprobe:oracle,sparse:parsed,sparseRequests:calls.length,passed:true},null,2)+'\n');
});
