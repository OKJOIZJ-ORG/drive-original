"""Build the pinned, audited local fork without npm lifecycle scripts."""
from pathlib import Path
import hashlib,json,runpy,subprocess,urllib.request
p=Path(__file__).resolve().parent
runpy.run_path(str(p/'patch.py'),run_name='__main__')
for row in json.loads((p/'shared-source-provenance.json').read_text()):
    f=p/'package/shared'/row['url'].rsplit('/',1)[1]
    if not f.exists():
        f.parent.mkdir(exist_ok=True);f.write_bytes(urllib.request.urlopen(row['url']).read())
    assert hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256']
(p/'package/tsconfig.json').write_text('{"compilerOptions":{"target":"ESNext","useDefineForClassFields":true}}',encoding='utf8')
tool=json.loads((p/'build-tool-provenance.json').read_text())
assert hashlib.sha256((p/'esbuild.exe').read_bytes()).hexdigest()==tool['binarySha256']
subprocess.run([str(p/'esbuild.exe'),str(p/'package/src/index.ts'),'--bundle','--format=esm','--platform=browser','--outfile='+str(p/'vendor/mediabunny.min.mjs'),'--minify'],check=True)
report={'toolVersion':'esbuild 0.25.1','toolBinarySha256':tool['binarySha256'],'preferredSourceCommit':'359e4e4eee43bf968551e03ddc7280f9c69d655a','bundleSha256':hashlib.sha256((p/'vendor/mediabunny.min.mjs').read_bytes()).hexdigest(),'patchSha256':hashlib.sha256((p/'preferred-source.patch').read_bytes()).hexdigest(),'license':'MPL-2.0','sourceFiles':json.loads((p/'patch-provenance.json').read_text())['modifiedFiles']}
(p/'build-provenance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='sourceFiles'}))
