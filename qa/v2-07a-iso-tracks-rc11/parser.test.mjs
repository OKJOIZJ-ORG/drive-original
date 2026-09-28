import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoov,MAX_MOOV_BYTES} from './parser.mjs';
import {moovFixture} from './fixtures.mjs';
test('video/audio sample descriptions report structural fields without decoder claims',()=>{
  const r=parseMoov(moovFixture({audio:true}));assert.equal(r.status,'parsed');assert.equal(r.tracks.length,2);
  assert.equal(r.tracks[0].descriptions[0].config.avcC.profile,100);assert.equal(r.tracks[0].width,640);
  assert.equal(r.tracks[1].descriptions[0].sampleRate,48000);assert.deepEqual(r.tracks[1].descriptions[0].config.esds.audioSpecificConfig,{objectType:2,freqIndex:3,channelConfig:2});assert.equal(r.decode,false);
});
test('truncated and overdeclared moov fail closed',()=>{const v=moovFixture();assert.equal(parseMoov(v.subarray(0,v.length-1)).status,'incomplete');const b=Buffer.from(v);b.writeUInt32BE(v.length+20);assert.equal(parseMoov(b).code,'INVALID_BOX_SIZE');});
test('cap and duplicate track IDs reject',()=>{assert.equal(parseMoov(new Uint8Array(MAX_MOOV_BYTES+1)).code,'MOOV_SIZE_LIMIT');assert.equal(parseMoov(moovFixture({audio:true,duplicate:true})).code,'DUPLICATE_TRACK_ID');});
test('encrypted/fragmented/rotated metadata carries limitations',()=>{const r=parseMoov(moovFixture({encrypted:true,fragmented:true,rotation:true}));assert.equal(r.fragmented,true);assert.equal(r.tracks[0].descriptions[0].encrypted,true);assert.ok(r.limitations.includes('nonidentity-track-matrix-unqualified'));});
test('QuickTime extended audio is explicitly unimplemented',()=>{const r=parseMoov(moovFixture({audio:true,quicktime:true}));assert.equal(r.tracks[1].descriptions[0].config,null);assert.ok(r.limitations.includes('quicktime-audio-version-unimplemented'));});
test('unknown sample-entry type never exports arbitrary bytes as a codec',()=>{const b=Buffer.from(moovFixture());b.write('SECR',b.indexOf('avc1'));const r=parseMoov(b);assert.equal(r.tracks[0].descriptions[0].codec,'unknown');assert.ok(r.limitations.includes('sample-entry-layout-unimplemented'));assert.ok(!JSON.stringify(r).includes('SECR'));});
test('stsd count and missing avcC reject',()=>{const b=Buffer.from(moovFixture());b.writeUInt32BE(2,b.indexOf('stsd')+8);assert.equal(parseMoov(b).code,'SAMPLE_DESCRIPTION_COUNT');const c=Buffer.from(moovFixture());c.write('free',c.indexOf('avcC'));assert.equal(parseMoov(c).code,'MISSING_CODEC_CONFIG');});
