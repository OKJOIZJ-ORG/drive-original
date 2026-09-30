"""Generate finite synthetic 420s original. ffmpeg is not browser playback."""
import pathlib, subprocess, hashlib, json
p=pathlib.Path(__file__).resolve().parent
out=p/'synthetic-420s-ac3.mp4'
command=['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i',
 'testsrc2=size=320x180:rate=24:duration=420','-f','lavfi','-i',
 'aevalsrc=0.15*sin(2*PI*(440*t+2*t*t))|0.10*sin(2*PI*(880*t+3*t*t)):s=48000:d=420',
 '-c:v','libx264','-threads','1','-preset','fast','-pix_fmt','yuv420p','-g','24','-bf','0',
 '-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
 '-c:a','ac3','-b:a','384k','-movflags','+faststart','-y',str(out)]
if not out.exists():subprocess.run(command,check=True)
probe_command=['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]
probe=json.loads(subprocess.check_output(probe_command))
assert abs(float(probe['format']['duration'])-420)<1/48000
video=next(s for s in probe['streams'] if s['codec_type']=='video')
audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert video['codec_name']=='h264' and int(video['nb_frames'])==10080
assert audio['codec_name']=='ac3' and audio['sample_rate']=='48000' and audio['channels']==2
packet_command=['ffprobe','-v','error','-select_streams','a:0','-show_packets',
 '-show_entries','packet=pts_time,dts_time,duration_time','-of','json',str(out)]
packets=json.loads(subprocess.check_output(packet_command))['packets']
assert len(packets)==13125
record={'path':out.name,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
 'generationCommand':command,'ffmpeg':subprocess.check_output(['ffmpeg','-version']).decode().splitlines()[0],
 'ffprobeCommand':probe_command,'packetCommand':packet_command,'originalProbe':probe,
 'audioPackets':{'count':len(packets),'first':packets[:3],'last':packets[-3:]},
 'scope':'Finite synthetic original only; no source/account media.'}
(p/'fixture-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'path':out.name,'bytes':record['bytes'],'sha256':record['sha256'],'duration':probe['format']['duration'],'audioPackets':len(packets)}))
