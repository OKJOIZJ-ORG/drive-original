// Bounded, single-track MPEG4 Simple Profile ISO admission. No media hydration.
// Unknown combinations remain explicit limits; metadata never proves decoding.
const demand=(condition,code)=>{if(!condition)throw new Error(`Q3_${code}`);};
export const Q3_LIMITS=Object.freeze({moovBytes:4194304,samples:65536,boxes:4096,packetBytes:1048576,pixels:1920*1080,maxDimension:4160});
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const u32=(b,p)=>{demand(p>=0&&p+4<=b.length,'BOX_BOUNDS');return view(b).getUint32(p);};
const u16=(b,p)=>{demand(p>=0&&p+2<=b.length,'BOX_BOUNDS');return view(b).getUint16(p);};
const text=(b,p,n=4)=>String.fromCharCode(...b.subarray(p,p+n));
const u64=(b,p)=>{demand(p>=0&&p+8<=b.length,'BOX_BOUNDS');const n=view(b).getBigUint64(p);demand(n<=BigInt(Number.MAX_SAFE_INTEGER),'INTEGER_LIMIT');return Number(n);};
function boxes(bytes,budget){const out=[];for(let p=0;p<bytes.length;){demand(p+8<=bytes.length,'BOX_HEADER');let n=u32(bytes,p),h=8;if(n===1){n=u64(bytes,p+8);h=16;}if(!n)n=bytes.length-p;demand(n>=h&&p+n<=bytes.length&&++budget.count<=Q3_LIMITS.boxes,'BOX_BOUNDS');out.push({type:text(bytes,p+4),data:bytes.subarray(p+h,p+n)});p+=n;}return out;}
const one=(entries,type)=>{const selected=entries.filter(x=>x.type===type);demand(selected.length===1,'TRACK_STRUCTURE');return selected[0];};
function descriptors(bytes){const out=[];for(let p=0;p<bytes.length;){const tag=bytes[p++];let n=0,done=false;for(let i=0;i<4;i++){demand(p<bytes.length,'ESDS_BOUNDS');const v=bytes[p++];n=n*128+(v&127);if(!(v&128)){done=true;break;}}demand(done&&n>0&&p+n<=bytes.length,'ESDS_BOUNDS');out.push({tag,data:bytes.subarray(p,p+n)});p+=n;}return out;}
function extraFromEsds(bytes){demand(u32(bytes,0)===0,'ESDS_VERSION');const es=descriptors(bytes.subarray(4));demand(es.length===1&&es[0].tag===3,'ESDS_PROFILE');const b=es[0].data;demand(b.length>=3&&b[2]===0,'ESDS_PROFILE');const inner=descriptors(b.subarray(3)),dec=inner.filter(x=>x.tag===4);demand(dec.length===1&&inner.every(x=>[4,6].includes(x.tag)),'ESDS_PROFILE');const d=dec[0].data;demand(d.length>=13&&d[0]===0x20&&d[1]===0x11,'CODEC_UNQUALIFIED');const cfg=descriptors(d.subarray(13));demand(cfg.length===1&&cfg[0].tag===5,'ESDS_PROFILE');const extra=cfg[0].data;demand(extra.length>=5&&extra.length<=65536&&text(extra,0,4)==='\0\0\x01\xb0'&&extra[4]===1,'PROFILE_UNQUALIFIED');return extra.slice();}
function table(box,width){const b=box.data;demand(u32(b,0)===0,'TABLE_VERSION');const n=u32(b,4);demand(n<=Q3_LIMITS.samples&&b.length===8+n*width,'TABLE_LIMIT');return {b,n};}
function identityClock(movieTicks,movieScale,ticks,timescale,delta){
 // Exact rational clocks avoid overflow and floating-point endpoint tolerances.
 // A nonexact endpoint may only be floor/ceil rounding at a movie tick no
 // longer than one source picture. Coarser clocks must describe exact identity.
 const movie=BigInt(movieTicks)*BigInt(timescale),media=BigInt(ticks)*BigInt(movieScale),difference=movie>media?movie-media:media-movie;
 const movieTick=BigInt(timescale),picture=BigInt(delta)*BigInt(movieScale);
 demand(difference===0n||(movieTick<=picture&&difference<movieTick&&difference<picture),'EDIT_UNQUALIFIED');
}
export function inspectQ3Moov(bytes,{size,mediaSpans}){
 demand(bytes.length<=Q3_LIMITS.moovBytes&&Number.isSafeInteger(size)&&size>0,'METADATA_LIMIT');
 const budget={count:0},children=box=>boxes(box.data,budget),root=boxes(bytes,budget),moov=one(root,'moov'),mc=children(moov);
 demand(!mc.some(x=>['mvex','cmov'].includes(x.type)),'CONTAINER_UNQUALIFIED');
 const tracks=mc.filter(x=>x.type==='trak');demand(tracks.length===1,'TRACKS_UNQUALIFIED');const tc=children(tracks[0]);
 const tkhd=one(tc,'tkhd').data;demand(tkhd.length===84&&tkhd[0]===0&&(u32(tkhd,0)&3)===3,'TRACK_HEADER');
 const matrix=[65536,0,0,0,65536,0,0,0,1073741824];demand(matrix.every((v,i)=>u32(tkhd,40+i*4)===v),'ROTATION_UNQUALIFIED');
 const mdia=children(one(tc,'mdia')),mdhd=one(mdia,'mdhd').data;demand(mdhd.length===24&&u32(mdhd,0)===0,'TRACK_CLOCK');
 const timescale=u32(mdhd,12),ticks=u32(mdhd,16);demand(timescale>0&&ticks>0,'TRACK_CLOCK');
 demand(text(one(mdia,'hdlr').data,8)==='vide','VIDEO_REQUIRED');
 const movie=one(mc,'mvhd').data;demand(movie[0]===0&&movie.length>=20,'MOVIE_CLOCK');const movieScale=u32(movie,12),movieTicks=u32(movie,16);demand(movieScale>0&&movieTicks>0&&u32(tkhd,20)===movieTicks,'EDIT_UNQUALIFIED');
 const edits=tc.filter(x=>x.type==='edts');demand(edits.length<=1,'EDIT_UNQUALIFIED');if(edits.length){const e=one(children(edits[0]),'elst').data;demand(e.length===20&&u32(e,0)===0&&u32(e,4)===1&&u32(e,12)===0&&u32(e,16)===65536&&u32(e,8)===movieTicks,'EDIT_UNQUALIFIED');}
 const minf=children(one(mdia,'minf')),dref=one(children(one(minf,'dinf')),'dref').data;
 demand(dref.length===20&&u32(dref,0)===0&&u32(dref,4)===1&&u32(dref,8)===12&&text(dref,12)==='url '&&u32(dref,16)===1,'EXTERNAL_REFERENCE_UNQUALIFIED');
 const stbl=children(one(minf,'stbl'));demand(!stbl.some(x=>['sinf','senc','saiz','saio','stz2'].includes(x.type)),'CONTAINER_UNQUALIFIED');
 const stsd=one(stbl,'stsd').data;demand(u32(stsd,0)===0&&u32(stsd,4)===1,'DESCRIPTION_UNQUALIFIED');const entries=boxes(stsd.subarray(8),budget),entry=one(entries,'mp4v'),d=entry.data;
 demand(entries.length===1&&d.length>=78&&u16(d,6)===1&&u32(d,8)===0&&u32(d,12)===0&&u32(d,16)===0&&u16(d,40)===1&&u16(d,74)===24,'DESCRIPTION_UNQUALIFIED');
 const width=u16(d,24),height=u16(d,26);demand(width>0&&height>0&&width<=Q3_LIMITS.maxDimension&&height<=Q3_LIMITS.maxDimension&&!(width%2)&&!(height%2)&&width*height<=Q3_LIMITS.pixels&&u32(tkhd,76)===width*65536&&u32(tkhd,80)===height*65536,'DIMENSIONS_UNQUALIFIED');
 const vc=boxes(d.subarray(78),budget);demand(vc.every(x=>['esds','colr','pasp','btrt'].includes(x.type)),'VIDEO_METADATA_UNQUALIFIED');
 const color=one(vc,'colr').data;demand(color.length===11&&text(color,0)==='nclx'&&[4,6,8].every(p=>u16(color,p)===1)&&color[10]===0,'COLOR_UNQUALIFIED');
 const sar=vc.filter(x=>x.type==='pasp');demand(sar.length<=1&&(!sar.length||(sar[0].data.length===8&&u32(sar[0].data,0)>0&&u32(sar[0].data,0)===u32(sar[0].data,4))),'SAR_UNQUALIFIED');
 const extradata=extraFromEsds(one(vc,'esds').data),sz=one(stbl,'stsz').data;demand(u32(sz,0)===0,'TABLE_VERSION');const fixed=u32(sz,4),count=u32(sz,8);demand(count>0&&count<=Q3_LIMITS.samples&&sz.length===12+(fixed?0:count*4),'SAMPLE_LIMIT');
 const sizes=Array.from({length:count},(_,i)=>fixed||u32(sz,12+i*4));demand(sizes.every(n=>n>0&&n<=Q3_LIMITS.packetBytes),'PACKET_LIMIT');
 const clock=table(one(stbl,'stts'),8);demand(clock.n===1&&u32(clock.b,8)===count,'CADENCE_UNQUALIFIED');const delta=u32(clock.b,12),fps=timescale/delta;demand(delta>0&&fps>0&&fps<=60&&count*delta===ticks,'CADENCE_UNQUALIFIED');
 identityClock(movieTicks,movieScale,ticks,timescale,delta);
 const ctts=stbl.filter(x=>x.type==='ctts');demand(ctts.length<=1,'REORDER_UNQUALIFIED');if(ctts.length){const t=table(ctts[0],8);let n=0;for(let i=0;i<t.n;i++){n+=u32(t.b,8+i*8);demand(u32(t.b,12+i*8)===0,'REORDER_UNQUALIFIED');}demand(n===count,'TABLE_COUNT');}
 const sync=stbl.filter(x=>x.type==='stss');demand(sync.length<=1,'SYNC_UNQUALIFIED');const keys=new Set();if(sync.length){const t=table(sync[0],4);let last=0;for(let i=0;i<t.n;i++){const n=u32(t.b,8+i*4);demand(n>last&&n<=count,'SYNC_UNQUALIFIED');keys.add(n-1);last=n;}demand(keys.has(0),'SYNC_UNQUALIFIED');}else for(let i=0;i<count;i++)keys.add(i);
 const offsetBoxes=stbl.filter(x=>['stco','co64'].includes(x.type));demand(offsetBoxes.length===1,'OFFSET_UNQUALIFIED');const stride=offsetBoxes[0].type==='co64'?8:4,offsets=table(offsetBoxes[0],stride),sc=table(one(stbl,'stsc'),12);demand(offsets.n>0&&sc.n>0,'OFFSET_UNQUALIFIED');
 const chunks=[];let previous=0;for(let i=0;i<sc.n;i++){const p=8+i*12,first=u32(sc.b,p),samples=u32(sc.b,p+4);demand(first>previous&&first<=offsets.n&&samples>0&&samples<=count&&u32(sc.b,p+8)===1,'CHUNK_UNQUALIFIED');chunks.push({first,samples});previous=first;}demand(chunks[0].first===1,'CHUNK_UNQUALIFIED');
 const packets=[];let sample=0,row=0,lastEnd=0;for(let i=0;i<offsets.n;i++){while(row+1<chunks.length&&chunks[row+1].first<=i+1)row++;let start=stride===8?u64(offsets.b,8+i*stride):u32(offsets.b,8+i*stride);for(let k=0;k<chunks[row].samples;k++){demand(sample<count,'TABLE_COUNT');const n=sizes[sample],end=start+n;demand(Number.isSafeInteger(end)&&start>=lastEnd&&end<=size&&mediaSpans.some(([a,b])=>start>=a&&end<=b),'PACKET_LOCATION');packets.push({start,size:n,timestamp:sample*delta/timescale,duration:delta/timescale,key:keys.has(sample)});sample++;lastEnd=end;start=end;}}demand(sample===count,'TABLE_COUNT');
 return {codec:'mp4v.20.1',width,height,fps,timescale,duration:ticks/timescale,extradata,packets,colorSpace:{primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false}};
}
export async function readQ3Input(rpc){let p=0,moov;const spans=[];for(let count=0;p<rpc.size&&count<256;count++){const b=await rpc.exact(p,Math.min(16,rpc.size-p));rpc.check();demand(b.length>=8,'BOX_HEADER');let n=u32(b,0),h=8;if(n===1){n=u64(b,8);h=16;}if(!n)n=rpc.size-p;demand(n>=h&&Number.isSafeInteger(p+n)&&p+n<=rpc.size,'BOX_BOUNDS');const type=text(b,4);demand(!['moof','sidx'].includes(type),'CONTAINER_UNQUALIFIED');if(type==='moov'){demand(!moov&&n<=Q3_LIMITS.moovBytes,'METADATA_LIMIT');moov=await rpc.exact(p,n);}if(type==='mdat')spans.push([p+h,p+n]);p+=n;}demand(p===rpc.size&&moov&&spans.length,'CONTAINER_UNQUALIFIED');return inspectQ3Moov(moov,{size:rpc.size,mediaSpans:spans});}
export function inspectQ3Packet(bytes,key){let vop=-1;for(let p=0;p+4<bytes.length;p++)if(bytes[p]===0&&bytes[p+1]===0&&bytes[p+2]===1){const code=bytes[p+3];demand(![0xb0,0xb5].includes(code),'CONFIG_CHANGED');if(code===0xb6){demand(vop===-1,'PACKET_FRAMES_UNQUALIFIED');vop=p+4;}}demand(vop>=0,'PACKET_FRAMES_UNQUALIFIED');const kind=bytes[vop]>>>6;demand(kind<=1&&key===(kind===0),'REORDER_UNQUALIFIED');}
