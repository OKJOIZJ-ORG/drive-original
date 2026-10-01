'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {prepare}=require('./normal-replay.cjs'),{SOURCE,VERSION}=require('./gate.cjs');
const fake={account:{accountId:'fixture-account',authAccountKey:'fixture-key'},target:{id:'fixture-target',name:'fixture.ts',mimeType:'video/mp2t',size:'18800',modifiedTime:'fixture-time',parents:[],version:'1',headRevisionId:'fixture-revision',sha256Checksum:'fixture-checksum'},folderPath:[]};
function runtime({cardAvailable=true}={}){
 let open=false,paused=false,seeking=false,time=0,stopped=false,removed=false,inputs=[],searching=false;
 const geometry={available:true,x:20,y:20,left:10,width:20,dpr:2,viewportHeight:600};
 const journal=()=>({sourceCommit:SOURCE,version:VERSION,latest:{route:'Q1_TS',sourceSame:true,accountSame:true,targetSame:true,seekWatchdog:false,seekGeneration:seeking?1:0,seekSettledGeneration:seeking?1:0,native:{time:++time,paused,duration:100},pipeline:{duration:100,source:{readsCompleted:2,rangeRequests:2,receivedBytes:18800}}},phases:[{label:'startup',firstTargetFrame:{},presentedCount:20,frames:[{sourceTime:0},{sourceTime:3}]},...(seeking?[{label:'seek50',firstTargetFrame:{}}]:[])]});
 const c={end:Date.now()+240000,physicalScreen:'Physical size: 1200x1600',wait:async()=>{},adb:a=>{inputs.push(a);if(a.includes('KEYCODE_BACK')){if(searching)searching=false;else open=false;}else if(a.includes('text'))searching=true;else if(a.includes('swipe'))seeking=true;else if(!searching&&!open)open=true;else if(!searching)paused=true;},originalAccountMatches:async()=>true,ownerReceipt:async()=>({mainFrame:true,exactTarget:true}),evaluate:async s=>{
  if(s.includes('function observeRc30NativeTarget')){if(s.endsWith('("searchInput"))()'))searching=true;return{...geometry,available:cardAvailable||!s.endsWith('("card"))()')};}
  if(s==='(()=>innerHeight>innerWidth)()')return true;
  if(s.includes('function installRc31CookieReplay'))return{installed:true};
  if(s.includes('const input='))return{ok:true,queryEmpty:true};
  if(s.includes('querySame:'))return{found:true,querySame:true,loading:false};
  if(s.includes('state.files.filter'))return true;
  if(s.includes('.metadata('))return{sameExactTarget:true,stableMetadataSame:true,freshRevisionChecksumSame:true,notTrashed:true,canDownload:true};
  if(s.includes('.arm('))return{armed:true};
  if(s.includes('.read()'))return journal();
  if(s.includes('apiCrossOrigin'))return{apiCrossOrigin:true,defaultSameOriginCredentials:true,workerScriptSameOrigin:true,noGoogleIframe:true,token:true};
  if(s==='state.selected!==null||!el.playerSheet.hidden')return open;
  if(s.startsWith('({closed:'))return{closed:!open,retired:!open,q0:false,q1:open,blob:open,frame:open};
  if(s==='window.__rc31CookieReplay.stop()'){stopped=true;return{disposed:true,frameCallbackRemoved:true,mediaListenersRemoved:true};}
  if(s.startsWith('delete window.__rc31CookieReplay')){removed=true;return true;}
  throw Error('UNEXPECTED_MOCK_EVALUATION');
 }};
 return{c,inspect:()=>({stopped,removed,inputs})};
}
test('root callback uses native actions and bounded independently observed original Q1 receipts',async()=>{const m=runtime();const r=await prepare(fake)(m.c);assert.equal(r.originalBytePathQualified,true);assert.equal(r.routes[0].noIndependentCookieDependentMediaTarget,true);assert.equal(r.routes[0].closedSettled,true);assert(m.inspect().stopped&&m.inspect().removed);assert(m.inspect().inputs.some(a=>a.includes('swipe')));assert(!JSON.stringify(r).includes('fixture-'));});
test('missing rendered normal target after native search stops before media open and removes private handles',async()=>{const m=runtime({cardAvailable:false});await assert.rejects(prepare(fake)(m.c),/TARGET_NOT_IN_NORMAL_RENDER_WINDOW/);assert.equal(m.inspect().inputs.length,3);assert.equal(m.inspect().removed,true);});
test('unsupported ASCII search name remains a boundary with no synthetic fallback',async()=>{const m=runtime();await assert.rejects(prepare({...fake,target:{...fake.target,name:'한글.ts'}})(m.c),/NATIVE_ASCII_SEARCH_UNSUPPORTED/);assert.equal(m.inspect().inputs.length,0);assert.equal(m.inspect().removed,true);});
test('immutable31 Q1 routes are independent of cross-origin cookie credentials; worker presence remains permitted',()=>{
 const root=path.resolve(__dirname,'../..'),git=file=>execFileSync('git',['show',SOURCE+':'+file],{cwd:root,maxBuffer:8*1024**2}).toString(),app=git('app.js'),sw=git('sw.js'),q1=git('media/q1-core.mjs');
 const range=app.slice(app.indexOf('readRange: ({ range, signal }) => {',app.indexOf('async function tryOriginalTsPlayback')),app.indexOf('if (q0PinnedSource',app.indexOf('async function tryOriginalTsPlayback')));
 assert(range.includes('new URL(buildMediaUrl'));assert(range.includes('return fetch(url.href'));assert(!range.includes('credentials'));
 const upstream=sw.slice(sw.indexOf('const headers = new Headers();'),sw.indexOf('if (owner) owner.upstream = attempt;'));
 assert(upstream.includes("headers.set('Authorization', `Bearer ${credential.token}`)"));assert(!upstream.includes('credentials'));assert(!upstream.includes("headers.set('Cookie'"));
 const meta=sw.slice(sw.indexOf('const requestJSON ='),sw.indexOf('owner.upstream = upstream;',sw.indexOf('const requestJSON =')));
 assert(meta.includes('Authorization: `Bearer ${credential.token}`'));assert(!meta.includes('credentials'));
 assert(q1.includes('new Worker(new URL("./transmux-worker.mjs",import.meta.url),{type:"module"})'));
 assert.equal(crypto.createHash('sha256').update(git('app.js')).digest('hex'),require('../rc31-resume-20261001/sourcebinding.json').sourceSHA256['app.js']);
});
test('root executor and callback import without private reads or execution',()=>{assert.equal(typeof require('./root-execute.cjs').execute,'function');assert.equal(typeof prepare,'function');});
