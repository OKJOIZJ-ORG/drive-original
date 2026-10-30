// Read-only, finite-prefix survey reporting. Never fetches media or changes Drive.
// Usage: node qa/media-format-report.mjs [ignored-survey-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMpegTsPsiState,feedMpegTsPsi,isMpegTsPsiSetComplete} from './v2-07a-container-probe/mpeg-ts-probe.mjs';

const baseDirectory=path.join(path.dirname(fileURLToPath(import.meta.url)),'buffering-20261030');
const count=(map,key)=>{map[key]=(map[key]??0)+1;};
const extension=name=>String(name??'').split(/[\\/]/).at(-1).match(/\.([^.]+)$/)?.[1].toLowerCase()??'';
// ISO alone may be audio-only (M4A); its signature cannot establish video.
const actualFamily=kind=>['ts','ts188','ts192','ts204','m2ts','quicktime','webm','matroska','avi'].includes(kind)?'video'
 :['jpeg','png','gif','webp','bmp','avif','heic','heif'].includes(kind)?'image':null;
const compatibleExtensions={ts:['ts','mts','m2ts','m2t'],ts188:['ts','mts','m2ts','m2t'],ts192:['ts','mts','m2ts','m2t'],ts204:['ts','mts','m2ts','m2t'],
 iso:['mp4','mov','m4v','m4a','m4b','m4p','3gp','3g2','qt'],quicktime:['mp4','mov','m4v','m4a','m4b','m4p','3gp','3g2','qt'],webm:['webm'],matroska:['mkv','mka'],avi:['avi'],
 jpeg:['jpg','jpeg','jpe','jfif'],png:['png'],gif:['gif'],webp:['webp'],bmp:['bmp'],avif:['avif'],heic:['heic','heif']};
compatibleExtensions.heif=compatibleExtensions.heic;
compatibleExtensions.m2ts=compatibleExtensions.ts;
compatibleExtensions['iso-no-ftyp']=compatibleExtensions.iso;

const QUICKTIME_BRAND='qt  ';
const MP4_BRANDS=new Set(['mp41','mp42']);
const QUICKTIME_EXTENSIONS=new Set(['mov','qt']);
const MP4_EXTENSIONS=new Set(['mp4','m4v','m4a','m4b','m4p','3gp','3g2']);

// The survey stores only a short signature prefix. Use brands only when the
// complete, aligned ftyp box (including every compatible brand) is present.
export function inspectFtypBrands(signature){
 if(typeof signature!=='string'||signature.length<32||signature.length>64||signature.length%2||!/^[0-9a-f]+$/i.test(signature))return null;
 const bytes=Buffer.from(signature.slice(0,60),'hex');
 if(bytes.length<16||bytes.toString('ascii',4,8)!=='ftyp')return null;
 const size=bytes.readUInt32BE(0);
 if(size<16||size%4!==0||size>bytes.length)return null;
 const majorBrand=bytes.toString('ascii',8,12),compatibleBrands=[];
 for(let offset=16;offset<size;offset+=4)compatibleBrands.push(bytes.toString('ascii',offset,offset+4));
 const brands=new Set([majorBrand,...compatibleBrands]);
 return {size,majorBrand,compatibleBrands,hasQuickTime:compatibleBrands.includes(QUICKTIME_BRAND),hasMp4: [...MP4_BRANDS].some(brand=>brands.has(brand))};
}

export function mismatchReasons(file,result){
 const kind=String(result?.kind??'unknown').toLowerCase(),ext=extension(file.name),family=actualFamily(kind);
 // Unknown/error signatures and text sidecars never establish a mismatch.
 const ftypBrands=inspectFtypBrands(result?.signature);
 const extensionAliasMismatch=Boolean(compatibleExtensions[kind]&&!compatibleExtensions[kind].includes(ext));
 const quicktimeBrandMismatch=Boolean(ftypBrands?.hasQuickTime&&!ftypBrands.hasMp4&&MP4_EXTENSIONS.has(ext));
 const mp4BrandMismatch=Boolean(ftypBrands?.hasMp4&&!ftypBrands.hasQuickTime&&QUICKTIME_EXTENSIONS.has(ext));
 const extensionMismatch=extensionAliasMismatch||quicktimeBrandMismatch||mp4BrandMismatch;
 const declaredFamily=/^(video|image)\//i.exec(file.mimeType??'')?.[1].toLowerCase()??null;
 const familyMismatch=Boolean(family&&declaredFamily&&family!==declaredFamily);
 return {ext,actualFamily:family,extensionMismatch,declaredFamilyMismatch:familyMismatch,
  ftypBrands,
  reasons:[...(extensionAliasMismatch?[`extension-${ext||'none'}-versus-${kind}`]:[]),
   ...(quicktimeBrandMismatch?[`extension-${ext}-versus-quicktime-branded`]:[]),
   ...(mp4BrandMismatch?[`extension-${ext}-versus-mp4-branded`]:[]),
   ...(familyMismatch?[`declared-${declaredFamily}-versus-${family}`]:[])]};
}

export function inspectTsPrefix(base64){
 if(typeof base64!=='string'||base64.length>1368||!base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))return {status:'header-unavailable'};
 const bytes=Buffer.from(base64,'base64');if(bytes.length>1024)return {status:'header-invalid'};
 const layout=[{stride:188,offset:0},{stride:192,offset:4},{stride:204,offset:0}].find(({stride,offset})=>
  bytes.length>=offset+stride*2+188&&[0,1,2].every(i=>bytes[offset+i*stride]===0x47));
 if(!layout)return {status:'sync-incomplete-or-unrecognized',bytes:bytes.length};
 const limits={maxSectionBytes:1024,maxSections:16,maxPrograms:16,maxStreamsPerProgram:64,maxTotalStreams:128};
 const state=createMpegTsPsiState(limits),issues=[];
 const add=(severity,code)=>{if(issues.length<32)issues.push({severity,code});};
 let packets=0;
 for(let p=layout.offset;p+188<=bytes.length;p+=layout.stride){
  const packet=bytes.subarray(p,p+188);packets++;
  if(packet[0]!==0x47||(packet[1]&128)||(packet[3]&192)){add('malformed','TS_HEADER_INVALID');continue;}
  const pid=((packet[1]&31)<<8)|packet[2],control=(packet[3]>>4)&3;
  if(pid!==0&&!state.pmtPids.has(pid))continue;
  if(!control){add('malformed','TS_ADAPTATION_INVALID');continue;}
  let offset=4,discontinuity=false;
  if(control&2){const length=packet[4];if(length>183||4+1+length>188){add('malformed','TS_ADAPTATION_INVALID');continue;}discontinuity=length>0&&Boolean(packet[5]&128);offset+=1+length;}
  if(!(control&1))continue;
  if(offset>=188){add('malformed','TS_PAYLOAD_INVALID');continue;}
  feedMpegTsPsi(pid,packet.subarray(offset),Boolean(packet[1]&64),packet[3]&15,discontinuity,state,add,packets-1);
 }
 const patComplete=Boolean(state.patSet&&isMpegTsPsiSetComplete(state.patSet));
 const programs=[...state.programs.values()].map(p=>({programNumber:p.programNumber,pmtPid:p.pmtPid,
  pmtComplete:Boolean(p.pmtSet&&isMpegTsPsiSetComplete(p.pmtSet)),
  streams:(p.pmt?.streams??[]).map(s=>({pid:s.elementaryPid,streamType:s.streamType,kind:s.kind,codec:s.codec}))}));
 const complete=patComplete&&programs.length>0&&programs.every(p=>p.pmtComplete);
 const invalid=state.limitHit||issues.some(i=>['malformed','limit'].includes(i.severity));
 const streams=programs[0]?.streams??[];
 const compatible=programs.length===1&&state.networkPids.size===0&&streams.length===2
  &&streams.some(s=>s.streamType===27)&&streams.some(s=>s.streamType===15);
 return {status:invalid?'prefix-invalid':!complete?'psi-incomplete':compatible?'strict-topology-compatible':'strict-topology-unsupported',
  bytes:bytes.length,packets,stride:layout.stride,patComplete,programs,issues,
  crcValidatedSections:state.sectionsValid,
  limit:'PAT/PMT prefix topology only; no elementary codec configuration, timestamps, seeks, frames or full-file playback proof'};
}

export function buildReport(inventory,survey){
 if(!Array.isArray(inventory.files)||!Array.isArray(survey.results))throw Error('FORMAT_REPORT_INPUT_SCHEMA');
 const files=new Map(inventory.files.map(f=>[f.id,f])),results=new Map(survey.results.map(r=>[r.id,r]));
 const folderPaths=new Map((inventory.folders??[]).map(f=>[f.id,f.path]));
 const summary={schema:1,generatedAt:new Date().toISOString(),surveyPhase:survey.phase??'unknown',
  inventoryFiles:files.size,inventoryFolders:inventory.folders?.length??0,surveyTotal:survey.total??null,
  rawResultRecords:survey.results.length,inspectedFiles:0,uninspectedFiles:0,orphanResults:0,
  declaredMimes:{},extensions:{},actualKinds:{},extensionActualPairs:{},extensionMismatches:0,declaredFamilyMismatches:0,
  unknownSignatures:0,sidecarCandidates:0,tsMetadata:{},mismatchReasons:{},
  limits:['Finite prefix signature evidence only; container signatures do not prove codecs or all frames playable.',
   'TS headers are limited to 1024 bytes; missing/incomplete PSI is unknown, not unsupported.',
   'Strict topology compatibility is not strict player qualification; elementary data, clocks, seek and EOF remain unchecked.',
   'Unknown/error signatures and incomplete or unrecognized ftyp brand prefixes are not counted as mismatches. Generic ISO stays ambiguous; complete QuickTime-only and explicit MP41/MP42 brands can distinguish extension mismatches.',
   'Counts describe this snapshot and do not claim the unfinished survey covers the whole folder.']};
 const rows=[],witnesses=[];
 for(const file of files.values()){
  const result=results.get(file.id),ext=extension(file.name),mime=file.mimeType??'';
  count(summary.declaredMimes,mime);count(summary.extensions,ext||'(none)');
  if(ext==='srt'&&mime==='application/octet-stream')summary.sidecarCandidates++;
  if(!result){summary.uninspectedFiles++;rows.push({id:file.id,name:file.name,folder:folderPaths.get(file.folder)??file.folder??'',declaredMime:mime,extension:ext,
   actualKind:'uninspected',extensionMismatch:'',declaredFamilyMismatch:'',mismatchReasons:'',tsMetadataStatus:'',tsStreams:''});continue;}summary.inspectedFiles++;
  const kind=String(result.kind??'unknown').toLowerCase(),mismatch=mismatchReasons(file,result);
  count(summary.actualKinds,kind);count(summary.extensionActualPairs,`${ext||'(none)'} → ${kind}`);
  if(!compatibleExtensions[kind])summary.unknownSignatures++;
  if(mismatch.extensionMismatch)summary.extensionMismatches++;
  if(mismatch.declaredFamilyMismatch)summary.declaredFamilyMismatches++;
  for(const reason of mismatch.reasons)count(summary.mismatchReasons,reason);
  const ts=(kind.startsWith('ts')||kind==='m2ts')?inspectTsPrefix(result.transportHeader):null;
  if(ts)count(summary.tsMetadata,ts.status);
  const row={id:file.id,name:file.name,folder:folderPaths.get(file.folder)??file.folder??'',declaredMime:mime,extension:ext,
   actualKind:kind,extensionMismatch:mismatch.extensionMismatch,declaredFamilyMismatch:mismatch.declaredFamilyMismatch,
   ftypBrands:mismatch.ftypBrands?JSON.stringify(mismatch.ftypBrands):'',mismatchReasons:mismatch.reasons.join(';'),tsMetadataStatus:ts?.status??'',tsStreams:ts?JSON.stringify(ts.programs??[]):''};
  rows.push(row);
  if(mismatch.reasons.length||ts?.status==='strict-topology-unsupported'||ts?.status==='prefix-invalid')witnesses.push({...row,ts});
 }
 summary.orphanResults=[...results.keys()].filter(id=>!files.has(id)).length;
 const mismatchRows=rows.filter(row=>row.extensionMismatch===true||row.declaredFamilyMismatch===true);
 return {summary,rows,witnesses,mismatchRows};
}

const tsvCell=value=>{const s=String(value??'').replace(/[\t\r\n]/g,' ');return /^[=+@-]/.test(s)?`'${s}`:s;};
export async function writeReport(directory=baseDirectory){
 const [inventory,survey]=await Promise.all(['format-inventory-private.json','format-results-private.json'].map(async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'))));
 const {summary,rows,witnesses,mismatchRows}=buildReport(inventory,survey);
 const columns=['id','name','folder','declaredMime','extension','actualKind','extensionMismatch','declaredFamilyMismatch','ftypBrands','mismatchReasons','tsMetadataStatus','tsStreams'];
 await fs.writeFile(path.join(directory,'format-details-private.tsv'),'\ufeff'+[columns.join('\t'),...rows.map(r=>columns.map(k=>tsvCell(r[k])).join('\t'))].join('\n')+'\n');
 const mismatchColumns=['id','name','folder','declaredMime','extension','actualKind','ftypBrands','mismatchReasons'];
 await fs.writeFile(path.join(directory,'format-mismatches-private.tsv'),'\ufeff'+[mismatchColumns.join('\t'),...mismatchRows.map(r=>mismatchColumns.map(k=>tsvCell(r[k])).join('\t'))].join('\n')+'\n');
 await fs.writeFile(path.join(directory,'format-witnesses-private.json'),JSON.stringify({limits:summary.limits,witnesses},null,2)+'\n');
 await fs.writeFile(path.join(directory,'format-summary-redacted.json'),JSON.stringify(summary,null,2)+'\n');
 const sections=[['Actual prefix kinds',summary.actualKinds],['Extension / actual kind',summary.extensionActualPairs],['TS prefix metadata',summary.tsMetadata],['Mismatch reasons',summary.mismatchReasons]];
 const report=`# Media format prefix survey\n\nSnapshot: ${summary.surveyPhase}; inspected ${summary.inspectedFiles}/${summary.inventoryFiles}, uninspected ${summary.uninspectedFiles}.\n\nExtension mismatches: ${summary.extensionMismatches}; declared image/video family mismatches: ${summary.declaredFamilyMismatches}; unknown signatures: ${summary.unknownSignatures}.\n\n`
  +sections.map(([title,map])=>`## ${title}\n\n| Category | Count |\n|---|---:|\n`+Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k.replaceAll('|','/')} | ${v} |`).join('\n')).join('\n\n')
  +'\n\n## Evidence limits\n\n'+summary.limits.map(s=>`- ${s}`).join('\n')+'\n';
 await fs.writeFile(path.join(directory,'format-summary-redacted.md'),report);
 return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const summary=await writeReport(process.argv[2]?path.resolve(process.argv[2]):baseDirectory);console.log(JSON.stringify(summary,null,2));}
 catch(error){console.error(['SyntaxError'].includes(error?.name)?'FORMAT_REPORT_INPUT_JSON':/^FORMAT_REPORT_[A-Z_]+$/.test(error?.message)?error.message:'FORMAT_REPORT_FAILED');process.exitCode=1;}
}
