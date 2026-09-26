// Independent native packet oracle for bounded browser-safe window anchors.
// This does not turn a sampled timestamp window into a full-file seek index.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {scanTsWindow} from './ts-window.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const input=path.join(root,'synthetic-bframes-audiolead.ts'),fixture=readFileSync(input);
assert.equal(sha(fixture),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
function native(args){const result=spawnSync('ffprobe',args,{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
  assert.ok(!result.error&&result.status===0&&!result.stderr.length,'PUBLIC_PACKET_ORACLE_FAILED');return result.stdout.toString('utf8');}
const oracle=JSON.parse(native(['-v','error','-show_packets','-show_streams','-show_entries',
  'packet=stream_index,pts,dts,pos,flags:stream=index,id,codec_type,codec_name,sample_rate,channels',
  '-of','json',input]));
assert.equal(oracle.streams.length,2);
const videoTrack=oracle.streams.find(row=>row.codec_type==='video'),audioTrack=oracle.streams.find(row=>row.codec_type==='audio');
assert.equal(videoTrack.codec_name,'h264');assert.equal(audioTrack.codec_name,'aac');
const videoPid=Number(videoTrack.id),audioPid=Number(audioTrack.id);
const nativeVideo=oracle.packets.filter(row=>row.stream_index===videoTrack.index)
  .map(row=>({offset:Number(row.pos),pts:row.pts,dts:row.dts,idr:row.flags.includes('K')}));
const nativeAudio=[];
for(const packet of oracle.packets.filter(row=>row.stream_index===audioTrack.index)){
  if(packet.pos!==undefined)nativeAudio.push({offset:Number(packet.pos),pts:packet.pts,dts:packet.dts,frames:0});
  assert.ok(nativeAudio.length);nativeAudio.at(-1).frames++;
}
const virtualBase=Math.ceil(2**32/188)*188;
const scenarios=[
  {name:'whole-public-control',start:0,end:fixture.length,atEof:true},
  {name:'head-with-trailing-partial',start:0,end:1100*188,atEof:false},
  {name:'interior-leading-and-trailing',start:400*188,end:1800*188,atEof:false},
  {name:'tail-at-exact-source-end',start:4100*188,end:fixture.length,atEof:true},
  {name:'same-tail-virtual-offset-above-4gib',start:4100*188,end:fixture.length,atEof:true,base:virtualBase}
];
const observations=[];
for(const scenario of scenarios){
  const {start,end,atEof,base=0}=scenario;
  const result=scanTsWindow(fixture.subarray(start,end),{offset:base+start,videoPid,audioPid,atEof});
  const expectedVideo=nativeVideo.filter((row,index)=>row.offset>=start
    &&(nativeVideo[index+1]?nativeVideo[index+1].offset<end:atEof&&end===fixture.length));
  assert.deepEqual(result.video.map(({offset,pts,dts,idr})=>({offset:offset-base,pts,dts,idr})),expectedVideo);
  for(const row of result.video){assert.ok(row.end>row.offset&&row.end<=base+end);
    if(row.idr)assert.ok(row.sps?.length&&row.pps?.length);}
  let previousAudioOffset=-1;
  for(const row of result.audio){
    assert.ok(row.offset>previousAudioOffset&&row.offset%188===0&&row.end%188===0);
    previousAudioOffset=row.offset;
    assert.ok(row.offset>=base+start&&row.end>row.offset&&row.end<=base+end);
    const expected=nativeAudio.find(candidate=>candidate.offset===row.offset-base);assert.ok(expected);
    assert.deepEqual({pts:row.pts,dts:row.dts,frames:row.frames},
      {pts:expected.pts,dts:expected.dts,frames:expected.frames});
    assert.equal(row.sampleRate,Number(audioTrack.sample_rate));assert.equal(row.channels,audioTrack.channels);
  }
  const definitelyComplete=nativeAudio.filter((row,index)=>row.offset>=start
    &&(nativeAudio[index+1]?nativeAudio[index+1].offset<end:atEof&&end===fixture.length));
  for(const row of definitelyComplete)assert.ok(result.audio.some(candidate=>candidate.offset-base===row.offset));
  if(atEof)assert.equal(result.audio.length,nativeAudio.filter(row=>row.offset>=start).length);
  if(scenario.name==='whole-public-control'){
    assert.equal(result.video.length,360);assert.equal(result.audio.reduce((count,row)=>count+row.frames,0),564);
  }
  observations.push({name:scenario.name,start:base+start,endExclusive:base+end,bytes:end-start,atEof,
    videoRecords:result.video.length,keyframes:result.video.filter(row=>row.idr).length,
    audioPes:result.audio.length,aacFrames:result.audio.reduce((count,row)=>count+row.frames,0),
    leadingPartial:result.leadingPartial,trailingPartial:result.trailingPartial,
    nativeVideoPositionTimestampKeyframeEqual:true,nativeAudioPositionTimestampCountEqual:true,
    virtualOffsetOnly:Boolean(base),scope:result.scope});
}
const sources={};for(const file of ['ts-window-probe.mjs','ts-window.mjs','gop-boundaries.mjs','../v2-07a-container-probe/mpeg-ts-probe.mjs'])
  sources[file]=sha(readFileSync(path.join(root,file)));
const report={schema:'drive-original.q1-ts-window/1',recordedAt:new Date().toISOString(),
  fixture:{bytes:fixture.length,sha256:sha(fixture)},
  producer:{sources,node:process.version,ffprobe:native(['-version']).split(/\r?\n/)[0]},observations,
  limitations:['public packet-oracle QA only; no authenticated Drive/private source or browser playback',
    'bounded complete PES anchors; not a complete source index, exact global duration or successful seek',
    'no global PSI/source identity/clock-epoch/wrap/discontinuity or decoder validity guarantee',
    'above-4GiB offset is virtual arithmetic evidence, not a real large media read']};
const directory=mkdtempSync(path.join(root,'run-ts-window-'));
writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),passed:observations.length}));
