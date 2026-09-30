// Copy only the maintained redacted report's explicit scalar/counter contract.
const fail=()=>{throw Object.assign(new Error('INVENTORY_FAILED'),{code:'INVENTORY_FAILED'});};
const integer=n=>Number.isSafeInteger(n)&&n>=0?n:fail();
const bool=x=>typeof x==='boolean'?x:fail();
const bytes=x=>typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)&&x.length<=100?x:fail();
const countKeys=['totalUniqueItems','folders','shortcuts','folderShortcutsNotTraversed','physicalFiles','classifiedUniqueObjects','videoObjects','imageObjects','audioObjects','otherObjects','visibleMediaReferences','uniqueMediaObjects','uniqueShortcutTargets'];
const extensionKeys=['.jpg','.jpeg','.png','.gif','.webp','.bmp','.mp4','.mov','.webm','.mkv','.avi','<none>','<other>'];
const mimeKeys=['image/jpeg','image/png','image/gif','image/webp','image/bmp','video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/flac','audio/webm','<other>'];
const sizeKeys=['unknown','zero','>0-24MiB','>24-64MiB','>64-96MiB','>96-256MiB','>256MiB-<2GiB','>=2-<4GiB','>=4GiB'];
const copyFields=(source,keys)=>Object.fromEntries(keys.map(k=>[k,integer(source?.[k])]));
const counter=(source,keys)=>{if(!source||Array.isArray(source)||Object.keys(source).some(k=>!keys.includes(k)))fail();return Object.fromEntries(Object.entries(source).map(([k,v])=>[k,integer(v)]));};
export function summarizeInventoryDenominators(report){
  if(report?.schema!=='drive-original.v2-07a-root-inventory-output-redacted/1')fail();
  const c=report.completeness;
  if(c?.repeatedPassCount!==2||c.repeatedPrivateInventoryMatched!==true||c.containmentComplete!==true||c.shortcutClassificationComplete!==true||c.recursiveFolderTraversal!==true||c.folderShortcutsTraversed!==false)fail();
  const counts=copyFields(report.counts,countKeys);
  if(counts.totalUniqueItems!==counts.folders+counts.shortcuts+counts.physicalFiles||counts.classifiedUniqueObjects!==counts.videoObjects+counts.imageObjects+counts.audioObjects+counts.otherObjects)fail();
  const extensions=counter(report.extensions,extensionKeys),mimeTypes=counter(report.mimeTypes,mimeKeys),bands=counter(report.sizes?.bands,sizeKeys);
  for(const values of [extensions,mimeTypes,bands])if(Object.values(values).reduce((n,v)=>n+v,0)!==counts.classifiedUniqueObjects)fail();
  const twoCounts=x=>{if(!Array.isArray(x)||x.length!==2)fail();return x.map(integer);};
  const capabilityKeys=['true','false','unknown'];
  const capabilities=Object.fromEntries(['canDownload','canReadRevisions','canListChildren'].map(k=>[k,counter(report.capabilities?.[k],capabilityKeys)]));
  const availability=Object.fromEntries(['size','modifiedTime','version'].map(k=>[k,copyFields(report.metadataAvailability?.[k],['present','absent'])]));
  return {
    schema:'drive-original.corpus-safe-inventory-denominators/1',counts,extensions,mimeTypes,
    completeness:{repeatedPassCount:2,repeatedPrivateInventoryMatched:true,containmentComplete:true,shortcutClassificationComplete:true,recursiveFolderTraversal:true,folderShortcutsTraversed:false,providerTransactionalSnapshotGuaranteed:bool(c.providerTransactionalSnapshotGuaranteed),
      traversedFolderCount:integer(c.traversedFolderCount),pageCountPerPass:twoCounts(c.pageCountPerPass),duplicateReferenceCountPerPass:twoCounts(c.duplicateReferenceCountPerPass),incompleteSearchCount:integer(c.incompleteSearchCount),paginationCycleCount:integer(c.paginationCycleCount),inventoryErrorCount:integer(c.inventoryErrorCount),shortcutResolutionErrorCount:integer(c.shortcutResolutionErrorCount)},
    sizes:{bands,...copyFields(report.sizes,['knownSizeFileCount','unknownSizeFileCount']),totalKnownSizeBytes:bytes(report.sizes.totalKnownSizeBytes),maximumKnownSizeBytes:bytes(report.sizes.maximumKnownSizeBytes)},
    capabilities,metadataAvailability:availability,
    risk:copyFields(report.risk,['prioritySampleCount','rareExtensionCount','animatedGifOrWebp','largeMp4OrMov','videosAtLeastOneHour','imagesWithRotation','extensionMimeMismatchCount','downloadBlocked','downloadCapabilityUnknown','missingVersion','missingSize','unresolvedShortcutTargetCount','staleShortcutTargetMimeCount']),
    candidateDenominators:{videoMimeObjects:counts.videoObjects,videoExtensionObjects:['.mp4','.mov','.webm','.mkv','.avi'].reduce((n,k)=>n+(extensions[k]??0),0),videoMimeOrExtensionUnion:null,unionRequiresPrivateUniqueObjectSet:true},
    coverage:{metadataInventoryCount:integer(report.coverage?.metadataInventoryCount),configuredContainerAnalysisCount:integer(report.coverage?.configuredContainerAnalysisCount),decodedInThisRunCount:integer(report.coverage?.decodedInThisRunCount),physicalDevicePlaybackCount:integer(report.coverage?.physicalDevicePlaybackCount)},
    limitations:{providerTransactionalSnapshotGuaranteed:false,folderShortcutsNotTraversed:counts.folderShortcutsNotTraversed,metadataInventoryIsPlaybackProof:false,wholeCorpusComplete:false}
  };
}
export function summarizeProbeDenominators({inventory,representatives,candidateTracks}={}){
  const r=integer(representatives),t=integer(candidateTracks),c=inventory?.counts;
  if(!c||r>c.classifiedUniqueObjects||t>r)fail();
  return {classifiedObjects:c.classifiedUniqueObjects,metadataVideoObjects:c.videoObjects,metadataRepresentatives:r,diagnosticTrackCandidates:t,scheduledPrefixReads:0,scheduledTrackReads:0,probedClassifiedObjects:0,probedVideoObjects:0,probedRepresentatives:0,unprobedClassifiedObjects:c.classifiedUniqueObjects,unprobedVideoObjects:c.videoObjects,unprobedRepresentatives:r,wholeCorpusComplete:false,denominatorScope:'metadata-only-current-run-no-prior-body-evidence-admitted'};
}
