import {scanIsoBmffTopLevel} from '../v2-07a-isobmff-index/isobmff-index.mjs';
import {parseMoov} from '../v2-07a-iso-tracks-rc11/parser.mjs';
import {readSparseMoov} from '../rc21-corpus-night/sparse-moov.mjs';
import {readEbmlTracks} from '../rc16-corpus-tracks/ebml-tracks.mjs';
import {createMoovWindowCache} from '../rc31-deeper-coalesced-probe/moov-window-cache.mjs';
import {probeMpegTs} from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const n=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?x:null;
const tags=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4v','mp4a','ac-3','ec-3','Opus','fLaC','lpcm','raw ','twos','sowt']);
// Same bounded ISO projection as rc32-format-acceptance; no private byte/string export.
export function safeIso(value){return {status:value?.status==='parsed'?'parsed':'incomplete',fragmented:value?.fragmented===true,tracks:(value?.tracks??[]).slice(0,32).map(t=>({type:['vide','soun','subt','text'].includes(t.type)?t.type:'other',width:n(t.width),height:n(t.height),identityMatrix:t.identityMatrix===true,descriptions:(t.descriptions??[]).slice(0,16).map(d=>({codec:tags.has(d.codec)?d.codec:'unknown',width:n(d.width),height:n(d.height),channels:n(d.channels),sampleRate:n(d.sampleRate),sampleSize:n(d.sampleSize),encrypted:d.encrypted===true,avcProfile:n(d.config?.avcC?.profile),avcLevel:n(d.config?.avcC?.level),hevcProfile:n(d.config?.hvcC?.profileIdc),hevcLevel:n(d.config?.hvcC?.levelIdc),bitDepthLuma:n(d.config?.hvcC?.bitDepthLuma),bitDepthChroma:n(d.config?.hvcC?.bitDepthChroma),aacObjectType:n(d.config?.esds?.audioSpecificConfig?.objectType),aacFrequencyIndex:n(d.config?.esds?.audioSpecificConfig?.freqIndex),aacChannelConfig:n(d.config?.esds?.audioSpecificConfig?.channelConfig),colorMetadataPresent:d.config?.colr?.present===true,sampleAspectRatioPresent:d.config?.pasp?.present===true,configPresent:Boolean(d.config&&Object.keys(d.config).length)}))}))};}
const text=(b,a,z)=>String.fromCharCode(...b.subarray(a,z));
const dim=(width,height,extra={})=>width>0&&height>0&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)?{status:'parsed',width,height,...extra}:{status:'incomplete'};
export function imageHeader(kind,b){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),u24=p=>b[p]+b[p+1]*256+b[p+2]*65536;
 if(kind==='png'&&b.length>=33&&text(b,12,16)==='IHDR'&&v.getUint32(8)===13)return dim(v.getUint32(16),v.getUint32(20),{bitDepth:b[24],colorType:b[25],animationKnown:false,rotationKnown:false});
 if(kind==='gif'&&b.length>=13&&['GIF87a','GIF89a'].includes(text(b,0,6)))return dim(v.getUint16(6,true),v.getUint16(8,true),{animationKnown:false,rotationKnown:false});
 if(kind==='bmp'&&b.length>=30){const dib=v.getUint32(14,true);if(dib===12)return dim(v.getUint16(18,true),v.getUint16(20,true),{bitDepth:v.getUint16(24,true),animationKnown:true,animated:false,rotationKnown:false});if(dib>=40&&b.length>=54)return dim(Math.abs(v.getInt32(18,true)),Math.abs(v.getInt32(22,true)),{bitDepth:v.getUint16(28,true),animationKnown:true,animated:false,rotationKnown:false});}
 if(kind==='webp'&&b.length>=30&&text(b,0,4)==='RIFF'&&text(b,8,12)==='WEBP'){const tag=text(b,12,16);if(tag==='VP8X'&&v.getUint32(16,true)===10)return dim(1+u24(24),1+u24(27),{animationKnown:true,animated:Boolean(b[20]&2),alpha:Boolean(b[20]&16),rotationKnown:false});if(tag==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return dim(v.getUint16(26,true)&0x3fff,v.getUint16(28,true)&0x3fff,{animationKnown:false,rotationKnown:false});if(tag==='VP8L'&&b[20]===0x2f&&b.length>=25){const bits=v.getUint32(21,true);return dim(1+(bits&0x3fff),1+((bits>>>14)&0x3fff),{alpha:Boolean(bits&(1<<28)),animationKnown:false,rotationKnown:false});}}
 if(kind==='jpeg'){let p=2,segments=0;while(p+3<b.length&&++segments<=256){if(b[p++]!==255)return {status:'incomplete'};while(b[p]===255)p++;const marker=b[p++];if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;if(p+2>b.length)break;const length=v.getUint16(p);if(length<2||p+length>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return dim(v.getUint16(p+5),v.getUint16(p+3),{bitDepth:b[p+2],components:b[p+7],progressive:marker===0xc2,animationKnown:true,animated:false,rotationKnown:false});p+=length;}}
 return {status:'incomplete'};
}
export function safeTs(value){return {status:value?.status==='complete'?'parsed':'incomplete',topologyComplete:value?.status==='complete',sampleScope:'bounded-head-only',codecConfigOutsideSample:'unknown',tracks:(value?.programs??[]).slice(0,16).flatMap(p=>(p.streams??[]).slice(0,16).map(t=>{const d=t.codecDetails??{};return {type:['video','audio'].includes(t.kind)?t.kind:'other',codec:['h264','aac','hevc','mpeg-1-video','mpeg-2-video','mpeg-1-audio','mpeg-2-audio','mpeg-4-part-2','aac-latm','mpeg-h-part-2'].includes(t.codec)?t.codec:'unknown',streamType:n(t.streamType),configStatus:d.status==='parsed'?'parsed':'incomplete',profileIdc:n(d.profileIdc),constraintFlags:n(d.constraintFlags),levelIdc:n(d.levelIdc),width:n(d.width),height:n(d.height),chromaFormatIdc:n(d.chromaFormatIdc),bitDepthLuma:n(d.bitDepthLuma),bitDepthChroma:n(d.bitDepthChroma),aacObjectType:n(d.objectType),sampleRate:n(d.sampleRate),channelConfiguration:n(d.channelConfiguration),channels:n(d.channels),vuiPresent:d.status==='parsed'?d.vuiPresent===true:null,color:d.color?{fullRange:typeof d.color.fullRange==='boolean'?d.color.fullRange:null,primariesCode:n(d.color.primariesCode),transferCode:n(d.color.transferCode),matrixCode:n(d.color.matrixCode)}:null,aspectRatio:d.aspectRatio?{present:d.aspectRatio.present===true,idc:n(d.aspectRatio.idc),width:n(d.aspectRatio.width),height:n(d.aspectRatio.height)}:null};}))};}
export async function classifyBounded({read,sniffMagic,size,signal,current=()=>{}}){
 const prefix=await read({start:0,end:Math.min(939,size-2)});let sparse=null,windows=null;
 try{current();const kind=sniffMagic(prefix).kind;
  const out={kind,classification:'unknown',reason:'UNKNOWN_SIGNATURE',tracks:null,image:null,metadataWindows:null};
  const part=async({start,end})=>{const a=Number(start),b=Number(end);if(b<prefix.length)return prefix.slice(a,b+1);if(a<prefix.length){const tail=await read({start:prefix.length,end:b}),x=new Uint8Array(b-a+1);x.set(prefix.subarray(a));x.set(tail,prefix.length-a);return x;}return read({start:a,end:b});};
  if(kind==='iso-bmff'){
   const scan=await scanIsoBmffTopLevel({size:String(size),signal,read:part,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();out.reason='ISO_HEADER_INCOMPLETE';
   if(scan.status==='complete'&&scan.observations.moov.length===1){windows=createMoovWindowCache({box:scan.observations.moov[0],fileSize:String(size),read:part,signal,checkCurrent:current});sparse=await readSparseMoov({box:scan.observations.moov[0],fileSize:String(size),read:windows.read,signal,checkCurrent:current});current();out.reason='ISO_SPARSE_INCOMPLETE';
    if(sparse.status==='complete'){out.tracks=safeIso(parseMoov(sparse.bytes));out.reason='ISO_PARSER_INCOMPLETE';if(out.tracks.status==='parsed'){out.reason='CODEC_METADATA_UNQUALIFIED';const descriptions=out.tracks.tracks.flatMap(t=>t.descriptions);if(descriptions.length&&descriptions.every(d=>d.codec!=='unknown'&&!d.encrypted)){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}}}
  }else if(['webm','matroska','ebml'].includes(kind)){out.tracks=await readEbmlTracks({read:part,size,prefix,signal});current();out.reason='EBML_TRACKS_INCOMPLETE';if(out.tracks.status==='parsed'){out.reason='CODEC_METADATA_UNQUALIFIED';if(out.tracks.tracks.every(t=>t.codec!=='unknown')){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}}
  else if(['png','jpeg','gif','webp','bmp'].includes(kind)){out.image=imageHeader(kind,prefix);if(kind==='jpeg'&&out.image.status!=='parsed'&&size>prefix.length+1){const bytes=await part({start:0,end:Math.min(size-2,65535)});try{out.image=imageHeader(kind,bytes);}finally{bytes.fill(0);}}out.reason='IMAGE_HEADER_INCOMPLETE';if(out.image.status==='parsed'){out.classification='image-header';out.reason='IMAGE_HEADER_METADATA';}}
  else if(kind==='mpeg-ts'){
   const width=Math.floor(Math.min(1024*1024,size-1)/188)*188;out.reason='TS_TRACK_CONFIG_UNQUALIFIED';
   if(width>=564){const bytes=await part({start:0,end:width-1});try{const parsed=probeMpegTs(bytes,{maxBytes:1024*1024,maxPackets:5577,maxResyncBytes:6016,maxSectionBytes:1024,maxSections:128,maxPrograms:16,maxStreamsPerProgram:16,maxTotalStreams:64,maxElementaryBytesPerStream:65536,maxIssues:64});current();out.tracks=safeTs(parsed);if(out.tracks.status==='parsed'&&out.tracks.tracks.length&&out.tracks.tracks.every(t=>t.configStatus==='parsed'&&t.codec!=='unknown')){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}finally{bytes.fill(0);}}
  }
  else if(kind==='avi')out.reason='UNSUPPORTED_STRUCTURAL_PARSER';
  else if(kind==='error-payload')out.reason='ERROR_PAYLOAD';
  return out;
 }finally{sparse?.bytes?.fill(0);if(windows)windows.release();prefix.fill(0);}
}
export function configurationKey(record){
 if(record.classification==='image-header')return JSON.stringify([record.kind,record.image]);
 if(record.classification!=='video-structural')return null;
 // Canonical observable config only. Codec-private bytes, HDR, VFR, decoder support remain unknown.
 return JSON.stringify([record.kind,record.tracks?.tracks,record.tracks?.fragmented??null,record.tracks?.docType??null]);
}
