const demand=ok=>{if(!ok)throw new Error('FRAGMENT_CLOCK_UNPROVEN');};
// Pinned mux.js fragment validator. Every output video timestamp must equal the
// observed source timestamp. Only the last duration lacks mux lookahead; bind it
// to the already-observed next DTS (or the explicit EOF duration estimate).
// Box lengths, sample data, timestamps, audio and media payloads are unchanged.
export function bindFragmentClock(bytes,{videoTrackId,samples,nextDts=null}={}){
  demand(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=2*1024*1024
    &&Number.isInteger(videoTrackId)&&Array.isArray(samples)&&samples.length>=3&&samples.length<=4096);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let count=0,matched=0;
  function boxes(start,end){const result=[];for(let offset=start;offset<end;){
    demand(offset+8<=end&&++count<=64);const size=view.getUint32(offset);
    demand(size>=8&&offset+size<=end);
    result.push({offset,end:offset+size,type:String.fromCharCode(...bytes.subarray(offset+4,offset+8))});offset+=size;
  }return result;}
  const one=(items,type)=>{const found=items.filter(b=>b.type===type);demand(found.length===1);return found[0];};
  const top=boxes(0,bytes.length);
  demand(top.length>=2&&top.length<=4&&top.every((box,i)=>box.type===(i%2?'mdat':'moof')));
  let patchOffset=null,patchDuration=null;
  for(const moof of top.filter(b=>b.type==='moof')) for(const traf of boxes(moof.offset+8,moof.end).filter(b=>b.type==='traf')){
    const items=boxes(traf.offset+8,traf.end),tfhd=one(items,'tfhd');demand(tfhd.offset+16<=tfhd.end);
    if(view.getUint32(tfhd.offset+12)!==videoTrackId)continue;
    demand(++matched===1);const tfdt=one(items,'tfdt'),trun=one(items,'trun');
    demand(tfdt.offset+16<=tfdt.end&&[0,1].includes(bytes[tfdt.offset+8]));
    const v=bytes[tfdt.offset+8];if(v===1)demand(tfdt.offset+20===tfdt.end);else demand(tfdt.offset+16===tfdt.end);
    let dts=v===1?view.getUint32(tfdt.offset+12)*2**32+view.getUint32(tfdt.offset+16):view.getUint32(tfdt.offset+12);
    demand(trun.offset+16<=trun.end&&[0,1].includes(bytes[trun.offset+8]));
    const flags=view.getUint32(trun.offset+8)&0xffffff;
    demand((flags&0xf00)===0xf00&&(flags&~0xf05)===0&&view.getUint32(trun.offset+12)===samples.length);
    let cursor=trun.offset+16+(flags&1?4:0)+(flags&4?4:0);
    demand(cursor+samples.length*16===trun.end);
    for(let i=0;i<samples.length;i++,cursor+=16){
      const duration=view.getUint32(cursor),composition=bytes[trun.offset+8]===1?view.getInt32(cursor+12):view.getUint32(cursor+12);
      demand(dts===samples[i].dts&&dts+composition===samples[i].pts&&view.getUint32(cursor+4)>0);
      if(i+1<samples.length)demand(duration===samples[i+1].dts-samples[i].dts&&duration>0&&duration<=90000);
      else {patchOffset=cursor;patchDuration=(nextDts??(samples[i].dts+samples[i].dts-samples[i-1].dts))-samples[i].dts;
        demand(Number.isSafeInteger(patchDuration)&&patchDuration>0&&patchDuration<=90000);}
      dts+=duration;
    }
  }
  demand(matched===1&&patchOffset!==null);view.setUint32(patchOffset,patchDuration);
  return bytes;
}
