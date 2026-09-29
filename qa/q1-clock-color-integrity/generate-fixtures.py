from pathlib import Path
import hashlib,json,subprocess
p=Path(__file__).resolve().parent;rows=[]
def make(args,name):
    f=p/name
    if not f.exists():subprocess.run(['ffmpeg','-v','error','-nostdin','-n',*args,str(f)],check=True)
    rows.append({'name':name,'args':args,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
base=['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=6','-f','lavfi','-i','sine=frequency=700:sample_rate=48000:duration=6','-map','0:v:0','-map','1:a:0','-vf',r'select=not(eq(mod(n\,5)\,1)),setpts=PTS+0.25/TB,setsar=4/3','-fps_mode','vfr','-c:v','libx264','-threads:v','1','-preset','veryfast','-g','48','-bf','2','-x264-params','aud=1:repeat-headers=1','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','96k','-ar','48000','-ac','2']
make(base+['-f','mpegts'],'b-vfr-audiolead.ts')
make(['-i',str(p/'b-vfr-audiolead.ts'),'-map','0','-c','copy','-movflags','+faststart'],'b-vfr-aac.mp4')
# Retain the failed fixture hypothesis: metadata rotate did not produce a matrix.
make(['-i',str(p/'b-vfr-aac.mp4'),'-map','0','-c','copy','-metadata:s:v:0','rotate=90'],'b-vfr-rotate.mp4')
make(['-ss','0.4','-i',str(p/'b-vfr-aac.mp4'),'-map','0','-c','copy','-avoid_negative_ts','disabled'],'b-trim-negative.mp4')
make(['-i',str(p/'b-vfr-aac.mp4'),'-map','0','-c','copy','-output_ts_offset','7'],'b-empty-edit.mp4')
make(['-i',str(p/'b-vfr-aac.mp4'),'-map','0','-c','copy','-movflags','+negative_cts_offsets'],'b-negative-cto.mp4')
make(['-display_rotation:v:0','90','-i',str(p/'b-vfr-aac.mp4'),'-map','0','-c','copy'],'b-rotate90.mp4')
make(['-f','lavfi','-i','testsrc2=size=320x180:rate=1/6:duration=6','-f','lavfi','-i','sine=frequency=700:sample_rate=48000:duration=6','-vf','setsar=4/3','-c:v','libx264','-threads:v','1','-bf','0','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-movflags','+faststart'],'one-picture-color.mp4')
b=(p/'b-vfr-aac.mp4').read_bytes();old=bytes.fromhex('00000010706173700000000400000003');assert b.count(old)==1
f=p/'b-subpixel-sar.mp4';f.write_bytes(b.replace(old,bytes.fromhex('000000107061737000000a2800000a29')))
rows.append({'name':f.name,'method':'copy original b-vfr-aac MP4 and replace its one 4:3 pasp box with exact 2600:2601; coded SPS and pictures unchanged, container aspect declaration owns display ratio','sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(p/'fixture-provenance.json').write_text(json.dumps({'ffmpeg':subprocess.check_output(['ffmpeg','-version']).decode().splitlines()[0],'fixtures':rows},indent=2)+'\n',encoding='utf8')
