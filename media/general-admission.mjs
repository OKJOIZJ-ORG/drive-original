const fail=code=>{throw new Error(`GENERAL_${code}`);};
const demand=(x,c)=>{if(!x)fail(c);};
const type=(b,p)=>String.fromCharCode(...b.subarray(p+4,p+8));
const u32=(b,p)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p);
const integer64=(b,p)=>{const n=new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(p);demand(n<=BigInt(Number.MAX_SAFE_INTEGER),'BOX_INTEGER');return Number(n);};
export const GENERAL_LIMITS=Object.freeze({moovBytes:4*1024*1024,tableSamplesPerTrack:65536,tableEntries:65536,totalSamples:2*65536,totalEntriesPerTable:2*65536,tracks:8,boxes:4096,packetBytes:2*1024*1024,retainedMuxBytes:4*1024*1024,retainedMuxSamples:4096,appendChunkBytes:262144});
// Positive routing hint only: complete single-packet current PAT/PMT, both CRC
// verified, one program and exactly one AVC stream. Missing/partial/other input
// retains the established strict TS path; it never authorizes error fallback.
export function hasVideoOnlyTsTopology(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<940||bytes.length>1024)return false;
 const crc=section=>{let n=0xffffffff;for(const b of section){n^=b<<24;for(let i=0;i<8;i++)n=((n&0x80000000)?(n<<1)^0x04c11db7:n<<1)>>>0;}return n;};
 let pmtPid=null,videoPid=null,pat=null,pmt=null;
 for(let p=0;p+188<=bytes.length;p+=188){
  const packet=bytes.subarray(p,p+188);if(packet[0]!==0x47||(packet[1]&128)||(packet[3]&192))return false;
  const pid=((packet[1]&31)<<8)|packet[2];if(pid!==0&&pid!==pmtPid)continue;
  const control=(packet[3]>>4)&3;if(!(control&1)||!(packet[1]&64))return false;
  let offset=4;if(control&2){if(packet[4]>182||(packet[4]&&packet[5]&128))return false;offset+=1+packet[4];}
  if(offset>=188||packet[offset++]!==0||offset+8>188)return false;
  const length=3+(((packet[offset+1]&15)<<8)|packet[offset+2]);
  if(length<12||offset+length>188)return false;
  const s=packet.subarray(offset,offset+length);
  if((s[1]&0xf0)!==0xb0||(s[5]&0xc1)!==0xc1||s[6]!==0||s[7]!==0||crc(s)!==0)return false;
  if(pid===0){
   if(s[0]!==0||length!==16||s[8]===0&&s[9]===0||(s[10]&0xe0)!==0xe0)return false;
   const next=((s[10]&31)<<8)|s[11];if(next<16||next>=8191)return false;
   if(pat&&!pat.every((b,i)=>b===s[i]))return false;pat=s;pmtPid=next;
  }else{
   if(s[0]!==2||length<21||!pat||s[3]!==pat[8]||s[4]!==pat[9]||(s[8]&0xe0)!==0xe0||(s[10]&0xf0)!==0xf0)return false;
   const begin=12+(((s[10]&15)<<8)|s[11]),end=length-4;if(begin+5>end)return false;
   const tail=begin+5+(((s[begin+3]&15)<<8)|s[begin+4]);
   if(s[begin]!==27||(s[begin+1]&0xe0)!==0xe0||(s[begin+3]&0xf0)!==0xf0||tail!==end)return false;
   const next=((s[begin+1]&31)<<8)|s[begin+2],pcr=((s[8]&31)<<8)|s[9];
   if(next<16||next>=8191||next===pmtPid||pcr!==next)return false;
   if(pmt&&(pmt.length!==s.length||!pmt.every((b,i)=>b===s[i])))return false;pmt=s;videoPid=next;
  }
 }
 return Boolean(pat&&pmt&&videoPid!==null);
}
// Read every allocation-driving count before constructing the library Input.
// A small run-length table can otherwise expand to billions of objects.
export function inspectGeneralMoov(bytes,{audioCodecs=["mp4a"]}={}){demand(Array.isArray(audioCodecs)&&audioCodecs.length>0&&audioCodecs.every(c=>["mp4a","ac-3","ec-3"].includes(c)),"AUDIO_ADMISSION_OPTIONS");demand(bytes.length<=GENERAL_LIMITS.moovBytes,'MOOV_LIMIT');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),read32=p=>view.getUint32(p),read64=p=>{const n=view.getBigUint64(p);demand(n<=BigInt(Number.MAX_SAFE_INTEGER),'BOX_INTEGER');return Number(n);};let boxes=0,tracks=0;const samples=[],entries={};
 // QuickTime may close an atom list with a 32-bit zero (e.g. after avc1's colr/fiel/chrm).
 const isListTerminator=(p,end)=>end-p===4&&read32(p)===0;
 function walk(start,end,depth,track,parent){demand(depth<=8,'BOX_DEPTH');for(let p=start;p<end;){if(isListTerminator(p,end))break;demand(p+8<=end,'BOX_HEADER');let n=read32(p),h=8;if(n===1){demand(p+16<=end,'BOX_HEADER');n=read64(p+8);h=16;}else if(n===0)n=end-p;demand(n>=h&&p+n<=end,'BOX_BOUNDS');demand(++boxes<=GENERAL_LIMITS.boxes,'BOX_COUNT');const t=type(bytes,p),body=p+h,limit=p+n;
  if(['mvex','moof','sinf','senc','saiz','saio','cmov'].includes(t))fail('ISO_FEATURE_UNQUALIFIED');
  if(t==='trak'){demand(++tracks<=GENERAL_LIMITS.tracks,'TRACK_LIMIT');track={stts:null,ctts:null,stsz:null,stsd:false,dref:false,trackId:null,handler:null,codec:null,reordered:false,seen:new Set()};samples.push(track);walk(body,limit,depth+1,track,'trak');}
  else if(['moov','mdia','minf','stbl','edts','dinf'].includes(t))walk(body,limit,depth+1,track,t);
  else if(t==='tkhd'){
   demand(track&&track.trackId===null&&body+4<=limit&&[0,1].includes(bytes[body]),'TRACK_ID');const at=body+(bytes[body]===1?20:12);demand(at+4<=limit,'TRACK_ID');track.trackId=read32(at);demand(track.trackId>0,'TRACK_ID');
  }
  // QuickTime minf may also contain a data handler. Only mdia owns the media type.
  else if(t==='hdlr'&&track&&parent==='mdia'){demand(track.handler===null&&body+12<=limit,'TRACK_HANDLER');track.handler=type(bytes,body+4);}
  else if(t==='dref'){
   demand(track&&body+20===limit&&!track.dref,'DATA_REFERENCE');
   // Both references must be the empty, version-0 self-contained form (flag 1).
   demand(read32(body+4)===1&&read32(body+8)===12&&['url ','alis'].includes(type(bytes,body+8))&&read32(body+16)===1,'EXTERNAL_REFERENCE_UNQUALIFIED');track.dref=true;
  }
  else if(t==='stsd'){
   demand(track&&!track.stsd&&body+16<=limit&&read32(body+4)===1,'SAMPLE_DESCRIPTION_UNQUALIFIED');
   const entry=body+8,n=read32(entry),codec=type(bytes,entry),video=codec==='avc1'||codec==='avc3',subtitle=codec==='tx3g';
   demand(video||subtitle||audioCodecs.includes(codec),'CODEC_UNQUALIFIED');
   // QuickTime sound descriptions v1/v2 append 16/36 bytes to the v0 fields;
   // their extensions (wave, chan) are left to the demuxer.
   const audioVersion=video||subtitle?0:(bytes[entry+16]<<8)|bytes[entry+17];demand([0,1,2].includes(audioVersion),'AUDIO_DESCRIPTION_UNQUALIFIED');
   const fixed=video?86:subtitle?46:[36,52,72][audioVersion];demand(n>=fixed&&entry+n===limit,'SAMPLE_DESCRIPTION_BOUNDS');
   demand(bytes[entry+14]===0&&bytes[entry+15]===1,'DATA_REFERENCE');
   if(!audioVersion)walk(entry+fixed,limit,depth+1,track);track.stsd=true;track.codec=codec;
  }
  else if(['stts','ctts','stsz','stz2','stsc','stco','co64','stss'].includes(t)){
   demand(track&&body+8<=limit,'TABLE_HEADER');demand(t!=='stz2','COMPACT_SIZES_UNQUALIFIED');
   const key=t==='co64'?'stco':t;demand(!track.seen.has(key),'DUPLICATE_TABLE');track.seen.add(key);
   if(t==='stsz'){demand(body+12<=limit,'TABLE_HEADER');const fixed=read32(body+4),count=read32(body+8);demand(count<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');demand(fixed<=GENERAL_LIMITS.packetBytes,'PACKET_LIMIT');if(!fixed){demand(body+12+count*4<=limit,'TABLE_BOUNDS');for(let i=0;i<count;i++)demand(read32(body+12+i*4)<=GENERAL_LIMITS.packetBytes,'PACKET_LIMIT');}track.stsz=count;}
   else{const count=read32(body+4),width={stts:8,ctts:8,stsc:12,stco:4,co64:8,stss:4}[t];demand(count<=GENERAL_LIMITS.tableEntries,'TABLE_ENTRIES_LIMIT');entries[key]=(entries[key]??0)+count;demand(entries[key]<=GENERAL_LIMITS.totalEntriesPerTable,'AGGREGATE_ENTRIES_LIMIT');demand(body+8+count*width<=limit,'TABLE_BOUNDS');if(t==='stts'||t==='ctts'){let total=0;for(let i=0;i<count;i++){total+=read32(body+8+i*width);demand(total<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');if(t==='ctts'&&read32(body+12+i*width)!==0)track.reordered=true;}track[t]=total;}if(t==='stsc')for(let i=0;i<count;i++)demand(read32(body+12+i*width)<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');}
  }p=limit;
 }}walk(0,bytes.length,0,null);demand(tracks>=1,'NO_TRACK');const ids=new Set();let totalSamples=0;for(const t of samples){demand(t.stsd&&t.dref,'TRACK_DESCRIPTION_REQUIRED');demand(t.trackId!==null&&!ids.has(t.trackId),'TRACK_ID');ids.add(t.trackId);demand(t.codec==='tx3g'?['text','sbtl','subt'].includes(t.handler):['avc1','avc3'].includes(t.codec)?t.handler==='vide':t.handler==='soun','TRACK_HANDLER');demand(t.stsz!==null&&t.stts===t.stsz&&(t.ctts===null||t.ctts===t.stsz),'TABLE_COUNT_MISMATCH');totalSamples+=t.stsz;demand(totalSamples<=GENERAL_LIMITS.totalSamples,'AGGREGATE_SAMPLES_LIMIT');}return {tracks,samples:samples.map(t=>t.stsz),boxes,trackInfo:samples.map(t=>({trackId:t.trackId,codec:t.codec,handler:t.handler,samples:t.stsz,reordered:t.reordered}))};
}
export async function admitGeneralInput(rpc,options){const head=await rpc.exact(0,Math.min(rpc.size,1024));if(head.length>=564&&[0,188,376].every(p=>head[p]===0x47))return {kind:'ts',packetStride:188};
 let p=0,moov,inspected;for(let n=0;p<rpc.size&&n<256;n++){const b=await rpc.exact(p,Math.min(16,rpc.size-p));demand(b.length>=8,'BOX_HEADER');let size=u32(b,0),h=8;if(size===1){demand(b.length===16,'BOX_HEADER');size=integer64(b,8);h=16;}if(!size)size=rpc.size-p;demand(size>=h&&p+size<=rpc.size,'BOX_BOUNDS');const t=type(b,0);if(t==='moof')fail('FRAGMENTED_INPUT_UNQUALIFIED');if(t==='moov'){demand(!moov&&size<=GENERAL_LIMITS.moovBytes,'MOOV_LIMIT');moov=await rpc.exact(p,size);inspected=inspectGeneralMoov(moov,options);return {kind:'iso',...inspected};}p+=size;}fail('CONTAINER_UNQUALIFIED');}
