from pathlib import Path
import urllib.request
p=Path('qa/q2-original-end-integrity')
for n in ['filters/opus_audio_decoder.cc','filters/audio_discard_helper.cc']:
 u='https://raw.githubusercontent.com/chromium/chromium/main/media/'+n
 try:(p/n.split('/')[-1]).write_bytes(urllib.request.urlopen(u).read())
 except Exception as e:print(type(e).__name__)
