(function (legacyLocal, swProof) {
  const sameProjection = (a, b) => accountMediaStatesEqual(a, b);
  const initialProjection = JSON.parse(JSON.stringify(state.accountMediaState));
  const initialCache = localStorage.getItem(accountStateCacheKey(state.accountId));
  const initialWriterStorage = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
  const owner = {
    accountId: state.accountId, key: state.authAccountKey,
    auth: state.authGeneration, drive: state.driveSessionGeneration,
    revision: state.tokenRevision, token: state.token, expiry: state.expiresAt,
    controller: navigator.serviceWorker.controller,
    accountAbort: state.accountStateAbortController,
    mediaSession: state.mediaSession, sourceGeneration: mediaSourceGeneration,
    retirement: q1RetirementResult, writerId: state.accountStateWriterId, stateRevision: state.accountStateRevision,
  };
  const rootAbort = new AbortController();
  const abort = () => rootAbort.abort();
  const idle = () => state.selected === null && state.mediaAttempt === 'idle'
    && state.mediaAbortController === null && state.pendingOriginalBuffer === null
    && state.pendingPlay === false && state.mediaTransportStarted === false
    && q1Playback === null && q1RetirementResult?.settled === true && !playerMediaPriorityActive;
  const currentBase = () => !rootAbort.signal.aborted
    && APP_VERSION === '1.22.0-rc.28' && DRIVE_MUTATIONS_ENABLED === false
    && location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    && top === self && navigator.onLine === true && document.visibilityState === 'visible'
    && navigator.serviceWorker.controller === owner.controller
    && owner.controller?.state === 'activated' && swProof.get()?.controller === owner.controller && swProof.get()?.version === APP_VERSION && swProof.get()?.sourceCommit === '944f00607cf05e586b1c88e2876dd796ce114e82' && swProof.get()?.sourceSHA256?.['app.js'] === '2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377'
    && state.accountId === owner.accountId && state.authAccountKey === owner.key
    && state.authGeneration === owner.auth && state.driveSessionGeneration === owner.drive
    && state.tokenRevision === owner.revision && state.token === owner.token && state.expiresAt === owner.expiry
    && state.authStatus === 'online' && state.demo === false && hasUsableToken()
    && state.accountStateLoaded === true && !state.accountIdentityPending && !state.accountStateLoadingPromise && !state.accountStateSyncTimer && !state.accountStateSyncRetryTimer && !state.accountStateSyncError && hasAuthCapability('appData') && !state.accountStateSyncPromise
    && state.accountStateAbortController === owner.accountAbort && Boolean(owner.accountAbort?.signal)
    && !owner.accountAbort.signal.aborted
    && state.mediaSession === owner.mediaSession && mediaSourceGeneration === owner.sourceGeneration
    && q1RetirementResult === owner.retirement && state.accountStateWriterId === owner.writerId && state.accountStateRevision === owner.stateRevision && idle()
    && sameProjection(state.accountMediaState, initialProjection)
    && localStorage.getItem(accountStateCacheKey(owner.accountId)) === initialCache
    && localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === initialWriterStorage;
  const guardFailures=[];
  const current=()=>{const ok=currentBase();if(!ok&&guardFailures.length<16)guardFailures.push({at:Date.now(),aborted:rootAbort.signal.aborted,source:APP_VERSION==='1.22.0-rc.28'&&swProof.get()?.controller===owner.controller,foreground:document.visibilityState==='visible',online:navigator.onLine,controller:navigator.serviceWorker.controller===owner.controller,account:state.accountId===owner.accountId&&state.authAccountKey===owner.key,authGeneration:state.authGeneration===owner.auth,driveGeneration:state.driveSessionGeneration===owner.drive,token:state.token===owner.token&&state.tokenRevision===owner.revision&&state.expiresAt===owner.expiry,authOnline:state.authStatus==='online'&&hasUsableToken(),loaded:state.accountStateLoaded===true,identityIdle:!state.accountIdentityPending,loadingIdle:!state.accountStateLoadingPromise,syncTimerIdle:!state.accountStateSyncTimer,retryTimerIdle:!state.accountStateSyncRetryTimer,syncErrorAbsent:!state.accountStateSyncError,syncIdle:!state.accountStateSyncPromise,capability:hasAuthCapability('appData'),abortOwner:state.accountStateAbortController===owner.accountAbort&&!owner.accountAbort.signal.aborted,mediaSession:state.mediaSession===owner.mediaSession&&mediaSourceGeneration===owner.sourceGeneration,retirement:q1RetirementResult===owner.retirement,writer:state.accountStateWriterId===owner.writerId,revision:state.accountStateRevision===owner.stateRevision,idle:idle(),projection:sameProjection(state.accountMediaState,initialProjection),cache:localStorage.getItem(accountStateCacheKey(owner.accountId))===initialCache,writerStorage:localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY)===initialWriterStorage});return ok;};
  if (!current() || !owner.accountId || !owner.token || !initialCache || !owner.writerId) throw new Error('BACKUP_PREFLIGHT_REJECTED');
  const events = ['pagehide', 'beforeunload'];
  for (const event of events) window.addEventListener(event, abort, { once: true });
  owner.accountAbort.signal.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    for (const event of events) window.removeEventListener(event, abort);
    owner.accountAbort.signal.removeEventListener('abort', abort);
  };
  const readCandidate = () => {
    let cachedRemote = createEmptyAccountMediaState();
    for (const entry of state.accountStateReadCache.values()) {
      cachedRemote = mergeAccountMediaStates(cachedRemote, entry.data);
    }
    return {
      accountId: owner.accountId,
      cacheText: localStorage.getItem(accountStateCacheKey(owner.accountId)),
      runtimeProjection: JSON.parse(JSON.stringify(state.accountMediaState)),
      pending: !sameProjection(mergeAccountMediaStates(cachedRemote, state.accountMediaState), cachedRemote),
      writerId: state.accountStateWriterId,
      writerStorageText: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY),
    };
  };
  const adapter=(function(current, signal, seedIds) {
  const ids=new Set(seedIds),start=Date.now();let requests=0,bytes=0,pages=0,blocked=0;
  const fail=code=>Object.assign(new Error(code),{code});
  const check=()=>{if(signal.aborted||!current())throw fail('stale_owner');if(Date.now()-start>=30000)throw fail('time_limit');};
  const bounded=(promise,readSignal)=>new Promise((resolve,reject)=>{const abort=()=>reject(fail('cancelled'));readSignal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>readSignal.removeEventListener('abort',abort));if(readSignal.aborted)abort();});
  const read=async(address,options={})=>{
    check();const url=new URL(address),keys=[...url.searchParams.keys()].sort().join(',');
    const about=url.pathname==='/drive/v3/about'&&keys==='fields'&&url.searchParams.get('fields')==='user(permissionId)';
    const catalog=url.pathname==='/drive/v3/files'&&url.searchParams.get('spaces')==='appDataFolder'&&url.searchParams.get('pageSize')==='1000'
      &&url.searchParams.get('q')==="(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false"
      &&['nextPageToken,incompleteSearch,files(id,name,modifiedTime)','nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)'].includes(url.searchParams.get('fields'))
      &&[...url.searchParams.keys()].every(k=>['spaces','pageSize','q','fields','pageToken','orderBy'].includes(k))
      &&(!url.searchParams.has('orderBy')||url.searchParams.get('orderBy')==='modifiedTime desc');
    const body=/^\/drive\/v3\/files\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname)&&ids.has(url.pathname.split('/').pop())&&keys==='alt'&&url.searchParams.get('alt')==='media';
    if(url.origin!=='https://www.googleapis.com'||url.hash||url.username||url.password||options.method!=='GET'||options.headers||options.body!==undefined||!options.signal||!(about||catalog||body)){blocked++;throw fail('invalid_transport');}
    if(++requests>80||(catalog&&++pages>16))throw fail('request_limit');
    const response=await bounded(driveFetch(url.href,{method:'GET',signal:options.signal,driveNoRetry:true,driveMaxRateAttempts:1,redirect:'error',credentials:'omit',[ACCOUNT_STATE_READ]:true}),options.signal);check();
    if(!response.ok){await response.body?.cancel();throw fail('read_failed');}
    const reader=response.body?.getReader();if(!reader)throw fail('invalid_reader');const chunks=[];let length=0;
    try{for(;;){check();const r=await bounded(reader.read(),options.signal);check();if(r.done)break;bytes+=r.value.byteLength;length+=r.value.byteLength;if(bytes>8*1024*1024)throw fail('byte_limit');chunks.push(r.value);}}
    catch(e){void reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);raw.fill(0);
    if(catalog){const value=JSON.parse(text);if(value.incompleteSearch===true||!Array.isArray(value.files))throw fail('incomplete_catalog');for(const file of value.files){if(!/^[A-Za-z0-9_-]{1,200}$/.test(file.id)||!(file.name==='drive-original-account-state.json'||/^drive-original-account-state-v2-[A-Za-z0-9_-]+\.json$/.test(file.name)))throw fail('unexpected_file');if(seedIds.length&&!ids.has(file.id))throw fail('concurrent_change');ids.add(file.id);}if(ids.size>64)throw fail('file_limit');}
    check();return new Response(text,{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {read,summary:()=>({requests,bytes,pages,blocked,writes:0,namespaceAllowed:true,canonicalAccountStateRead:true})};
}
)(current, rootAbort.signal, []);
  const read=adapter.read;
  let handle;
  try {
    handle = this({ read, readCandidate, legacyLocal, expectedAccountId: owner.accountId,
      normalize: normalizeAccountMediaState, merge: mergeAccountMediaStates,
      isCurrent: current, signal: rootAbort.signal, limits: {milliseconds: 30000,requests: 80,bytes: 8*1024*1024,files: 64,pages: 16}, evidence: { projectClientBinding: 'unknown' } });
  } catch (cause) {
    rootAbort.abort(); cleanup(); throw cause;
  }
  let done = false;
  const capture = handle.capture().then(() => { done = true; }).finally(cleanup);
  return {
    poll: () => ({ done, nativeDispatches: adapter.summary().requests, transport: adapter.summary(), guardFailures: guardFailures.slice(), summary: handle.safeSummary(), ownerCurrent: current() }),
    privateText: () => handle.readPrivateText(),
    privateEnvelope: () => handle.readPrivatePayload(),
    verifyReread: text => handle.verifyReread(text),
    clear: () => { rootAbort.abort(); handle.clear(); cleanup(); },
    settled: () => capture,
  };
})