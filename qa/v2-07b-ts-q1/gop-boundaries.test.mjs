import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { analyzeGopBoundaries } from './gop-boundaries.mjs';
const require = createRequire(import.meta.url);
const { initTracks, transmuxAtCuts, decode } = require('./incremental-probe.cjs');
const { decode: decodeBounded } = require('./preservation-probe.cjs');
const input = readFileSync(new URL('./synthetic-bframes-audiolead.ts', import.meta.url));
const baseline = analyzeGopBoundaries(input);

import { variant, crossAdts, vfr, delayedAudio, shiftTimestamp } from './synthetic-variants.mjs';

test('complete public CFR clip yields cuts BEFORE verified IDR PES, independent of random-access flags', () => {
  assert.deepEqual(baseline.cuts,[156228,322044,481092,643524,800692]);
  assert.equal(baseline.videoFrames,360);assert.equal(baseline.aacFrames,564);assert.equal(baseline.dtsStep,3000);
  assert.equal(baseline.largestWindowBytes,165816);
  const withoutFlags=Buffer.from(input);
  for(let i=0;i<withoutFlags.length;i+=188)if(withoutFlags[i+3]&32&&withoutFlags[i+4])withoutFlags[i+5]&=~64;
  assert.deepEqual(analyzeGopBoundaries(withoutFlags).cuts,baseline.cuts);
});

test('bounds, malformed transport, discontinuity and continuity gaps cannot produce admitted cuts', () => {
  for(const bytes of [new Uint8Array(),input.subarray(1),new Uint8Array(5*1024*1024)])assert.throws(()=>analyzeGopBoundaries(bytes));
  for(const maxWindowBytes of [187,0,NaN,Infinity,4*1024*1024+1,1000])assert.throws(()=>analyzeGopBoundaries(input,{maxWindowBytes}));
  const start=baseline.frames[2].offset;
  for(const change of [b=>b[start+1]|=128,b=>b[start+3]|=128,b=>b[start+3]^=1,b=>b[start+5]|=128]){
    const bytes=Buffer.from(input);change(bytes);assert.throws(()=>analyzeGopBoundaries(bytes));
  }
});

test('repacketized control is eligible; VFR and complete-PES/partial-ADTS counterexamples fail closed', () => {
  assert.equal(analyzeGopBoundaries(variant().bytes).videoFrames,360);
  assert.throws(()=>analyzeGopBoundaries(vfr().bytes),/VFR_OR_DISCONTINUITY_UNPROVEN/);
  assert.throws(()=>analyzeGopBoundaries(crossAdts().bytes),/ADTS_CROSS_PES_UNPROVEN/);
});

test('each declared track must have samples in every flush; combined event is not sufficient', () => {
  const delayed=delayedAudio();
  assert.throws(()=>analyzeGopBoundaries(delayed.bytes),/EACH_FRAGMENT_NEEDS_BOTH_TRACKS/);
  assert.throws(()=>transmuxAtCuts(delayed.bytes,delayed.cuts),/QA_INIT_TRACK_IDENTITY/);
});

test('real incremental init contains unique expected tracks and one data fragment per admitted interval', () => {
  const result=transmuxAtCuts(input,baseline.cuts);
  assert.equal(result.fragments,6);
  const tracks=initTracks(result.bytes.subarray(0,result.bytes.indexOf(Buffer.from('moof'))-4));
  assert.deepEqual(tracks.map(track=>track.id).sort((a,b)=>a-b),[baseline.videoPid,baseline.audioPid]);
  for(const cuts of [[0],[188,188],[input.length],[189],[-188]])assert.throws(()=>transmuxAtCuts(input,cuts),/QA_CUTS/);
});

test('parameter changes in a later GOP are rejected', () => {
  const changed=variant(records=>{
    const secondIdr=records.find(record=>record.videoIndex===60);
    const header=9+secondIdr.data[8];
    const bytes=secondIdr.data;
    for(let i=header;i+4<bytes.length;i++)if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1&&(bytes[i+3]&31)===7){bytes[i+5]^=16;break;}
  });
  assert.throws(()=>analyzeGopBoundaries(changed.bytes));
});

test('audio timestamp tolerance cannot accumulate afresh across each PES', () => {
  const changed=variant((records,base)=>{
    let count=0;
    for(const record of records)if(record.pid===base.audioPid)shiftTimestamp(record.data,9,count++);
  });
  assert.throws(()=>analyzeGopBoundaries(changed.bytes),/AAC_TIMING_DISCONTINUITY/);
});

test('structural eligibility is not NAL completeness; zero-exit decoder concealment fails strict QA', () => {
  const truncated=variant(records=>{
    const last=records.find(record=>record.videoIndex===359);
    last.data=last.data.subarray(0,last.data.length-100);
  });
  assert.equal(analyzeGopBoundaries(truncated.bytes).videoFrames,360);
  const root=fileURLToPath(new URL('.',import.meta.url));
  const directory=mkdtempSync(path.join(root,'run-decode-test-'));
  const file=path.join(directory,'truncated-public.ts');
  try {
    writeFileSync(file,truncated.bytes,{flag:'wx'});
    assert.throws(()=>decode(file),/QA_EXTERNAL_COMMAND_DIAGNOSTIC/);
    assert.throws(()=>decodeBounded(file),/ERROR_LEVEL_MEDIA_DIAGNOSTIC/);
    const diagnostics=[];decodeBounded(file,diagnostics);
    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.every(row=>row.code==='ERROR_LEVEL_MEDIA_DIAGNOSTIC'));
  } finally { unlinkSync(file);rmdirSync(directory); }
});
