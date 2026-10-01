import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHeaderCohort,ORIGIN} from './probe.mjs';
import {summarizeRepeatedInventory,FOLDER_MIME} from '../v2-07a-root-inventory/root-inventory.mjs';
import {box,cat,moovFixture} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
export const binding=JSON.parse(await readFile(new URL('../rc31-corpus-content-continuity/binding.json',import.meta.url)));
export function fixture(count=20){
 const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_AUTHKEY',token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authGeneration:1,driveSessionGeneration:2,tokenRevision:3,mediaSession:4,accountStateAbortController:new AbortController(),authStatus:'online',demo:false,accountIdentityPending:false,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
 const data=cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),moovFixture({audio:true}),box('mdat',Buffer.alloc(4000)));
 const files=Array.from({length:count},(_,i)=>({id:'PRIVATE_VIDEO_'+String(i).padStart(3,'0'),name:'PRIVATE_NAME_'+i+'.mp4',mimeType:'video/mp4',fullFileExtension:'mp4',size:String(data.length),version:'123456789',modifiedTime:'PRIVATE_DATE',parents:['PRIVATE_ROOT'],trashed:false,capabilities:{canDownload:true,canReadRevisions:true},data,headRevisionId:'PRIVATE_REV',sha256Checksum:'e'.repeat(64)}));
 const context={accountKey:state.accountId,authAccountKey:state.authAccountKey,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:files[0].id};
 const root={id:context.rootId,mimeType:FOLDER_MIME,version:'1',modifiedTime:'PRIVATE_DATE',trashed:false,capabilities:{canListChildren:true}};
 const pass={accountBefore:state.accountId,accountAfter:state.accountId,rootBefore:root,rootAfter:root,items:files,shortcutTargets:[],pageCount:1,traversedFolderCount:1,duplicateReferenceCount:0,unresolvedShortcutTargetCount:0,staleShortcutTargetMimeCount:0};
 const selected=files.slice(0,Math.min(36,count)).map((row,i)=>({fileId:row.id,mandatoryReasons:i===0?['priority']:i===1?['largest:.mp4']:[]}));
 const selection={privateManifest:{selected}},controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},retirement={settled:true},calls=[],listeners=new Set();let clock=0;
 const runtime={appVersion:binding.version,privateContext:context,options:{phase:'representatives',maxFiles:8},readState:()=>state,navigator:{onLine:true,serviceWorker:{controller}},location:{origin:ORIGIN,href:ORIGIN+'/'},document:{visibilityState:'visible'},top:1,self:1,getSWIdentity:()=>({controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:{...binding.sourceSHA256}}),getMutationsEnabled:()=>false,getQ1Playback:()=>null,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>5,getPlayerMediaPriorityActive:()=>false,hasUsableToken:()=>true,addEventListener:t=>listeners.add(t),removeEventListener:t=>listeners.delete(t),nativeFetch:async(v,init)=>{
   const url=new URL(v);calls.push({url,init});if(url.origin!==ORIGIN){if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:state.accountId}});const row=files.find(x=>url.pathname.endsWith('/'+x.id));return Response.json({...row,data:undefined});}
   const row=files.find(x=>url.pathname.endsWith('/'+x.id));assert.equal(init.headers.Range,'bytes=0-939');return new Response(row.data.subarray(0,940),{status:206,headers:{'Content-Range':'bytes 0-939/'+row.size,'Content-Length':'940','Accept-Ranges':'bytes','Cache-Control':'no-store'}});
 }};
 const dependencies={binding,now:()=>clock,selector:()=>selection,inventoryRunner:async({driveFetch})=>{for(let i=0;i<8;i++)await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();return {report:summarizeRepeatedInventory({firstPass:pass,secondPass:pass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId}),privatePasses:{firstPass:pass,secondPass:pass}};},compareInventory:()=>{}};
 return {state,files,context,pass,selection,runtime,dependencies,calls,listeners,setClock:n=>clock=n,make:()=>createHeaderCohort(runtime,dependencies)};
}


