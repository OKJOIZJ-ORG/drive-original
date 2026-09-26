'use strict';
// Independent native oracle for the product's absolute start/end seek extension.
// Public fixture only; whole-source QA buffers are NOT product memory evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {extract,decode}=require('./v2-07b-ts-q1/incremental-probe.cjs');
const {compare}=require('./v2-07b-ts-q1/preservation-probe.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(__dirname,'q1-preservation');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixtureFile=path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'),fixture=fs.readFileSync(fixtureFile);
assert.equal(hash(fixture),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'media/build.json')));
const producerFiles=[...new Set(['qa/q1-preservation-audit.cjs','qa/v2-07b-ts-q1/incremental-probe.cjs',
  'qa/v2-07b-ts-q1/preservation-probe.cjs','media/mux-mp4.min.js',...Object.values(manifest.outputs).flatMap(row=>Object.keys(row.inputs))])];
const producers=()=>Object.fromEntries(producerFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const sources=producers(),results=[];
function command(executable,args,input){
  const value=spawnSync(executable,args,{input,windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});
  assert.ok(!value.error&&value.status===0&&!value.stderr.length,'STRICT_NATIVE_DECODE_NO_DIAGNOSTICS');return value.stdout;
}
(async()=>{
  fs.mkdirSync(base,{recursive:true});const temporary=fs.mkdtempSync(path.join(base,'run-')),generated=[];
  try{
    const {probeTsSeek}=await import('./v2-07b-ts-q1/ts-seek.mjs');
    const {prepareTsSeekInput}=await import('./v2-07b-ts-q1/seek-input.mjs');
    const {createSeekBootstrap}=await import('./v2-07b-ts-q1/seek-bootstrap.mjs');
    const {createTransmuxSession}=await import('./v2-07b-ts-q1/transmux-session.mjs');
    const muxFile=require.resolve('./v2-07b-ts-q1/node_modules/mux.js/dist/mux-mp4.min.js');
    assert.equal(hash(fs.readFileSync(muxFile)),hash(fs.readFileSync(path.join(root,'media/mux-mp4.min.js'))));
    const Transmuxer=require(muxFile).Transmuxer;
    const original=extract(fixtureFile),decodedSource=decode(fixtureFile);
    const oracle=JSON.parse(command('ffprobe',['-v','error','-show_packets','-show_streams','-show_entries',
      'packet=stream_index,pts,dts:stream=index,codec_type','-of','json',fixtureFile]));
    const videoIndex=oracle.streams.find(row=>row.codec_type==='video').index,audioIndex=oracle.streams.find(row=>row.codec_type==='audio').index;
    const videoPackets=oracle.packets.filter(row=>row.stream_index===videoIndex).sort((a,b)=>a.pts-b.pts);
    const audioPackets=oracle.packets.filter(row=>row.stream_index===audioIndex);
    const adts=command('ffmpeg',['-v','error','-nostdin','-i',fixtureFile,'-map','0:a:0','-c:a','copy','-f','adts','pipe:1']);
    const adtsOffsets=[];for(let position=0;position<adts.length;){adtsOffsets.push(position);
      position+=((adts[position+3]&3)<<11)|(adts[position+4]<<3)|(adts[position+5]>>5);}
    adtsOffsets.push(adts.length);assert.equal(adtsOffsets.length,audioPackets.length+1);
    for(const seconds of [0,1.2,6.1,11.95,1000]){
      const plan=await probeTsSeek({read:async({start,end})=>Uint8Array.from(fixture.subarray(start,end+1)),sourceSize:fixture.length,positionSeconds:seconds});
      const input={headBytes:fixture.subarray(0,Math.floor(65536/188)*188),bytes:fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan};
      const prepared=prepareTsSeekInput(input),bootstrap=createSeekBootstrap({...input,generation:1}),parts=[];
      for(let offset=bootstrap.readStart;offset<fixture.length;offset+=65536)
        parts.push(bootstrap.push(fixture.subarray(offset,offset+65536),{offset,generation:1}));
      bootstrap.finish({sourceSize:fixture.length,generation:1});const suffix=Buffer.concat(parts),fragments=[];
      let session;session=createTransmuxSession({generation:1,sourceSize:suffix.length,Transmuxer,send(message){
        if(message.type==='fragment'){fragments.push(Buffer.from(message.bytes));session.receive({type:'ack',generation:1,fragmentSequence:message.fragmentSequence});}
      }});
      for(let offset=0,sequence=1;offset<suffix.length;offset+=65536,sequence++)
        session.receive({type:'input',generation:1,sequence,offset,bytes:Uint8Array.from(suffix.subarray(offset,offset+65536)).buffer});
      session.receive({type:'eof',generation:1});assert.equal(session.stats().state,'finished');
      const clip=path.join(temporary,`${seconds}.ts`),output=path.join(temporary,`${seconds}.mp4`);generated.push(clip,output);
      fs.writeFileSync(clip,suffix,{flag:'wx'});fs.writeFileSync(output,Buffer.concat(fragments),{flag:'wx'});
      const clipData=extract(clip),outputData=extract(output),preservation=compare(clipData,outputData);
      assert.equal(preservation.preserved,true,JSON.stringify(preservation));
      for(const kind of ['video','audio']){
        const before=clipData.streams.find(row=>row.codec_type===kind),after=outputData.streams.find(row=>row.codec_type===kind);
        const a=clipData.packets.filter(row=>row.stream_index===before.index),b=outputData.packets.filter(row=>row.stream_index===after.index);
        assert.equal(a.length,b.length);
        for(let n=0;n<a.length;n++)for(const clock of ['pts_time','dts_time'])
          assert.ok(Math.abs(Number(a[n][clock])-Number(b[n][clock]))<=1/(kind==='video'?90000:48000)+.000002,'ABSOLUTE_CLOCK');
      }
      const decoded=decode(output),decodedClip=decode(clip),firstVideo=videoPackets.findIndex(row=>row.pts===prepared.video.startPts);
      const firstAudio=audioPackets.findIndex(row=>row.pts===prepared.audio.startPts);assert.ok(firstVideo>=0&&firstAudio>=0);
      assert.deepEqual(decoded.frames,decodedSource.frames.slice(firstVideo));assert.deepEqual(decoded.frames,decodedClip.frames);
      assert.deepEqual(outputData.audio,original.audio.slice(firstAudio));
      const resetPcm=command('ffmpeg',['-v','error','-nostdin','-threads','1','-f','aac','-i','pipe:0','-c:a','pcm_s16le','-f','s16le','pipe:1'],adts.subarray(adtsOffsets[firstAudio]));
      assert.ok(decoded.pcm.equals(resetPcm)&&decoded.pcm.equals(decodedClip.pcm));
      assert.equal(decoded.pcm.length,(audioPackets.length-firstAudio)*1024*4);
      if(seconds===0){assert.equal(firstVideo,0);assert.equal(firstAudio,0);assert.ok(decoded.pcm.equals(decodedSource.pcm));}
      if(seconds>=11.95){assert.ok(plan.timeline.audioEndTicks<plan.timeline.videoEndTicks);assert.equal(prepared.audio.endPts,plan.timeline.audioEndTicks);}
      results.push({seconds,target:(plan.targetTicks-plan.timeline.originTicks)/90000,fragments:fragments.length,
        videoFrames:decoded.frames.length,aacFrames:audioPackets.length-firstAudio,pcmBytes:decoded.pcm.length,
        preservation,absoluteClockEqual:true,originalVideoEqual:true,originalAacEqual:true,sameStartOriginalPcmEqual:true,
        originalAudioEnd:plan.timeline.audioEndTicks,originalVideoEnd:plan.timeline.videoEndTicks,
        bootstrap:bootstrap.stats(),outputSha256:hash(fs.readFileSync(output))});
    }
    assert.deepEqual(producers(),sources);
  }finally{for(const file of generated)if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(temporary);}
})().catch(error=>{results.push({passed:false,error:error.message});process.exitCode=1;console.error(error);}).finally(()=>{
  fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(base,'results.json'),JSON.stringify({syntheticOnly:true,
    passed:!process.exitCode,recordedAt:new Date().toISOString(),fixtureSha256:hash(fixture),sources,results,
    scope:'strict native coded/clock/metadata/frame/PCM oracle; not browser audible/color, real Drive/device or total memory'},null,2)+'\n');
});
