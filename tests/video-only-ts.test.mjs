import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from './general-q1-fixture.mjs';
import {hasVideoOnlyTsTopology} from '../media/general-admission.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {crc32Mpeg2} from '../qa/v2-07a-container-probe/mpeg-ts-probe.mjs';
import {Input,BufferSource,MP4,EncodedPacketSink,EncodedVideoPacketSource,Output,MpegTsOutputFormat,BufferTarget} from '../media/mediabunny-q1.mjs';
function prefix({audio=false,corrupt=false}={}){
 const section=hex=>{const raw=Buffer.from(hex,'hex'),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32Mpeg2(raw));return Buffer.concat([raw,crc]);};
 const bytes=Buffer.alloc(940,255);for(let p=0;p<940;p+=188)bytes.set([0x47,0x1f,0xff,0x10],p);
 bytes.set([0x47,0x40,0,0x10,0],0);bytes.set(section('00b00d0001c100000001f000'),5);
 const pmt=section(audio?'02b0170001c10000e100f0001be100f0000fe101f000':'02b0120001c10000e100f0001be100f000');if(corrupt)pmt[pmt.length-1]^=1;
 bytes.set([0x47,0x50,0,0x10,0],188);bytes.set(pmt,193);return bytes;
}
test('only CRC-valid complete single-program AVC-only topology gets the general hint',()=>{
 assert.equal(hasVideoOnlyTsTopology(prefix()),true);assert.equal(hasVideoOnlyTsTopology(prefix({audio:true})),false);
 assert.equal(hasVideoOnlyTsTopology(prefix({corrupt:true})),false);assert.equal(hasVideoOnlyTsTopology(prefix().subarray(0,400)),false);
 const noPmt=prefix();noPmt.fill(255,188+5,376);assert.equal(hasVideoOnlyTsTopology(noPmt),false);
 const hevc=prefix();hevc[193+12]=36;const table=hevc.subarray(193,193+17);hevc.writeUInt32BE(crc32Mpeg2(table),193+17);assert.equal(hasVideoOnlyTsTopology(hevc),false);
});
test('app chooses general only for positive video-only hint while preserving TS-container fallback guards',async()=>{
 const source=fs.readFileSync(new URL('../app/playback-source.js',import.meta.url),'utf8');
 const branch=source.slice(source.indexOf('    const createPlayer = ts'),source.indexOf('    if (!current()) return true;',source.indexOf('    const createPlayer = ts')))
  .replace("(await import('../media/ts-player.mjs')).createTsPlayer",'strictPlayer').replace("(await import('../media/general-player.mjs')).createGeneralPlayer",'generalPlayer');
 for(const [videoOnlyTs,expected] of [[false,'ts'],[true,'general']]){
  const context=vm.createContext({ts:true,videoOnlyTs,owner:{},strictPlayer:()=>{},generalPlayer:()=>{}});
  await vm.runInContext(`(async()=>{${branch}})()`,context);assert.equal(context.owner.kind,expected);assert.equal(context.ts,true);
 }
 assert.match(source,/selectedAudioTrackId === undefined && !ts && general/);
});
test('existing general Q1 copies a real AVC-only TS through end and seek without creating audio',async()=>{
 const input=new Input({source:new BufferSource(fixture),formats:[MP4]}),track=await input.getPrimaryVideoTrack();
 const packets=new EncodedPacketSink(track),config=await track.getDecoderConfig(),encoded=new EncodedVideoPacketSource('avc'),target=new BufferTarget();
 const output=new Output({format:new MpegTsOutputFormat(),target});output.addVideoTrack(encoded);await output.start();
 let first=true;for await(const p of packets.packets()){await encoded.add(p,first?{decoderConfig:config}:undefined);first=false;}await output.finalize();input.dispose();
 const bytes=new Uint8Array(target.buffer);assert.equal(bytes.length%188,0);
 for(const time of [0,1.35]){
  let closed=0,window,total=0;
  const source={identity:{size:bytes.length},read:async({start,end})=>bytes.slice(start,end+1),abort:async()=>{closed++;return {settled:true};}};
  const result=await streamGeneralQ1({source,targetTime:time,onWindow:w=>window=w,onChunk:c=>{total+=c.bytes.length;}});
  assert.equal(result.inputFormat,'MPEG Transport Stream');assert.equal(result.audioCodec,null);assert.equal(window.audioConfig,null);assert.ok(total>0);assert.equal(result.encodersCreated,0);assert.equal(closed,1);assert.equal(result.cleanup.settled,true);
 }
});
