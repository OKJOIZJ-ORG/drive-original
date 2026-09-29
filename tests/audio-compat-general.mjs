import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGeneralMoov,admitGeneralInput} from '../media/general-admission.mjs';
import {streamGeneralQ2} from '../media/audio-general-pipeline.mjs';
const box=(name,...parts)=>{const b=Buffer.concat([Buffer.alloc(8),...parts]);b.writeUInt32BE(b.length);b.write(name,4);return b;};
function moov(codec){const entry=Buffer.alloc(36);entry.writeUInt32BE(36);entry.write(codec,4);entry[15]=1;const count=Buffer.alloc(8);count.writeUInt32BE(1,4);const reference=Buffer.from('00000001000000010000000c75726c2000000001','hex');return box('moov',box('trak',box('mdia',box('minf',box('dinf',box('dref',reference)),box('stbl',box('stsd',count,entry),box('stts',Buffer.alloc(8)),box('stsz',Buffer.alloc(12)))))));}
for(const codec of ['ac-3','ec-3'])test(`Q2 ${codec} admission requires explicit opt-in and preserves allocation guards`,async()=>{
 const b=moov(codec);assert.throws(()=>inspectGeneralMoov(b),/GENERAL_CODEC_UNQUALIFIED/);
 const admitted=inspectGeneralMoov(b,{audioCodecs:['ac-3','ec-3']});assert.deepEqual(admitted.samples,[0]);
 const rpc={size:b.length,exact:async(p,n)=>b.subarray(p,p+n)};assert.equal((await admitGeneralInput(rpc,{audioCodecs:[codec]})).kind,'iso');
 const bad=Buffer.from(b),stsz=bad.indexOf(Buffer.from('stsz'));bad.writeUInt32BE(65537,stsz+12);assert.throws(()=>inspectGeneralMoov(bad,{audioCodecs:[codec]}),/GENERAL_EXPANDED_INDEX_LIMIT/);
});
test('default AAC admission unchanged; unknown audio entries never become opt-in',()=>{assert.equal(inspectGeneralMoov(moov('mp4a')).tracks,1);assert.throws(()=>inspectGeneralMoov(moov('enca'),{audioCodecs:['enca']}),/GENERAL_AUDIO_ADMISSION_OPTIONS/);assert.throws(()=>inspectGeneralMoov(moov('mp4a'),{audioCodecs:['ac-3','ec-3']}),/GENERAL_CODEC_UNQUALIFIED/);});
test('Q2 container failure drains source without producing a window or output',async()=>{let closed=0;const b=moov('mp4a');await assert.rejects(streamGeneralQ2({source:{identity:{size:b.length},read:async({start,end})=>b.slice(start,end+1),abort:async()=>{closed++;return{settled:true};}},onWindow(){assert.fail('unexpected window');},onChunk(){assert.fail('unexpected output');}}),/GENERAL_CODEC_UNQUALIFIED/);assert.equal(closed,1);});
