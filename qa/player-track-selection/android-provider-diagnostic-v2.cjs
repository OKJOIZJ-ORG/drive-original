'use strict';
// Bounded derivative of rc21 android-synthetic-provider-cdp-v2; owned page/SW only.
const LIMITS=Object.freeze({requests:256,mediaBytes:24*1024*1024,rpcMs:15000});
function classify(url,method,origin,id){
 const u=new URL(url);if(u.origin===origin)return{kind:'local'};
 const base='/drive/v3/files/'+id;
 if(u.origin!=='https://www.googleapis.com'||![base,base+'/revisions/A',base+'/download'].includes(u.pathname))return{kind:'blocked'};
 if(method==='OPTIONS')return{kind:'preflight'};
 if(u.pathname===base+'/download')return{kind:method==='POST'?'download':'blocked'};
 return{kind:method==='GET'?(u.searchParams.get('alt')==='media'?'media':'metadata'):'blocked'};
}
function byteRange(range,size){
 if(!range)return{start:0,end:size-1,status:200};const m=/^bytes=(\d+)-(\d*)$/.exec(range);
 if(!m)return{status:416};const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<=end&&start<size?{start,end,status:206}:{status:416};
}
async function install(browser,page,{origin,id,bytes,sha}){
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)||!/^android-tracks-[0-9a-f]{16}$/.test(id)||bytes.length>2097152||!/^[0-9a-f]{64}$/.test(sha))throw Error('MOCK_PROVIDER_ADMISSION');
 const root=await browser.newBrowserCDPSession(),pageCdp=await page.context().newCDPSession(page),owned=new Set(),pending=new Map();let seq=0,disposed=false;
 const network={requests:0,local:0,metadata:0,download:0,range:0,mediaBytes:0,preflights:0,blocked:0,workersReady:0,errors:[],cors:[]};
 const error=code=>{if(network.errors.length<16)network.errors.push(code);};
 const send=(sessionId,method,params={})=>new Promise((resolve,reject)=>{const messageId=++seq,key=sessionId+':'+messageId;
  const timer=setTimeout(()=>{pending.delete(key);reject(Error('OWNED_CDP_TIMEOUT'));},LIMITS.rpcMs);pending.set(key,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:e=>{clearTimeout(timer);reject(e);}});
  root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:messageId,method,params})}).catch(e=>{const p=pending.get(key);pending.delete(key);p?.reject(Error('OWNED_CDP_PROTOCOL'));});});
 async function fulfill(e,sender){
  if(disposed)return;network.requests++;const kind=classify(e.request.url,e.request.method,origin,id).kind;
  if(network.requests>LIMITS.requests){error('PROVIDER_REQUEST_CAP');return sender('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});}
  if(kind==='local'){network.local++;return sender('Fetch.continueRequest',{requestId:e.requestId});}
  if(kind==='blocked'){network.blocked++;return sender('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});}
  const headers=[{name:'access-control-allow-origin',value:'*'},{name:'access-control-expose-headers',value:'content-range,content-length,content-type'}];let status=200,body;
  if(kind==='preflight'){network.preflights++;const requested=Object.entries(e.request.headers).find(([k])=>k.toLowerCase()==='access-control-request-headers')?.[1]||'';const names=requested.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean),allowed=['authorization','range','content-type','x-goog-drive-resource-keys','x-drive-original-q1-revision'];if(network.cors.length<32)network.cors.push({at:Date.now(),recognized:names.filter(n=>allowed.includes(n)),unknownNames:names.filter(n=>!allowed.includes(n)).length,allAllowed:names.every(n=>allowed.includes(n))});headers.push({name:'access-control-allow-methods',value:'GET,POST,OPTIONS'},{name:'access-control-allow-headers',value:'authorization,range,content-type,x-goog-drive-resource-keys,x-drive-original-q1-revision'});body=Buffer.alloc(0);status=204;}
  else if(kind==='download'){network.download++;body=Buffer.from(JSON.stringify({name:'synthetic/op',done:true,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',partialDownloadAllowed:true,downloadUri:'https://www.googleapis.com/drive/v3/files/'+id+'/revisions/A?alt=media'}}));headers.push({name:'content-type',value:'application/json'});}
  else if(kind==='metadata'){network.metadata++;body=Buffer.from(JSON.stringify({id,name:'Generated combined fixture.mp4',headRevisionId:'A',version:'1',size:String(bytes.length),mimeType:'video/mp4',modifiedTime:'A',sha256Checksum:sha,trashed:false,capabilities:{canDownload:true,canReadRevisions:true}}));headers.push({name:'content-type',value:'application/json'});}
  else{const h=Object.entries(e.request.headers).find(([k])=>k.toLowerCase()==='range')?.[1],r=byteRange(h,bytes.length);status=r.status;network.range++;body=status===416?Buffer.alloc(0):bytes.subarray(r.start,r.end+1);
   if(network.mediaBytes+body.length>LIMITS.mediaBytes){error('PROVIDER_BYTE_CAP');return sender('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});}network.mediaBytes+=body.length;
   if(status!==200)headers.push({name:'content-range',value:status===416?'bytes */'+bytes.length:`bytes ${r.start}-${r.end}/${bytes.length}`});headers.push({name:'content-type',value:'video/mp4'});}
  headers.push({name:'content-length',value:String(body.length)});await sender('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:status,responseHeaders:headers,body:body.toString('base64')});
 }
 const messages=e=>{if(!owned.has(e.sessionId))return;let m;try{m=JSON.parse(e.message);}catch{return error('OWNED_CDP_PROTOCOL');}
  if(m.id){const key=e.sessionId+':'+m.id,p=pending.get(key);if(p){pending.delete(key);m.error?p.reject(Error('OWNED_CDP_PROTOCOL')):p.resolve(m.result);}return;}
  if(m.method==='Fetch.requestPaused')void fulfill(m.params,(method,params)=>send(e.sessionId,method,params)).catch(()=>error('OWNED_PROVIDER_FAILED'));};
 const attach=e=>{if(e.targetInfo.type!=='service_worker'||e.targetInfo.url!==origin+'/sw.js')return;owned.add(e.sessionId);void send(e.sessionId,'Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]}).then(()=>network.workersReady++).catch(()=>error('OWNED_WORKER_ATTACH_FAILED'));};
 const discover=e=>{if(e.targetInfo.type==='service_worker'&&e.targetInfo.url===origin+'/sw.js')void root.send('Target.attachToTarget',{targetId:e.targetInfo.targetId,flatten:false}).catch(()=>error('OWNED_WORKER_DISCOVERY_FAILED'));};
 const pageRequest=e=>void fulfill(e,(method,params)=>pageCdp.send(method,params)).catch(()=>error('OWNED_PAGE_PROVIDER_FAILED'));
 root.on('Target.receivedMessageFromTarget',messages);root.on('Target.attachedToTarget',attach);root.on('Target.targetCreated',discover);pageCdp.on('Fetch.requestPaused',pageRequest);
 async function dispose(){let ok=true;await pageCdp.send('Fetch.disable').catch(()=>{ok=false;});for(const session of owned){await send(session,'Fetch.disable').catch(()=>{ok=false;});await root.send('Target.detachFromTarget',{sessionId:session}).catch(()=>{ok=false;});}disposed=true;
  root.off('Target.receivedMessageFromTarget',messages);root.off('Target.attachedToTarget',attach);root.off('Target.targetCreated',discover);pageCdp.off('Fetch.requestPaused',pageRequest);
  for(const p of pending.values())p.reject(Error('OWNED_PROVIDER_DISPOSED'));pending.clear();owned.clear();await pageCdp.detach().catch(()=>{ok=false;});await root.detach().catch(()=>{ok=false;});return{providerDetached:ok,pending:pending.size};}
 try{await root.send('Target.setDiscoverTargets',{discover:true});await pageCdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});}catch{await dispose();throw Error('OWNED_PROVIDER_SETUP_FAILED');}
 return{network,dispose};
}
module.exports={install,classify,byteRange,LIMITS};
