import urllib.request,pathlib
p=pathlib.Path(__file__).resolve().parent
u='https://raw.githubusercontent.com/chromium/chromium/main/media/filters/frame_processor.cc'
(p/'frame_processor.cc').write_bytes(urllib.request.urlopen(u,timeout=10).read())
