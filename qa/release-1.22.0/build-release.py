"""Package immutable published public Git blobs, then independently read every entry."""
import datetime
import hashlib
import io
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = '54e786f499c4496259bdb6e066e9626381cbe376'
QA = ROOT / 'qa' / 'release-1.22.0'
OUTPUT = ROOT.parent / 'releases' / 'Drive-Original-v1.22.0-54e786f.zip'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, timeout=30)

assert git('rev-parse', 'HEAD').decode().strip() == SOURCE, 'IMMUTABLE_SOURCE_REQUIRED'
served = json.loads((QA / 'served.json').read_text(encoding='utf-8'))
assert served['passed'] and served['source'] == SOURCE and served['cleanup']['passed']
allowlist = git('show', SOURCE + ':scripts/public-files.cjs')
script = "const vm=require('node:vm'),fs=require('node:fs');const s={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(0,'utf8'),s);process.stdout.write(JSON.stringify(s.module.exports));"
files = json.loads(subprocess.check_output(['node', '-e', script], input=allowlist, cwd=ROOT, timeout=10))
assert len(files) == len(set(files)) == 64
assert all(not name.startswith('/') and '..' not in name.split('/') and '\\' not in name for name in files)
blobs = {name: git('show', SOURCE + ':' + name) for name in files}
blobs['.nojekyll'] = b''
assert json.loads(blobs['version.json'])['version'] == '1.22.0'
assert OUTPUT.parent.resolve() == (ROOT.parent / 'releases').resolve() and OUTPUT.parent.is_dir()
assert not OUTPUT.exists() and not (QA / 'package.json').exists(), 'NO_PACKAGE_OVERWRITE'
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(blobs.items()):
        entry = zipfile.ZipInfo(name, (2026, 10, 3, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, data, compresslevel=9)
with OUTPUT.open('xb') as handle:
    handle.write(buffer.getvalue())
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    assert len(archive.infolist()) == len(blobs) == 65
    assert set(archive.namelist()) == set(blobs)
    assert all(archive.read(name) == expected for name, expected in blobs.items())
receipt = {
    'passed': True, 'source': SOURCE, 'version': '1.22.0', 'path': str(OUTPUT),
    'entries': 65, 'bytes': OUTPUT.stat().st_size,
    'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'everyPublicEntryEqualsGitBlob': True, 'privateEntries': 0,
    'producerSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Public runtime and corresponding-source distribution; excludes backend configuration, QA, account data and secrets.'
}
with (QA / 'package.json').open('x', encoding='utf-8', newline='\n') as handle:
    handle.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
