'use strict';
const fs=require('node:fs'),path=require('node:path');if(process.argv[2]!=='--execute-read-only')throw Error('HEADER_DIAGNOSTIC_EXECUTION_REQUIRED');
const output='android-header-cdp-diagnostic-safe.json';if(fs.existsSync(path.join(__dirname,output)))throw Error('NO_OVERWRITE');
const input=require('../rc32-ts-device-replay/android-replay.cjs').loadPrivate(path.resolve(process.argv[3]));
require('./android.cjs').common35()(__filename,'../rc35-cold-q0/'+output,async c=>{
 let transport,owned=false;try{await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  await c.evaluateNative(`()=>{const i=${JSON.stringify(input)};if(state.accountId!==i.account.accountId||state.authAccountKey!==i.account.authAccountKey||!el.playerSheet.hidden||window.__resumeReplayTarget30)throw Error('HEADER_DIAGNOSTIC_ACCOUNT');window.__resumeReplayTarget30=i;return{protectedInputInstalled:true};}`);owned=true;
  transport=await require('./worker.cjs').preparePage(c);c.step('header body/range diagnostic',await require('./bounded-header.cjs').read(c,transport.pageSession,input));
 }finally{if(owned)c.step('header private holder cleanup',await c.evaluateNative('()=>{delete window.__resumeReplayTarget30;return{ownedHolderAbsent:!window.__resumeReplayTarget30,closed:el.playerSheet.hidden};}'));if(transport){const r=await transport.stop();c.step('header owned transport cleanup',r);if(!r.ownedPageDetached||!r.ownedBrowserSessionDetached||!r.ownedConnectionDisconnected||!r.ownedForwardRemoved)throw Error('HEADER_TRANSPORT_CLEANUP');}}
});
