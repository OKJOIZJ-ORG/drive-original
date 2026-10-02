const fail=code=>{throw new Error(`GENERAL_${code}`);};
const demand=(x,c)=>{if(!x)fail(c);};
const type=(b,p)=>String.fromCharCode(...b.subarray(p+4,p+8));
const u32=(b,p)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p);
const integer64=(b,p)=>{const n=new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(p);demand(n<=BigInt(Number.MAX_SAFE_INTEGER),'BOX_INTEGER');return Number(n);};
export const GENERAL_LIMITS=Object.freeze({moovBytes:4*1024*1024,tableSamplesPerTrack:65536,tableEntries:65536,totalSamples:2*65536,totalEntriesPerTable:2*65536,tracks:8,boxes:4096,packetBytes:2*1024*1024,retainedMuxBytes:4*1024*1024,retainedMuxSamples:4096,appendChunkBytes:262144});
// Read every allocation-driving count before constructing the library Input.
// A small run-length table can otherwise expand to billions of objects.
export function inspectGeneralMoov(bytes,{audioCodecs=["mp4a"]}={}){demand(Array.isArray(audioCodecs)&&audioCodecs.length>0&&audioCodecs.every(c=>["mp4a","ac-3","ec-3"].includes(c)),"AUDIO_ADMISSION_OPTIONS");demand(bytes.length<=GENERAL_LIMITS.moovBytes,'MOOV_LIMIT');let boxes=0,tracks=0;const samples=[],entries={};
 function walk(start,end,depth,track){demand(depth<=8,'BOX_DEPTH');for(let p=start;p<end;){demand(p+8<=end,'BOX_HEADER');let n=u32(bytes,p),h=8;if(n===1){demand(p+16<=end,'BOX_HEADER');n=integer64(bytes,p+8);h=16;}else if(n===0)n=end-p;demand(n>=h&&p+n<=end,'BOX_BOUNDS');demand(++boxes<=GENERAL_LIMITS.boxes,'BOX_COUNT');const t=type(bytes,p),body=p+h,limit=p+n;
  if(['mvex','moof','sinf','senc','saiz','saio','cmov'].includes(t))fail('ISO_FEATURE_UNQUALIFIED');
  if(t==='trak'){demand(++tracks<=GENERAL_LIMITS.tracks,'TRACK_LIMIT');track={stts:null,ctts:null,stsz:null,stsd:false,dref:false,trackId:null,handler:null,codec:null,reordered:false,seen:new Set()};samples.push(track);walk(body,limit,depth+1,track);}
  else if(['moov','mdia','minf','stbl','edts','dinf'].includes(t))walk(body,limit,depth+1,track);
  else if(t==='tkhd'){
   demand(track&&track.trackId===null&&body+4<=limit&&[0,1].includes(bytes[body]),'TRACK_ID');const at=body+(bytes[body]===1?20:12);demand(at+4<=limit,'TRACK_ID');track.trackId=u32(bytes,at);demand(track.trackId>0,'TRACK_ID');
  }
  else if(t==='hdlr'&&track){demand(track.handler===null&&body+12<=limit,'TRACK_HANDLER');track.handler=type(bytes,body+4);}
  else if(t==='dref'){
   demand(track&&body+20===limit&&!track.dref,'DATA_REFERENCE');
   demand(u32(bytes,body+4)===1&&u32(bytes,body+8)===12&&type(bytes,body+8)==='url '&&u32(bytes,body+16)===1,'EXTERNAL_REFERENCE_UNQUALIFIED');track.dref=true;
  }
  else if(t==='stsd'){
   demand(track&&!track.stsd&&body+16<=limit&&u32(bytes,body+4)===1,'SAMPLE_DESCRIPTION_UNQUALIFIED');
   const entry=body+8,n=u32(bytes,entry),codec=type(bytes,entry),video=codec==='avc1'||codec==='avc3',subtitle=codec==='tx3g';
   demand(video||subtitle||audioCodecs.includes(codec),'CODEC_UNQUALIFIED');const fixed=video?86:subtitle?46:36;demand(n>=fixed&&entry+n===limit,'SAMPLE_DESCRIPTION_BOUNDS');
   demand(bytes[entry+14]===0&&bytes[entry+15]===1,'DATA_REFERENCE');
   if(!video&&!subtitle)demand(bytes[entry+16]===0&&bytes[entry+17]===0,'AUDIO_DESCRIPTION_UNQUALIFIED');
   walk(entry+fixed,limit,depth+1,track);track.stsd=true;track.codec=codec;
  }
  else if(['stts','ctts','stsz','stz2','stsc','stco','co64','stss'].includes(t)){
   demand(track&&body+8<=limit,'TABLE_HEADER');demand(t!=='stz2','COMPACT_SIZES_UNQUALIFIED');
   const key=t==='co64'?'stco':t;demand(!track.seen.has(key),'DUPLICATE_TABLE');track.seen.add(key);
   if(t==='stsz'){demand(body+12<=limit,'TABLE_HEADER');const fixed=u32(bytes,body+4),count=u32(bytes,body+8);demand(count<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');demand(fixed<=GENERAL_LIMITS.packetBytes,'PACKET_LIMIT');if(!fixed){demand(body+12+count*4<=limit,'TABLE_BOUNDS');for(let i=0;i<count;i++)demand(u32(bytes,body+12+i*4)<=GENERAL_LIMITS.packetBytes,'PACKET_LIMIT');}track.stsz=count;}
   else{const count=u32(bytes,body+4),width={stts:8,ctts:8,stsc:12,stco:4,co64:8,stss:4}[t];demand(count<=GENERAL_LIMITS.tableEntries,'TABLE_ENTRIES_LIMIT');entries[key]=(entries[key]??0)+count;demand(entries[key]<=GENERAL_LIMITS.totalEntriesPerTable,'AGGREGATE_ENTRIES_LIMIT');demand(body+8+count*width<=limit,'TABLE_BOUNDS');if(t==='stts'||t==='ctts'){let total=0;for(let i=0;i<count;i++){total+=u32(bytes,body+8+i*width);demand(total<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');if(t==='ctts'&&u32(bytes,body+12+i*width)!==0)track.reordered=true;}track[t]=total;}if(t==='stsc')for(let i=0;i<count;i++)demand(u32(bytes,body+12+i*width)<=GENERAL_LIMITS.tableSamplesPerTrack,'EXPANDED_INDEX_LIMIT');}
  }p=limit;
 }}walk(0,bytes.length,0,null);demand(tracks>=1,'NO_TRACK');const ids=new Set();let totalSamples=0;for(const t of samples){demand(t.stsd&&t.dref,'TRACK_DESCRIPTION_REQUIRED');demand(t.trackId!==null&&!ids.has(t.trackId),'TRACK_ID');ids.add(t.trackId);demand(t.codec==='tx3g'?['text','sbtl','subt'].includes(t.handler):['avc1','avc3'].includes(t.codec)?t.handler==='vide':t.handler==='soun','TRACK_HANDLER');demand(t.stsz!==null&&t.stts===t.stsz&&(t.ctts===null||t.ctts===t.stsz),'TABLE_COUNT_MISMATCH');totalSamples+=t.stsz;demand(totalSamples<=GENERAL_LIMITS.totalSamples,'AGGREGATE_SAMPLES_LIMIT');}return {tracks,samples:samples.map(t=>t.stsz),boxes,trackInfo:samples.map(t=>({trackId:t.trackId,codec:t.codec,handler:t.handler,samples:t.stsz,reordered:t.reordered}))};
}
export async function admitGeneralInput(rpc,options){const head=await rpc.exact(0,Math.min(rpc.size,1024));if(head.length>=564&&[0,188,376].every(p=>head[p]===0x47))return {kind:'ts',packetStride:188};
 let p=0,moov,inspected;for(let n=0;p<rpc.size&&n<256;n++){const b=await rpc.exact(p,Math.min(16,rpc.size-p));demand(b.length>=8,'BOX_HEADER');let size=u32(b,0),h=8;if(size===1){demand(b.length===16,'BOX_HEADER');size=integer64(b,8);h=16;}if(!size)size=rpc.size-p;demand(size>=h&&p+size<=rpc.size,'BOX_BOUNDS');const t=type(b,0);if(t==='moof')fail('FRAGMENTED_INPUT_UNQUALIFIED');if(t==='moov'){demand(!moov&&size<=GENERAL_LIMITS.moovBytes,'MOOV_LIMIT');moov=await rpc.exact(p,size);inspected=inspectGeneralMoov(moov,options);return {kind:'iso',...inspected};}p+=size;}fail('CONTAINER_UNQUALIFIED');}
