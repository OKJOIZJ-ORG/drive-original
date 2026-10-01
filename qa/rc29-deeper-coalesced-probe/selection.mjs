import {normalizeProbeIdentity} from '../v2-07a-bounded-probe/bounded-probe.mjs';
const fail=()=>{throw Object.assign(Error('SELECTION_FAILED'),{code:'SELECTION_FAILED'});};
const exts=new Set(['jpg','jpeg','png','gif','webp','bmp','mp4','mov','webm','mkv','avi']);
const mimes=new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp','video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo']);
const extension=r=>String(r.extension||'').replace(/^\./,'').toLowerCase();
const stratum=r=>['mkv','webm'].includes(extension(r))||['video/webm','video/x-matroska'].includes(r.mimeType)?'ebml':['mp4','mov'].includes(extension(r))&&['video/mp4','video/quicktime'].includes(r.mimeType)?'iso-metadata':'rare-image-or-mismatch';
const safeReason=x=>typeof x!=='string'?'other-mandatory':/^(priority|longest-video|largest:\.(mp4|mov))$/.test(x)?x:/^rare:\.(mkv|avi|bmp):/.test(x)?/^rare:\.(mkv|avi|bmp):/.exec(x)[0].slice(0,-1):x.startsWith('ge4gib:')?'ge4gib':'other-mandatory';
const categoryPatterns=[/^extension:\.(jpg|jpeg|png|gif|webp|bmp|mp4|mov|webm|mkv|avi)$/,/^mediaFamily:(image|video|audio)$/,/^videoSize:\.(mp4|mov):(ge256MiB_lt2GiB|ge2GiB_lt4GiB|ge4GiB)$/,/^videoDuration:(ge1h_lt2h|ge2h)$/,/^videoMetadataMissing:(duration|size)$/,/^animationCandidate:\.(gif|webp)$/,/^animationSize:\.(gif|webp):(unknown|le24MiB|gt24MiB_le64MiB|gt64MiB)$/,/^imageRotation:([1-8]|other)$/,/^capability:(download|read-revisions)-(true|false|unknown)$/,/^metadata:(version|size|mime)-missing$/];
const safeCategory=x=>typeof x!=='string'?'other-metadata-risk':x.startsWith('mandatory:')?'mandatory:'+safeReason(x.slice(10)):x.startsWith('mimeMismatch:')?'mimeMismatch:metadata-extension-mime':x.startsWith('mime:')?'mime:'+(mimes.has(x.slice(5))?x.slice(5):'other'):categoryPatterns.some(p=>p.test(x))?x:'other-metadata-risk';
export function safeReferences(selection){return selection.privateManifest.selected.map((r,i)=>({reference:'representative-'+(i+1),stratum:stratum(r),extension:exts.has(extension(r))?extension(r):'other',mimeType:mimes.has(r.mimeType)?r.mimeType:'other',mandatoryReasons:[...new Set(r.mandatoryReasons.map(safeReason))],metadataRiskCategories:[...new Set(r.coveredCategories.map(safeCategory))],privateIdentityExported:false}));}
export function planDeepCohorts(selection,context,cohortNumber=1){
 const m=selection?.privateManifest,r=selection?.report;
 if(m?.schema!=='drive-original.v2-07a-risk-selection-private/1'||!Array.isArray(m.selected)||m.selected.length<1||m.selected.length>38||m.prioritySample?.fileId!==context.priorityFileId||m.prioritySample?.version!==context.priorityVersion||r?.coverage?.uncoveredCategoryCount!==0||!Number.isSafeInteger(cohortNumber)||cohortNumber<1||cohortNumber>38)fail();
 const seen=new Set(),ineligible=[];
 const pending=m.selected.flatMap((row,i)=>{
  if(seen.has(row.fileId))fail();seen.add(row.fileId);
  const expected=normalizeProbeIdentity({accountKey:context.authAccountKey,fileId:row.fileId,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
  if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))fail();
  const reference='representative-'+(i+1);
  if(BigInt(expected.size)<=940n){ineligible.push({reference,reason:'SMALL_FILE_WHOLE_READ_EXCLUDED'});return [];}
  const keys=new Set((row.visibleReferences||[]).map(x=>x.resourceKey).filter(Boolean));if(keys.size>1)fail();
  return [{row,expected,resourceKey:[...keys][0]||null,reference,group:stratum(row)}];
 });
 const cohorts=[];
 while(pending.length){const counts={'iso-metadata':0,ebml:0,'rare-image-or-mismatch':0},limits={'iso-metadata':5,ebml:1,'rare-image-or-mismatch':2},picked=[];
  for(let i=0;i<pending.length;){const x=pending[i];if(counts[x.group]<limits[x.group]){counts[x.group]++;picked.push(x);pending.splice(i,1);}else i++;}if(!picked.length)fail();cohorts.push(picked);
 }
 const plan=cohorts[cohortNumber-1]||[],planned=new Set(plan.map(x=>x.reference));
 return {plan,summary:{representatives:m.selected.length,cohort:cohortNumber,cohorts:cohorts.length,configuredMaximumFiles:8,planned:plan.length,priorityBodyReprobe:true,priorPrivateMappingAvailable:false,metadataCategoryCoverage:r.coverage,bodyCoverageComplete:false},stratumCoverage:{scope:'complete-current-selected-metadata-risk-representatives-not-whole-codec-union',selectedDenominator:m.selected.length,planned:plan.length,unprobedInThisJob:m.selected.length-plan.length,ineligible,cohorts:cohorts.map((xs,i)=>({ordinal:i+1,references:xs.map(x=>x.reference)})),references:safeReferences(selection).map(x=>({...x,planned:planned.has(x.reference)})),actualWholeCodecCombinationCoverage:false,hdrPresence:'unknown',vfrPresence:'unknown',budgetDeferred:0}};
}
export function classifyTimeoutRetry(prior,current){
 const same=prior?.sourceCommit===current?.sourceCommit&&prior?.version===current?.version&&['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload','headRevisionId','sha256Checksum'].every(k=>prior?.privateIdentity?.[k]!==undefined&&prior.privateIdentity[k]===current?.privateIdentity?.[k]);
 return {sameImmutableTarget:same,priorFailureRetained:true,classification:!same?'IDENTITY_UNQUALIFIED':prior.failure!=='HEADER_TIMEOUT'?'NOT_HEADER_TIMEOUT':current.complete===true&&current.failure===null?'RECOVERED_SAME_IMMUTABLE_TARGET':current.failure==='HEADER_TIMEOUT'?'REPEATED_HEADER_TIMEOUT':'DIFFERENT_FAILURE',limitsIncreased:false,productCauseEstablished:false};
}
