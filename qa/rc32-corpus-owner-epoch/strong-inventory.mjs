import {runAuthenticatedRootInventory} from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import {stableItemRow} from '../rc31-corpus-content-continuity/inventory-normalizers.mjs';

// Compose around the immutable collector. Every row route uses its full ITEM projection,
// including root GETs, then adds the three fields its comparator does not retain.
export const STRONG_FIELDS='id,name,mimeType,fileExtension,fullFileExtension,size,modifiedTime,version,parents,driveId,trashed,capabilities(canListChildren,canDownload,canReadRevisions,canCopy),videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation),shortcutDetails(targetId,targetMimeType,targetResourceKey),headRevisionId,sha256Checksum,resourceKey';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const strongTuple=row=>({headRevisionId:row?.headRevisionId??null,sha256Checksum:row?.sha256Checksum??null,resourceKey:row?.resourceKey??null});
export const hasStrong=tuple=>(validId(tuple?.headRevisionId)||/^[a-fA-F0-9]{64}$/.test(tuple?.sha256Checksum??''));
export const strongSame=(a,b)=>['headRevisionId','sha256Checksum','resourceKey'].every(k=>a?.[k]===b?.[k]);
export function strongRowSignature(row){
 if(!validId(row?.id))fail('STRONG_INVENTORY_CONFLICT');const t=strongTuple(row);
 if(t.headRevisionId!==null&&!validId(t.headRevisionId)||t.sha256Checksum!==null&&!/^[a-fA-F0-9]{64}$/.test(t.sha256Checksum)||t.resourceKey!==null&&!validId(t.resourceKey))fail('STRONG_INVENTORY_CONFLICT');
 return JSON.stringify([stableItemRow(row),t.headRevisionId,t.sha256Checksum,t.resourceKey]);
}
export async function runStrongInventory(options,{inventoryRunner=runAuthenticatedRootInventory}={}){
 const raw=new Map();let latched=null,rawRows=0;
 const capture=row=>{try{const signature=strongRowSignature(row),old=raw.get(row.id);if(old&&old.signature!==signature)fail('STRONG_INVENTORY_CONFLICT');raw.set(row.id,{signature,tuple:strongTuple(row)});rawRows++;}catch(e){latched='STRONG_INVENTORY_CONFLICT';throw e;}};
 const driveFetch=async(value,requestOptions)=>{
  const url=new URL(value),route=/^\/drive\/v3\/files(?:\/[A-Za-z0-9_-]+)?$/.test(url.pathname);
  if(route){if(url.pathname.endsWith('/files'))url.searchParams.set('fields',`nextPageToken,incompleteSearch,files(${STRONG_FIELDS})`);else url.searchParams.set('fields',STRONG_FIELDS);}
  const response=await options.driveFetch(url.href,requestOptions);
  if(!route)return response;
  return {ok:response.ok,status:response.status,json:async()=>{const body=await response.json();if(response.ok===true){if(url.pathname.endsWith('/files')){if(!Array.isArray(body?.files)){latched='STRONG_INVENTORY_CONFLICT';fail(latched);}body.files.forEach(capture);}else capture(body);}return body;}};
 };
 let result;
 try{result=await inventoryRunner({...options,driveFetch});}catch(e){if(latched)fail(latched);throw e;}
 if(latched)fail(latched);
 const passRows=pass=>{if(!Array.isArray(pass?.items)||!Array.isArray(pass?.shortcutTargets))fail('STRONG_INVENTORY_CONFLICT');return [pass.rootBefore,pass.rootAfter,...pass.items,...pass.shortcutTargets.map(x=>x[1])];};
 const first=passRows(result?.privatePasses?.firstPass),second=passRows(result?.privatePasses?.secondPass);
 for(const row of [...first,...second])if(raw.get(row.id)?.signature!==strongRowSignature(row))fail('STRONG_INVENTORY_CONFLICT');
 const sig=rows=>JSON.stringify(rows.map(strongRowSignature).sort());if(sig(first)!==sig(second))fail('STRONG_INVENTORY_CONFLICT');
 return {...result,strongInventory:{rows:raw,rawRows,uniqueRows:raw.size,complete:true}};
}
export function compareStrongInventories(first,last){
 const a=first?.strongInventory,b=last?.strongInventory;if(!a?.complete||!b?.complete||a.rows.size!==b.rows.size)fail('STRONG_CATALOG_DRIFT');
 for(const [id,row]of a.rows)if(b.rows.get(id)?.signature!==row.signature)fail('STRONG_CATALOG_DRIFT');return true;
}
