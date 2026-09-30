// Structural metadata only; RFC8794 VINTs and Matroska element schema.
// No packet, codec-private, attachment, string-name or media payload export.
const fail=code=>Object.assign(new Error(code),{code});
const safe=()=>({status:'incomplete',code:'EBML_TRACKS_INCOMPLETE',tracks:[],limitations:['structural-metadata-only','codec-private-unparsed','packets-cues-timing-unread','hdr-vfr-decoder-capability-unqualified']});
const codecs=new Map([['V_VP8','vp8'],['V_VP9','vp9'],['V_AV1','av1'],['V_MPEG4/ISO/AVC','avc'],['V_MPEGH/ISO/HEVC','hevc'],['V_MPEG4/ISO/SP','mpeg4-part2'],['V_MPEG4/ISO/ASP','mpeg4-part2'],['V_MPEG2','mpeg2'],['A_OPUS','opus'],['A_VORBIS','vorbis'],['A_AAC','aac'],['A_AC3','ac3'],['A_EAC3','eac3'],['A_FLAC','flac'],['A_PCM/INT/LIT','pcm'],['A_PCM/INT/BIG','pcm']]);
function vint(bytes,pos,isId){
  const first=bytes[pos];if(!first)throw fail('EBML_MALFORMED');let length=1,mask=128;while(!(first&mask)){length++;mask>>=1;}
  if(length>(isId?4:8)||pos+length>bytes.length)throw fail('EBML_MALFORMED');
  let value=BigInt(isId?first:first&(mask-1));for(let i=1;i<length;i++)value=value*256n+BigInt(bytes[pos+i]);
  if(isId){const data=value&((1n<<BigInt(7*length))-1n);if(data===0n||data===(1n<<BigInt(7*length))-1n)throw fail('EBML_MALFORMED');}
  return {length,value,unknown:!isId&&value===(1n<<BigInt(7*length))-1n};
}
function element(bytes,pos,end){const id=vint(bytes,pos,true),size=vint(bytes,pos+id.length,false),start=pos+id.length+size.length;
  if(size.unknown||size.value>BigInt(Number.MAX_SAFE_INTEGER))throw fail('EBML_UNKNOWN_NESTED_SIZE');const stop=start+Number(size.value);if(stop>end)throw fail('EBML_MALFORMED');return {id:Number(id.value),start,end:stop};}
function uint(bytes,a,b){if(b<=a||b-a>8)throw fail('EBML_MALFORMED');let n=0n;for(let i=a;i<b;i++)n=n*256n+BigInt(bytes[i]);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw fail('EBML_NUMBER_LIMIT');return Number(n);}
function float(bytes,a,b){if(b-a!==4&&b-a!==8)throw fail('EBML_MALFORMED');const v=new DataView(bytes.buffer,bytes.byteOffset+a,b-a),n=b-a===4?v.getFloat32(0):v.getFloat64(0);if(!Number.isFinite(n)||n<=0)throw fail('EBML_MALFORMED');return n;}
export function parseEbmlTracks(bytes){
  const result=safe();try{
    if(!(bytes instanceof Uint8Array)||bytes.length>262144)throw fail('EBML_TRACKS_SIZE_LIMIT');let boxes=0;
    const walk=(a,b,visit)=>{for(let p=a;p<b;){if(++boxes>512)throw fail('EBML_ELEMENT_LIMIT');const e=element(bytes,p,b);visit(e);p=e.end;}};
    walk(0,bytes.length,e=>{if(e.id!==0xae)return;if(result.tracks.length>=32)throw fail('EBML_TRACK_LIMIT');
      const track={type:'other',codec:'unknown',width:null,height:null,displayWidth:null,displayHeight:null,sampleRate:null,channels:null,bitDepth:null,colorMetadataPresent:false,codecPrivatePresent:false,defaultDurationPresent:false};
      const seen=new Set();
      const scalar=(e,field,read=uint)=>{if(seen.has(field))throw fail('EBML_DUPLICATE_FIELD');seen.add(field);track[field]=read(bytes,e.start,e.end);};
      walk(e.start,e.end,x=>{
        if(x.id===0x83){if(seen.has('type'))throw fail('EBML_DUPLICATE_FIELD');seen.add('type');const n=uint(bytes,x.start,x.end);track.type=n===1?'video':n===2?'audio':n===17?'subtitle':'other';}
        else if(x.id===0x86){if(seen.has('codec'))throw fail('EBML_DUPLICATE_FIELD');seen.add('codec');if(x.end-x.start>64)throw fail('EBML_CODEC_SIZE_LIMIT');let text='';for(let i=x.start;i<x.end;i++){if(bytes[i]<32||bytes[i]>126)throw fail('EBML_MALFORMED');text+=String.fromCharCode(bytes[i]);}track.codec=codecs.get(text)??'unknown';}
        else if(x.id===0x63a2)track.codecPrivatePresent=true;
        else if(x.id===0x23e383)track.defaultDurationPresent=true;
        else if(x.id===0xe0)walk(x.start,x.end,v=>{if(v.id===0xb0)scalar(v,'width');else if(v.id===0xba)scalar(v,'height');else if(v.id===0x54b0)scalar(v,'displayWidth');else if(v.id===0x54ba)scalar(v,'displayHeight');else if(v.id===0x55b0)track.colorMetadataPresent=true;});
        else if(x.id===0xe1)walk(x.start,x.end,v=>{if(v.id===0xb5)scalar(v,'sampleRate',float);else if(v.id===0x9f)scalar(v,'channels');else if(v.id===0x6264)scalar(v,'bitDepth');});
      });
      if(!seen.has('type')||!seen.has('codec'))throw fail('EBML_TRACKS_INCOMPLETE');result.tracks.push(track);
    });
    if(!result.tracks.length)throw fail('EBML_TRACKS_INCOMPLETE');result.status='parsed';result.code='EBML_STRUCTURAL_METADATA';return result;
  }catch(e){result.tracks=[];result.code=/^EBML_[A-Z_]+$/.test(e?.code??'')?e.code:'EBML_MALFORMED';return result;}
}

export async function readEbmlTracks({read,size,prefix,signal}){
  const result=safe();let headers=0,docType=null;
  const check=()=>{if(signal?.aborted)throw fail('EBML_ABORTED');};
  const bytes=async(a,b)=>{check();if(a<0||b<a||b>=size)throw fail('EBML_BOUNDS');if(b<prefix.length)return prefix.slice(a,b+1);
    if(a<prefix.length){const tail=await read({start:prefix.length,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(tail,prefix.length-a);check();return out;}const out=await read({start:a,end:b});check();return out;};
  const header=async(pos,end)=>{if(++headers>56)throw fail('EBML_HEADER_LIMIT');const data=await bytes(pos,Math.min(end-1,pos+11)),id=vint(data,0,true),n=vint(data,id.length,false),start=pos+id.length+n.length;
    if(n.value>BigInt(Number.MAX_SAFE_INTEGER)&&!n.unknown)throw fail('EBML_BOUNDS');const stop=n.unknown?end:start+Number(n.value);if(stop>end||stop<start)throw fail('EBML_BOUNDS');return {id:Number(id.value),start,end:stop,unknown:n.unknown};};
  try{
    const head=await header(0,size);if(head.id!==0x1a45dfa3||head.unknown||head.end-head.start>4096)throw fail('EBML_HEADER_INVALID');
    const hb=await bytes(head.start,head.end-1);let count=0;for(let p=0;p<hb.length;){if(++count>32)throw fail('EBML_HEADER_LIMIT');const e=element(hb,p,hb.length);if(e.id===0x4282){let text='';if(e.end-e.start>16)throw fail('EBML_HEADER_INVALID');for(let i=e.start;i<e.end;i++)text+=String.fromCharCode(hb[i]);if(docType!==null)throw fail('EBML_HEADER_INVALID');docType=text==='webm'?'webm':text==='matroska'?'matroska':'unknown';}p=e.end;}
    if(!['webm','matroska'].includes(docType))throw fail('EBML_DOCTYPE_UNSUPPORTED');
    let p=head.end,segment=null;while(p<size){const e=await header(p,size);if(e.id===0x18538067){segment=e;break;}if(e.unknown)throw fail('EBML_UNKNOWN_TOP_SIZE');p=e.end;}
    if(!segment)throw fail('EBML_SEGMENT_MISSING');
    p=segment.start;while(p<segment.end){const e=await header(p,segment.end);if(e.id===0x1654ae6b){if(e.unknown||e.end-e.start>262144)throw fail('EBML_TRACKS_SIZE_LIMIT');if(e.end===e.start)throw fail('EBML_TRACKS_INCOMPLETE');const payload=new Uint8Array(await bytes(e.start,e.end-1));const parsed=parseEbmlTracks(payload);payload.fill(0);return {...parsed,docType,headers};}
      if(e.unknown)throw fail('EBML_UNKNOWN_CHILD_SIZE');p=e.end;}
    throw fail('EBML_TRACKS_INCOMPLETE');
  }catch(e){return {...result,code:/^EBML_[A-Z_]+$/.test(e?.code??'')?e.code:'EBML_MALFORMED',docType:['webm','matroska'].includes(docType)?docType:null,headers};}
}
