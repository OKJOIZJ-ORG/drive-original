// Bounded structural metadata only. No decoder/capability or sample-table verdict.
export const MAX_MOOV_BYTES = 2 * 1024 * 1024;
const error = code => { throw Object.assign(new Error(code), { code }); };
const knownCodecs = new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4a','Opus','ac-3','ec-3','alac','fLaC','enca','encv','tx3g','wvtt','stpp']);
export function parseMoov(input) {
  let count=0, descriptorCount=0, tracks=[];
  const limitations=new Set(['sample-tables-unparsed','sample-payloads-unread','decode-and-capability-unproven','hdr-vfr-subtitles-unqualified']);
  const report=(status,code,fragmented=null)=>({schema:'drive-original.iso-tracks/1',status,code,fragmented,tracks,
    boxesParsed:count,limitations:[...limitations],containerValidityProven:false,decode:false,playback:false});
  try {
    if(!(input instanceof Uint8Array)||input.byteLength<8||input.byteLength>MAX_MOOV_BYTES)error('MOOV_SIZE_LIMIT');
    const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
    const need=(offset,n,end=input.length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+n>end)error('TRUNCATED_FIELD');};
    const u16=(p,end)=>{need(p,2,end);return view.getUint16(p);};
    const u32=(p,end)=>{need(p,4,end);return view.getUint32(p);};
    const type=p=>String.fromCharCode(...input.subarray(p,p+4));
    const boxes=(start,end)=>{
      const out=[];
      for(let p=start;p<end;){
        if(++count>4096)error('BOX_LIMIT');need(p,8,end);
        let size=u32(p,end),header=8;
        if(size===1){need(p,16,end);const n=view.getBigUint64(p+8);if(n>BigInt(MAX_MOOV_BYTES))error('BOX_SIZE_LIMIT');size=Number(n);header=16;}
        if(size===0)size=end-p;
        if(size<header||p+size>end)error('INVALID_BOX_SIZE');
        out.push({type:type(p+4),start:p,body:p+header,end:p+size});p+=size;
      }
      return out;
    };
    const one=(list,t,required=true)=>{const found=list.filter(b=>b.type===t);if(found.length>1||(!found.length&&required))error('MISSING_OR_DUPLICATE_BOX');return found[0]??null;};
    const full=(box,versions=[0])=>{need(box.body,4,box.end);const v=input[box.body];if(!versions.includes(v))error('UNSUPPORTED_BOX_VERSION');return v;};
    const configs=(entry,start)=>{
      const result={};
      for(const b of boxes(start,entry.end)){
        if(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','sinf','pasp','colr'].includes(b.type)){
          if(result[b.type])error('DUPLICATE_CODEC_CONFIG');
          result[b.type]={present:true,bytes:b.end-b.body};
          if(b.type==='avcC'){need(b.body,5,b.end);if(input[b.body]!==1)error('INVALID_AVCC');Object.assign(result[b.type],{profile:input[b.body+1],compatibility:input[b.body+2],level:input[b.body+3],lengthSize:(input[b.body+4]&3)+1});limitations.add('avcc-parameter-sets-unparsed');}
          else if(b.type==='hvcC'){need(b.body,23,b.end);if(input[b.body]!==1)error('INVALID_HVCC');Object.assign(result[b.type],{profileIdc:input[b.body+1]&31,levelIdc:input[b.body+12],bitDepthLuma:8+(input[b.body+17]&7),bitDepthChroma:8+(input[b.body+18]&7)});limitations.add('hvcc-arrays-unparsed');}
          else if(b.type==='esds'){
            full(b);const descriptor=(p,end,depth=0)=>{
              if(depth>4)error('DESCRIPTOR_DEPTH');let asc=null;
              while(p<end){if(++descriptorCount>4096)error('DESCRIPTOR_LIMIT');need(p,2,end);const tag=input[p++];let n=0,k=0,more;
                do{need(p,1,end);const v=input[p++];more=v&128;n=n*128+(v&127);if(++k>4)error('INVALID_DESCRIPTOR_LENGTH');}while(more);
                need(p,n,end);const next=p+n;
                if(tag===3){need(p,3,next);const flags=input[p+2];p+=3;if(flags&128){need(p,2,next);p+=2;}if(flags&64){need(p,1,next);const len=input[p++];need(p,len,next);p+=len;}if(flags&32){need(p,2,next);p+=2;}asc=descriptor(p,next,depth+1)??asc;}
                else if(tag===4){need(p,13,next);result.esds.objectTypeIndication=input[p];asc=descriptor(p+13,next,depth+1)??asc;}
                else if(tag===5){need(p,2,next);const a=input[p],c=input[p+1],objectType=a>>3,freqIndex=((a&7)<<1)|(c>>7),channelConfig=(c>>3)&15;
                  asc={objectType,freqIndex,channelConfig};if(objectType===31||freqIndex===15||![1,2,3,4].includes(objectType)||channelConfig===0)limitations.add('complex-audio-specific-config-unparsed');}
                p=next;
              }return asc;
            };result.esds.audioSpecificConfig=descriptor(b.body+4,b.end);limitations.add('audio-specific-config-extension-bits-unparsed');
          } else if(b.type==='sinf')limitations.add('encrypted-sample-entry-unqualified');
          else if(b.type==='colr')limitations.add('color-description-unparsed');
        } else limitations.add('unknown-sample-entry-child');
      }return result;
    };
    const top=boxes(0,input.length);if(top.length!==1||top[0].type!=='moov')error('EXPECTED_EXACT_MOOV');
    const children=boxes(top[0].body,top[0].end),fragmented=children.some(b=>b.type==='mvex');
    if(fragmented)limitations.add('fragment-defaults-and-fragments-unparsed');
    const traks=children.filter(b=>b.type==='trak');if(!traks.length||traks.length>32)error('TRACK_COUNT_LIMIT');
    const ids=new Set();
    for(const trak of traks){
      const tc=boxes(trak.body,trak.end),tk=one(tc,'tkhd'),tv=full(tk,[0,1]);
      const id=u32(tk.body+(tv===1?20:12),tk.end);if(!id||ids.has(id))error('DUPLICATE_TRACK_ID');ids.add(id);
      const dim=tk.body+(tv===1?88:76),width=u32(dim,tk.end)/65536,height=u32(dim+4,tk.end)/65536;
      const matrix=tk.body+(tv===1?52:40);need(matrix,36,tk.end);
      const identityMatrix=[65536,0,0,0,65536,0,0,0,1073741824].every((v,i)=>view.getInt32(matrix+i*4)===v);
      if(!identityMatrix)limitations.add('nonidentity-track-matrix-unqualified');
      if(tc.some(b=>b.type==='edts'))limitations.add('edit-list-unparsed');
      const mdia=one(tc,'mdia'),mc=boxes(mdia.body,mdia.end),hd=one(mc,'hdlr');full(hd);need(hd.body+8,4,hd.end);
      const rawHandler=type(hd.body+8),handler=['vide','soun','subt','text','sbtl','meta','hint'].includes(rawHandler)?rawHandler:'unknown';
      const mh=one(mc,'mdhd'),mv=full(mh,[0,1]),time=mh.body+(mv===1?20:12),timescale=u32(time,mh.end);if(!timescale)error('INVALID_TIMESCALE');
      const minf=one(mc,'minf'),stbl=one(boxes(minf.body,minf.end),'stbl'),stsd=one(boxes(stbl.body,stbl.end),'stsd');full(stsd);
      const entries=boxes(stsd.body+8,stsd.end);if(u32(stsd.body+4,stsd.end)!==entries.length||entries.length<1||entries.length>16)error('SAMPLE_DESCRIPTION_COUNT');
      const descriptions=entries.map(entry=>{
        need(entry.body,8,entry.end);const raw=entry.type,codec=knownCodecs.has(raw)?raw:'unknown',encrypted=['enca','encv'].includes(raw);
        const out={codec,encrypted,dataReferenceIndex:u16(entry.body+6,entry.end)};
        if(out.dataReferenceIndex!==1)limitations.add('nondefault-data-reference-unqualified');
        if(encrypted)limitations.add('encrypted-sample-entry-unqualified');
        if(handler==='vide'&&['avc1','avc3','hvc1','hev1','av01','vp09','encv'].includes(raw)){
          need(entry.body,78,entry.end);out.width=u16(entry.body+24,entry.end);out.height=u16(entry.body+26,entry.end);out.config=configs(entry,entry.body+78);
          const required={avc1:'avcC',avc3:'avcC',hvc1:'hvcC',hev1:'hvcC',av01:'av1C',vp09:'vpcC'}[raw];if(required&&!out.config[required])error('MISSING_CODEC_CONFIG');
        }else if(handler==='soun'&&['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca'].includes(raw)){
          need(entry.body,28,entry.end);const version=u16(entry.body+8,entry.end);out.soundVersion=version;
          out.channels=u16(entry.body+16,entry.end);out.sampleSize=u16(entry.body+18,entry.end);out.sampleRate=u32(entry.body+24,entry.end)/65536;
          if(version!==0){limitations.add('quicktime-audio-version-unimplemented');out.config=null;}else{out.config=configs(entry,entry.body+28);if(raw==='mp4a'&&!out.config.esds)limitations.add('mp4a-esds-missing');}
        }else limitations.add('sample-entry-layout-unimplemented');
        return out;
      });
      tracks.push({type:handler,width,height,identityMatrix,timescale,descriptions});
    }
    return report('parsed','STRUCTURAL_METADATA_ONLY',fragmented);
  }catch(e){return report('incomplete',e?.code??'INVALID_INPUT');}
}
