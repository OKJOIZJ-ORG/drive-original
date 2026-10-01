const privateCapsules=new WeakMap();
const controllerEpochs=new WeakMap();let nextControllerEpoch=1;
export const CONTINUITY_LIMIT=8192;
export const RETRYABLE=new Set(['POSTFLIGHT_FAILED','PREFLIGHT_FAILED','HEADER_TIMEOUT','BODY_TIMEOUT','FILE_TIMEOUT']);
const reject=()=>{throw Object.assign(new Error('CONTINUITY_REJECTED'),{code:'CONTINUITY_REJECTED'});};
export function evidenceEpoch({state,controller,source}){if(!controllerEpochs.has(controller))controllerEpochs.set(controller,nextControllerEpoch++);return JSON.stringify([state.authGeneration,state.driveSessionGeneration,state.tokenRevision,state.expiresAt,state.mediaSession,source,controllerEpochs.get(controller)]);}
export const identitySame=(a,b)=>/^(0|[1-9]\d*)$/.test(a?.version??'')&&/^(0|[1-9]\d*)$/.test(b?.version??'')&&['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'].every(k=>a?.[k]===b?.[k]);
export const contentSame=(a,b)=>['headRevisionId','sha256Checksum'].every(k=>a?.[k]===b?.[k]);
const recordCopy=r=>({identity:{...r.identity},content:{...r.content},kind:r.kind,deeperMetadata:'not-probed',evidenceEpoch:r.evidenceEpoch});
const attemptCopy=r=>({identity:{...r.identity},content:r.content?{...r.content}:null,count:r.count,failure:r.failure});
export function readHeaderState(capsule,context,binding){
  if(capsule===null||capsule===undefined)return {records:[],attempts:[]};
  const value=privateCapsules.get(capsule);
  if(!value||value.accountKey!==context.authAccountKey||value.rootId!==context.rootId||value.sourceCommit!==binding.sourceCommit||value.version!==binding.version||['app.js','sw.js','version.json'].some(k=>value.sourceSHA256?.[k]!==binding.sourceSHA256?.[k]))reject();
  return {records:value.records.map(recordCopy),attempts:value.attempts.map(attemptCopy)};
}
export function readHeaderContinuity(capsule,context,binding){return readHeaderState(capsule,context,binding).records;}
export function createHeaderContinuity(context,binding,records,attempts){
  if(records.length>CONTINUITY_LIMIT||attempts.length>CONTINUITY_LIMIT||new Set(records.map(r=>r.identity.fileId)).size!==records.length||new Set(attempts.map(r=>r.identity.fileId)).size!==attempts.length||attempts.some(r=>!Number.isSafeInteger(r.count)||r.count<1||r.count>2))throw Object.assign(new Error('CONTINUITY_LIMIT'),{code:'CONTINUITY_LIMIT'});
  const capsule=Object.freeze({schema:'drive-original.private-prefix-recovery-handle/1'});
  privateCapsules.set(capsule,{accountKey:context.authAccountKey,rootId:context.rootId,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:{...binding.sourceSHA256},records:records.map(recordCopy),attempts:attempts.map(attemptCopy)});
  return capsule;
}
export function clearHeaderContinuity(capsule){return privateCapsules.delete(capsule);}
