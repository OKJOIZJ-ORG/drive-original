'use strict';
function browserHeader(input){return(async()=>{
 const t=input.target,a=new AbortController(),timer=setTimeout(()=>a.abort(),10000);let reader;
 try{const u=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(t.id)+'/revisions/'+encodeURIComponent(t.headRevisionId));u.searchParams.set('alt','media');const headers={Authorization:'Bearer '+state.token,Range:'bytes=0-16383'};if(t.resourceKey)headers['X-Goog-Drive-Resource-Keys']=t.id+'/'+t.resourceKey;
  const r=await fetch(u,{headers,cache:'no-store',redirect:'error',signal:a.signal});if(r.status!==206)throw Error('COLD_HEADER_STATUS');
  const pageRange=r.headers.get('Content-Range');if(pageRange!==null&&pageRange!=='bytes 0-16383/'+t.size)throw Error('COLD_HEADER_VISIBLE_RANGE');
  reader=r.body.getReader();const bytes=new Uint8Array(16384);let n=0;for(;;){const v=await reader.read();if(v.done)break;if(n+v.value.length>bytes.length)throw Error('COLD_HEADER_BOUND');bytes.set(v.value,n);n+=v.value.length;}if(n!==16384)throw Error('COLD_HEADER_LENGTH');
  const view=new DataView(bytes.buffer),size=view.getUint32(0),tag=String.fromCharCode(...bytes.slice(4,8)),brand=String.fromCharCode(...bytes.slice(8,12)),compatible=[];
  if(tag==='ftyp'&&size>=16&&size<=n&&size%4===0)for(let p=16;p<size;p+=4)compatible.push(String.fromCharCode(...bytes.slice(p,p+4)));
  const allowed=['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '];
  return{normalIsoMp4:tag==='ftyp'&&size>=16&&size<=n&&size%4===0&&[brand,...compatible].some(x=>allowed.includes(x))&&brand!=='qt  ',bytes:n,headerSHA256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),pageRangeVisible:pageRange!==null,rangeMatched:false,requiresIndependentCdpRange:true,sourceRevisionPinned:true,rawHeaderExported:false,performedBeforeFreshReload:true};
 }finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
})();}
const get=(headers,key)=>Object.entries(headers||{}).find(([k])=>k.toLowerCase()===key.toLowerCase())?.[1];
function qualify(page,wire,size){return !!page&&page.normalIsoMp4===true&&page.bytes===16384&&wire.requests===1&&wire.responses===1&&wire.requestRangeExact===true&&wire.status===206&&wire.contentRange==='bytes 0-16383/'+size&&wire.contentLength==='16384';}
async function read(c,pageSession,input){
 const t=input.target,u=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(t.id)+'/revisions/'+encodeURIComponent(t.headRevisionId));u.searchParams.set('alt','media');let selectedRequest=null,page,enabled=false;
 const wire={requests:0,responses:0,requestRangeExact:false,status:null,contentRange:null,contentLength:null};
 const request=e=>{if(e.request?.url!==u.href)return;wire.requests++;if(wire.requests===1){selectedRequest=e.requestId;wire.requestRangeExact=e.request.method==='GET'&&get(e.request.headers,'Range')==='bytes=0-16383';}};
 const response=e=>{if(e.requestId!==selectedRequest||e.response?.url!==u.href)return;wire.responses++;wire.status=e.response.status;wire.contentRange=get(e.response.headers,'Content-Range');wire.contentLength=get(e.response.headers,'Content-Length');};
 pageSession.on('Network.requestWillBeSent',request);pageSession.on('Network.responseReceived',response);
 try{await pageSession.send('Network.enable',{});enabled=true;
  const r=await c.evaluateNative('async()=>{try{return{ok:true,page:await ('+browserHeader.toString()+')(window.__resumeReplayTarget30)};}catch(e){return{ok:false,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:"COLD_HEADER_OPERATION"};}}');
  if(!r.ok){c.step('bounded header safe failure',{failure:r.code,playbackStarted:false});throw Error(r.code);}
  page=r.page;const end=Date.now()+3000;while(wire.responses===0&&Date.now()<end)await c.wait(50);
  const qualified=qualify(page,wire,Number(t.size));const safeWire={requests:wire.requests,responses:wire.responses,requestRangeExact:wire.requestRangeExact,status:wire.status,rangeExact:wire.contentRange==='bytes 0-16383/'+t.size,lengthExact:wire.contentLength==='16384',rawHeadersExported:false};
  c.step('independent bounded header CDP range qualification',{...safeWire,qualified});if(!qualified)throw Error('COLD_HEADER_CDP_RANGE');return{...page,rangeMatched:true,independentCdpRangeMatched:true,requiresIndependentCdpRange:false};
 }finally{pageSession.off('Network.requestWillBeSent',request);pageSession.off('Network.responseReceived',response);selectedRequest=null;wire.contentRange=null;wire.contentLength=null;
  let disabled=!enabled;if(enabled)try{await pageSession.send('Network.disable',{});disabled=true;}catch{}
  c.step('owned header observer cleanup',{listenersRemoved:true,privateRequestCorrelationCleared:true,ownedPageNetworkDisabled:disabled});if(!disabled)throw Error('COLD_HEADER_OBSERVER_CLEANUP');
 }
}
module.exports={browserHeader,qualify,read};
