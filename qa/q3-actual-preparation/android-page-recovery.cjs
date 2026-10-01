'use strict';
const path=require('node:path');
async function execute(){
 return require('./android-common33.cjs')(__filename,'android-cua2-page-recovery-safe.json',async c=>{
  const before=await c.evaluate("()=>({version:APP_VERSION,closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback,loading:state.loadingFiles,writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null,clobberedAdmission:window.__q3ActualReplay33?.installed===true&&typeof window.__q3ActualReplay33?.metadata==='undefined'})");
  c.step('bounded cleanup admission',before);
  if(before.version!=='1.22.0-rc.33'||!before.closed||before.q0||before.q1||before.loading||!before.writerIdle||!before.clobberedAdmission)throw Error('EXACT_IDLE_TOOL_RECOVERY_REQUIRED');
  const result=await c.call('navigate_page',{type:'reload',ignoreCache:false,handleBeforeUnload:'dismiss',timeout:20000});
  if(result.isError)throw Error('OWNED_NORMAL_RELOAD_FAILED');
  let after,deadline=Date.now()+15000;
  do{after=await c.evaluate("()=>({version:APP_VERSION,accountPresent:!!state.accountId&&!!state.authAccountKey,online:state.authStatus==='online',closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback,helpersGone:!window.__q3ActualReplay33&&!window.__q3ActualTarget33&&!window.__resumeSwProof,loading:state.loadingFiles,writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null})");if(after.accountPresent&&after.online&&!after.loading&&after.writerIdle)break;await c.wait(250);}while(Date.now()<deadline);
  c.step('normal reload discarded old QA realm',after);
  if(after.version!=='1.22.0-rc.33'||!after.accountPresent||!after.online||!after.closed||after.q0||after.q1||!after.helpersGone||after.loading||!after.writerIdle)throw Error('RECOVERY_STATE_UNCONFIRMED');
 });
}
if(require.main===module)execute();
module.exports={execute};
