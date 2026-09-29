from pathlib import Path
import struct,json,urllib.request
p=Path('qa/q2-original-end-integrity');b=bytearray((p/'output-eac3.mp4').read_bytes())
def walk(st,en,track=None):
 while st<en:
  n,t=struct.unpack_from('>I4s',b,st)
  if t==b'trak':
   a=st+8;z=struct.unpack_from('>I',b,a)[0];track=struct.unpack_from('>I',b,a+20)[0]
  if t in [b'moov',b'trak',b'edts',b'mdia']:walk(st+8,st+n,track)
  if t==b'mvhd':print('mvhd scale',struct.unpack_from('>I',b,st+20)[0])
  if t==b'elst':print('elst',track,b[st:st+n].hex());struct.pack_into('>I',b,st+16,6000)
  st+=n
walk(0,len(b));(p/'edit-duration.mp4').write_bytes(b)
u='https://raw.githubusercontent.com/chromium/chromium/main/media/base/audio_discard_helper.cc';(p/'audio_discard_helper.cc').write_bytes(urllib.request.urlopen(u).read())
