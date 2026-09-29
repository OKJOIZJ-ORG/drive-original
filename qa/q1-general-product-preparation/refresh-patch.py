from pathlib import Path
import tarfile,hashlib,json,difflib
r=Path.cwd(); p=r/'qa/q1-general-product-preparation'; m=r/'media'; manifest=json.loads((m/'mediabunny-q1-build.json').read_text())
diff=''; rows=[]
with tarfile.open(r/'qa/media-general-routing/vendor/mediabunny-1.60.0.tgz') as t:
 for row in manifest['changes']:
  f=row['path']; before=t.extractfile('package/'+f).read(); after=(p/'build/package'/f).read_bytes()
  diff+=''.join(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+f,tofile='b/'+f))
  rows.append({'path':f,'beforeSha256':hashlib.sha256(before).hexdigest(),'afterSha256':hashlib.sha256(after).hexdigest()})
(m/'mediabunny-q1-source.patch').write_text(diff,encoding='utf8',newline='\n');manifest['changes']=rows;manifest['patchSha256']=hashlib.sha256(diff.encode()).hexdigest()
(m/'mediabunny-q1-build.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
f=m/'general-pipeline.mjs';s=f.read_text();s=s.replace('MP4, QTFF, MATROSKA, WEBM, MPEG_TS','MP4, QTFF, MPEG_TS').replace('    const videoCursor = null, audioCursor = null;\n    let resolvedVideoEnd = 0;\n','').replace('      const cursor = useVideo ? videoCursor : audioCursor;\n      const resolved = cursor ? await cursor.resolve(sourcePacket) : { packet: sourcePacket, evidence: null }, packet = resolved.packet;','      const packet = sourcePacket;').replace('durationEvidence: resolved.evidence, ','').replace('        resolvedVideoEnd = Math.max(resolvedVideoEnd, packet.timestamp + packet.duration);\n','').replace('videoCursor ? await videoCursor.advance(sourcePacket) : ','').replace('audioCursor ? await audioCursor.advance(sourcePacket) : ','');f.write_text(s,encoding='utf8',newline='\n')
