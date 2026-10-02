import {createGeneralSource} from './general-source.mjs';

const fail = code => { throw new Error(`SUBTITLE_${code}`); };
const demand = (value, code) => { if (!value) fail(code); };
export const SUBTITLE_LIMITS = Object.freeze({metadataBytes:4194304, boxes:4096, tracks:8,
  samples:65536, aggregateSamples:131072, tableEntries:131072, sampleBytes:65536,
  windowSeconds:30, windowSamples:128, windowBytes:262144, cueCharacters:32768});
const view = b => new DataView(b.buffer,b.byteOffset,b.byteLength);
const u32 = (b,p) => view(b).getUint32(p);
const i32 = (b,p) => view(b).getInt32(p);
const u16 = (b,p) => view(b).getUint16(p);
const fourcc = (b,p) => String.fromCharCode(...b.subarray(p,p+4));
const safe = n => { demand(Number.isSafeInteger(n),'INTEGER_OVERFLOW'); return n; };
const u64 = (b,p) => { const n=view(b).getBigUint64(p); demand(n<=BigInt(Number.MAX_SAFE_INTEGER),'INTEGER_OVERFLOW'); return Number(n); };
const i64 = (b,p) => { const n=view(b).getBigInt64(p); demand(n>=BigInt(Number.MIN_SAFE_INTEGER)&&n<=BigInt(Number.MAX_SAFE_INTEGER),'INTEGER_OVERFLOW'); return Number(n); };
const TEXT_HANDLERS = ['text','sbtl','subt'];
const FORBIDDEN = ['mvex','moof','sinf','senc','saiz','saio','cmov'];
const LIMITATIONS = Object.freeze(['Plain text only: embedded fonts, styles, placement, highlighting and karaoke are not rendered.']);

// Length is bytes, including a possible UTF-16 BOM. Never interpret cue text as HTML.
// Format cross-check: AndroidX Tx3gParser.readSubtitleText and FFmpeg movtextdec.c.
export function decodeTx3gSample(bytes) {
  demand(bytes instanceof Uint8Array&&bytes.length>=2&&bytes.length<=SUBTITLE_LIMITS.sampleBytes,'SAMPLE_BYTES');
  const length=u16(bytes,0); demand(length+2<=bytes.length,'TEXT_LENGTH');
  const textBytes=bytes.subarray(2,2+length); let encoding='utf-8';
  if(length>=2&&textBytes[0]===0xfe&&textBytes[1]===0xff) encoding='utf-16be';
  else if(length>=2&&textBytes[0]===0xff&&textBytes[1]===0xfe) encoding='utf-16le';
  if(encoding!=='utf-8') demand(length%2===0,'TEXT_ENCODING');
  let text; try { text=new TextDecoder(encoding,{fatal:true}).decode(textBytes); } catch { fail('TEXT_ENCODING'); }
  demand(text.length<=SUBTITLE_LIMITS.cueCharacters,'TEXT_LIMIT');
  // Modifiers are not rendered; still validate their framing before skipping them.
  let count=0;
  for(let p=2+length;p<bytes.length;) {
    demand(p+8<=bytes.length,'MODIFIER_HEADER'); let size=u32(bytes,p),header=8;
    if(size===1) { demand(p+16<=bytes.length,'MODIFIER_HEADER'); size=u64(bytes,p+8); header=16; }
    demand(size>=header&&p+size<=bytes.length&&++count<=128,'MODIFIER_BOUNDS');
    const type=fourcc(bytes,p+4),body=p+header,end=p+size;
    if(type==='styl') { demand(body+2<=end,'STYLE_COUNT'); demand(body+2+u16(bytes,body)*12===end,'STYLE_COUNT'); }
    p=end;
  }
  return text.replace(/\r\n?/g,'\n');
}

// Bounded metadata tree. Sample tables of every track are checked before any
// subtitle index expansion, including unrelated tracks with hostile counts.
export function inspectSubtitleMoov(bytes,{size,mdatRanges=[]}={}) {
  demand(bytes instanceof Uint8Array&&bytes.length<=SUBTITLE_LIMITS.metadataBytes,'METADATA_LIMIT');
  demand(Number.isSafeInteger(size)&&size>0,'SOURCE_SIZE');
  let boxes=0,aggregateSamples=0,aggregateEntries=0;
  function children(start,end,depth=0) {
    demand(depth<=8,'BOX_DEPTH'); const result=[];
    for(let p=start;p<end;) {
      demand(p+8<=end,'BOX_HEADER'); let n=u32(bytes,p),header=8;
      if(n===1) { demand(p+16<=end,'BOX_HEADER'); n=u64(bytes,p+8); header=16; }
      else if(n===0) n=end-p;
      demand(n>=header&&safe(p+n)<=end,'BOX_BOUNDS'); demand(++boxes<=SUBTITLE_LIMITS.boxes,'BOX_LIMIT');
      const type=fourcc(bytes,p+4); demand(!FORBIDDEN.includes(type),'FEATURE_UNSUPPORTED');
      const box={type,body:p+header,end:p+n};
      if(['moov','trak','mdia','minf','stbl','dinf','edts'].includes(type)) box.children=children(box.body,box.end,depth+1);
      result.push(box); p+=n;
    }
    return result;
  }
  const roots=children(0,bytes.length),moov=one(roots,'moov');
  function one(list,type,required=true) { const found=list.filter(b=>b.type===type); demand(found.length<=1,'DUPLICATE_BOX'); if(required)demand(found.length===1,'BOX_REQUIRED'); return found[0]; }
  const mvhd=one(moov.children,'mvhd');
  function clock(box) { demand(box.body+4<=box.end,'CLOCK_HEADER'); const v=bytes[box.body]; demand((v===0||v===1)&&(u32(bytes,box.body)&0xffffff)===0,'CLOCK_VERSION'); const p=box.body+(v?20:12); demand(p+(v?12:8)<=box.end,'CLOCK_HEADER'); const scale=u32(bytes,p),duration=v?u64(bytes,p+4):u32(bytes,p+4); demand(scale>0,'CLOCK_SCALE'); return {scale,duration,p}; }
  const movie=clock(mvhd),trackBoxes=moov.children.filter(b=>b.type==='trak');
  demand(trackBoxes.length>0&&trackBoxes.length<=SUBTITLE_LIMITS.tracks,'TRACK_LIMIT'); const ids=new Set(),tracks=[];
  for(const trak of trackBoxes) {
    const tkhd=one(trak.children,'tkhd'),version=bytes[tkhd.body]; demand(version===0||version===1,'TRACK_HEADER');
    const idOffset=tkhd.body+(version?20:12); demand(idOffset+4<=tkhd.end,'TRACK_HEADER');
    const trackId=u32(bytes,idOffset); demand(trackId>0&&!ids.has(trackId),'TRACK_ID'); ids.add(trackId);
    const mdia=one(trak.children,'mdia'),mdhd=one(mdia.children,'mdhd'),media=clock(mdhd),hdlr=one(mdia.children,'hdlr');
    demand(hdlr.body+24<=hdlr.end,'HANDLER_HEADER'); const handler=fourcc(bytes,hdlr.body+8),subtitle=TEXT_HANDLERS.includes(handler);
    demand(media.p+(bytes[mdhd.body]?14:10)<=mdhd.end,'LANGUAGE_HEADER'); const packed=u16(bytes,media.p+(bytes[mdhd.body]?12:8));
    const language=packed?String.fromCharCode(((packed>>10)&31)+96,((packed>>5)&31)+96,(packed&31)+96):'und';
    const minf=one(mdia.children,'minf'),stbl=one(minf.children,'stbl'),dinf=one(minf.children,'dinf'),dref=one(dinf.children,'dref');
    demand(dref.body+20===dref.end&&u32(bytes,dref.body)===0&&u32(bytes,dref.body+4)===1&&u32(bytes,dref.body+8)===12&&fourcc(bytes,dref.body+12)==='url '&&u32(bytes,dref.body+16)===1,'EXTERNAL_REFERENCE_UNSUPPORTED');
    const stsd=one(stbl.children,'stsd'); demand(stsd.body+24<=stsd.end&&u32(bytes,stsd.body)===0&&u32(bytes,stsd.body+4)===1,'DESCRIPTION_COUNT');
    const entry=stsd.body+8,entrySize=u32(bytes,entry),codec=fourcc(bytes,entry+4);
    demand(entrySize>=16&&entry+entrySize===stsd.end&&u16(bytes,entry+14)===1,'DESCRIPTION_BOUNDS');
    demand(!['encv','enca','enct','encs'].includes(codec),'ENCRYPTION_UNSUPPORTED');
    if(codec==='tx3g') { demand(subtitle&&entrySize>=46,'TX3G_DESCRIPTION'); children(entry+46,stsd.end,4); }
    else if(['avc1','avc3'].includes(codec)) { demand(entrySize>=86,'DESCRIPTION_BOUNDS'); children(entry+86,stsd.end,4); }
    else if(['mp4a','ac-3','ec-3'].includes(codec)) { demand(entrySize>=36,'DESCRIPTION_BOUNDS'); children(entry+36,stsd.end,4); }
    const tables={};
    for(const box of stbl.children.filter(b=>['stsz','stz2','stts','ctts','stsc','stco','co64','stss'].includes(b.type))) {
      demand(box.type!=='stz2','COMPACT_SIZES_UNSUPPORTED'); const key=box.type==='co64'?'stco':box.type;
      demand(!tables[key],'DUPLICATE_TABLE'); tables[key]=box; demand(box.body+8<=box.end,'TABLE_HEADER');
      const v=u32(bytes,box.body); demand(v===0||(box.type==='ctts'&&v===0x01000000),'TABLE_VERSION');
      if(box.type==='stsz') {
        demand(box.body+12<=box.end,'TABLE_HEADER'); const fixed=u32(bytes,box.body+4),count=u32(bytes,box.body+8);
        demand(count<=SUBTITLE_LIMITS.samples,'SAMPLE_LIMIT'); aggregateSamples+=count; demand(aggregateSamples<=SUBTITLE_LIMITS.aggregateSamples,'AGGREGATE_SAMPLE_LIMIT');
        demand(box.body+12+(fixed?0:count*4)===box.end,'TABLE_BOUNDS');
        const cap=subtitle?SUBTITLE_LIMITS.sampleBytes:2097152;
        demand(fixed<=cap,'SAMPLE_BYTES'); for(let i=0;!fixed&&i<count;i++) demand(u32(bytes,box.body+12+i*4)<=cap,'SAMPLE_BYTES');
        box.count=count; box.fixed=fixed;
      } else {
        const count=u32(bytes,box.body+4),width={stts:8,ctts:8,stsc:12,stco:4,co64:8,stss:4}[box.type];
        demand(count<=SUBTITLE_LIMITS.tableEntries,'TABLE_ENTRY_LIMIT'); aggregateEntries+=count; demand(aggregateEntries<=SUBTITLE_LIMITS.tableEntries,'AGGREGATE_TABLE_LIMIT');
        demand(box.body+8+count*width===box.end,'TABLE_BOUNDS'); box.count=count; box.width=width;
      }
    }
    for(const t of ['stsz','stts','stsc','stco']) demand(tables[t],'TABLE_REQUIRED');
    const count=tables.stsz.count;
    for(const t of ['stts','ctts']) if(tables[t]) { const box=tables[t]; let total=0; for(let i=0;i<box.count;i++) { const n=u32(bytes,box.body+8+i*8); demand(n>0,'TABLE_RUN'); total+=n; demand(total<=SUBTITLE_LIMITS.samples,'SAMPLE_LIMIT'); } demand(total===count,'TABLE_COUNT_MISMATCH'); }
    const sc=tables.stsc,co=tables.stco; let previous=0,expanded=0;
    for(let i=0;i<sc.count;i++) { const p=sc.body+8+i*12,first=u32(bytes,p),per=u32(bytes,p+4),next=i+1<sc.count?u32(bytes,p+12):co.count+1;
      demand(first>previous&&first>=1&&first<=co.count&&next>first&&per>0&&per<=SUBTITLE_LIMITS.samples&&u32(bytes,p+8)===1,'CHUNK_MAPPING');
      if(i===0)demand(first===1,'CHUNK_MAPPING'); expanded=safe(expanded+(next-first)*per); demand(expanded<=SUBTITLE_LIMITS.samples,'SAMPLE_LIMIT'); previous=first;
    }
    demand(expanded===count&&(count>0||(!sc.count&&!co.count)),'TABLE_COUNT_MISMATCH');
    // Unsupported subtitle codecs are visible and cannot be selected.
    if(!subtitle) continue;
    if(codec!=='tx3g') { tracks.push({trackId,codec,language,handler,supported:false,reason:'CODEC_UNSUPPORTED',limitations:LIMITATIONS}); continue; }
    let shift=0,clipEnd=Infinity;
    const edts=one(trak.children,'edts',false),elst=edts&&one(edts.children,'elst');
    if(elst) {
      demand(elst.body+8<=elst.end,'EDIT_HEADER'); const v=bytes[elst.body]; demand((v===0||v===1)&&(u32(bytes,elst.body)&0xffffff)===0,'EDIT_VERSION');
      const n=u32(bytes,elst.body+4),width=v?20:12; demand(n>=1&&n<=2&&elst.body+8+n*width===elst.end,'EDIT_UNSUPPORTED'); let empty=0;
      for(let i=0;i<n;i++) { const p=elst.body+8+i*width,duration=v?u64(bytes,p):u32(bytes,p),origin=v?i64(bytes,p+8):i32(bytes,p+4),rate=p+(v?16:8);
        demand(u32(bytes,rate)===65536&&duration>0,'EDIT_UNSUPPORTED');
        if(origin===-1) { demand(i===0&&n===2,'EDIT_UNSUPPORTED'); empty=duration/movie.scale; }
        else { demand(origin>=0&&origin<=media.duration&&i===n-1,'EDIT_UNSUPPORTED'); shift=empty-origin/media.scale; clipEnd=empty+duration/movie.scale; }
      }
    }
    const samples=[]; let sampleIndex=0,scIndex=0;
    for(let chunk=1;chunk<=co.count;chunk++) {
      if(scIndex+1<sc.count&&chunk===u32(bytes,sc.body+8+(scIndex+1)*12))scIndex++;
      const per=u32(bytes,sc.body+12+scIndex*12); let offset=co.type==='co64'?u64(bytes,co.body+8+(chunk-1)*8):u32(bytes,co.body+8+(chunk-1)*4);
      for(let j=0;j<per;j++) { const length=tables.stsz.fixed||u32(bytes,tables.stsz.body+12+sampleIndex*4),end=safe(offset+length);
        demand(length>=2&&end<=size&&mdatRanges.some(([a,b])=>offset>=a&&end<=b),'SAMPLE_BOUNDS');
        samples.push({offset,length}); offset=end; sampleIndex++;
      }
    }
    const ts=tables.stts; let index=0,dts=0;
    for(let i=0;i<ts.count;i++) { const p=ts.body+8+i*8,n=u32(bytes,p),delta=u32(bytes,p+4); safe(dts+n*delta);
      for(let j=0;j<n;j++) { samples[index].dts=dts; samples[index].duration=delta; dts=safe(dts+delta); index++; }
    }
    demand(dts===media.duration,'DURATION_MISMATCH');
    if(tables.ctts) { const ct=tables.ctts; index=0; for(let i=0;i<ct.count;i++) { const p=ct.body+8+i*8,n=u32(bytes,p),offset=bytes[ct.body]===1?i32(bytes,p+4):u32(bytes,p+4); for(let j=0;j<n;j++) samples[index++].cts=offset; } }
    for(const sample of samples) { const ticks=safe(sample.dts+(sample.cts||0)),end=safe(ticks+sample.duration); sample.startTime=Math.max(0,ticks/media.scale+shift); sample.endTime=Math.min(clipEnd,end/media.scale+shift); delete sample.dts; delete sample.cts; delete sample.duration; }
    samples.sort((a,b)=>a.startTime-b.startTime);
    tracks.push({trackId,codec,language,handler,supported:true,limitations:LIMITATIONS,samples});
  }
  return {tracks,boxes,aggregateSamples,aggregateEntries};
}

// The source is a separate pinned owner. Cleanup aborts it exactly once; sharing
// the playback source here would incorrectly retire the playback owner.
export async function createPinnedSubtitleTrack(source,{signal,isCurrent=()=>true,readTimeoutMs=30000}={}) {
  const rpc=createGeneralSource(source,{signal,isCurrent,readTimeoutMs,discoveryBytes:8*1024*1024,discoveryRequests:512});
  let inventory,selected=null,generation=0,inFlight=false,disposed=false;
  const dispose=async()=>{ disposed=true; generation++; selected=null; if(inventory) for(const track of inventory.tracks) track.samples=[]; return rpc.cleanup(); };
  try {
    let p=0,moov=null; const mdatRanges=[];
    for(let n=0;p<rpc.size;n++) { demand(n<256,'TOP_BOX_LIMIT'); const b=await rpc.exact(p,Math.min(16,rpc.size-p)); demand(b.length>=8,'BOX_HEADER'); let length=u32(b,0),header=8;
      if(length===1) { demand(b.length>=16,'BOX_HEADER'); length=u64(b,8); header=16; } else if(!length) length=rpc.size-p;
      const end=safe(p+length); demand(length>=header&&end<=rpc.size,'BOX_BOUNDS'); const type=fourcc(b,4); demand(!FORBIDDEN.includes(type),'FEATURE_UNSUPPORTED');
      if(type==='moov') { demand(!moov&&length<=SUBTITLE_LIMITS.metadataBytes,'METADATA_LIMIT'); moov=await rpc.exact(p,length); }
      if(type==='mdat') mdatRanges.push([p+header,end]); p=end;
    }
    demand(moov,'CONTAINER_UNSUPPORTED'); inventory=inspectSubtitleMoov(moov,{size:rpc.size,mdatRanges}); rpc.beginStreaming();
    const tracks=Object.freeze(inventory.tracks.map(({samples,...track})=>Object.freeze(track)));
    return {tracks,metrics:rpc.metrics,get selectedTrackId(){return selected;},
      select(trackId) { rpc.check(); demand(!disposed,'CANCELLED'); if(trackId!==null) { const track=inventory.tracks.find(t=>t.trackId===trackId); demand(track,'TRACK_UNKNOWN'); demand(track.supported,'CODEC_UNSUPPORTED'); } selected=trackId; generation++; },
      async cuesAt(time,{before=0,after=1}={}) {
        rpc.check(); demand(!disposed,'CANCELLED'); demand(Number.isFinite(time)&&time>=0&&Number.isFinite(before)&&before>=0&&Number.isFinite(after)&&after>=0&&before+after<=SUBTITLE_LIMITS.windowSeconds,'WINDOW_LIMIT');
        if(selected===null)return []; demand(!inFlight,'READ_BUSY'); inFlight=true; const token=generation,track=inventory.tracks.find(t=>t.trackId===selected);
        try {
          const start=Math.max(0,time-before),end=time+after,window=track.samples.filter(s=>s.endTime>start&&s.startTime<=end&&s.endTime>s.startTime);
          demand(window.length<=SUBTITLE_LIMITS.windowSamples,'WINDOW_SAMPLE_LIMIT'); demand(window.reduce((n,s)=>n+s.length,0)<=SUBTITLE_LIMITS.windowBytes,'WINDOW_BYTE_LIMIT'); const cues=[];
          for(const sample of window) { rpc.check(); demand(token===generation&&!disposed,'STALE_SELECTION'); const bytes=await rpc.exact(sample.offset,sample.length); rpc.check(); demand(token===generation&&!disposed,'STALE_SELECTION'); const text=decodeTx3gSample(bytes); if(text)cues.push({trackId:track.trackId,startTime:sample.startTime,endTime:sample.endTime,text}); }
          return cues;
        } finally { inFlight=false; }
      },dispose,cleanup:dispose};
  } catch(error) { await dispose(); throw error; }
}
