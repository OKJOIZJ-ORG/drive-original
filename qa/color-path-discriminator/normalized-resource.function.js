async function discriminateNativeResourceRendering() {
  if(window.__resourceColorRun)throw Error('COLOR_RESOURCE_RUN_ALREADY_STARTED');window.__resourceColorRun=true;
  const report={schema:'native-resource-normalized-yuv-rendering/1',scope:'Only saved generated source and copied observed-color output, no pipeline/account/media mutation.',
    userAgent:navigator.userAgent,cases:[],comparisons:[],cleanup:null};
  const videos=[],urls=[],timers=new Set(),callbacks=new Map(),listeners=new Set(),pixels=new Map();
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const bounded=(label,setup)=>new Promise((resolve,reject)=>{
    let clean=()=>{},done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);timers.delete(timer);clean();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('COLOR_'+label+'_DEADLINE')),15000);timers.add(timer);clean=setup(v=>finish(null,v),e=>finish(e))||clean;
  });
  const event=(node,type,action)=>bounded(type.toUpperCase(),(ok,bad)=>{
    const handle=e=>ok({trusted:e.isTrusted}),error=()=>bad(Error('COLOR_RESOURCE_NATIVE_ERROR'));
    node.addEventListener(type,handle,{once:true});node.addEventListener('error',error,{once:true});
    const clean=()=>{node.removeEventListener(type,handle);node.removeEventListener('error',error);listeners.delete(clean);};listeners.add(clean);action();return clean;
  });
  const draw=async(input,width,height,label)=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});
    ctx.drawImage(input,0,0);const rgba=ctx.getImageData(0,0,width,height).data;pixels.set(label,rgba);
    return{label,sha256:await hash(rgba),width,height,attributes:ctx.getContextAttributes(),png:canvas.toDataURL()};
  };
  const capture=async(v,m,label)=>{
    const vf=new VideoFrame(v);let normalized;
    try {
      const colorSpace=vf.colorSpace.toJSON(),rect=vf.visibleRect,raw=new Uint8Array(vf.allocationSize({rect}));
      const direct=await draw(v,v.videoWidth,v.videoHeight,label+'-video'),frameView=await draw(vf,vf.displayWidth,vf.displayHeight,label+'-frame');
      const layout=await vf.copyTo(raw,{rect});
      // Explicit causal intervention: retain exact native YUV bytes and color,
      // reconstruct one equal tightly packed visible surface for both paths.
      normalized=new VideoFrame(raw,{format:vf.format,codedWidth:rect.width,codedHeight:rect.height,layout,
        timestamp:vf.timestamp,colorSpace,displayWidth:vf.displayWidth,displayHeight:vf.displayHeight});
      const normalizedView=await draw(normalized,normalized.displayWidth,normalized.displayHeight,label+'-normalized');
      return{label,frame:{mediaTime:m.mediaTime},format:vf.format,codedWidth:vf.codedWidth,codedHeight:vf.codedHeight,visibleRect:rect.toJSON(),
        displayWidth:vf.displayWidth,displayHeight:vf.displayHeight,colorSpace,nativePlanes:{bytes:raw.length,sha256:await hash(raw),layout,formatConversionRequested:false},
        normalized:{format:normalized.format,codedWidth:normalized.codedWidth,codedHeight:normalized.codedHeight,colorSpace:normalized.colorSpace.toJSON()},views:[direct,frameView,normalizedView]};
    }finally{normalized?.close();vf.close();}
  };
  const seek=(v,target,pts,label)=>bounded('RESOURCE_FRAME',(ok,bad)=>{
    let active=true;const watch=()=>{const id=v.requestVideoFrameCallback((_,m)=>{callbacks.delete(v);if(!active)return;
      if(Math.abs(m.mediaTime-pts)>.0001){watch();return;}active=false;capture(v,m,label).then(ok,bad);});callbacks.set(v,id);};watch();v.currentTime=target;
    return()=>{active=false;const id=callbacks.get(v);if(id!=null)v.cancelVideoFrameCallback(id);callbacks.delete(v);};
  });
  const compare=(a,b)=>{const x=pixels.get(a),y=pixels.get(b);if(!x||!y||x.length!==y.length)return{a,b,qualified:false};
    let changed=0,max=0,sq=0,sum=0;for(let p=0;p<x.length;p++){if(p%4===3)continue;const d=Math.abs(x[p]-y[p]);changed+=d>0;max=Math.max(max,d);sq+=d*d;sum+=d;}
    const n=x.length/4*3;return{a,b,qualified:true,exact:changed===0,differentChannels:changed,maxChannelDelta:max,meanAbsoluteChannelDelta:sum/n,psnr:sq?10*Math.log10(255**2/(sq/n)):null};};
  try{
    const native=document.createElement('video');native.muted=true;native.width=320;native.height=180;videos.push(native);document.body.append(native);
    await event(native,'loadeddata',()=>{native.src='/source.mp4';native.load();});report.cases.push(await seek(native,5.999999,5.958333333333333,'file'));
    const v=document.createElement('video');v.muted=true;v.width=320;v.height=180;videos.push(v);document.body.append(v);
    const ms=new MediaSource(),url=URL.createObjectURL(ms);urls.push(url);await event(ms,'sourceopen',()=>{v.src=url;v.load();});
    const sb=ms.addSourceBuffer('video/mp4; codecs="avc1.42c00c,mp4a.40.2"'),bytes=await(await fetch('/remux.mp4')).arrayBuffer();
    const loaded=event(v,'loadeddata',()=>{});loaded.catch(()=>{});await event(sb,'updateend',()=>sb.appendBuffer(bytes));ms.endOfStream();await loaded;
    if(!Array.from({length:sb.buffered.length},(_,i)=>[sb.buffered.start(i),sb.buffered.end(i)]).some(([a,b])=>.9663333333333334>=a&&.9663333333333334<b))throw Error('COLOR_RESOURCE_TARGET_OUTSIDE');
    report.cases.push(await seek(v,.9663333333333334,.9663333333333334,'mse'));
    report.comparisons=[compare('file-video','mse-video'),compare('file-frame','mse-frame'),compare('file-normalized','mse-normalized'),
      compare('file-video','file-frame'),compare('mse-video','mse-frame'),compare('file-video','file-normalized'),compare('mse-video','mse-normalized')];
    report.observed=true;
  }catch(e){report.failure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'COLOR_RESOURCE_OPERATION_FAILED';report.errorName=e.name;}
  finally{
    for(const[v,id]of callbacks)v.cancelVideoFrameCallback(id);callbacks.clear();for(const t of timers)clearTimeout(t);timers.clear();for(const clean of[...listeners])clean();
    for(const v of videos){v.pause();v.removeAttribute('src');v.load();}for(const url of urls)URL.revokeObjectURL(url);
    report.cleanup={callbacksEmpty:callbacks.size===0,timersEmpty:timers.size===0,listenersEmpty:listeners.size===0,sourcesRemoved:videos.every(v=>!v.hasAttribute('src')),urlsRevoked:urls.length};
    const response=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});if(!response.ok)throw Error('COLOR_RESOURCE_RESULT_SAVE');
  }
  return{observed:report.observed===true,failure:report.failure||null,comparisons:report.comparisons,cleanup:report.cleanup};
}
