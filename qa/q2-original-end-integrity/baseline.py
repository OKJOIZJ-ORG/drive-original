import subprocess,json,pathlib
p=pathlib.Path('qa/q2-original-end-integrity')
for name,f in [('source','qa/q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4'),('baseline','qa/q2-general-product-integration/output-eac3.mp4')]:
 q=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a','-show_streams','-show_packets','-of','json',f]));a=q['packets'];report={'streams':q['streams'],'first':a[:2],'last':a[-3:],'packets':len(a),'decodedFrames':len(subprocess.check_output(['ffmpeg','-v','error','-i',f,'-map','0:a:0','-f','f32le','-']))//8};(p/(name+'-extent.json')).write_text(json.dumps(report,indent=2));print(name,report['decodedFrames'],a[0]['pts_time'],a[-1]['pts_time'],a[-1]['duration_time'])
