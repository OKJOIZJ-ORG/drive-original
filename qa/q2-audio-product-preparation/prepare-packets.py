import pathlib,subprocess,json,hashlib
p=pathlib.Path('qa/q2-audio-product-preparation');rows={}
for name,f in [('ac3',pathlib.Path('qa/q2-audio-compatibility/synthetic-avc-ac3.mp4')),('eac3',pathlib.Path('qa/q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4'))]:
 data=f.read_bytes();packets=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a:0','-show_packets','-of','json',str(f)]))['packets'][:3]
 rows[name]={'source':str(f),'sourceSha256':hashlib.sha256(data).hexdigest(),'packets':[{'timestamp':float(x['pts_time']),'data':list(data[int(x['pos']):int(x['pos'])+int(x['size'])])} for x in packets]}
(p/'packets.json').write_text(json.dumps(rows)+'\n')
