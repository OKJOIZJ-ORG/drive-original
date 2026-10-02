'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {binding,observer,input,compare,run}=require('./driver.cjs');
const {captureGeometry,pixelHash,cropViewport}=require('./native-painted-sampler.cjs'),{PNG}=require('pngjs');
const readPNG=png=>PNG.sync.read(png,{checkCRC:true});
const b={schema:'pc-image-binding/1',sourceCommit:'a'.repeat(40),version:'1.22.0-rc.34',sourceSHA256:{'app.js':'a'.repeat(64),'sw.js':'b'.repeat(64),'version.json':'c'.repeat(64)}};
const t={id:'synthetic-private-target',name:'synthetic-name',size:'1000',mimeType:'image/gif',modifiedTime:'2026-10-02',headRevisionId:'revision-1',parents:['synthetic-parent'],role:'gif'};
const p={schema:'pc-image-targets/1',account:{accountId:'synthetic-account',authAccountKey:'synthetic-key'},targets:[t]};
test('explicit binding replaces only frozen owner/source pins, preserves crop and same-owner logic',()=>{
 const s=observer(b);assert(s.includes('installPcImageObservation'));assert(s.includes("'"+b.sourceCommit+"'"));assert(s.includes('installedAccountGeneration'));assert(s.includes('sameOwner'));assert(s.includes('scale: 1 / devicePixelRatio'));assert(!s.includes('1.22.0-rc.32'));assert.throws(()=>binding({...b,sourceCommit:'HEAD'}));assert.throws(()=>binding({...b,sourceSHA256:{'app.js':'a'.repeat(64)}}));
});
test('native viewport path crops the fenced CSS region and charges all captured bytes',()=>{
 const g=captureGeometry({x:2,y:3,width:1,height:1,scale:.8},{cssVisualViewport:{pageX:0,pageY:10,clientWidth:10,clientHeight:8,scale:1}},1.25);
 const data=Buffer.alloc(13*10*4,255);data[(3*13+2)*4]=17;const source=PNG.sync.write({width:13,height:10,data});
 const r=cropViewport(source,g,{width:10,height:8,dpr:1.25,scale:1},readPNG,PNG.sync.write);assert.equal(r.sourceEncodedBytes,source.length);assert.equal(r.geometry.nativeRect.x,2);assert.equal(r.geometry.nativeRect.y,3);assert.equal(r.geometry.nativeRect.width,2);assert.equal(pixelHash(r.png,r.geometry,readPNG).nativeWidth,2);
 assert.throws(()=>cropViewport(source,g,{width:20,height:8,dpr:1.25,scale:1},readPNG,PNG.sync.write),/CAPTURE_VIEWPORT_FOOTPRINT/);
 assert.throws(()=>cropViewport(source,g,{width:10,height:8,dpr:1.25,scale:1.1},readPNG,PNG.sync.write),/CAPTURE_GEOMETRY/);
});
test('protected input is bounded and metadata drift/missing authority fails',()=>{
 input(p);assert.throws(()=>input({...p,targets:[t,t]}));assert.throws(()=>input({...p,targets:Array.from({length:4},(_,i)=>({...t,id:String(i)}))}));
 assert(compare(t,{...t,trashed:false,capabilities:{canDownload:true}}));assert.throws(()=>compare(t,{...t,size:'999',trashed:false,capabilities:{canDownload:true}}));assert.throws(()=>compare(t,{...t,trashed:false,capabilities:{canDownload:false}}));
});
test('failure evidence stays safe, cleanup runs after deadline, existing output blocks activity',async()=>{
 const output=path.join(__dirname,'guard-owned-output.json');assert(!fs.existsSync(output));let reads=0,closed=0,restored=0,detached=0;
 const transport={readPNG,evaluate:async()=>({observerRemoved:true}),prepareTarget:async()=>({normalUi:true,exactTarget:true}),openCard:async()=>{},captureCrop:async()=>{},readMetadata:async()=>{reads++;return{...t,size:'changed',trashed:false,capabilities:{canDownload:true}};},closePlayer:async()=>{closed++;return{closed:true,retired:true};},restoreNavigation:async()=>{restored++;return{restored:true};},closeOwned:async()=>{detached++;return{closed:true,ownedOnly:true};}};
 try{const r=await run({transport,binding:b,privateInput:p,output});assert.equal(r.passed,false);assert.equal(r.failure,'FRESH_METADATA_MISMATCH');assert.equal(reads,1);assert.equal(closed,1);assert.equal(restored,1);assert.equal(detached,1);const text=fs.readFileSync(output,'utf8');assert(!text.includes(t.id));assert(!text.includes(t.name));assert(!text.includes(p.account.accountId));await assert.rejects(run({transport,binding:b,privateInput:p,output}));assert.equal(reads,1);}finally{if(fs.existsSync(output))fs.unlinkSync(output);}
 const out2=path.join(__dirname,'guard-owned-deadline.json');try{const slow={...transport,prepareTarget:async()=>new Promise(r=>setTimeout(()=>r({normalUi:true,exactTarget:true}),30))};const r=await run({transport:slow,binding:b,privateInput:p,output:out2,totalMs:5});assert.equal(r.failure,'TOTAL_BOUND');assert(r.cleanup.ownedTransport.closed);}finally{if(fs.existsSync(out2))fs.unlinkSync(out2);}
});
test('normal card two lifetimes require six fenced crops within twelve-capture budget; cleanup failure prevents pass',async()=>{
 let open=false,armed=false,captures=0,opens=0,closes=0;
 const png=()=>PNG.sync.write({width:1,height:1,data:Buffer.from([captures%2?255:0,0,0,255])});
 const geometry=c=>captureGeometry(c,{cssVisualViewport:{pageX:0,pageY:0,clientWidth:100,clientHeight:100,scale:1}},1);
 const snapshot=()=>({sourceQualified:true,accountSame:true,foreground:true,online:true,exactSelectedMetadata:true,imageReady:open,sameOwner:open&&armed,originalMode:true,transportVerified:true,noImageIframeFallback:true,videoHidden:true,videoControlsHidden:true,imageErrorHidden:true,closed:!open,selectionCleared:!open,sourcesCleared:!open,retired:!open});
 const tr={readPNG,prepareTarget:async()=>({normalUi:true,exactTarget:true}),readMetadata:async()=>({...t,trashed:false,capabilities:{canDownload:true}}),openCard:async()=>{open=true;armed=false;opens++;return{normalCard:true,exactTarget:true};},closePlayer:async()=>{open=false;closes++;return{closed:true,retired:true};},restoreNavigation:async()=>({restored:true}),closeOwned:async()=>({closed:true,ownedOnly:true}),captureCrop:async o=>{assert(o.croppedOnly&&o.save===false&&o.clip.width===1&&o.clip.height===1);captures++;return{png:png(),geometry:geometry(o.clip)};},evaluate:async s=>{if(s.includes('.fence('))return{admitted:true,clip:{x:1,y:1,width:1,height:1,scale:1}};if(s.includes('.arm(')){armed=true;return snapshot();}if(s.includes('.snapshot('))return snapshot();if(s.includes('.dispose('))return{observerRemoved:true};return{installed:true};}};
 const out=path.join(__dirname,'guard-owned-success.json');try{const r=await run({transport:tr,binding:b,privateInput:p,output:out});assert(r.passed);assert.equal(captures,6);assert(captures<=12);assert.equal(opens,2);assert.equal(closes,3);assert.equal(r.rows[0].sampleCount,6);assert.equal(r.rows[0].alpha,'UNKNOWN');assert.equal(r.rows[0].loop,'UNKNOWN');assert.equal(r.qualityAcceptance,'UNKNOWN');}finally{if(fs.existsSync(out))fs.unlinkSync(out);}
 const failout=path.join(__dirname,'guard-owned-cleanup.json');try{const r=await run({transport:{...tr,prepareTarget:async()=>{throw Error('SYNTHETIC_FAILURE');},closeOwned:async()=>({closed:false,ownedOnly:true})},binding:b,privateInput:p,output:failout});assert.equal(r.passed,false);assert.equal(r.cleanupFailure,true);}finally{if(fs.existsSync(failout))fs.unlinkSync(failout);}
});
test('native crop translates scroll origin and admits fractional DPR without relabeling pixels',()=>{
 const clip={x:11,y:12,width:1,height:1,scale:.8},metrics={cssVisualViewport:{pageX:0,pageY:639.2,clientWidth:1500,clientHeight:640,scale:1}};
 const g=captureGeometry(clip,metrics,1.25);assert.equal(g.pageClip.y,651.2);assert.equal(g.pageClip.scale,1);
 const data=Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]),png=PNG.sync.write({width:2,height:2,data});
 const r=pixelHash(png,g,readPNG);assert.equal(r.nativeWidth,2);assert.equal(r.nativeHeight,2);assert.equal(r.paintedCropRGBAsha256,require('node:crypto').createHash('sha256').update(data).digest('hex'));
 assert.throws(()=>captureGeometry({...clip,scale:1},metrics,1.25),/CAPTURE_GEOMETRY/);
 assert.throws(()=>captureGeometry({...clip,y:640},metrics,1.25),/CAPTURE_GEOMETRY/);
 assert.throws(()=>pixelHash(PNG.sync.write({width:10,height:10,data:Buffer.alloc(400)}),g,()=>{throw Error('must reject before decode');}),/CAPTURE_NATIVE_FOOTPRINT/);
 const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;assert.throws(()=>pixelHash(corrupt,g,readPNG),/CAPTURE_PNG_DECODE/);
 assert.throws(()=>pixelHash(png.subarray(0,15),g,readPNG),/CAPTURE_PNG_REQUIRED/);
});
