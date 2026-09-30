'use strict';
// A second, separately preserved QA producer. Reuse the wrapper discriminator
// and shed only the isolated automation Network response agents after playback.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const probePath=path.join(__dirname,'probe.cjs');
let outer=fs.readFileSync(probePath,'utf8');
const anchor='const compiled=new Module(__filename,module);';
assert.ok(outer.includes(anchor),'PROBE_ADAPTER_ANCHOR');
const injection=String.raw`
replace("adapterSha256:", "networkShed:true,wrapperAdapterSha256:'"+hash(fs.readFileSync(path.join(__dirname,'probe.cjs')))+"',playwrightCoreSha256:'"+hash(fs.readFileSync(path.join(root,'qa/node_modules/playwright-core/lib/coreBundle.js')))+"',adapterSha256:");
const pressureStart=source.indexOf("  // One reversible internal notification in this isolated browser.");
const pressureEnd=source.indexOf("await t.nativeObserve('after-isolated-moderate-notification');",pressureStart)+"await t.nativeObserve('after-isolated-moderate-notification');".length;
assert.ok(pressureStart>=0&&pressureEnd>pressureStart,'PRESSURE_BLOCK_ANCHOR');
source=source.slice(0,pressureStart)+String.raw`+'`'+`
  // These are the actual Playwright-created sessions, not a new unrelated CDP
  // session. This private QA bridge is version/hash fenced and never persisted.
  const impl=t.page._connection.toImpl(t.page),swImpl=t.page._connection.toImpl(t.context.serviceWorkers()[0]);
  const managers=[impl._delegate._networkManager,swImpl._networkManager];
  assert.ok(managers.every(m=>m&&m._sessions instanceof Map),'EXACT_NETWORK_MANAGERS');
  report.networkShedSessions=[];
  for(let i=0;i<managers.length;i++)for(const info of managers[i]._sessions.values()){
   await info.session.send('Network.disable');report.networkShedSessions.push({owner:i===0?'page':'service_worker',isMain:!!info.isMain,disabled:true});
  }
  assert.ok(report.networkShedSessions.some(x=>x.owner==='page')&&report.networkShedSessions.some(x=>x.owner==='service_worker'),'BOTH_NETWORK_AGENTS_SHED');
  await t.page.waitForTimeout(5000);await t.nativeObserve('after-exact-playwright-network-disable');
  report.afterNetworkShed=await t.read();
`+'`'+`+source.slice(pressureEnd);
`;
outer=outer.replace(anchor,injection+'\n'+anchor);
const adapter=new Module(__filename,module);adapter.filename=__filename;adapter.paths=module.paths;adapter._compile(outer,__filename);
