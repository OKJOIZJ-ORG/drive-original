async function verifyObservedNativeColorPlayer() {
  if (window.__observedColorRun) throw Error('COLOR_RUN_ALREADY_STARTED');
  window.__observedColorRun = true;
  const report = {schema:'observed-native-color-player/1', scope:'Generated fixture, actual native file observation and Q1 worker/MSE output; no Drive account or original media mutation.',
    chrome:navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0],viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},startedAt:Date.now(),runs:[],sources:[],workers:[],cleanup:null};
  const native = document.createElement('video'), video = document.createElement('video');
  for (const v of [native,video]) {v.width=320;v.height=180;v.muted=true;v.controls=true;document.body.append(v);}
  const callbacks=new Map(),timers=new Set(),listeners=new Set(); let player,ownerActive=true;
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const bounded=(setup,label,ms=15000)=>new Promise((resolve,reject)=>{
    let clean=()=>{},done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);timers.delete(timer);clean();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('COLOR_'+label+'_DEADLINE')),ms);timers.add(timer);
    clean=setup(value=>finish(null,value),error=>finish(error))||clean;
  });
  const event=(node,type,action)=>bounded((ok,bad)=>{
    const handle=e=>ok({trusted:e.isTrusted}),error=()=>bad(Error('COLOR_NATIVE_ERROR'));
    node.addEventListener(type,handle,{once:true});node.addEventListener('error',error,{once:true});
    const clean=()=>{node.removeEventListener(type,handle);node.removeEventListener('error',error);listeners.delete(clean);};listeners.add(clean);action();return clean;
  },type.toUpperCase());
  const capture=async(v,m)=>{
    const vf=new VideoFrame(v);
    try {
      const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
      const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(v,0,0);
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const raw=new Uint8Array(vf.allocationSize({rect:vf.visibleRect})),layout=await vf.copyTo(raw,{rect:vf.visibleRect});
      return {frame:{mediaTime:m.mediaTime,presentedFrames:m.presentedFrames},elementTime:v.currentTime,
        format:vf.format,codedWidth:vf.codedWidth,codedHeight:vf.codedHeight,visibleRect:vf.visibleRect.toJSON(),colorSpace:vf.colorSpace.toJSON(),
        nativePlanes:{sha256:await hash(raw),bytes:raw.length,layout,formatConversionRequested:false},
        canvas:{sha256:await hash(rgba),width:canvas.width,height:canvas.height,attributes:ctx.getContextAttributes()}};
    } finally {vf.close();}
  };
  const frame=(v,expected)=>bounded((ok,bad)=>{
    let active=true;const watch=()=>{const id=v.requestVideoFrameCallback((_,m)=>{
      callbacks.delete(v);if(!active)return;
      const pts=expected();if(!Number.isFinite(pts)||Math.abs(m.mediaTime-pts)>.0001){watch();return;}
      active=false;capture(v,m).then(ok,bad);
    });callbacks.set(v,id);};watch();
    return()=>{active=false;const id=callbacks.get(v);if(id!=null)v.cancelVideoFrameCallback(id);callbacks.delete(v);};
  },'PACKET_FRAME');
  const timed=p=>bounded((ok,bad)=>{Promise.resolve(p).then(ok,bad);},'PLAYER');
  const base64=b=>{let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
  try {
    const binding=await(await fetch('/binding')).json();report.binding=binding;
    const ownedOrigin=location.origin;const identity={fileId:'generated-color-fixture',accountKey:'synthetic',accountGeneration:1,headRevisionId:'fixture-A',
      size:String(binding.source.bytes),mimeType:'video/mp4',modifiedTime:'fixture-A',sha256Checksum:binding.source.sha256,canDownload:true,trashed:false};
    const {observeNativeFrameColor}=await import('/media/native-color.mjs');
    const {createGeneralPlayer}=await import('/media/general-player.mjs');
    await event(native,'loadeddata',()=>{native.src='/source.mp4';native.load();});
    const nativeFrame=frame(native,()=>5.958333333333333);nativeFrame.catch(()=>{});
    await event(native,'seeked',()=>{native.currentTime=5.999999;});
    report.native=await nativeFrame;
    const observation=observeNativeFrameColor({video:native,identity,isCurrent:()=>native.currentSrc===location.origin+'/source.mp4'});
    if(!observation)throw Error('COLOR_NATIVE_OBSERVATION_UNAVAILABLE');report.observation={basis:observation.basis,format:observation.format,codedWidth:observation.codedWidth,codedHeight:observation.codedHeight,visibleRect:observation.visibleRect,colorSpace:observation.colorSpace,identityQualified:true,currentQualified:true};
    const openSource=async()=>{
      const record={reads:0,bytes:0,activeReads:0,aborts:0,active:true};report.sources.push(record);const controllers=new Set();
      return {identity,async read({start,end}){
        if(!record.active||!ownerActive||location.origin!==ownedOrigin)throw Error('Q1_SOURCE_STALE');const controller=new AbortController();controllers.add(controller);record.activeReads++;
        try {const r=await fetch('/source.mp4',{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal});
          if(r.status!==206||r.headers.get('Content-Range')!==`bytes ${start}-${end}/${identity.size}`)throw Error('COLOR_RANGE_UNQUALIFIED');
          const b=new Uint8Array(await r.arrayBuffer());if(!record.active||!ownerActive||location.origin!==ownedOrigin)throw Error('Q1_SOURCE_STALE');if(b.length!==end-start+1)throw Error('COLOR_RANGE_BODY');record.reads++;record.bytes+=b.length;return b;
        } finally {record.activeReads--;controllers.delete(controller);}
      },async abort(){if(record.active){record.active=false;record.aborts++;for(const c of controllers)c.abort();}return{settled:record.activeReads===0};}};
    };
    const chunks=new Map();
    const workerFactory=url=>{
      const worker=new Worker(url,{type:'module'}),record={created:true,terminated:false};report.workers.push(record);
      worker.addEventListener('message',e=>{const m=e.data;if(m.kind==='window')record.outputColorObservation=m.value.outputColorObservation;
        if(m.kind==='terminal')record.terminal=m.result?{generation:m.result.generation,outputColorObservation:m.result.outputColorObservation,encodersCreated:m.result.encodersCreated,cleanup:m.result.cleanup}:m.error;});
      const terminate=worker.terminate.bind(worker);worker.terminate=()=>{record.terminated=true;return terminate();};return worker;
    };
    let expected=NaN,currentPacketPTS=NaN;
    for (const item of [{label:'last-frame',target:5.999999,packetPTS:5.958333333333333},
      {label:'back-seek',target:2,packetPTS:2},{label:'last-frame-return',target:5.999999,packetPTS:5.958333333333333}]) {
      expected=NaN;currentPacketPTS=item.packetPTS;
      const presented=frame(video,()=>expected),start=performance.now();presented.catch(()=>{});
      let mapping;
      if(!player){player=createGeneralPlayer({video,openSource,isCurrent:()=>ownerActive&&location.origin===ownedOrigin,initialTime:item.target,autoplay:false,
        workerFactory,selectedAudioTrackId:2,nativeColorObservation:observation,
        onEvent:e=>{if(e.type==='mapping')expected=currentPacketPTS-e.commonShift;}});mapping=await timed(player.ready);}
      else {mapping=await timed(player.seek(item.target,{autoplay:false}));expected=item.packetPTS-mapping.commonShift;}
      const image=await presented;await timed(player.completion());const stats=player.stats();
      const nativeLayoutExact=image.format===report.native.format&&JSON.stringify(image.nativePlanes.layout)===JSON.stringify(report.native.nativePlanes.layout);
      const samePacket=item.packetPTS===5.958333333333333;
      const result={label:item.label,target:item.target,packetPTS:item.packetPTS,elapsedMs:Math.round(performance.now()-start),mapping,stats,image,
        comparison:samePacket?{rgbaExact:image.canvas.sha256===report.native.canvas.sha256,nativeLayoutExact,
          nativePlanesExact:nativeLayoutExact&&image.nativePlanes.sha256===report.native.nativePlanes.sha256,colorSpaceExact:JSON.stringify(image.colorSpace)===JSON.stringify(report.native.colorSpace)}:null};
      report.runs.push(result);
      result.generationQualified=stats.generation===report.runs.length&&stats.pipeline?.selectedAudioTrackId===2&&stats.pipeline?.encodersCreated===0;result.sourceDeclarationAbsent=!stats.pipeline?.videoConfig?.colorSpace||Object.values(stats.pipeline.videoConfig.colorSpace).every(v=>v==null);result.observedOutputQualified=stats.outputColorObservation?.basis==='observed-native-frame'&&JSON.stringify(stats.outputColorObservation.colorSpace)===JSON.stringify(report.observation.colorSpace);if(result.comparison&&!result.comparison.rgbaExact)report.strictRgbaFailure='COLOR_RGBA_PARITY_FAILED';if(stats.failure||!result.generationQualified||!result.sourceDeclarationAbsent||!result.observedOutputQualified||result.comparison&&['nativeLayoutExact','nativePlanesExact','colorSpaceExact'].some(k=>result.comparison[k]!==true))throw Error('COLOR_INTERPRETATION_UNQUALIFIED');
    }
    report.observedPass=true;report.strictRgbaPass=!report.strictRgbaFailure;
  } catch(e) {report.failure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'COLOR_OPERATION_FAILED';report.errorName=e.name;}
  finally {
    ownerActive=false;const cleanup=await player?.dispose().catch(()=>({settled:false}));
    for(const [v,id]of callbacks)v.cancelVideoFrameCallback(id);callbacks.clear();for(const t of timers)clearTimeout(t);timers.clear();for(const clean of [...listeners])clean();
    for(const v of [native,video]){v.pause();v.removeAttribute('src');v.load();}
    report.cleanup={player:cleanup||null,callbacksEmpty:callbacks.size===0,timersEmpty:timers.size===0,listenersEmpty:listeners.size===0,
      sourcesRemoved:[native,video].every(v=>!v.hasAttribute('src')),allWorkersTerminated:report.workers.every(w=>w.terminated),
      allReadersClosed:report.sources.every(s=>!s.active&&s.activeReads===0&&s.aborts===1)};
    report.completedAt=Date.now();const r=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
    if(!r.ok)throw Error('COLOR_RESULT_SAVE_FAILED');
  }
  return {observedPass:report.observedPass===true,strictRgbaPass:report.strictRgbaPass===true,strictRgbaFailure:report.strictRgbaFailure||null,failure:report.failure||null,
    runs:report.runs.map(r=>({label:r.label,elapsedMs:r.elapsedMs,generation:r.stats.generation,comparison:r.comparison})),cleanup:report.cleanup};
}
