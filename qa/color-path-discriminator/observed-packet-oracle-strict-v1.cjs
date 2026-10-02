'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4'),output=path.join(__dirname,'observed-output.mp4');
const run=(tool,args)=>cp.execFileSync(tool,args,{maxBuffer:8*1024*1024}),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',file]));
const a=probe(source),b=probe(output),video=x=>x.streams.find(s=>s.codec_type==='video'),packets=x=>x.packets.filter(p=>p.codec_type==='video');
const ap=packets(a),bp=packets(b),suffix=ap.slice(-bp.length),shifts=new Set();
const [an,ad]=video(a).time_base.split('/').map(BigInt),[bn,bd]=video(b).time_base.split('/').map(BigInt);
assert.ok(bp.length>0);assert.deepEqual(bp.map(p=>p.data_hash),suffix.map(p=>p.data_hash));
for(let i=0;i<bp.length;i++){
  assert.equal(BigInt(suffix[i].duration)*an*bd,BigInt(bp[i].duration)*bn*ad);
  const pts=BigInt(bp[i].pts)*bn*ad-BigInt(suffix[i].pts)*an*bd,dts=BigInt(bp[i].dts)*bn*ad-BigInt(suffix[i].dts)*an*bd;
  assert.equal(pts,dts);shifts.add(String(pts));
}
assert.equal(shifts.size,1);assert.equal(video(a).extradata_hash,video(b).extradata_hash);
const yuv=(file,index)=>run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-vf',`select=eq(n\\,${index})`,'-fps_mode','passthrough','-frames:v','1','-pix_fmt','yuv420p','-f','rawvideo','pipe:1']);
const av=yuv(source,ap.length-1),bv=yuv(output,bp.length-1);assert.ok(av.equals(bv));
const result=JSON.parse(fs.readFileSync(path.join(__dirname,'observed-player-attempt2-result.json')));
assert.equal(hash(fs.readFileSync(source)),result.binding.source.sha256);
assert.equal(hash(fs.readFileSync(output)),result.runs[0].output.sha256);
const producerEquality=result.binding.producers.map(p=>{const file=p.path==='/runner.js'?path.join(__dirname,'observed-player.function.js'):path.join(root,p.path.slice(1));
  return {path:p.path,exact:hash(fs.readFileSync(file))===p.sha256};});
assert.ok(producerEquality.every(p=>p.exact));assert.equal(result.observedPass,true);assert.equal(result.cleanup.player.settled,true);
assert.ok(result.workers.every(w=>w.terminal.encodersCreated===0&&w.terminated));
assert.ok(result.runs.filter(r=>r.comparison).every(r=>Object.values(r.comparison).every(v=>v===true)));
const color=s=>Object.fromEntries(['color_range','color_space','color_transfer','color_primaries'].map(k=>[k,s[k]??null]));
assert.deepEqual(color(video(a)),{color_range:null,color_space:null,color_transfer:null,color_primaries:null});
assert.deepEqual(color(video(b)),{color_range:'tv',color_space:'smpte170m',color_transfer:'smpte170m',color_primaries:'smpte170m'});
const report={schema:'observed-color-independent-packet-oracle/1',sourceSHA256:hash(fs.readFileSync(source)),outputSHA256:hash(fs.readFileSync(output)),
  tools:{ffmpeg:String(run('ffmpeg',['-version'])).split('\n')[0],ffprobe:String(run('ffprobe',['-version'])).split('\n')[0]},
  copiedVideoPackets:bp.length,encodedPacketsExact:true,avccExtradataExact:true,rationalPacketDurationsExact:true,ptsDtsConstantShiftExact:true,
  shift:{numerator:[...shifts][0],denominator:String(ad*bd)},sourceDeclaredColor:color(video(a)),outputDerivedObservedColor:color(video(b)),
  outputColorProvenance:'Actual same-source native VideoFrame observation, not original declared metadata or inferred intended color.',
  lastDecodedYUV420P:{sourceBytes:av.length,sourceSHA256:hash(av),outputSHA256:hash(bv),exact:av.equals(bv)},
  actualNativeNV12AndRGBAExact:true,productProducersUnchanged:producerEquality,originalMediaMutated:false,
  limits:['Generated SDR fixture and isolated Chrome154; no actual account/Android/HDR claim','Absent source colr is retained in original configuration; output adds explicitly derived observed display metadata']};
fs.writeFileSync(path.join(__dirname,'observed-packet-oracle-result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({copiedVideoPackets:bp.length,encodedPacketsExact:true,avccExtradataExact:true,rationalClocksExact:true,decodedYUVExact:true,nativeNV12RGBAExact:true,producerChecks:producerEquality.length}));
