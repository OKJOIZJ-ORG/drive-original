import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const facadeSource=await readFile(new URL('../rc31-corpus-content-continuity/facade.function.js',import.meta.url),'utf8');
function fixture(){
  const controller={state:'activated'},retirement={settled:true};
  const state={accountId:'SYNTHETIC_ACCOUNT',authAccountKey:'SYNTHETIC_KEY',authGeneration:1,driveSessionGeneration:2,
    token:'SYNTHETIC_TOKEN',tokenRevision:3,expiresAt:99999999,accountStateAbortController:new AbortController(),
    accountStateWriterId:'SYNTHETIC_WRITER',accountStateRevision:4,accountMediaState:{updatedAt:1,viewed:{},favorites:{}},
    authStatus:'online',demo:false,accountIdentityPending:false,accountStateLoaded:true,accountStateLoadingPromise:null,
    accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,
    mediaSession:5,playbackSession:6,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,
    pendingPlay:false,mediaTransportStarted:false};
  const globals={state,APP_VERSION:'1.22.0-rc.32',__BINDING__:{version:'1.22.0-rc.32'},DRIVE_MUTATIONS_ENABLED:false,
    ACCOUNT_STATE_WRITES_ENABLED:true,top:1,self:1,navigator:{onLine:true,serviceWorker:{controller}},
    document:{visibilityState:'visible'},location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'},
    hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    mediaSourceGeneration:7,q1RetirementResult:retirement,q1Playback:null,playerMediaPriorityActive:false,
    window:{addEventListener(){},removeEventListener(){}},fetch:()=>{throw Error('NO_NETWORK_IN_LOCAL_DISCRIMINATOR');}};
  const facade=vm.runInNewContext('('+facadeSource+')',globals);let runtime;
  const create=value=>{runtime=value;return{run:()=>new Promise(()=>{}),poll:()=>({done:false}),cancel(){},continuity:()=>null};};
  facade.call(create,JSON.stringify({accountKey:state.accountId,generation:2,priorityFileId:'SYNTHETIC_FILE',rootId:'SYNTHETIC_ROOT'}),
    {get:()=>({controller,version:'1.22.0-rc.32'})},null,{phase:'videos',maxFiles:64});
  assert(runtime,'synthetic facade admission');return{state,globals,read:()=>runtime.readState()};
}
test('same account projection merge or revision/sync activity triggers frozen OWNER_CHANGED without auth/content change',()=>{
  for(const change of [f=>f.state.accountMediaState.updatedAt++,f=>f.state.accountStateRevision++,
    f=>f.state.accountStateSyncTimer=1,f=>f.state.accountStateSyncPromise=Promise.resolve(),
    f=>f.state.accountStateSyncError=Error('SYNTHETIC_ERROR')]){
    const f=fixture(),before=[f.state.accountId,f.state.authAccountKey,f.state.authGeneration,f.state.driveSessionGeneration,
      f.state.token,f.state.tokenRevision,f.state.expiresAt];
    change(f);assert.deepEqual([f.state.accountId,f.state.authAccountKey,f.state.authGeneration,f.state.driveSessionGeneration,
      f.state.token,f.state.tokenRevision,f.state.expiresAt],before);
    assert.throws(f.read,e=>e.code==='OWNER_CHANGED');
  }
});
test('identical projection replacement or pending refresh alone does not fail the frozen facade',()=>{
  const f=fixture();f.state.accountMediaState=structuredClone(f.state.accountMediaState);
  f.state.accountStateLoadingPromise=Promise.resolve();assert.equal(f.read(),f.state);
});
test('actual auth, controller, source, playback or abort owner transition yields the same generic failure',()=>{
  for(const change of [f=>f.state.authGeneration++,f=>f.state.tokenRevision++,f=>f.state.accountId='SYNTHETIC_OTHER',
    f=>f.globals.navigator.serviceWorker.controller={state:'activated'},f=>f.globals.mediaSourceGeneration++,
    f=>f.state.mediaSession++,f=>f.state.accountStateAbortController.abort()]){
    const f=fixture();change(f);assert.throws(f.read,e=>e.code==='OWNER_CHANGED');
  }
});
