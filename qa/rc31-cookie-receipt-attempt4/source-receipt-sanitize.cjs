'use strict';
// Exact finite projection; the attempt3 scope/classifier/cookie arguments are unchanged.
const OWNER=['exactSource31','accountSame','targetSame','freshSameWhenKnown','exactCurrentOwner','exactPlayer','nativeEventCurrent','nativeErrorAbsent','q1Ts','sourceGenerationSame','sessionSame','ownerAccountSame','ownerDriveGenerationSame','ownerControllerSame','controllerNotAborted','pipelineGenerationKnown','pipelineHealthy','visible'];
const FENCES=['exactSource31','accountSame','sameRetainedPlayer','sameRetainedGeneration','playerDisposed','exactOwnerRetirement','closedSettled','noBlob','noFrameOwner','visible'];
const PREDICATES=['sourceStatsPresent','readsCompletedPositive','rangeRequestsPositive','receivedBytesPositive'];
const COUNTS=['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes'];
const bools=(o,k)=>Object.fromEntries(k.map(x=>[x,o?.[x]===true]));const safe=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const snapshot=o=>({generation:safe(o?.generation),sourceStatsPresent:o?.sourceStatsPresent===true,counters:Object.fromEntries(COUNTS.map(k=>[k,safe(o?.counters?.[k])]))});
function reduce(o){return{scope:'Q1_ORIGINAL_BYTE_READ_ONLY',q0CookieCoverage:'UNKNOWN',ownerBeforeClose:bools(o?.ownerBeforeClose,OWNER),preClose:snapshot(o?.preClose),preClosePredicateQualified:o?.preClosePredicateQualified===true,postClose:{...snapshot(o?.postClose),fences:bools(o?.postClose?.fences,FENCES),predicates:bools(o?.postClose?.predicates,PREDICATES)},originalBytePathQualified:o?.originalBytePathQualified===true,rawIdentifiersExported:false};}
module.exports={reduce,OWNER,FENCES,PREDICATES,COUNTS};
