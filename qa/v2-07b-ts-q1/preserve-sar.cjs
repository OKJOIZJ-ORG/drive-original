'use strict';
// mux.js defaults absent SPS SAR to 1:1 and emits pasp. Only call this when
// independent source metadata confirms SAR was unspecified. Retain the exact
// SPS and every byte/offset; turn just that introduced pasp into padding.
function preserveUnspecifiedSar(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 8 || input.byteLength > 2*1024*1024) throw new Error('Invalid init segment');
  const output = Uint8Array.from(input);
  const view = new DataView(output.buffer);
  let boxes = 0; let changes = 0;
  const typeAt = offset => String.fromCharCode(...output.subarray(offset+4,offset+8));
  const paths = { '':'moov', moov:'trak', 'moov/trak':'mdia', 'moov/trak/mdia':'minf',
    'moov/trak/mdia/minf':'stbl', 'moov/trak/mdia/minf/stbl':'stsd',
    'moov/trak/mdia/minf/stbl/stsd':'avc1' };
  function visit(start,end,parent) {
    for (let offset=start; offset<end;) {
      if (offset+8>end || ++boxes>128) throw new Error('Truncated or excessive init boxes');
      const size=view.getUint32(offset); const type=typeAt(offset);
      if (size<8 || offset+size>end) throw new Error('Unsupported init box size');
      const current=parent ? `${parent}/${type}` : type;
      if (parent==='moov/trak/mdia/minf/stbl/stsd/avc1' && type==='pasp') {
        if (size!==16 || view.getUint32(offset+8)!==1 || view.getUint32(offset+12)!==1 || changes) throw new Error('Unexpected aspect ratio box');
        output.set([102,114,101,101],offset+4); // free; do not touch payload/sizes
        changes++;
      } else if (paths[parent]===type) {
        const skip=type==='stsd' ? 16 : type==='avc1' ? 86 : 8;
        if (size<skip || (type==='stsd' && view.getUint32(offset+12)!==1)) throw new Error('Unsupported sample entry');
        visit(offset+skip,offset+size,current);
      }
      offset+=size;
    }
  }
  visit(0,output.length,'');
  if (changes!==1) throw new Error('Expected exactly one introduced pasp');
  return output;
}
module.exports={preserveUnspecifiedSar};
