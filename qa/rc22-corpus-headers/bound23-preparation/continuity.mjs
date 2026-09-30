const privateCapsules=new WeakMap();
const controllerEpochs=new WeakMap();let nextControllerEpoch=1;
export function validationEpoch({state,controller,source}){if(!controllerEpochs.has(controller))controllerEpochs.set(controller,nextControllerEpoch++);return JSON.stringify([state.authGeneration,state.driveSessionGeneration,state.tokenRevision,state.expiresAt,state.mediaSession,source,controllerEpochs.get(controller)]);}
export const identitySame=(a,b)=>['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'].every(k=>a?.[k]===b?.[k]);
export const contentSame=(a,b)=>['headRevisionId','sha256Checksum'].every(k=>a?.[k]===b?.[k]);
export function readHeaderContinuity(capsule,context,binding){
  if(capsule===null||capsule===undefined)return [];
  const value=privateCapsules.get(capsule);
  if(!value||value.accountKey!==context.authAccountKey||value.rootId!==context.rootId||value.sourceCommit!==binding.sourceCommit||value.version!==binding.version)throw Object.assign(new Error('CONTINUITY_REJECTED'),{code:'CONTINUITY_REJECTED'});
  return value.records.map(r=>({identity:{...r.identity},content:{...r.content},kind:r.kind,deeperMetadata:r.deeperMetadata,validationEpoch:r.validationEpoch}));
}
export function createHeaderContinuity(context,binding,records){
  const capsule=Object.freeze({schema:'drive-original.private-header-continuity-handle/1'});
  privateCapsules.set(capsule,{accountKey:context.authAccountKey,rootId:context.rootId,version:binding.version,sourceCommit:binding.sourceCommit,records:records.map(r=>({identity:{...r.identity},content:{...r.content},kind:r.kind,deeperMetadata:'not-probed',validationEpoch:r.validationEpoch}))});
  return capsule;
}
export function clearHeaderContinuity(capsule){return privateCapsules.delete(capsule);}
