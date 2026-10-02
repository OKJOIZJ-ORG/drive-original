'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4'),output=path.join(__dirname,'fixed-q1-output.mp4');
const run=(tool,args,input)=>cp.execFileSync(tool,args,{input,maxBuffer:8*1024*1024});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',file]));
const a=probe(source),b=probe(output),video=x=>x.streams.find(s=>s.codec_type==='video'),packets=x=>x.packets.filter(p=>p.codec_type==='video'),ap=packets(a),bp=packets(b);
const [an,ad]=video(a).time_base.split('/').map(BigInt),[bn,bd]=video(b).time_base.split('/').map(BigInt),shiftNumerators=new Set();
const suffix=ap.slice(-bp.length);assert.deepEqual(bp.map(p=>p.data_hash),suffix.map(p=>p.data_hash));for(let i=0;i<bp.length;i++){assert.equal(BigInt(suffix[i].duration)*an*bd,BigInt(bp[i].duration)*bn*ad);const pts=BigInt(bp[i].pts)*bn*ad-BigInt(suffix[i].pts)*an*bd,dts=BigInt(bp[i].dts)*bn*ad-BigInt(suffix[i].dts)*an*bd;assert.equal(pts,dts);shiftNumerators.add(String(pts));}assert.equal(shiftNumerators.size,1);
const yuv=(file,index)=>run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-vf',`select=eq(n\\,${index})`,'-fps_mode','passthrough','-frames:v','1','-pix_fmt','yuv420p','-f','rawvideo','pipe:1']);
const difference=(x,y)=>{assert.equal(x.length,y.length);let changed=0,max=0,sq=0,sum=0;for(let p=0;p<x.length;p+=4)for(let c=0;c<3;c++){const d=Math.abs(x[p+c]-y[p+c]);changed+=d>0;max=Math.max(max,d);sq+=d*d;sum+=d;}const count=x.length/4*3,mse=sq/count;return{differentChannels:changed,maxChannelDelta:max,meanAbsoluteChannelDelta:sum/count,psnr:mse?10*Math.log10(255**2/mse):null};};
const native=run('ffmpeg',['-v','error','-i',path.join(__dirname,'discriminator-native-frame.png'),'-pix_fmt','rgba','-f','rawvideo','pipe:1']);
const q1=run('ffmpeg',['-v','error','-i',path.join(__dirname,'discriminator-q1-frame.png'),'-pix_fmt','rgba','-f','rawvideo','pipe:1']);
const rawA=yuv(source,ap.length-1),rawB=yuv(output,bp.length-1),matrix=[];
for(const name of ['bt601','bt709']){
 const rgb=run('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','yuv420p','-video_size','320x180','-i','pipe:0','-vf',`scale=in_color_matrix=${name}:out_color_matrix=${name}:in_range=limited:out_range=full`,'-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1'],rawA);
 matrix.push({name,native:difference(native,rgb),q1:difference(q1,rgb)});
}
const report={scope:'Independent FFprobe packet/time and FFmpeg decoded YUV oracle; explicit RGB matrices are a discriminator, not a new color contract.',tools:{ffmpeg:String(run('ffmpeg',['-version'])).split('\n')[0],ffprobe:String(run('ffprobe',['-version'])).split('\n')[0]},copiedPacketCount:bp.length,ptsDtsClockShift:{numerator:[...shiftNumerators][0],denominator:String(ad*bd)},rationalPacketDurationsExact:true,lastSourcePacket:ap.at(-1),lastOutputPacket:bp.at(-1),sourceVideo:video(a),outputVideo:video(b),sourceDecodedYuv:{bytes:rawA.length,sha256:hash(rawA)},outputDecodedYuv:{bytes:rawB.length,sha256:hash(rawB)},originalPacketHashPreserved:ap.at(-1).data_hash===bp.at(-1).data_hash,decodedFrameExact:rawA.equals(rawB),canvasDifference:difference(native,q1),matrix};
assert.equal(report.originalPacketHashPreserved,true);assert.equal(report.decodedFrameExact,true);
fs.writeFileSync(path.join(__dirname,'packet-frame-oracle-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({decodedFrameExact:report.decodedFrameExact,canvasDifference:report.canvasDifference,matrix}));
