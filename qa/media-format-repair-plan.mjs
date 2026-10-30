// Offline, reviewable repair planning only. This module never connects to Drive.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectFtypBrands,mismatchReasons} from './media-format-report.mjs';

const baseDirectory=path.join(path.dirname(fileURLToPath(import.meta.url)),'buffering-20261030');
const PLAN_VERSION='1.0.0';
const tsvCell=value=>{const s=String(value??'').replace(/[\t\r\n]/g,' ');return /^[=+@-]/.test(s)?`'${s}`:s;};
const extension=name=>String(name??'').match(/\.([^.]+)$/)?.[1].toLowerCase()??'';
const folderId=file=>String(file.parents?.[0]??file.folder??'');
const normalizedName=name=>String(name).normalize('NFC').toLocaleLowerCase('und');
const identity=file=>({size:String(file?.size??''),headRevisionId:String(file?.headRevisionId??''),modifiedTime:String(file?.modifiedTime??'')});
const identityEqual=(a,b)=>Boolean(a&&b&&identity(a).size&&identity(a).headRevisionId&&identity(a).modifiedTime
 &&identity(a).size===identity(b).size&&identity(a).headRevisionId===identity(b).headRevisionId&&identity(a).modifiedTime===identity(b).modifiedTime);
const contentIdentityValid=file=>Boolean(file?.md5Checksum&&file?.headRevisionId&&file?.size!=null&&String(file.size)!=='');

const definiteByKind={
 // The survey's `ts` kind is assigned only after its supported 188-byte sync.
 // Do not infer a 188-byte canonical form for unobserved 192/204-byte kinds.
 ts:{ext:'ts',mime:'video/mp2t'},
 webm:{ext:'webm',mime:'video/webm'},quicktime:{ext:'mov',mime:'video/quicktime'},
 jpeg:{ext:'jpg',mime:'image/jpeg'},png:{ext:'png',mime:'image/png'},gif:{ext:'gif',mime:'image/gif'},webp:{ext:'webp',mime:'image/webp'},bmp:{ext:'bmp',mime:'image/bmp'},heic:{ext:'heic',mime:'image/heic'},heif:{ext:'heic',mime:'image/heic'},avif:{ext:'avif',mime:'image/avif'}
};

function canonicalTarget(file,result){
 const kind=String(result?.kind??'unknown').toLowerCase();
 let target=definiteByKind[kind];
 const brands=inspectFtypBrands(result?.signature);
 if(kind==='iso'&&brands?.hasMp4&&!brands.hasQuickTime&&/^(mp41|mp42)$/.test(brands.majorBrand)) target={ext:'mp4',mime:'video/mp4'};
 if(!target)return null;
 // Google Drive names are literal strings, not local paths. Protect the shared
 // report helper's path splitting while preserving the literal name's suffix.
 const mismatch=mismatchReasons(file.name?.match(/[\\/]/)?{...file,name:String(file.name).replace(/[\\/]/g,'_')}:file,result);
 // Preserve accepted aliases, except a fully evidenced ISO MP4 vs MOV/qt conflict.
 const rename=mismatch.extensionMismatch;
 let name=file.name;
 if(rename){
  const leaf=String(file.name??'');
  if(/\.crswap$/i.test(leaf)){
   let stem=leaf.replace(/\.crswap$/i,'');
   // A recognizable media suffix inside Chrome's temporary suffix is replaced,
   // rather than duplicated (clip.mp4.crswap -> clip.ts).
   if(/\.(?:ts|mts|m2ts|m2t|webm|mov|qt|mp4|m4v|m4a|m4b|m4p|3gp|3g2|jpe?g|jpe|jfif|png|gif|webp|bmp|heic|heif|avif)$/i.test(stem)) stem=stem.replace(/\.[^.]+$/,'');
   name=`${stem}.${target.ext}`;
  } else {
   const leafExt=extension(leaf);
   name=leafExt?leaf.replace(/\.[^.]+$/i,`.${target.ext}`):`${leaf}.${target.ext}`;
  }
 }
 const mime=file.mimeType===target.mime?null:target.mime;
 return {kind,target,rename:rename&&name!==file.name,requestedName:name,requestedMime:mime,reasons:mismatch.reasons};
}

function collisionSafeName(requested,file,occupied){
 const key=`${folderId(file)}\0${normalizedName(requested)}`;
 if(!occupied.has(key))return requested;
 const ext=extension(requested),stem=ext?requested.slice(0,-ext.length-1):requested,suffixExt=ext?`.${ext}`:'';
 for(let n=2;;n++){
  const candidate=`${stem} (형식교정 ${n})${suffixExt}`;
  if(!occupied.has(`${folderId(file)}\0${normalizedName(candidate)}`))return candidate;
 }
}

export function buildRepairPlan(oldInventory,freshInventory,survey){
 if(!Array.isArray(oldInventory?.files)||!Array.isArray(freshInventory?.files)||!Array.isArray(survey?.results))throw Error('REPAIR_PLAN_INPUT_SCHEMA');
 const oldFiles=new Map(oldInventory.files.map(file=>[file.id,file]));
 const results=new Map(survey.results.map(result=>[result.id,result]));
 const freshFiles=freshInventory.files;
 const occupied=new Set(freshFiles.map(file=>`${folderId(file)}\0${normalizedName(file.name??'')}`));
 const rows=[],warnings={missingOldIdentity:0,staleIdentity:0,incompleteContentIdentity:0,noRenameCapability:0,noMimeCapability:0,unknownOrAmbiguous:0};
 const counts={inventoryFiles:freshFiles.length,plannedFiles:0,nameChanges:0,mimeChanges:0,blockedNameChanges:0,blockedMimeChanges:0,unchangedFiles:0};
 for(const file of [...freshFiles].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
  const old=oldFiles.get(file.id),result=results.get(file.id);
  if(!old){warnings.missingOldIdentity++;counts.unchangedFiles++;continue;}
  if(!identityEqual(old,file)){warnings.staleIdentity++;counts.unchangedFiles++;continue;}
  if(!result){warnings.unknownOrAmbiguous++;counts.unchangedFiles++;continue;}
  const candidate=canonicalTarget(file,result);
  if(!candidate){warnings.unknownOrAmbiguous++;counts.unchangedFiles++;continue;}
  let afterName=file.name,afterMime=file.mimeType??'';
  let nameChange=candidate.rename,mimeChange=Boolean(candidate.requestedMime);
  if(!contentIdentityValid(file)){warnings.incompleteContentIdentity++;nameChange=false;mimeChange=false;}
  if(nameChange&&!file.capabilities?.canRename){warnings.noRenameCapability++;counts.blockedNameChanges++;nameChange=false;}
  if(mimeChange&&!file.capabilities?.canEdit){warnings.noMimeCapability++;counts.blockedMimeChanges++;mimeChange=false;}
  if(nameChange){afterName=collisionSafeName(candidate.requestedName,file,occupied);occupied.delete(`${folderId(file)}\0${normalizedName(file.name??'')}`);occupied.add(`${folderId(file)}\0${normalizedName(afterName)}`);}
  if(mimeChange)afterMime=candidate.requestedMime;
  if(nameChange||mimeChange){
   counts.plannedFiles++;if(nameChange)counts.nameChanges++;if(mimeChange)counts.mimeChanges++;
   rows.push({id:file.id,parents:[...(file.parents??[])],folder:folderId(file),before:{name:file.name,mimeType:file.mimeType??''},after:{name:afterName,mimeType:afterMime},reason:candidate.reasons.length?candidate.reasons.join(';'):`canonical-mime-${candidate.kind}`,actualKind:candidate.kind,
    identity:{md5Checksum:file.md5Checksum,headRevisionId:file.headRevisionId,size:String(file.size),old:identity(old),fresh:identity(file)},capabilities:{canRename:Boolean(file.capabilities?.canRename),canEdit:Boolean(file.capabilities?.canEdit)}});
  }else counts.unchangedFiles++;
 }
 return {planVersion:PLAN_VERSION,schema:'drive-original.media-format-repair-plan',createdAt:new Date().toISOString(),counts,warnings,rows};
}

export async function writeRepairPlan(directory=baseDirectory,oldInventoryPath=path.join(directory,'format-inventory-private.json')){
 const [oldInventory,freshInventory,survey]=await Promise.all([oldInventoryPath,path.join(directory,'repair-inventory-private.json'),path.join(directory,'format-results-private.json')].map(async file=>JSON.parse(await fs.readFile(file,'utf8'))));
 const plan=buildRepairPlan(oldInventory,freshInventory,survey);
 const columns=['id','parents','folder','beforeName','beforeMimeType','afterName','afterMimeType','reason','actualKind','md5Checksum','headRevisionId','size','oldHeadRevisionId','oldModifiedTime','freshHeadRevisionId','freshModifiedTime','canRename','canEdit'];
 const tsv=['\ufeff'+columns.join('\t'),...plan.rows.map(row=>{const values={id:row.id,parents:row.parents.join(','),folder:row.folder,beforeName:row.before.name,beforeMimeType:row.before.mimeType,afterName:row.after.name,afterMimeType:row.after.mimeType,reason:row.reason,actualKind:row.actualKind,md5Checksum:row.identity.md5Checksum,headRevisionId:row.identity.headRevisionId,size:row.identity.size,oldHeadRevisionId:row.identity.old.headRevisionId,oldModifiedTime:row.identity.old.modifiedTime,freshHeadRevisionId:row.identity.fresh.headRevisionId,freshModifiedTime:row.identity.fresh.modifiedTime,canRename:row.capabilities.canRename,canEdit:row.capabilities.canEdit};return columns.map(key=>tsvCell(values[key])).join('\t');})].join('\n')+'\n';
 await fs.writeFile(path.join(directory,'repair-plan-private.json'),JSON.stringify(plan,null,2)+'\n');
 await fs.writeFile(path.join(directory,'repair-plan-private.tsv'),tsv);
 return {planVersion:plan.planVersion,counts:plan.counts,warnings:plan.warnings};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await writeRepairPlan(process.argv[2]?path.resolve(process.argv[2]):baseDirectory,process.argv[3]?path.resolve(process.argv[3]):undefined);console.log(JSON.stringify(result));}
 catch(error){console.error(error?.code==='ENOENT'?'REPAIR_PLAN_INPUT_MISSING':/^REPAIR_PLAN_[A-Z_]+$/.test(error?.message)?error.message:'REPAIR_PLAN_FAILED');process.exitCode=1;}
}
