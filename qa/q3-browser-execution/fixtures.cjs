// Synthetic producer only; native FFmpeg never participates in browser runtime.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const f=path.join(__dirname,'synthetic-mpeg4.mp4');
const args=['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=3','-vf','setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv','-c:v','mpeg4','-q:v','2','-bf','0','-g','24','-pix_fmt','yuv420p','-movflags','+faststart','-y',f];
cp.execFileSync('ffmpeg',args,{windowsHide:true});
const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-show_packets','-show_data','-of','json',f],{maxBuffer:16*1024*1024,windowsHide:true}));
const stream=probe.streams[0],bytes=fs.readFileSync(f);
if(stream.codec_name!=='mpeg4'||stream.pix_fmt!=='yuv420p'||stream.color_primaries!=='bt709'||stream.color_transfer!=='bt709'||stream.color_space!=='bt709'||stream.color_range!=='tv')throw Error('Q3_FIXTURE_COLOR_OR_CODEC');
function hexDump(x){return Buffer.from((x||'').split('\n').filter(x=>x.includes(':')).map(x=>x.slice(x.indexOf(':')+1).trimStart().split('  ')[0].replaceAll(' ','')).join(''),'hex')}
const manifest={synthetic:true,inputSha256:sha(bytes),inputBytes:bytes.length,width:stream.width,height:stream.height,fps:24,codec:stream.codec_name,profile:stream.profile,hasBFrames:stream.has_b_frames,pixelFormat:stream.pix_fmt,colorSpace:{primaries:stream.color_primaries,transfer:stream.color_transfer,matrix:stream.color_space,fullRange:stream.color_range==='pc'},extradata:[...hexDump(stream.extradata)],packets:probe.packets.map(p=>({start:Number(p.pos),size:Number(p.size),pts:Math.round(Number(p.pts_time)*1e6),dts:Math.round(Number(p.dts_time)*1e6),duration:Math.round(Number(p.duration_time)*1e6),key:p.flags.includes('K')}))};
fs.writeFileSync(path.join(__dirname,'fixture.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'fixture-provenance.json'),JSON.stringify({command:['ffmpeg',...args.map(x=>x===f?'synthetic-mpeg4.mp4':x)],version:cp.execFileSync('ffmpeg',['-version'],{windowsHide:true}).toString().split('\n')[0],inputSha256:sha(bytes),producerSha256:sha(fs.readFileSync(__filename))},null,2)+'\n');
console.log(JSON.stringify({codec:manifest.codec,profile:manifest.profile,packets:manifest.packets.length,bytes:bytes.length}));
