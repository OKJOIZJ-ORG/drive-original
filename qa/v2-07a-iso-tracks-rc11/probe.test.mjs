import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createIsoTracksProbe,VERSION} from './probe.mjs';
import {build} from './build.mjs';
import {box,cat,moovFixture} from './fixtures.mjs';
const make=(options={})=>{
  const bytes=options.bytes??cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),moovFixture({audio:true}),box('mdat',Buffer.alloc(3000)));
  const file={id:'private_id',name:'private_name',size:String(bytes.length),modifiedTime:'private_time',mimeType:'video/mp4',capabilities:{canDownload:true}};
  const state={accountId:'private_subject',authAccountKey:'private_opaque_account_key',authGeneration:1,driveSessionGeneration:2,tokenRevision:3,token:'private_token',expiresAt:999,mediaSession:4,accountStateAbortController:new AbortController(),selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const controller={state:'activated'},retirement={settled:true};let n=0;const calls=[];
  const runtime={appVersion:VERSION,readState:()=>state,navigator:{serviceWorker:{controller}},location:{href:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'},
    getSWIdentity:()=>({controller,version:VERSION}),getMutationsEnabled:()=>false,getQ1Playback:()=>null,getPlayerMediaPriorityActive:()=>false,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>5,hasUsableToken:()=>true,
    nativeFetch:async(url,init)=>{calls.push({url,init});if(url.startsWith('https://www.googleapis.com/')){n++;return new Response(JSON.stringify({...file,version:options.drift&&n===2?'2':'1',headRevisionId:'private_revision',sha256Checksum:options.checksumDrift&&n===2?'different':'private_checksum',trashed:false}));}
      if(options.ownerChange)state.tokenRevision++;
      if(options.held)return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));
      const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(init.headers.Range),start=Number(a),end=Number(b);
      return new Response(bytes.subarray(start,end+1),{status:options.status??206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'}});
    }};
  return {runtime,file,state,calls,bytes};
};
test('single-file success uses two metadata GETs and only redacted structural summary',async()=>{
  const f=make(),job=createIsoTracksProbe(f.runtime,f.file),r=await job.run();assert.equal(r.complete,true);assert.equal(r.metadataRequests,2);assert.equal(r.identityPostflight,true);assert.equal(r.actualIsoMagic,true);assert.ok(r.mediaBytes<f.bytes.length);
  assert.equal(job.selectedFile(),f.file);assert.equal(job.poll().done,true);assert.ok(!JSON.stringify(r).includes('private_'));job.release();assert.equal(job.selectedFile(),null);assert.equal(await job.run(),r); // same single execution promise result
});
test('headRevision/checksum drift prevents acceptance and retained private file',async()=>{const f=make({checksumDrift:true}),j=createIsoTracksProbe(f.runtime,f.file),r=await j.run();assert.equal(r.complete,false);assert.equal(r.failure,'POSTFLIGHT_FAILED');assert.equal(j.selectedFile(),null);});
test('version drift rejects after reads',async()=>{const f=make({drift:true}),r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.complete,false);assert.equal(r.failure,'POSTFLIGHT_DRIFT');});
test('metadata MIME/size hint mismatch rejects before media',async()=>{const f=make();f.file={...f.file,size:'99999'};const r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.failure,'IDENTITY_MISMATCH');assert.equal(r.mediaBytes,0);});
test('nonISO actual bytes reject despite MP4 metadata',async()=>{const f=make({bytes:Buffer.alloc(3000)}),r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.failure,'NOT_ISO');assert.equal(r.metadataRequests,2);assert.equal(r.mediaRequests,1);});
test('upstream200 is rejected, still postflight checked',async()=>{const f=make({status:200}),r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.failure,'STATUS_NOT_206');assert.equal(r.identityPostflight,true);assert.equal(r.released,true);});
test('changed credential owner stops further requests',async()=>{const f=make({ownerChange:true}),r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.complete,false);assert.equal(r.failure,'GENERATION_STALE');assert.equal(f.calls.length,2);});
test('cancel interrupts a held media request and settles',async()=>{const f=make({held:true}),j=createIsoTracksProbe(f.runtime,f.file),p=j.run();while(f.calls.length<2)await new Promise(r=>setTimeout(r,1));j.cancel();const r=await p;assert.equal(r.complete,false);assert.equal(r.released,true);assert.equal(j.selectedFile(),null);});
test('opaque auth key is the normalized identity; distinct subject and key both fenced',async()=>{
  const source=await readFile(new URL('probe.mjs',import.meta.url),'utf8');assert.match(source,/accountKey:owner\.values\.authAccountKey/);
  for(const k of ['accountId','authAccountKey']){const f=make(),fetch=f.runtime.nativeFetch;assert.notEqual(f.state.accountId,f.state.authAccountKey);
    f.runtime.nativeFetch=async(...args)=>{const response=await fetch(...args);if(args[0].includes('/__drive_media/'))f.state[k]='changed';return response;};
    const r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.failure,'GENERATION_STALE');assert.equal(f.calls.length,2);}
});
test('late metadata response cancellation rejection is terminal and no next request dispatches',async()=>{
  const f=make();let resolveFetch,cancelled=0;f.runtime.nativeFetch=()=>new Promise(r=>{resolveFetch=r;});
  const j=createIsoTracksProbe(f.runtime,f.file),p=j.run();j.cancel();
  resolveFetch({body:{cancel(){cancelled++;return Promise.reject(Error('cleanup rejected'));}}});
  const r=await p;assert.equal(cancelled,1);assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.complete,false);assert.equal(r.metadataRequests,1);assert.equal(r.metadataCleanup,'failed');assert.equal(r.localReferencesReleased,true);assert.equal(r.genericUpstreamCleanup,'unknown');
});
test('unsettled metadata fetch cleanup times out instead of declaring safe completion',async()=>{
  const f=make();f.runtime.nativeFetch=()=>new Promise(()=>{});const j=createIsoTracksProbe(f.runtime,f.file),p=j.run();j.cancel();
  const r=await p;assert.equal(r.failure,'CLEANUP_TIMEOUT');assert.equal(r.complete,false);assert.equal(r.metadataRequests,1);assert.equal(r.metadataCleanup,'timeout');assert.equal(r.genericUpstreamCleanup,'unknown');
});
test('oversize moov lacking tracks stays incomplete with sparse reads only',async()=>{const mb=Buffer.alloc(2*1024*1024+9);mb.writeUInt32BE(mb.length);mb.write('moov',4);const f=make({bytes:cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),mb,box('mdat',Buffer.alloc(20)))}),r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.failure,'PARSER_INCOMPLETE');assert.ok(r.mediaBytes<1000);});
test('large valid moov probe keeps actual total request/byte caps and postflight',async()=>{
  const m=Buffer.from(moovFixture({audio:true})),gap=3*1024*1024,stbl=m.indexOf('stbl')-4,insert=stbl+m.readUInt32BE(stbl),head=Buffer.from(m.subarray(0,insert)),table=Buffer.alloc(gap);table.writeUInt32BE(gap);table.write('stsz',4);
  for(const type of ['moov','trak','mdia','minf','stbl']){const p=m.indexOf(type)-4;head.writeUInt32BE(head.readUInt32BE(p)+gap,p);}
  const f=make({bytes:cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),box('mdat',Buffer.alloc(1000)),head,table,m.subarray(insert))});
  const r=await createIsoTracksProbe(f.runtime,f.file).run();assert.equal(r.complete,true);assert.equal(r.identityPostflight,true);assert.equal(r.metadataRequests,2);assert.ok(r.moovBytes>2*1024*1024);assert.ok(r.mediaBytes<4096);assert.ok(r.mediaRequests<=64);assert.equal(r.sparseMoov.metrics.sampleTableBoxesSkipped,1);assert.equal(r.sparseMoov.originalSampleTablesRead,false);
});
test('bundle syntax and rejected facade dispatch no fetch',async()=>{const {bundle}=await build();new vm.Script(bundle);const context=vm.createContext({state:{files:[]}}),factory=new vm.Script(bundle).runInContext(context),j=factory({},null);assert.equal(j.poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(j.selectedFile(),null);});
test('facade accepts only exact listed object and guards sync/controller/token/foreground ownership',async()=>{
  const source=await readFile(new URL('facade.function.js',import.meta.url),'utf8');
  const makeContext=()=>{const f=make(),c=f.runtime.navigator.serviceWorker.controller,s=f.state;
    Object.assign(s,{files:[f.file],accountMediaState:{liked:[]},accountStateWriterId:'writer',accountStateRevision:0,accountStateLoaded:true,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,authStatus:'online',demo:false,accountIdentityPending:false,playbackSession:1});
    const retirement={settled:true},self={};const ctx={state:s,APP_VERSION:VERSION,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,top:self,self,navigator:{onLine:true,serviceWorker:{controller:c}},document:{visibilityState:'visible'},location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'},mediaSourceGeneration:5,q1RetirementResult:retirement,q1Playback:null,playerMediaPriorityActive:false,hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{addEventListener(){},removeEventListener(){}},fetch(){throw Error('unexpected');}};
    return {f,ctx,facade:new vm.Script(`(${source})`).runInContext(vm.createContext(ctx)),proof:{get:()=>({controller:c,version:VERSION})}};};
  for(const mutate of [v=>v.ctx.state.tokenRevision++,v=>v.ctx.state.accountStateSyncPromise={},v=>v.ctx.navigator.serviceWorker.controller={},v=>v.ctx.document.visibilityState='hidden',v=>v.ctx.state.accountMediaState={liked:['changed']}]){
    const v=makeContext();let owned;const stub={run:()=>new Promise(()=>{}),poll:()=>({}),cancel(){},selectedFile(){},release(){}};
    v.facade.call(r=>{owned=r;return stub;},v.f.file,v.proof);assert.equal(owned.readState(),v.f.state);mutate(v);assert.throws(()=>owned.readState(),/OWNER_CHANGED/);
  }
  const v=makeContext();let calls=0;const j=v.facade.call(()=>{calls++;}, {...v.f.file},v.proof);assert.equal(calls,0);assert.equal(j.poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');
});
