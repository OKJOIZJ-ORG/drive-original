function (create,facade,binding) {
 'use strict';
 let registry=new Map(),owner=null,proof=null,active=null;
 const capture=p=>({controller:p.controller,account:state.accountId,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,writer:state.accountStateWriterId,revision:state.accountStateRevision,source:mediaSourceGeneration,projection:JSON.parse(JSON.stringify(state.accountMediaState))});
 const released=()=>!active||active.poll().done===true;
 const current=()=>owner&&APP_VERSION===binding.version&&navigator.serviceWorker.controller===owner.controller&&owner.controller.state==='activated'&&navigator.onLine===true&&document.visibilityState==='visible'&&state.authStatus==='online'&&hasUsableToken()&&q1Playback===null&&proof?.get?.()?.controller===owner.controller&&proof.get()?.sourceCommit===binding.sourceCommit&&['app.js','sw.js','version.json'].every(k=>proof.get()?.sourceSHA256?.[k]===binding.sourceSHA256[k])&&state.accountId===owner.account&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive&&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.accountStateWriterId===owner.writer&&state.accountStateRevision===owner.revision&&mediaSourceGeneration===owner.source&&q1RetirementResult?.settled===true&&state.selected===null&&state.mediaAttempt==='idle'&&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null&&accountMediaStatesEqual(state.accountMediaState,owner.projection);
 const rejected=()=>({poll:()=>({done:true,summary:{complete:false,failure:'SOURCE_BINDING_REJECTED',writeRequests:0,mediaRequests:0}}),cancel:()=>({cancelled:true})});
 const entry=(contextText,acceptedProof,options)=>{
  options=options||{cohort:1,mode:'probe'};
  if(!released()||!options||Object.keys(options).some(k=>!['cohort','mode'].includes(k))||!Number.isSafeInteger(options.cohort)||options.cohort<1||options.cohort>38||!['probe','metadata-only'].includes(options.mode))return rejected();
  registry.clear();proof=acceptedProof;const p=proof?.get?.();
  if(!p||p.version!==binding.version||p.sourceCommit!==binding.sourceCommit||['app.js','sw.js','version.json'].some(k=>p.sourceSHA256?.[k]!==binding.sourceSHA256[k]))return rejected();
  owner=capture(p);
  const witness=selection=>selection.privateManifest.selected.forEach((r,i)=>registry.set('representative-'+(i+1),{id:r.fileId,version:r.version}));
  active=facade.call(runtime=>{runtime.deeperOptions={cohort:options.cohort};return create(runtime,witness);},contextText,proof,null,options.mode);
  return active;
 };
 entry.rearmTargets=acceptedProof=>{
  const p=acceptedProof?.get?.(),result=active?.poll?.()?.summary;
  if(!owner||!released()||result?.catalogStable!==true||result?.released!==true||state.accountId!==owner.account||state.driveSessionGeneration!==owner.drive||!p||p.controller!==owner.controller||p.controller!==navigator.serviceWorker.controller||p.version!==binding.version||p.sourceCommit!==binding.sourceCommit||['app.js','sw.js','version.json'].some(k=>p.sourceSHA256?.[k]!==binding.sourceSHA256[k])||state.accountStateLoaded!==true||state.accountStateWriterId!==owner.writer||!Number.isSafeInteger(state.accountStateRevision)||state.accountStateRevision<owner.revision||state.accountStateSyncPromise!==null||state.accountStateSyncTimer!==null||state.accountStateSyncRetryTimer!==null||state.accountStateSyncError!==null||state.selected!==null||state.mediaAttempt!=='idle'||q1Playback!==null||q1RetirementResult?.settled!==true||state.authStatus!=='online'||!hasUsableToken()||navigator.onLine!==true||document.visibilityState!=='visible')return {ready:false,reason:'FRESH_IDLE_OWNER_UNQUALIFIED'};
  proof=acceptedProof;owner=capture(p);return {ready:current(),privateRegistryExported:false,newMediaRequest:false};
 };
 entry.target=reference=>{
  if(!released())return {ready:false,reason:'PROBE_ACTIVE'};
  const result=active?.poll?.()?.summary;if(result?.catalogStable!==true||result?.released!==true)return {ready:false,reason:'FINAL_CATALOG_UNQUALIFIED'};
  if(!current()){registry.clear();owner=null;proof=null;return {ready:false,reason:'OWNER_CHANGED'};}
  const row=registry.get(reference);if(!row)return {ready:false,reason:'UNKNOWN_REFERENCE'};
  const matches=state.files.filter(f=>f.id===row.id);if(matches.length!==1||String(matches[0].version)!==String(row.version))return {ready:false,reason:'CURRENT_UI_VERSION_UNQUALIFIED'};
  const buttons=[...document.querySelectorAll('.file-card-open')].filter(b=>b.closest('[data-file-id]')?.dataset.fileId===row.id);if(buttons.length!==1)return {ready:false,reason:'NOT_RENDERED'};
  const r=buttons[0].getBoundingClientRect();return {ready:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight,reference,x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,dpr:devicePixelRatio,privateIdentityExported:false,trustedNormalUIClickRequired:true};
 };
 entry.cleanup=()=>{if(!released())active.cancel();registry.clear();owner=null;proof=null;return {released:released(),privateRegistryCleared:true};};
 return Object.freeze(entry);
}
