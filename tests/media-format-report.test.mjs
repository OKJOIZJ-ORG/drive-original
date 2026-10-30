import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,inspectFtypBrands,inspectTsPrefix,mismatchReasons} from '../qa/media-format-report.mjs';
import {crc32Mpeg2} from '../qa/v2-07a-container-probe/mpeg-ts-probe.mjs';
const section=hex=>{const body=Buffer.from(hex,'hex'),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32Mpeg2(body));return Buffer.concat([body,crc]);};
function header({audio=15,corrupt=false,pmt=true}={}){
 const bytes=Buffer.alloc(940,255);
 for(let p=0;p<940;p+=188)bytes.set([0x47,0x1f,0xff,0x10],p);
 const pat=section('00b00d0001c100000001f000');bytes.set([0x47,0x40,0,0x10,0],0);bytes.set(pat,5);
 if(pmt){const raw=Buffer.from('02b0170001c10000e100f0001be100f0000fe101f000','hex');raw[17]=audio;
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32Mpeg2(raw));const table=Buffer.concat([raw,crc]);if(corrupt)table[table.length-1]^=1;
  bytes.set([0x47,0x50,0,0x10,0],188);bytes.set(table,193);}
 return bytes.toString('base64');
}
test('TS prefix distinguishes CRC-validated strict topology, other streams, missing PSI and corruption',()=>{
 const good=inspectTsPrefix(header());assert.equal(good.status,'strict-topology-compatible');assert.equal(good.crcValidatedSections,2);
 assert.deepEqual(good.programs[0].streams.map(s=>s.streamType),[27,15]);
 assert.equal(inspectTsPrefix(header({audio:129})).status,'strict-topology-unsupported');
 assert.equal(inspectTsPrefix(header({pmt:false})).status,'psi-incomplete');
 const bad=inspectTsPrefix(header({corrupt:true}));assert.equal(bad.status,'prefix-invalid');assert.ok(bad.issues.some(i=>i.code==='PSI_CRC_MISMATCH'));
 assert.equal(inspectTsPrefix().status,'header-unavailable');assert.equal(inspectTsPrefix(Buffer.alloc(1025).toString('base64')).status,'header-invalid');
});
test('unknown sidecars are not mismatches, ISO overlap is accepted, image/video family mismatch is separate',()=>{
 assert.deepEqual(mismatchReasons({name:'fixture.srt',mimeType:'application/octet-stream'},{kind:'unknown'}).reasons,[]);
 assert.equal(mismatchReasons({name:'fixture.mov',mimeType:'video/quicktime'},{kind:'iso'}).extensionMismatch,false);
 assert.equal(mismatchReasons({name:'fixture.mp4',mimeType:'video/mp4'},{kind:'quicktime'}).extensionMismatch,false);
 const audio=mismatchReasons({name:'fixture.m4a',mimeType:'audio/mp4'},{kind:'iso'});assert.equal(audio.extensionMismatch,false);assert.equal(audio.actualFamily,null);
 const ts=mismatchReasons({name:'fixture.mkv',mimeType:'video/x-matroska'},{kind:'ts'});assert.equal(ts.extensionMismatch,true);assert.equal(ts.declaredFamilyMismatch,false);
 const jpeg=mismatchReasons({name:'fixture.bmp',mimeType:'image/bmp'},{kind:'jpeg'});assert.equal(jpeg.extensionMismatch,true);assert.equal(jpeg.declaredFamilyMismatch,false);
 assert.equal(mismatchReasons({name:'fixture.jpg',mimeType:'video/mp4'},{kind:'jpeg'}).declaredFamilyMismatch,true);
 assert.equal(mismatchReasons({name:'fixture.jpg',mimeType:'image/jpeg'},{kind:'heif'}).extensionMismatch,true);
 assert.equal(mismatchReasons({name:'fixture.m2ts',mimeType:'video/mp2t'},{kind:'m2ts'}).extensionMismatch,false);
 assert.equal(mismatchReasons({name:'fixture.mov',mimeType:'video/quicktime'},{kind:'iso-no-ftyp'}).extensionMismatch,false);
});
function ftyp(major,compatible=[]){
 const bytes=Buffer.alloc(16+compatible.length*4);bytes.writeUInt32BE(bytes.length);bytes.write('ftyp',4,'ascii');bytes.write(major,8,'ascii');
 compatible.forEach((brand,index)=>bytes.write(brand,16+index*4,'ascii'));return bytes;
}
test('complete ftyp brands identify only definite QuickTime/MP4 extension conflicts',()=>{
 const qtOnly=ftyp('qt  ',['qt  ']).toString('hex');
 const qtMajorOnly=ftyp('qt  ').toString('hex');
 const mp4=ftyp('mp42',['mp42','mp41','iso4']).toString('hex');
 const mixed=ftyp('mp42',['qt  ','mp42']).toString('hex');
 const quicktime=mismatchReasons({name:'fixture.mp4',mimeType:'video/mp4'},{kind:'quicktime',signature:qtOnly});
 assert.deepEqual(quicktime.ftypBrands,{size:20,majorBrand:'qt  ',compatibleBrands:['qt  '],hasQuickTime:true,hasMp4:false});
 assert.equal(quicktime.extensionMismatch,true);assert.ok(quicktime.reasons.includes('extension-mp4-versus-quicktime-branded'));
 assert.equal(inspectFtypBrands(qtMajorOnly).hasQuickTime,false); // QuickTime compatibility is declared by compatibleBrands.
 const mp4AsMov=mismatchReasons({name:'fixture.mov',mimeType:'video/quicktime'},{kind:'iso',signature:mp4});
 assert.equal(mp4AsMov.extensionMismatch,true);assert.ok(mp4AsMov.reasons.includes('extension-mov-versus-mp4-branded'));
 assert.equal(mismatchReasons({name:'fixture.mov'},{kind:'iso',signature:mixed}).extensionMismatch,false);
 assert.equal(mismatchReasons({name:'fixture.mp4'},{kind:'iso',signature:mixed}).extensionMismatch,false);
});
test('truncated, malformed, absent, and unknown ftyp brands stay ambiguous; M4A is not classified as video',()=>{
 const complete=ftyp('mp42',['mp42','mp41','iso4']);
 const unrecognized=ftyp('zzzz',['abcd']).toString('hex');
 const truncated=complete.subarray(0,20).toString('hex');
 assert.equal(inspectFtypBrands(truncated),null);
 assert.ok(inspectFtypBrands(complete.toString('hex')+'00000000')); // Bytes after the 30-byte signature prefix are ignored.
 assert.equal(inspectFtypBrands(ftyp('mp42',['mp42','mp41','iso4','mif1']).toString('hex')),null); // The full box exceeds the 30-byte prefix.
 assert.equal(inspectFtypBrands('00000015667479706d70343200000000'),null); // unaligned size
 assert.equal(inspectFtypBrands('00000020667479706d70343200000000'),null); // declared box exceeds prefix
 assert.equal(inspectFtypBrands('000000146e6f70656d70343200000000'),null); // not ftyp
 assert.equal(mismatchReasons({name:'fixture.mov'},{kind:'iso',signature:truncated}).extensionMismatch,false);
 assert.equal(mismatchReasons({name:'fixture.mov'},{kind:'iso'}).extensionMismatch,false);
 const unknown=mismatchReasons({name:'fixture.mov'},{kind:'iso',signature:unrecognized});
 assert.equal(unknown.extensionMismatch,false);assert.equal(unknown.ftypBrands.hasQuickTime,false);assert.equal(unknown.ftypBrands.hasMp4,false);
 const m4a=mismatchReasons({name:'fixture.m4a',mimeType:'audio/mp4'},{kind:'iso',signature:complete.toString('hex')});
 assert.equal(m4a.extensionMismatch,false);assert.equal(m4a.actualFamily,null);
});
test('redacted summary contains counts only and snapshot coverage is explicit',()=>{
 const inventory={folders:[{id:'PRIVATE_FOLDER',path:'PRIVATE_PATH'}],files:[{id:'PRIVATE_ID',name:'PRIVATE_NAME.mp4',mimeType:'video/mp4',folder:'PRIVATE_FOLDER'},
  {id:'UNREAD',name:'UNREAD.srt',mimeType:'application/octet-stream'}]};
 const {summary,rows,witnesses,mismatchRows}=buildReport(inventory,{phase:'sniffing',total:2,results:[{id:'PRIVATE_ID',kind:'ts',transportHeader:header()}]});
 assert.equal(summary.inspectedFiles,1);assert.equal(summary.uninspectedFiles,1);assert.equal(summary.extensionMismatches,1);assert.equal(summary.sidecarCandidates,1);
 assert.equal(summary.tsMetadata['strict-topology-compatible'],1);assert.equal(rows[0].folder,'PRIVATE_PATH');assert.equal(witnesses.length,1);
 assert.equal(mismatchRows.length,1);assert.equal(mismatchRows[0].extensionMismatch,true);assert.ok(!mismatchRows.some(row=>row.extension==='srt'));
 assert.doesNotMatch(JSON.stringify(summary),/PRIVATE_|UNREAD/);
});
