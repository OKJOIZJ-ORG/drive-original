'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { annexBNals, adtsFrames, compare, transmux, run } = require('./preservation-probe.cjs');
const { preserveUnspecifiedSar } = require('./preserve-sar.cjs');

function evidence() {
  return { streams:[{index:0,codec_type:'video',codec_name:'h264',width:16,height:16,color_space:'bt709'},
    {index:1,codec_type:'audio',codec_name:'aac',sample_rate:'48000',channels:2}],
    nals:[{type:7,hash:'sps'},{type:8,hash:'pps'},{type:6,hash:'sei'},{type:5,hash:'vcl'}],audio:['aac1','aac2'],
    packets:[{stream_index:0,dts_time:'1',pts_time:'1.1',duration_time:'.033333'},
      {stream_index:1,dts_time:'1',pts_time:'1',duration_time:'.021333'},
      {stream_index:1,dts_time:'1.021333',pts_time:'1.021333',duration_time:'.021333'}] };
}

test('preservation requires encoded pictures, parameter sets, SEI, AAC, metadata and timing', () => {
  assert.equal(compare(evidence(),evidence()).preserved,true);
  for (const change of [e=>e.nals[3].hash='changed',e=>e.nals[0].hash='changed',e=>e.nals[2].hash='changed',
    e=>e.audio.pop(),e=>e.streams[0].color_space='bt601',e=>e.packets[0].pts_time='1.2',
    e=>e.packets[0].duration_time='.1',e=>delete e.packets[0].dts_time,
    e=>e.streams[0].sample_aspect_ratio='1:1']) {
    const changed=evidence();change(changed);assert.equal(compare(evidence(),changed).preserved,false);
  }
});

test('only a common timestamp-origin shift is allowed, not track-relative drift', () => {
  const changed=evidence();
  changed.packets.forEach(packet=>{packet.pts_time=String(Number(packet.pts_time)+10);packet.dts_time=String(Number(packet.dts_time)+10);});
  assert.equal(compare(evidence(),changed).preserved,true);
  changed.packets[1].pts_time=String(Number(changed.packets[1].pts_time)+.1);
  assert.equal(compare(evidence(),changed).preserved,false);
});

test('Annex-B parser normalizes start-code packaging and rejects dangling/empty NALs', () => {
  const a=annexBNals(Buffer.from([0,0,0,1,0x65,0x80,0,0,1,0x67,0x81]));
  const b=annexBNals(Buffer.from([0,0,1,0x65,0x80,0,0,0,1,0x67,0x81]));
  assert.deepEqual(a,b);
  for (const bytes of [[1,2,3],[0,0,1],[0,0,1,0x65,0x80,0,0,1]]) assert.throws(()=>annexBNals(Buffer.from(bytes)));
});

test('ADTS comparison omits only header packaging and rejects incomplete frames', () => {
  const bytes=Buffer.from([0xff,0xf1,0x4c,0x80,1,0x3f,0xfc,0x12,0x34]);
  assert.equal(adtsFrames(bytes).length,1);
  assert.throws(()=>adtsFrames(bytes.subarray(0,8)));
  const multiple=Buffer.from(bytes);multiple[6]|=1;assert.throws(()=>adtsFrames(multiple));
});

function box(type,...payload) {
  const body=Buffer.concat(payload);const header=Buffer.alloc(8);header.writeUInt32BE(body.length+8);header.write(type,4);return Buffer.concat([header,body]);
}
function init({ h=1,v=1,duplicate=false,fake=false }={}) {
  const spacing=Buffer.alloc(8);spacing.writeUInt32BE(h,0);spacing.writeUInt32BE(v,4);
  const pasp=box('pasp',spacing);
  const avc1=box('avc1',Buffer.alloc(78),box('avcC',fake?pasp:Buffer.from([1,100,0,30])),pasp,...(duplicate?[pasp]:[]));
  const stsd=Buffer.alloc(8);stsd.writeUInt32BE(1,4);
  return box('moov',box('trak',box('mdia',box('minf',box('stbl',box('stsd',stsd,avc1))))));
}

test('unspecified SAR adapter touches only the introduced square pasp type, preserving all offsets', () => {
  const input=init({fake:true});const original=Buffer.from(input);const result=Buffer.from(preserveUnspecifiedSar(input));
  assert.deepEqual(input,original);assert.equal(result.length,input.length);
  const changed=[];for(let i=0;i<input.length;i++)if(input[i]!==result[i])changed.push(i);
  assert.equal(changed.length,4);assert.equal(result.toString('ascii',changed[0],changed[0]+4),'free');
  assert.ok(result.subarray(0,changed[0]).equals(input.subarray(0,changed[0])));
  assert.equal(result.toString('ascii').match(/pasp/g).length,1,'pasp-like bytes within avcC remain unchanged');
});

test('SAR adapter refuses explicit non-square, duplicate, malformed or missing entries', () => {
  for (const value of [init({h:4,v:3}),init({duplicate:true}),init().subarray(0,32),box('moov'),Buffer.alloc(8)]) assert.throws(()=>preserveUnspecifiedSar(value));
});

test('bounded transmux rejects invalid chunks before processing', () => {
  for (const chunkBytes of [0,-1,Infinity,1.5,5*1024*1024]) assert.throws(()=>transmux(new Uint8Array(188),{chunkBytes}));
  assert.throws(()=>transmux(new Uint8Array(5*1024*1024)));
});

test('partial private-prefix write failure is covered by cleanup', () => {
  const original=fs.writeFileSync;let created=null;
  fs.writeFileSync=(file,data,options)=>{
    if(path.basename(file)==='input.ts') {created=file;original(file,data.subarray(0,4),options);throw Object.assign(new Error('simulated disk full'),{code:'ENOSPC'});}
    return original(file,data,options);
  };
  try { assert.throws(()=>run(path.join(__dirname,'synthetic-bframes-audiolead.ts'),'synthetic')); }
  finally {fs.writeFileSync=original;}
  assert.ok(created);assert.equal(fs.existsSync(created),false);
  const directory=path.dirname(created);assert.equal(path.dirname(directory),__dirname);
  assert.deepEqual(fs.readdirSync(directory),[]);fs.rmdirSync(directory);
});

test('CLI failure never prints a private input path', () => {
  const marker='DO_NOT_DISCLOSE_PRIVATE_PATH';
  const child=spawnSync(process.execPath,[path.join(__dirname,'preservation-probe.cjs'),path.join(__dirname,marker),'priority-prefix'],{encoding:'utf8',windowsHide:true});
  assert.equal(child.status,1);assert.equal((child.stdout+child.stderr).includes(marker),false);
  assert.match(child.stderr,/Q1 probe failed: ENOENT/);
});
