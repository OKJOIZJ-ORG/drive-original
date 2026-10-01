function (factory, privateContextText, proof, binding, dependencies) {
  'use strict';
  dependencies=dependencies||{};
  const now=dependencies.now||Date.now, schedule=dependencies.schedule||setTimeout, unschedule=dependencies.unschedule||clearTimeout;
  const version='1.22.0-rc.32',commit='1d79897fd32c569137cab079bfd93107be2ee33f';
  if(typeof factory!=='function'||typeof factory.clearContinuity!=='function'||typeof privateContextText!=='string'||binding.version!==version||binding.sourceCommit!==commit)throw Error('RUNNER_PREFLIGHT');
  let context=JSON.parse(privateContextText);
  if(Object.keys(context).sort().join(',')!=='accountKey,generation,priorityFileId,rootId'||!['accountKey','priorityFileId','rootId'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(context[k]))||!Number.isSafeInteger(context.generation)||context.generation<0)throw Error('RUNNER_CONTEXT');
  context=null;
  const initial=proof?.get?.();
  const sameProof=()=>{const p=proof?.get?.();return p&&p.controller===initial?.controller&&p.controller?.state==='activated'&&p.version===version&&p.sourceCommit===commit&&['app.js','sw.js','version.json'].every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256?.[k]);};
  if(!sameProof())throw Error('RUNNER_PROOF');
  let active=null,capsule=null,timer=null,burst=null,representativesDone=false,progressExhausted=false,stopped=null,cleaning=false,disposed=false;
  const jobs=[];
  const codes=new Set(['FACADE_PREFLIGHT_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','CONTINUITY_REJECTED','SOURCE_BINDING_REJECTED','RUNTIME_REJECTED','PROBE_FAILED','ERROR_PAYLOAD','CONTINUITY_CONTENT_CHANGED']);
  for(const code of ['ABORTED','ACCEPT_RANGES_INVALID','BATCH_BYTE_LIMIT','BODY_LENGTH_MISMATCH','BODY_TIMEOUT','BODY_UNAVAILABLE','CACHE_CONTROL_INVALID','CONTENT_LENGTH_INVALID','CONTENT_RANGE_INVALID','DOWNLOAD_FORBIDDEN','FILE_BYTE_LIMIT','FILE_REQUEST_LIMIT','FILE_TIMEOUT','GENERATION_STALE','HEADER_TIMEOUT','IDENTITY_MISMATCH','INVALID_IDENTITY','INVALID_RANGE','INVALID_READER_RESULT','POSTFLIGHT_DRIFT','POSTFLIGHT_FAILED','PREFLIGHT_FAILED','READER_FAILURE','REQUEST_BYTE_LIMIT','STATUS_NOT_206'])codes.add(code);
  codes.add('CONTINUITY_LIMIT');
  const fileFatal=new Set(['FACADE_PREFLIGHT_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','CONTINUITY_REJECTED','CONTINUITY_LIMIT','SOURCE_BINDING_REJECTED','RUNTIME_REJECTED','GENERATION_STALE','IDENTITY_MISMATCH','POSTFLIGHT_DRIFT']);
  const kinds=new Set(['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','bmp','gif','webp','png','jpeg','unknown','error-payload']);
  const safeKeys=new Set(('about absent allEligiblePrefixesValidated animatedGifOrWebp attempted audioObjects bands batches batchesPlanned batchFiles bytes candidateDenominators canDownload canListChildren canReadRevisions capabilities carriedImmutableByCatalog classified classifiedUniqueObjects complete completed completeness configuredContainerAnalysisCount containmentComplete counts coverage decodedInThisRunCount deeperMetadataIncomplete deeperMetadataProbed deeperMetadataUnprobed denominator dispositionsComplete downloadBlocked downloadCapabilityUnknown duplicateReferenceCountPerPass eligible exhausted extensionMimeMismatchCount extensions failed file folders folderShortcutsNotTraversed folderShortcutsTraversed freshHeadChecksForCarry freshPerFileChecked gif guaranteed historicalPendingRevalidation imageObjects imagesWithRotation incompleteSearchCount ineligible inventoryErrorCount knownSizeFileCount kindCounts knownSignaturesAllEligible largeMp4OrMov lastCleanupFailure lastFailure limitations list maxFiles maximumKnownSizeBytes maxResponseBytes metadataAvailability metadataInventoryCount metadataInventoryIsPlaybackProof missingSize missingVersion modifiedTime ms ordinal otherObjects pageCountPerPass paginationCycleCount physicalDevicePlaybackCount physicalFiles planned png present previouslyValidated priorImmutablePrefixes prioritySampleCount providerTransactionalSnapshotGuaranteed rareExtensionCount recursiveFolderTraversal repeatedPassCount repeatedPrivateInventoryMatched requests risk routeCounts shortcutClassificationComplete shortcutResolutionErrorCount shortcuts size sizes staleShortcutTargetMimeCount totalKnownSizeBytes totalUniqueItems traversedFolderCount true unionRequiresPrivateUniqueObjectSet uniqueMediaObjects uniqueShortcutTargets unknown unknownSignatures unknownSizeFileCount unplannedPending unresolvedShortcutTargetCount version videoExtensionObjects videoMimeObjects videoMimeOrExtensionUnion videoObjects videosAtLeastOneHour visibleMediaReferences queuedFresh queuedRetries queuedTotal retryPending retryExhausted maxFreshAttemptsPerFile ledgerEntries ledgerLimit responseLimitBytes requestMs receivedBytes runReceivedBytes childAborted bodyFinished status code').split(' '));
  for(const k of [...kinds,'.avi','.bmp','.gif','.jpeg','.jpg','.mkv','.mov','.mp4','.png','.webm','.webp','<other>','>=4GiB','>0-24MiB','>24-64MiB','>256MiB-<2GiB','>64-96MiB','>96-256MiB','>2GiB-<4GiB','image/gif','image/jpeg','image/png','image/webp','image/bmp','video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo','video/mp2t','application/octet-stream'])safeKeys.add(k);
  safeKeys.add('mimeTypes');
  // Numeric/boolean trees retain redacted inventory counters, never arbitrary strings.
  const counters=value=>{
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value==='string'&&/^(0|[1-9]\d{0,99})$/.test(value))return value;
    if(typeof value==='string'&&(codes.has(value)||kinds.has(value)))return value;
    if(Array.isArray(value))return value.slice(0,256).map(counters);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>safeKeys.has(k)).flatMap(([k,v])=>{const x=counters(v);return x===undefined?[]:[[k,x]];}));
  };
  const safeSummary=s=>({schema:'drive-original.serial-corpus-safe-job/1',version,complete:s?.complete===true,catalogStable:s?.catalogStable===true,released:s?.released===true,
    failure:s?.failure===null?null:codes.has(s?.failure)?s.failure:'FACTORY_FAILURE',wholeCorpusComplete:false,
    inventoryRuns:s?.inventoryRuns??0,inventoryDenominators:counters(s?.inventoryDenominators||[]),plan:counters(s?.plan),coverage:counters(s?.coverage),reserve:counters(s?.reserve),
    metadataRequests:s?.metadataRequests??0,metadataBytes:s?.metadataBytes??0,mediaRequests:s?.mediaRequests??0,mediaBytes:s?.mediaBytes??0,
    decoded:0,playback:0,physicalDevice:0,writeRequests:s?.writeRequests??0,batches:counters(s?.batches||[]),
    files:(s?.files||[]).slice(0,64).map((f,i)=>({sample:'sample-'+(i+1),kind:kinds.has(f.kind)?f.kind:'unknown',complete:f.complete===true,failure:f.failure===null?null:codes.has(f.failure)?f.failure:'FILE_FAILURE',identityPreflight:f.identityPreflight===true,identityPostflight:f.identityPostflight===true,mediaRequests:f.mediaRequests??0,mediaBytes:f.mediaBytes??0,deeperMetadata:'not-probed'})),metadataDiagnostic:counters(s?.metadataDiagnostic)});
  function wake(){if(timer!==null)unschedule(timer);timer=schedule(tick,100);}
  function stop(code){if(!stopped)stopped=code;if(active)active.cancel();if(!active&&burst)burst.done=true;}
  function launch(){
    if(!burst||burst.done||stopped||active)return;
    if(now()>=burst.deadline){stop('BURST_DEADLINE');return;}
    if(!sameProof()){stop('SOURCE_OWNER_CHANGED');return;}
    if(burst.started>=burst.maxJobs){burst.done=true;return;}
    const phase=representativesDone?'videos':'representatives';
    try{active=factory(privateContextText,proof,capsule,{phase,maxFiles:phase==='representatives'?36:64});}catch{stop('FACTORY_THROW');return;}
    burst.started++;burst.activePhase=phase;wake();
  }
  function tick(){
    timer=null;
    if(active){
      if(!sameProof())stop('SOURCE_OWNER_CHANGED');
      if(burst&&now()>=burst.deadline)stop('BURST_DEADLINE');
      let p;try{p=active.poll();}catch{stop('POLL_FAILED');wake();return;}
      // The unchanged factory exposes file failures only in its settled summary.
      if(p.done){
        const raw=p.summary,safe=safeSummary(raw);jobs.push({ordinal:jobs.length+1,phase:burst.activePhase,summary:safe});
        const c=raw?.coverage,counts=['denominator','classified','failed','ineligible','unattempted','queuedFresh','queuedRetries','queuedTotal','retryPending','retryExhausted'];
        const validCounts=c&&counts.every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)&&c.maxFreshAttemptsPerFile===2&&Number.isSafeInteger(c.ledgerEntries)&&c.ledgerEntries>=0&&c.ledgerEntries<=8192&&c.ledgerLimit===8192&&c.denominator===c.classified+c.failed+c.ineligible+c.unattempted&&c.failed===c.retryPending+c.retryExhausted&&c.queuedFresh===c.unattempted&&c.queuedRetries===c.retryPending&&c.queuedTotal===c.queuedFresh+c.queuedRetries;
        const budgets=raw&&[['metadataRequests',512],['metadataBytes',67108864],['mediaRequests',64],['mediaBytes',64*(2*1024*1024+8192)]].every(([k,max])=>Number.isSafeInteger(raw[k])&&raw[k]>=0&&raw[k]<=max)&&raw.writeRequests===0;
        const ok=raw?.complete===true&&raw.catalogStable===true&&raw.released===true&&raw.failure===null&&Array.isArray(raw.files)&&raw.files.length<=64&&raw.files.every(f=>f.complete===true?f.failure===null&&f.identityPreflight===true&&f.identityPostflight===true:codes.has(f.failure)&&!fileFatal.has(f.failure))&&validCounts&&budgets&&c.freshPerFileChecked===raw.files.filter(f=>f.complete===true).length;
        if(ok&&!stopped){const next=active.continuity?.();if(!next)stop('CONTINUITY_MISSING');else {if(capsule)factory.clearContinuity(capsule);capsule=next;if(burst.activePhase==='representatives'&&c.queuedTotal===0)representativesDone=true;if(burst.activePhase==='videos'&&c.queuedTotal===0){progressExhausted=true;if(c.failed===0&&c.unattempted===0&&c.allEligiblePrefixesValidated===true)burst.eligibleVideoPrefixesComplete=true;}}}
        else if(!stopped)stop('FATAL_FACTORY_OR_CONTRACT_FAILURE');
        active=null;
        if(cleaning){finishCleanup();return;}
        if(stopped||progressExhausted||burst.eligibleVideoPrefixesComplete||burst.started>=burst.maxJobs)burst.done=true;
        else launch();
      }
      if(active)wake();
    }else if(cleaning)finishCleanup();
  }
  function finishCleanup(){
    if(active)return;
    if(timer!==null){unschedule(timer);timer=null;}
    if(capsule)factory.clearContinuity(capsule);
    capsule=null;privateContextText=null;proof=null;disposed=true;cleaning=false;if(burst)burst.done=true;
  }
  const read=()=>JSON.parse(JSON.stringify({schema:'drive-original.rc32-prefix-recovery-runner/1',version,sourceCommit:commit,active:Boolean(active),disposed,cleaning,stopped,progressExhausted,
    burst:burst?{...burst}:null,jobs,successfulJobs:jobs.filter(x=>x.summary.complete&&x.summary.catalogStable&&x.summary.failure===null&&x.summary.files.every(f=>f.complete)).length,
    wholeCorpusComplete:false,evidenceLevel:'940-byte-prefix-signatures-only',freshRegistry:true,historicalActual63NotImported:true,maxFreshAttemptsPerFile:2,historicalCountsAreNotCurrentCoverage:true,actualPlaybackCount:0,privateContextExported:false,continuityExported:false}));
  return Object.freeze({
    start(options){
      if(disposed||cleaning||active||burst&&!burst.done||stopped||progressExhausted)throw Error('RUNNER_NOT_RESTARTABLE');
      if(!options||Object.keys(options).some(k=>!['maxJobs','deadlineMs','stopBeforeAt'].includes(k))||!Number.isSafeInteger(options.maxJobs)||options.maxJobs<1||options.maxJobs>8||!Number.isSafeInteger(options.deadlineMs)||options.deadlineMs<1||options.deadlineMs>4800000||!Number.isSafeInteger(options.stopBeforeAt)||options.stopBeforeAt<=now())throw Error('BURST_OPTIONS');
      burst={started:0,maxJobs:options.maxJobs,deadline:Math.min(now()+options.deadlineMs,options.stopBeforeAt),stopBeforeAt:options.stopBeforeAt,done:false,eligibleVideoPrefixesComplete:false,activePhase:null};launch();return read();
    },
    read,
    pause(){stop('ROOT_PAUSE_CANCEL');if(active)wake();return read();},
    cancel(){stop('ROOT_PAUSE_CANCEL');if(active)wake();return read();},
    cleanup(){cleaning=true;stop('ROOT_CLEANUP');if(active)wake();else finishCleanup();return read();}
  });
}
