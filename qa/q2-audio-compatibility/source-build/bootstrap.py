import pathlib,hashlib,json,tarfile,io,urllib.request,subprocess,sys
from compression import zstd
p=pathlib.Path(__file__).resolve().parents[1];s=p/'source-build';w=p/'build-investigation/work';sources=p/'build-investigation/sources'
sha=lambda b:hashlib.sha256(b).hexdigest()
def need_archive(name,url,digest):
 f=sources/name
 if not f.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Drive-Original-QA-source-build'}),timeout=120) as r:f.write_bytes(r.read())
 if sha(f.read_bytes())!=digest:raise RuntimeError('ARCHIVE_HASH:'+name)
 return f
for name,commit,digest in [('FFmpeg','140fd653aed8cad774f991ba083e2d01e86420c7','5c4a9e51e706b8deba835f02ea70e1e1101187f601adae72b36ec2b17b6f15be'),('emsdk','389a68bc35dcff7ebae4614e1615099dafda00d1','cdaa3bc973c609d9b0b1dab72de52f0b60427e6b95e30eecf9ec014514dddc67')]:
 # Retained original official archive bytes are authoritative; a GitHub archive format change fails closed.
 f=sources/f'{name.lower()}-{commit}.tar.gz'
 if sha(f.read_bytes())!=digest:raise RuntimeError('SOURCE_HASH:'+name)
 if not (w/f'{name}-{commit}').exists():
  with tarfile.open(f) as t:t.extractall(w,filter='data')
f=need_archive('make-4.4.1-3-x86_64.pkg.tar.zst','https://mirror.msys2.org/msys/x86_64/make-4.4.1-3-x86_64.pkg.tar.zst','af0bdba17f06fe037f0194069adaa31a8fe45f1a11381501896aea1fae37bd5d')
if not (w/'portable-make/usr/bin/make.exe').exists():
 with tarfile.open(fileobj=io.BytesIO(zstd.decompress(f.read_bytes()))) as t:t.extractall(w/'portable-make',filter='data')
sdk=w/'emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1'
if '--install-sdk' in sys.argv:
 subprocess.run([sys.executable,str(sdk/'emsdk.py'),'install','4.0.15'],check=True)
 subprocess.run([sys.executable,str(sdk/'emsdk.py'),'activate','4.0.15'],check=True)
print('Pinned sources and portable make verified; SDK activation, when requested, is local only.')
