'use strict';
const fs=require('node:fs'),path=require('node:path');
if(process.argv[2]!=='--execute-read-only')throw Error('HEADER_DIAGNOSTIC_EXECUTION_REQUIRED');
const output='android-header-diagnostic-safe.json';if(fs.existsSync(path.join(__dirname,output)))throw Error('NO_OVERWRITE');
const input=require('../rc32-ts-device-replay/android-replay.cjs').loadPrivate(path.resolve(process.argv[3]));
require('./android.cjs').common35()(__filename,'../rc35-cold-q0/'+output,async c=>{
 await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
 const r=await c.evaluateNative(`async()=>{const i=${JSON.stringify(input)};if(state.accountId!==i.account.accountId||state.authAccountKey!==i.account.authAccountKey||!el.playerSheet.hidden)throw Error('HEADER_DIAGNOSTIC_ACCOUNT');
 const a=new AbortController(),timer=setTimeout(()=>a.abort(),10000);let response;try{const t=i.target,u=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(t.id)+'/revisions/'+encodeURIComponent(t.headRevisionId));u.searchParams.set('alt','media');const headers={Authorization:'Bearer '+state.token,Range:'bytes=0-16383'};if(t.resourceKey)headers['X-Goog-Drive-Resource-Keys']=t.id+'/'+t.resourceKey;response=await fetch(u,{headers,cache:'no-store',redirect:'error',signal:a.signal});const range=response.headers.get('Content-Range');return{status:response.status,rangeVisible:range!==null,rangeExact:range==='bytes 0-16383/'+t.size,length:response.headers.get('Content-Length'),contentType:response.headers.get('Content-Type'),rawIdentifiersExported:false,playbackStarted:false};}catch(e){return{safeFailure:/^[A-Z0-9_]+$/.test(e.message)?e.message:'HEADER_FETCH_OPERATION',exceptionName:['TypeError','AbortError'].includes(e.name)?e.name:'other',playbackStarted:false,rawErrorExported:false};}finally{clearTimeout(timer);await response?.body?.cancel().catch(()=>{});}}`);
 c.step('bounded header response diagnostic; body cancelled',r);
});
