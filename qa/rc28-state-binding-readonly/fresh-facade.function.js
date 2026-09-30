function (expectedProjection, allowedFileIds, budgetMs, swProof) {
  const initialProjection = JSON.parse(JSON.stringify(state.accountMediaState));
  const cacheText = localStorage.getItem(accountStateCacheKey(state.accountId));
  const writerText = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
  const owner = {
    accountId: state.accountId, key: state.authAccountKey,
    auth: state.authGeneration, drive: state.driveSessionGeneration,
    token: state.token, tokenRevision: state.tokenRevision, expiry: state.expiresAt,
    controller: navigator.serviceWorker.controller, abort: state.accountStateAbortController,
    writerId: state.accountStateWriterId, revision: state.accountStateRevision,
    mediaSession: state.mediaSession, sourceGeneration: mediaSourceGeneration,
    retirement: q1RetirementResult,
  };
  const ids = new Set(allowedFileIds);
  if (ids.size !== allowedFileIds.length || ids.size < 1 || ids.size > 64
    || [...ids].some(id => !/^[A-Za-z0-9_-]{1,200}$/.test(id))) throw new Error('FRESH_CACHE_PREFLIGHT');
  const aborter = new AbortController();
  const abort = () => aborter.abort();
  let lastGuardFailures = [];
  const current = () => {
    const checks = {
      scopeActive: !aborter.signal.aborted,
      sourceProof: swProof.get()?.controller === owner.controller && swProof.get()?.version === APP_VERSION && swProof.get()?.sourceCommit === '944f00607cf05e586b1c88e2876dd796ce114e82' && swProof.get()?.sourceSHA256?.['app.js'] === '2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377',
      capability: hasAuthCapability('appData'),
      runtime: APP_VERSION === '1.22.0-rc.28' && DRIVE_MUTATIONS_ENABLED === false,
      origin: location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' && top === self,
      foreground: navigator.onLine && document.visibilityState === 'visible',
      controller: navigator.serviceWorker.controller === owner.controller && owner.controller?.state === 'activated',
      account: state.accountId === owner.accountId && state.authAccountKey === owner.key,
      authGeneration: state.authGeneration === owner.auth,
      driveGeneration: state.driveSessionGeneration === owner.drive,
      token: state.token === owner.token && state.tokenRevision === owner.tokenRevision && state.expiresAt === owner.expiry,
      credentialUsable: state.authStatus === 'online' && !state.demo && hasUsableToken(),
      stateReady: state.accountStateLoaded && !state.accountIdentityPending,
      readIdle: !state.accountStateLoadingPromise,
      writesIdle: !state.accountStateSyncPromise && !state.accountStateSyncTimer && !state.accountStateSyncRetryTimer && !state.accountStateSyncError,
      stateAbort: state.accountStateAbortController === owner.abort && owner.abort?.signal && !owner.abort.signal.aborted,
      writer: state.accountStateWriterId === owner.writerId && state.accountStateRevision === owner.revision,
      projection: accountMediaStatesEqual(state.accountMediaState, initialProjection),
      cache: localStorage.getItem(accountStateCacheKey(owner.accountId)) === cacheText,
      writerStorage: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === writerText,
      mediaOwner: state.mediaSession === owner.mediaSession && mediaSourceGeneration === owner.sourceGeneration,
      retirement: q1RetirementResult === owner.retirement && owner.retirement?.settled === true,
      mediaIdle: state.selected === null && state.mediaAttempt === 'idle' && !state.mediaAbortController
        && !state.pendingOriginalBuffer && !state.pendingPlay && !state.mediaTransportStarted && q1Playback === null && !playerMediaPriorityActive,
    };
    lastGuardFailures = Object.keys(checks).filter(key => !checks[key]);
    return lastGuardFailures.length === 0;
  };
  if (!current() || !owner.accountId || !owner.writerId || !cacheText
    || !accountMediaStatesEqual(initialProjection, expectedProjection)) throw new Error('FRESH_CACHE_PREFLIGHT');
  const events = ['pagehide', 'beforeunload'];
  for (const event of events) window.addEventListener(event, abort, { once: true });
  owner.abort.signal.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    for (const event of events) window.removeEventListener(event, abort);
    owner.abort.signal.removeEventListener('abort', abort);
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
)(current, aborter.signal, allowedFileIds);
  const read=adapter.read;
  let job;
  try {
    job = this({ read, expectedAccountId: owner.accountId, expectedProjection,
      isCurrent: current, signal: aborter.signal, budgetMs });
  } catch (error) { abort(); cleanup(); throw error; }
  return {
    run: () => job.run().finally(cleanup),
    summary: () => ({ ...job.safeSummary(), nativeGets: adapter.summary().requests, transport: adapter.summary(), ownerCurrent: current(), guardFailures: lastGuardFailures, sourceHash: job.sourceHash,
      actualCacheUnchanged: localStorage.getItem(accountStateCacheKey(owner.accountId)) === cacheText,
      actualWriterUnchanged: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === writerText }),
    clear: () => { job.clear(); abort(); cleanup(); },
  };
}
