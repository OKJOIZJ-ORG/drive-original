'use strict';
// A viewport fence selects one CSS pixel. CDP receives page coordinates at
// native scale; fractional DPR can round that region to several physical pixels.
const crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{safeImageSampler:true});};
function captureGeometry(c,m,dpr){
 const v=m?.cssVisualViewport;
 if(!v||![v.pageX,v.pageY,v.clientWidth,v.clientHeight,dpr,c?.x,c?.y].every(Number.isFinite)||dpr<1||dpr>8||v.scale!==1||c.width!==1||c.height!==1||Math.abs(c.scale*dpr-1)>1e-6||c.x<0||c.y<0||c.x+1>v.clientWidth||c.y+1>v.clientHeight)fail('CAPTURE_GEOMETRY');
 return {schema:'native-crop-geometry/1',viewportClip:{x:c.x,y:c.y,width:1,height:1},pageClip:{x:c.x+v.pageX,y:c.y+v.pageY,width:1,height:1,scale:1},viewport:{pageX:v.pageX,pageY:v.pageY,width:v.clientWidth,height:v.clientHeight},dpr,minPixels:Math.max(1,Math.floor(dpr)),maxPixels:Math.ceil(dpr)+1};
}
function pixelHash(png,g,readPNG){
 if(!Buffer.isBuffer(png)||png.length<33||png.length>8*1024*1024||!png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))fail('CAPTURE_PNG_REQUIRED');
 if(g?.schema!=='native-crop-geometry/1'||typeof readPNG!=='function'||g.pageClip?.scale!==1||g.pageClip.width!==1||g.pageClip.height!==1||g.dpr<1||g.dpr>8||g.minPixels!==Math.max(1,Math.floor(g.dpr))||g.maxPixels!==Math.ceil(g.dpr)+1)fail('CAPTURE_GEOMETRY');
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(png.readUInt32BE(8)!==13||png.toString('ascii',12,16)!=='IHDR'||width<g.minPixels||height<g.minPixels||width>g.maxPixels||height>g.maxPixels||png[24]!==8||![2,6].includes(png[25]))fail('CAPTURE_NATIVE_FOOTPRINT');
 let decoded;try{decoded=readPNG(png);}catch{fail('CAPTURE_PNG_DECODE');}
 if(decoded?.width!==width||decoded?.height!==height||!Buffer.isBuffer(decoded.data)||decoded.data.length!==width*height*4)fail('CAPTURE_PNG_DECODE');
 return {paintedCropRGBAsha256:hash(decoded.data),nativeWidth:width,nativeHeight:height};
}
function cropViewport(png,g,viewport,readPNG,writePNG){
 // Some extension CDP backends stall cropped screenshot requests. Capture one
 // bounded native viewport in memory, crop immediately, and retain no full image.
 if(!Buffer.isBuffer(png)||png.length<33||png.length>8*1024*1024||!png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))fail('CAPTURE_PNG_REQUIRED');
 if(viewport?.scale!==1||viewport.dpr!==g.dpr||![viewport.width,viewport.height].every(Number.isFinite)||viewport.width<=0||viewport.height<=0)fail('CAPTURE_GEOMETRY');
 const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
 if(w*h>8*1024*1024||Math.abs(w-Math.ceil(viewport.width*g.dpr))>1||Math.abs(h-Math.ceil(viewport.height*g.dpr))>1)fail('CAPTURE_VIEWPORT_FOOTPRINT');
 let decoded;try{decoded=readPNG(png);}catch{fail('CAPTURE_PNG_DECODE');}
 if(decoded?.width!==w||decoded?.height!==h||decoded.data?.length!==w*h*4)fail('CAPTURE_PNG_DECODE');
 const c=g.viewportClip,x=Math.floor(c.x*g.dpr),y=Math.floor(c.y*g.dpr),width=Math.ceil((c.x+1)*g.dpr)-x,height=Math.ceil((c.y+1)*g.dpr)-y;
 if(x<0||y<0||x+width>w||y+height>h)fail('CAPTURE_NATIVE_FOOTPRINT');
 const data=Buffer.alloc(width*height*4);for(let row=0;row<height;row++)decoded.data.copy(data,row*width*4,((y+row)*w+x)*4,((y+row)*w+x+width)*4);
 return {png:writePNG({width,height,data}),geometry:{...g,capturePath:'native viewport PNG, discarded after memory-only crop',nativeRect:{x,y,width,height},nativeViewport:{width:w,height:h}},sourceEncodedBytes:png.length,sourcePNGsha256:hash(png)};
}
async function samplePainted({capture,readFence,readPNG,phase,durationMs=8000,maxSamples=12,budget={sampleCount:0,encodedBytes:0}}){
 if(!['card','viewer'].includes(phase)||typeof capture!=='function'||typeof readFence!=='function'||typeof readPNG!=='function'||!Number.isInteger(durationMs)||durationMs<1||durationMs>8000||!Number.isInteger(maxSamples)||maxSamples<2||maxSamples>12||!Number.isInteger(budget.sampleCount)||budget.sampleCount<0||budget.sampleCount>12||!Number.isInteger(budget.encodedBytes)||budget.encodedBytes<0||budget.encodedBytes>8*1024*1024)fail('SAMPLER_ARGUMENTS');
 const start=performance.now(),deadline=start+durationMs,samples=[];let encodedBytes=0,clipKey,geometryKey;
 const bounded=async work=>{const remaining=Math.floor(deadline-performance.now());if(remaining<1)fail('CAPTURE_DEADLINE');const controller=new AbortController();let timer;try{return await Promise.race([Promise.resolve().then(()=>work(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('CAPTURE_DEADLINE'),{safeImageSampler:true}));},remaining);})]);}finally{clearTimeout(timer);controller.abort();}};
 const fence=async()=>{const f=await bounded(signal=>readFence(phase,signal)),c=f?.clip;if(f?.admitted!==true||!c||![c.x,c.y,c.scale].every(Number.isFinite)||c.x<0||c.y<0||c.width!==1||c.height!==1||c.scale<=0||c.scale>1)fail('PAINT_FENCE');const key=JSON.stringify(c);if(clipKey&&clipKey!==key)fail('PAINT_GEOMETRY_CHANGED');clipKey=key;return c;};
 try{
  for(let i=0;i<maxSamples&&performance.now()<deadline;i++){
   const desired=start+i*durationMs/maxSamples;if(desired>performance.now())await new Promise(r=>setTimeout(r,Math.min(desired-performance.now(),Math.max(0,deadline-performance.now()))));
   const clip=await fence();if(budget.sampleCount>=12)fail('CAPTURE_SAMPLE_BUDGET');budget.sampleCount++;
   const result=await bounded(signal=>capture({format:'png',clip,captureBeyondViewport:false,signal,timeoutMs:Math.max(1,Math.floor(deadline-performance.now())),maxEncodedBytes:8*1024*1024-budget.encodedBytes}));
   if(!Buffer.isBuffer(result?.png))fail('CAPTURE_BUFFER_REQUIRED');const admittedBytes=result.sourceEncodedBytes??result.png.length;if(!Number.isSafeInteger(admittedBytes)||admittedBytes<result.png.length)fail('CAPTURE_BYTE_BUDGET');encodedBytes+=admittedBytes;budget.encodedBytes+=admittedBytes;if(budget.encodedBytes>8*1024*1024)fail('CAPTURE_BYTE_BUDGET');
   const g=result.geometry;if(JSON.stringify(g?.viewportClip)!==JSON.stringify({x:clip.x,y:clip.y,width:1,height:1}))fail('CAPTURE_GEOMETRY');
   const key=JSON.stringify(g);if(geometryKey&&geometryKey!==key)fail('PAINT_GEOMETRY_CHANGED');geometryKey=key;
   await fence();if(performance.now()>deadline)fail('CAPTURE_DEADLINE');
   samples.push({elapsedMs:Math.round(performance.now()-start),pngSha256:hash(result.png),sourcePNGsha256:result.sourcePNGsha256??null,sourceEncodedBytes:admittedBytes,...pixelHash(result.png,g,readPNG),geometry:g});
  }
  if(samples.length<2)fail('PAINT_SAMPLES_INSUFFICIENT');const distinct=new Set(samples.map(s=>s.paintedCropRGBAsha256)).size;
  return {phase,samples,encodedBytes,distinctPaintedCrops:distinct,observedChangingPixel:distinct>1,observedStablePixel:distinct===1,measurement:'native physical RGBA region for one CSS pixel; page-offset transform fenced',preciseDelayProven:false,fullLoopProven:false,alphaPreservationProven:false,originalByteIdentityProven:false,foregroundOwnerFencesPassed:true,rawPixelsExported:false};
 }catch(e){throw Error(e?.safeImageSampler===true?e.message:'SAMPLER_OPERATION_FAILED');}
}
module.exports={captureGeometry,pixelHash,cropViewport,samplePainted};
