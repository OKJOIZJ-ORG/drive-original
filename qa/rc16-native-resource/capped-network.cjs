'use strict';
// Preserve Network metadata/Fetch interception while removing only response-body
// retention in the owned isolated QA sessions. No product bytes are rewritten.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let outer=fs.readFileSync(path.join(__dirname,'probe.cjs'),'utf8');
outer=outer.replace("['trend-q1','trend-q2'].includes(routeName)","['trend-q1','trend-q2','cycles'].includes(routeName)");
const anchor='const compiled=new Module(__filename,module);';assert.ok(outer.includes(anchor));
const injection=String.raw`
replace("adapterSha256:", "networkCapped:true,wrapperAdapterSha256:'"+hash(fs.readFileSync(path.join(__dirname,'probe.cjs')))+"',playwrightCoreSha256:'"+hash(fs.readFileSync(path.join(root,'qa/node_modules/playwright-core/lib/coreBundle.js')))+"',adapterSha256:");
source=source.replace("mode.startsWith('trend-')?"+cycles+":50",String(cycles));
source=source.replaceAll("if(mode.startsWith('trend-'))", "if(mode.startsWith('trend-')||mode==='cycles')");
replace("await nativeObserve('before-cycles');",String.raw`+'`'+`
 const managers=[page._connection.toImpl(page).delegate._networkManager,page._connection.toImpl(sw)._networkManager];
 assert.ok(managers.every(m=>m&&m._sessions instanceof Map),'EXACT_NETWORK_MANAGERS');
 report.networkCap={maxTotalBufferSize:0,maxResourceBufferSize:0,sessions:0,mediaMetadataEvents:0,mediaLoadingFinished:0,bodyProbes:[]};
 const pendingBodyProbes=[];
 const capSession=async(session,owner)=>{
  await session.send('Network.enable',{maxTotalBufferSize:0,maxResourceBufferSize:0});report.networkCap.sessions++;
  const mediaIds=new Set();
  session.on('Network.responseReceived',event=>{const u=new URL(event.response.url);if(u.origin==='https://www.googleapis.com'&&u.searchParams.has('alt')){report.networkCap.mediaMetadataEvents++;mediaIds.add(event.requestId);}});
  session.on('Network.loadingFinished',event=>{if(!mediaIds.delete(event.requestId))return;report.networkCap.mediaLoadingFinished++;
   if(pendingBodyProbes.length>=3)return;
   const p=session.send('Network.getResponseBody',{requestId:event.requestId}).then(value=>{report.networkCap.bodyProbes.push({owner,bodyAvailable:true,bytes:value.body.length});},error=>{report.networkCap.bodyProbes.push({owner,bodyAvailable:false,errorKind:error.name});});pendingBodyProbes.push(p);
  });
 };
 for(let i=0;i<managers.length;i++){
  const manager=managers[i],owner=i===0?'page':'service_worker',add=manager.addSession.bind(manager);
  // The owned page manager also receives each new dedicated Worker session.
  manager.addSession=async(...args)=>{await add(...args);await capSession(args[0],owner==='page'?'page-or-worker':owner);};
  for(const info of manager._sessions.values())await capSession(info.session,owner);
 }
 await nativeObserve('before-cycles');
`+'`'+`);
replace("const close=async()=>{", "const close=async()=>{await Promise.all(pendingBodyProbes);if(report.networkCap.bodyProbes.length)assert.ok(report.networkCap.bodyProbes.every(x=>!x.bodyAvailable),'CAP_RESPONSE_BODY_EVICTION');");
const pressureStart=source.indexOf("  // One reversible internal notification in this isolated browser.");
const pressureEnd=source.indexOf("await t.nativeObserve('after-isolated-moderate-notification');",pressureStart)+"await t.nativeObserve('after-isolated-moderate-notification');".length;
assert.ok(pressureStart>=0&&pressureEnd>pressureStart,'PRESSURE_BLOCK_ANCHOR');
source=source.slice(0,pressureStart)+String.raw`+'`'+`
  assert.ok(report.networkCap.mediaMetadataEvents>0&&report.networkCap.mediaLoadingFinished>0,'CAPPED_NETWORK_EVENTS_PRESERVED');
  assert.equal(report.networkCap.bodyProbes.length,3,'CAPPED_BODY_CONTROL_OBSERVED');
  assert.ok(report.networkCap.bodyProbes.every(x=>!x.bodyAvailable),'CAP_RESPONSE_BODY_EVICTION');
  await t.nativeObserve('capped-network-final');
`+'`'+`+source.slice(pressureEnd);
`;
outer=outer.replace(anchor,injection+'\n'+anchor);
const adapter=new Module(__filename,module);adapter.filename=__filename;adapter.paths=module.paths;adapter._compile(outer,__filename);
