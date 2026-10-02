'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const here=__dirname,source=fs.readFileSync(path.join(here,'browser-attempt4.function.js'),'utf8');
const color={primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false},file={id:'local-fixture',name:'Mock only.mp4',size:'659966',mimeType:'video/mp4',videoMediaMetadata:{durationMillis:'6000'}};
const meta={id:file.id,size:file.size,mimeType:file.mimeType,version:'1',headRevisionId:'A',modifiedTime:'A',sha256Checksum:'a'.repeat(64),trashed:false};
let closedFrames=0;const calls=[],controller={state:'activated'};
const ctx={window:{Worker:class MockWorker {addEventListener(){}removeEventListener(){}}},APP_VERSION:'1.22.0-rc.36',location:{origin:'https://example.invalid',href:'https://example.invalid/'},navigator:{serviceWorker:{controller}},document:{visibilityState:'visible'},
 state:{selected:null,authStatus:'online',accountStateLoaded:true,authAccountKey:'mock-account',driveSessionGeneration:1,mediaSession:0,currentFolderId:'root',query:''},
 q0Playback:null,q0PinnedSource:null,q1Playback:null,playerTracksOwner:null,q1RetirementResult:{settled:true},playerTracksRetirementResult:{settled:true},q1Retirement:Promise.resolve(),playerTracksRetirement:Promise.resolve(),
 el:{playerSheet:{hidden:true},videoPlayer:{readyState:2,videoWidth:320,videoHeight:180,paused:true,error:null},playerTracksDialog:{open:false}},
 crypto:crypto.webcrypto,Uint8Array,TextEncoder,
 DRIVE_API:'https://www.googleapis.com/drive/v3',URL,URLSearchParams,AbortController,setTimeout,clearTimeout,
 hasUsableToken:()=>true,hasVerifiedOriginalTransport:()=>true,
 driveFetch:async url=>{calls.push(url);if(new URL(url).searchParams.get('alt')==='media'){const bytes=new Uint8Array(16384);bytes.set(new TextEncoder().encode('ftypisom'),4);return new Response(bytes,{status:206});}return new Response(JSON.stringify(new URL(url).pathname.endsWith('/files')?{files:[file],incompleteSearch:false}:meta));},
 VideoFrame:class {constructor(){this.format='NV12';this.codedWidth=320;this.codedHeight=192;this.visibleRect={width:320,height:180};this.colorSpace=color;}close(){closedFrames++;}},
 openPlayer:f=>{ctx.state.selected=f;ctx.state.mediaSession=1;ctx.state.mediaDecodeVerified=true;ctx.q0Playback={};ctx.q0PinnedSource={};ctx.el.playerSheet.hidden=false;},
 openPlayerTracks:async()=>{ctx.playerTracksOwner={current:()=>true,cleanupOk:true,inventory:{audioTracks:[{trackId:2,codec:'aac',route:'q1'}]},identity:meta};ctx.el.playerTracksDialog.open=true;},
 closePlayer:()=>{ctx.state.selected=null;ctx.q0Playback=null;ctx.q1Playback=null;ctx.playerTracksOwner=null;ctx.el.playerSheet.hidden=true;}
};
vm.createContext(ctx);
(async()=>{
 vm.runInContext('('+source+')()',ctx);const helper=ctx.window.__rc36ActualColor;
 const selected=await helper.locate();assert.equal(selected.bytes,659966);assert.equal(calls.length,3);assert.equal(new URL(calls[0]).searchParams.get('pageSize'),'20');
 await assert.rejects(helper.locate(),/COLOR_LOCATOR_ONCE/);
 assert.equal(helper.open().current,true);assert.equal(helper.captureNative().frameClosed,true);assert.equal(closedFrames,1);
 await helper.tracks();ctx.q0Playback=null;ctx.playerTracksOwner.nativeColorObservation={identity:meta,format:'NV12',colorSpace:color};
 const config={codec:'avc1.42E01E',codedWidth:320,codedHeight:180,description:new Uint8Array([1,2,3])};
 ctx.q1Playback={player:{stats:()=>({phase:'buffered-to-end',generation:1,outputColorObservation:{colorSpace:color},pipeline:{selectedAudioTrackId:2,videoConfig:config,outputVideoConfig:{...config,colorSpace:color},encodersCreated:0}})}};
 const result=await helper.verify();assert.equal(result.capturedTupleMatches,true);assert.equal(result.derivedTupleMatches,true);assert.equal(result.frameTupleMatches,true);assert.equal(result.originalMetadataUnchanged,true);assert.equal(result.sourceConfigPreserved,true);assert.equal(closedFrames,2);
 const cleaned=await helper.cleanup();assert(Object.values(cleaned).every(v=>v===true));assert.equal(ctx.window.__rc36ActualColor,undefined);
 const out={schema:'rc36-color-integration-preflight/1',passed:true,localMockOnly:true,metadataRequests:3,headerRequests:1,noPagination:true,nativeFramesCreated:2,nativeFramesClosed:closedFrames,fullHelperLifecycle:true,cleanup:true,
 files:['browser-attempt4.function.js','driver-attempt4.cjs','preflight-attempt4.cjs'].map(file=>{const b=fs.readFileSync(path.join(here,file));return{file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};})};
 fs.writeFileSync(path.join(here,'preparation-attempt4.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,localMockOnly:true,metadataRequests:3,headerRequests:1,framesClosed:closedFrames}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
