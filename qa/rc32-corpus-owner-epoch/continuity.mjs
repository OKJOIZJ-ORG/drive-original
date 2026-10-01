const capsules=new WeakMap();
export const CONTINUITY_LIMIT=16384;
export const RETRYABLE=new Set();
export const EPOCH='rc32-bounded-container-config-image-owner-epoch-20261001-2';
export const identitySame=(a,b)=>['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'].every(k=>a?.[k]===b?.[k]);
export const contentSame=(a,b)=>['headRevisionId','sha256Checksum','resourceKey'].every(k=>a?.[k]===b?.[k]);
export const evidenceEpoch=()=>EPOCH;
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function readHeaderState(handle,context,binding){if(handle==null)return {records:[],attempts:[]};const x=capsules.get(handle);if(!x||x.epoch!==EPOCH||x.accountKey!==context.authAccountKey||x.rootId!==context.rootId||x.commit!==binding.sourceCommit||x.version!==binding.version||JSON.stringify(x.hashes)!==JSON.stringify(binding.sourceSHA256))fail('CONTINUITY_REJECTED');return copy({records:x.records,attempts:x.attempts});}
export function createHeaderContinuity(context,binding,records,attempts){if(records.length>CONTINUITY_LIMIT||attempts.length>CONTINUITY_LIMIT||new Set(attempts.map(x=>x.identity.fileId)).size!==attempts.length||attempts.some(x=>x.count!==1))fail('CONTINUITY_LIMIT');const handle=Object.freeze({schema:'drive-original.private-owner-epoch-handle/1'});capsules.set(handle,{epoch:EPOCH,accountKey:context.authAccountKey,rootId:context.rootId,commit:binding.sourceCommit,version:binding.version,hashes:{...binding.sourceSHA256},records:copy(records),attempts:copy(attempts)});return handle;}
export function clearHeaderContinuity(handle){return capsules.delete(handle);}
