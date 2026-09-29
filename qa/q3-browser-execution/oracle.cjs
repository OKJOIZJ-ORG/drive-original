// Independent installed-native decoder is an oracle, never the browser runtime.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function decode(name){return cp.execFileSync('ffmpeg',['-v','error','-i',path.join(__dirname,name),'-map','0:v:0','-an','-pix_fmt','yuv420p','-fps_mode','passthrough','-f','rawvideo','-'],{maxBuffer:16*1024*1024,windowsHide:true})}
function probe(name){return JSON.parse(cp.execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',path.join(__dirname,name)],{windowsHide:true})).streams[0]}
function frames(name){return JSON.parse(cp.execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',path.join(__dirname,name)],{maxBuffer:1024*1024,windowsHide:true})).frames.map(f=>Number(f.best_effort_timestamp_time))}
const source=decode('synthetic-mpeg4.mp4'),frameBytes=320*180*3/2,rows=[];
const sourceMeta=probe('synthetic-mpeg4.mp4'),sourceFrames=frames('synthetic-mpeg4.mp4');
if(sourceMeta.sample_aspect_ratio!=='1:1'||sourceMeta.display_aspect_ratio!=='16:9'||sourceMeta.avg_frame_rate!=='24/1'||sourceMeta.pix_fmt!=='yuv420p'||sourceMeta.side_data_list?.length)throw Error('Q3_ORACLE_SOURCE_PROFILE');
for(const start of [0,2.2]){const name=`output-${start}.webm`,b=decode(name),ref=source.subarray(start?48*frameBytes:0),meta=probe(name);let squared=0,minPsnr=Infinity;
 if(b.length!==ref.length)throw Error('Q3_FRAME_COUNT');
 for(let f=0;f<b.length;f+=frameBytes){let sum=0;for(let i=f;i<f+frameBytes;i++)sum+=(b[i]-ref[i])**2;squared+=sum;minPsnr=Math.min(minPsnr,10*Math.log10(255**2/(sum/frameBytes)))}
 const psnr=10*Math.log10(255**2/(squared/b.length));
 const outputFrames=frames(name),referenceFrames=sourceFrames.slice(start?48:0);
 const maxTimestampErrorSeconds=outputFrames.length===referenceFrames.length?Math.max(...outputFrames.map((t,i)=>Math.abs(t-referenceFrames[i]))):Infinity;
 const metadataAndCadencePass=meta.codec_name==='vp9'&&meta.pix_fmt==='yuv420p'&&meta.avg_frame_rate==='24/1'&&meta.r_frame_rate==='24/1'&&meta.sample_aspect_ratio==='1:1'&&meta.display_aspect_ratio==='16:9'&&!meta.side_data_list?.length&&Number.isFinite(maxTimestampErrorSeconds)&&maxTimestampErrorSeconds<=0.000501;
 rows.push({name,sha256:sha(fs.readFileSync(path.join(__dirname,name))),decodedFrames:b.length/frameBytes,sourceDecodedFrames:source.length/frameBytes,psnrAllYuv:psnr,minimumFramePsnr:minPsnr,width:meta.width,height:meta.height,pixelFormat:meta.pix_fmt,codec:meta.codec_name,colorSpace:meta.color_space,colorPrimaries:meta.color_primaries,colorTransfer:meta.color_transfer,colorRange:meta.color_range,avgFrameRate:meta.avg_frame_rate,sampleAspectRatio:meta.sample_aspect_ratio,displayAspectRatio:meta.display_aspect_ratio,maxTimestampErrorSeconds,metadataAndCadencePass,pass:metadataAndCadencePass&&psnr>=38&&minPsnr>=33&&meta.width===320&&meta.height===180&&meta.color_space==='bt709'&&meta.color_primaries==='bt709'&&meta.color_transfer==='bt709'&&meta.color_range==='tv'});
}
const result={pass:rows.every(r=>r.pass),method:'Independent native FFmpeg raw I420 decode; full three-plane MSE, aligned native-source frame48 for seek2.2s. Synthetic SDR only; thresholds qualify this fixture, not perceptual equivalence or HDR.',rows,producerSha256:sha(fs.readFileSync(__filename)),sourceSha256:sha(fs.readFileSync(path.join(__dirname,'synthetic-mpeg4.mp4')))};
fs.writeFileSync(path.join(__dirname,'oracle-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;
