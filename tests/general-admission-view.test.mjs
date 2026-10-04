import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectGeneralMoov} from '../media/general-admission.mjs';

test('native AAC admission reuses one view while respecting a nonzero byte offset',()=>{
 const bytes=readFileSync(new URL('../qa/faststart-h264-aac.mp4',import.meta.url));
 let at=0;
 while(bytes.toString('ascii',at+4,at+8)!=='moov')at+=bytes.readUInt32BE(at);
 const metadata=bytes.subarray(at,at+bytes.readUInt32BE(at));
 const padded=new Uint8Array(metadata.length+23);
 padded.set(metadata,17);
 const offsetMetadata=padded.subarray(17,17+metadata.length);
 const expected=inspectGeneralMoov(metadata);
 const OriginalDataView=globalThis.DataView;
 let views=0;
 globalThis.DataView=new Proxy(OriginalDataView,{construct(target,args,newTarget){
  views++;
  return Reflect.construct(target,args,newTarget);
 }});
 try {
  assert.deepEqual(inspectGeneralMoov(offsetMetadata),expected);
  assert.equal(views,1);
 } finally {globalThis.DataView=OriginalDataView;}
});
