import pathlib,struct,subprocess,json
p=pathlib.Path(__file__).resolve().parent;b=bytearray((p/'output-eac3.mp4').read_bytes());mvhd=b.index(b'mvhd')-4;scale=struct.unpack_from('>I',b,mvhd+20)[0];elst=b.index(b'elst')-4;struct.pack_into('>I',b,elst+16,6*scale);out=p/'edit-duration-correct.mp4';out.write_bytes(b)
frames=len(subprocess.check_output(['ffmpeg','-v','error','-i',str(out),'-map','0:a:0','-f','f32le','-']))//8
(p/'correct-edit-probe.json').write_text(json.dumps({'movieTimescale':scale,'editSegmentDurationTicks':6*scale,'decodedFrames':frames,'sourceFrames':288000,'nativeChromeRetest':False,'earlierEditTrial':'edit-duration.mp4 mistakenly used6000 ticks; invalid as a6second edit and retained as rejected experiment'},indent=2))
