import {stableItemRow} from '../rc31-corpus-content-continuity/inventory-normalizers.mjs';
import {identitySame,RETRYABLE} from './continuity.mjs';
import {normalizeProbeIdentity} from '../v2-07a-bounded-probe/bounded-probe.mjs';
const FOLDER='application/vnd.google-apps.folder',SHORTCUT='application/vnd.google-apps.shortcut';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fail=()=>{throw Object.assign(new Error('SELECTION_FAILED'),{code:'SELECTION_FAILED'});};
const ext=row=>{const raw=String(row.fullFileExtension||row.fileExtension||'').trim().toLowerCase().replace(/^\./,'');const name=String(row.name??'');return raw||(name.lastIndexOf('.')>0?name.slice(name.lastIndexOf('.')+1).toLowerCase():'');};
const video=row=>String(row.mimeType??'').toLowerCase().startsWith('video/')||['mp4','mov','webm','mkv','avi','ts','mts','m2ts','m4v','mpg','mpeg','mpe','m2v','wmv','flv','f4v','3gp','3g2','ogv','vob','asf','mxf'].includes(ext(row));
const image=row=>String(row.mimeType??'').toLowerCase().startsWith('image/')||['jpg','jpeg','png','gif','webp','bmp','avif','heic','heif','tif','tiff','svg','ico','jxl'].includes(ext(row));
export function collectHeaderCandidates(pass,selection,accountKey){
  if(!Array.isArray(pass?.items)||!Array.isArray(pass.shortcutTargets)||!Array.isArray(selection?.privateManifest?.selected))fail();
  const targets=new Map(pass.shortcutTargets),objects=new Map();
  const add=(row,reference)=>{if(!validId(row?.id)||!validId(reference?.fileId)||(reference.resourceKey!==null&&!validId(reference.resourceKey)))fail();const prior=objects.get(row.id);if(prior&&stableItemRow(prior.row)!==stableItemRow(row))fail();const value=prior??{row,references:[]};value.references.push(reference);objects.set(row.id,value);};
  for(const row of pass.items){if(row.mimeType===FOLDER)continue;if(row.mimeType===SHORTCUT){const target=targets.get(row.shortcutDetails?.targetId);if(!target)fail();if(target.mimeType!==FOLDER&&target.mimeType!==SHORTCUT)add(target,{fileId:target.id,resourceKey:row.shortcutDetails?.targetResourceKey??null});}else add(row,{fileId:row.id,resourceKey:row.resourceKey??null});}
  const representatives=new Map(selection.privateManifest.selected.map(row=>[row.fileId,row]));const representativeIds=new Set(representatives.keys());if(representativeIds.size!==selection.privateManifest.selected.length||[...representativeIds].some(id=>!objects.has(id)))fail();
  return [...objects.values()].map(item=>{
    const keys=new Set(item.references.map(x=>x.resourceKey).filter(Boolean));if(keys.size>1)fail();const row=item.row;
    let expected=null,ineligible=null;
    if(row.capabilities?.canDownload!==true)ineligible=row.capabilities?.canDownload===false?'DOWNLOAD_BLOCKED':'DOWNLOAD_CAPABILITY_UNKNOWN';
    else try{expected=normalizeProbeIdentity({accountKey,fileId:row.id,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});}catch{ineligible='METADATA_IDENTITY_INCOMPLETE';}
    if(expected&&BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))ineligible='UNSAFE_FILE_SIZE';
    if(expected&&BigInt(expected.size)<=1n)ineligible='SMALL_FILE_WHOLE_READ_EXCLUDED';
    const reasons=representatives.get(row.id)?.mandatoryReasons??[],priorityRank=reasons.includes('priority')?3:reasons.some(x=>x.startsWith('largest:'))?2:reasons.some(x=>x.startsWith('rare:'))?1:0;
    return {id:row.id,expected,ineligible,resourceKey:[...keys][0]??null,representative:representativeIds.has(row.id),videoCandidate:video(row),imageCandidate:image(row),priorityRank};
  }).sort((a,b)=>b.priorityRank-a.priorityRank||a.id.localeCompare(b.id));
}
export function planHeaderCohort(candidates,{phase='representatives',maxFiles=8,covered=new Set(),attempts=new Map()}={}){
  if(!['representatives','videos','revalidate-representatives','revalidate-videos'].includes(phase)||!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>64||!(covered instanceof Set))fail();
  const pool=candidates.filter(x=>phase.endsWith('representatives')?x.representative:x.videoCandidate||x.imageCandidate),eligible=pool.filter(x=>!x.ineligible);
  const pending=eligible.filter(x=>!covered.has(x.id)&&!attempts.has(x.id));
  const exhausted=eligible.filter(x=>!covered.has(x.id)&&attempts.has(x.id));
  return {pool,plan:pending.slice(0,maxFiles),exhausted,summary:{phase,denominator:pool.length,eligible:eligible.length,ineligible:pool.length-eligible.length,previouslyValidated:eligible.filter(x=>covered.has(x.id)).length,planned:Math.min(maxFiles,pending.length),unplannedPending:Math.max(0,pending.length-maxFiles),maxFiles,batchFiles:8,batchesPlanned:Math.ceil(Math.min(maxFiles,pending.length)/8),exhausted:exhausted.length}};
}
