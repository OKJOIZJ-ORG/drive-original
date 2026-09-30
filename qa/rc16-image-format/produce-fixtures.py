from PIL import Image, ImageDraw, features
from pathlib import Path
import json, hashlib, PIL, sys
out=Path('qa/rc16-image-format')
frames=[]
for color in [(255,0,0,255),(0,0,255,255)]:
 im=Image.new('RGBA',(96,64),(0,0,0,0));ImageDraw.Draw(im).rectangle((24,16,71,47),fill=color);ImageDraw.Draw(im).rectangle((32,24,39,31),fill=(0,0,0,0));frames.append(im)
frames[0].save(out/'alpha.png')
frames[0].convert('RGB').save(out/'raster.bmp')
frames[0].save(out/'animated.webp',save_all=True,append_images=frames[1:],duration=[250,750],loop=0,lossless=True)
frames[0].save(out/'animated.gif',save_all=True,append_images=frames[1:],duration=[250,750],loop=0,disposal=2)
big=Image.new('RGB',(4096,2048),(30,60,90));ImageDraw.Draw(big).rectangle((0,0,2047,1023),fill=(255,0,0));big.save(out/'large.png');big.close()
records={}
for n in ['alpha.png','raster.bmp','animated.webp','animated.gif','large.png']:
 b=(out/n).read_bytes();im=Image.open(out/n);records[n]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'format':im.format,'size':im.size,'frames':getattr(im,'n_frames',1),'duration':im.info.get('duration'),'loop':im.info.get('loop'),'mode':im.mode}
(out/'fixture-producers.json').write_text(json.dumps({'python':sys.version,'pillow':PIL.__version__,'webp':features.version('webp'),'fixtures':records},indent=2))
print(json.dumps(records,indent=2))

