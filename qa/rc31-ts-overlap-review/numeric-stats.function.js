function numericTsOverlapStats(s) {
 'use strict';
 const num=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const fields=(o,keys)=>Object.fromEntries(keys.map(k=>[k,num(o?.[k])]));
 return{generation:num(s?.generation),phase:['opening','buffering','ready','ended','cancelled','failed'].includes(s?.phase)?s.phase:'UNKNOWN',
  probeInputReused:typeof s?.probeInputReused==='boolean'?s.probeInputReused:null,disposed:s?.disposed===true,
  bootstrap:fields(s?.bootstrap,['readStart','sourceSize','sourceOffset','sourceReceived','outputBytes','packets','carryBytes']),
  sourceStatsPresent:!!s?.source,source:fields(s?.source,['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes']),
  rawIdentifiersExported:false};
}
