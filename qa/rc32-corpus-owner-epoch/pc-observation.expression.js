(()=>{'use strict';
 const r=window.__rc32CorpusOwnerEpoch;if(!r)throw Error('OWNED_EPOCH_REQUIRED');let waiting=false,disposed=false,exportText=null;
 const countKeys=['denominator','videoMimeOrExtensionUnion','imageMimeOrExtensionUnion','classified','unknown','failed','quarantined','quarantinedConsumedAttempts','ineligible','unattempted','deferred','queuedFresh','ledgerEntries'];
 const brief=()=>{const x=r.read(),s=x.jobs.at(-1)?.summary,c=s?.coverage;return{at:new Date().toISOString(),active:x.active,disposed:x.disposed,stopped:x.stopped,needsRecovery:x.needsRecovery,burst:x.burst,jobs:x.jobs.length,progress:x.progress,last:s?{complete:s.complete,failure:s.failure,catalogStable:s.catalogStable,released:s.released,metadataRequests:s.metadataRequests,metadataBytes:s.metadataBytes,mediaRequests:s.mediaRequests,mediaBytes:s.mediaBytes,ownerDiagnostic:s.ownerDiagnostic,coverage:c?Object.fromEntries(countKeys.map(k=>[k,c[k]])):null}:null};};
 return Object.freeze({brief,
  async wait(ms){if(disposed||waiting||!Number.isSafeInteger(ms)||ms<1||ms>25000)throw Error('OWNED_OBSERVER_BOUND');waiting=true;try{const end=Date.now()+ms;while(Date.now()<end){const x=r.read();if(!x.active&&x.burst?.done)break;await new Promise(done=>setTimeout(done,250));}return brief();}finally{waiting=false;}},
  async freeze(){const x=r.read();if(disposed||x.active||!x.burst?.done)throw Error('OWNED_EXPORT_IDLE_REQUIRED');exportText=JSON.stringify(x);const bytes=new TextEncoder().encode(exportText);return{characters:exportText.length,bytes:bytes.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')};},
  chunk(offset,length){if(exportText===null||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>24000)throw Error('OWNED_EXPORT_BOUND');return{text:exportText.slice(offset,offset+length)};},
  clearExport(){exportText=null;return{cleared:true};},
  dispose(){if(waiting)throw Error('OWNED_OBSERVER_ACTIVE');exportText=null;disposed=true;return{disposed:true};}
 });
})()
