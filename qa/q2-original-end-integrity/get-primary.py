from pathlib import Path
import urllib.request
p=Path('qa/q2-original-end-integrity')
for n in ['mp4_stream_parser.cc','track_run_iterator.cc']:
 u='https://raw.githubusercontent.com/chromium/chromium/main/media/formats/mp4/'+n
 (p/n).write_bytes(urllib.request.urlopen(u).read())
