export const cat=(...a)=>Buffer.concat(a.map(x=>Buffer.from(x)));
export const box=(type,...parts)=>{const p=cat(...parts),head=Buffer.alloc(8);head.writeUInt32BE(p.length+8);head.write(type,4,'ascii');return cat(head,p);};
const full=(type,...parts)=>box(type,Buffer.alloc(4),...parts);
export function moovFixture({audio=false,encrypted=false,quicktime=false,fragmented=false,duplicate=false,rotation=false}={}){
  const track=(audio,id)=>{
    const tk=Buffer.alloc(84);tk.writeUInt32BE(id,12);[65536,0,0,0,65536,0,0,0,1073741824].forEach((v,i)=>tk.writeInt32BE(v,40+i*4));if(rotation)tk.writeInt32BE(0,40);tk.writeUInt32BE(640*65536,76);tk.writeUInt32BE(360*65536,80);
    const md=Buffer.alloc(24);md.writeUInt32BE(48000,12);const hd=Buffer.alloc(12);hd.write(audio?'soun':'vide',8);
    let entry;
    if(audio){const base=Buffer.alloc(28);base.writeUInt16BE(1,6);base.writeUInt16BE(quicktime?1:0,8);base.writeUInt16BE(2,16);base.writeUInt16BE(16,18);base.writeUInt32BE(48000*65536,24);
      const asc=Buffer.from([5,2,0x11,0x90]),dc=cat([0x40,0x15],Buffer.alloc(11),asc),es=cat([0,1,0],[4,dc.length],dc);
      entry=box(encrypted?'enca':'mp4a',base,full('esds',[3,es.length],es));
    }else{const base=Buffer.alloc(78);base.writeUInt16BE(1,6);base.writeUInt16BE(640,24);base.writeUInt16BE(360,26);entry=box(encrypted?'encv':'avc1',base,box('avcC',[1,100,0,31,255]));}
    const n=Buffer.alloc(4);n.writeUInt32BE(1);return box('trak',box('tkhd',tk),box('mdia',box('mdhd',md),box('hdlr',hd),box('minf',box('stbl',full('stsd',n,entry)))));
  };
  return box('moov',track(false,1),...(audio?[track(true,duplicate?1:2)]:[]),...(fragmented?[box('mvex')]:[]));
}
