import pathlib,struct,json
p=pathlib.Path('qa/q2-original-end-integrity');b=(p/'output-eac3.mp4').read_bytes()
def boxes(start,end):
 while start<end:
  n,t=struct.unpack_from('>I4s',b,start);yield start,n,t;start+=n
rows=[]
for at,n,t in boxes(0,len(b)):
 if t!=b'moof':continue
 for a,z,t in boxes(at+8,at+n):
  if t!=b'traf':continue
  tid=None
  for v,z,t in boxes(a+8,a+z):
   if t==b'tfhd':tid=struct.unpack_from('>I',b,v+12)[0]
   if t==b'trun':
    flags=int.from_bytes(b[v+9:v+12],'big');count=struct.unpack_from('>I',b,v+12)[0];pos=v+16+bool(flags&1)*4+bool(flags&4)*4;d=[]
    for i in range(count):
     for bit in [256,512,1024,2048]:
      if flags&bit:
       value=struct.unpack_from('>I',b,pos)[0];pos+=4
       if bit==256:d.append(value)
    rows.append({'track':tid,'count':count,'flags':hex(flags),'lastDuration':d[-1] if d else None})
(p/'trun-report.json').write_text(json.dumps(rows,indent=2));print(rows[-4:])
