// Dependency-injected NAME-only metadata executor. No Drive client or browser
// dependency is imported here; callers own authentication, retries, and pacing.
const EXACT_FIELDS=['id','name','mimeType','size','headRevisionId','modifiedTime','version','md5Checksum','parents'];
const REQUIRED_EXPECTED=['id','name','mimeType','size','headRevisionId','modifiedTime','version','md5Checksum','parents'];

const sameScalar=(a,b)=>String(a??'')===String(b??'');
const sameParents=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index]);
const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function validate(expected,name,adapters){
 if(!expected||typeof expected!=='object'||typeof name!=='string'||!name||!expected.id||typeof expected.name!=='string')throw new TypeError('REPAIR_INPUT_INVALID');
 if(name===expected.name)throw new TypeError('REPAIR_NOOP');
 for(const field of REQUIRED_EXPECTED)if(!hasOwn(expected,field)||expected[field]==null)throw new TypeError('REPAIR_EXPECTED_METADATA_INCOMPLETE');
 if(!Array.isArray(expected.parents)||!expected.md5Checksum||!expected.headRevisionId||String(expected.size)==='')throw new TypeError('REPAIR_EXPECTED_IDENTITY_INCOMPLETE');
 if(!adapters||typeof adapters.read!=='function'||typeof adapters.patch!=='function'||typeof adapters.findCollisions!=='function')throw new TypeError('REPAIR_ADAPTERS_INCOMPLETE');
}
function matchesExpected(actual,expected){
 if(!actual||actual.id!==expected.id)return false;
 for(const field of EXACT_FIELDS){if(field==='parents'){if(!sameParents(actual.parents,expected.parents))return false;}else if(!sameScalar(actual[field],expected[field]))return false;}
 if((hasOwn(actual,'sha256Checksum')||hasOwn(expected,'sha256Checksum'))&&!sameScalar(actual.sha256Checksum,expected.sha256Checksum))return false;
 return true;
}
function eligible(actual,expected){
 return matchesExpected(actual,expected)&&actual.trashed!==true&&actual.capabilities?.canRename===true
  &&Boolean(actual.md5Checksum&&actual.headRevisionId&&actual.size!=null&&String(actual.size)!=='');
}
function unchanged(actual,expected){return matchesExpected(actual,expected);}
function postconditions(actual,expected,name){
 if(!actual||actual.trashed===true||actual.id!==expected.id||actual.name!==name||!sameParents(actual.parents,expected.parents)
  ||!sameScalar(actual.mimeType,expected.mimeType)||!sameScalar(actual.size,expected.size)
  ||!sameScalar(actual.md5Checksum,expected.md5Checksum)||!sameScalar(actual.headRevisionId,expected.headRevisionId))return false;
 if((hasOwn(actual,'sha256Checksum')||hasOwn(expected,'sha256Checksum'))&&!sameScalar(actual.sha256Checksum,expected.sha256Checksum))return false;
 return true;
}
function safeError(error){
 const status=Number(error?.status??error?.statusCode);
 return Number.isInteger(status)&&status>=100&&status<=599?`http-${status}`:'operation-error';
}
function result(status,reason,before,after,error){return {status,reason,before:before??null,after:after??null,error:error??null};}

/**
 * Apply one file-name update only.
 * Adapter contract: read(id)->full metadata; findCollisions({name,parents,excludeId})->array or {files};
 * patch(id,{name})->result. The PATCH is submitted exactly once.
 */
export async function repairFilename({expected,name},{read,patch,findCollisions}){
 validate(expected,name,{read,patch,findCollisions});
 let before;
 try{before=await read(expected.id);}catch(error){return result('blocked','preflight-read-failed',null,null,safeError(error));}
 if(!eligible(before,expected))return result('blocked','preflight-metadata-or-capability-mismatch',before,null,null);

 let collisions;
 try{collisions=await findCollisions({name,parents:expected.parents,excludeId:expected.id});}
 catch(error){return result('blocked','collision-check-failed',before,null,safeError(error));}
 const siblings=Array.isArray(collisions)?collisions:collisions?.files;
 if(!Array.isArray(siblings))return result('blocked','collision-check-invalid-result',before,null,null);
 const targetKey=name.normalize('NFC').toLocaleLowerCase('und');
 if(siblings.some(file=>file?.id!==expected.id&&typeof file?.name==='string'&&file.name.normalize('NFC').toLocaleLowerCase('und')===targetKey))
  return result('blocked','name-collision',before,null,null);

 let finalRead;
 try{finalRead=await read(expected.id);}catch(error){return result('blocked','final-preflight-read-failed',before,null,safeError(error));}
 if(!eligible(finalRead,expected))return result('blocked','final-preflight-metadata-or-capability-mismatch',before,finalRead,null);

 let patchError=null;
 try{await patch(expected.id,{name});}catch(error){patchError=safeError(error);}

 let after;
 try{after=await read(expected.id);}catch(error){return result('uncertain','post-read-failed',finalRead,null,safeError(error));}
 if(postconditions(after,expected,name))return result('applied',patchError?'verified-after-patch-error':'verified',finalRead,after,patchError);
 if(unchanged(after,expected))return result('unchanged','post-read-matches-original',finalRead,after,patchError);
 return result('uncertain','post-read-identity-or-metadata-drift',finalRead,after,patchError);
}
