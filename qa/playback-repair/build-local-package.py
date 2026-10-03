"""Package a fixed local Git revision; this does not publish or deploy it."""
import datetime
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
QA = pathlib.Path(__file__).resolve().parent
SOURCE = sys.argv[1]
VERSION = '1.22.1'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, timeout=30)

assert git('rev-parse', 'HEAD').decode().strip() == SOURCE, 'FIXED_LOCAL_SOURCE_REQUIRED'
checks = json.loads((QA / 'release-local-checks.json').read_text(encoding='utf-8'))
assert checks['passed'] and checks['version'] == VERSION
files = json.loads((QA / 'public-files.json').read_text(encoding='utf-8'))
assert len(files) == len(set(files)) == 64
assert all(not n.startswith('/') and '..' not in n.split('/') and '\\' not in n for n in files)
assert not git('status', '--porcelain=v1', '--', *files), 'PUBLIC_INPUTS_NOT_COMMITTED'
blobs = {name: git('show', SOURCE + ':' + name) for name in files}
blobs['.nojekyll'] = b''
assert json.loads(blobs['version.json'])['version'] == VERSION
for name, value in checks['inputs'].items():
    raw = (ROOT / name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == value, 'CHECKED_WORKTREE_CHANGED'
    assert raw.replace(b'\r\n', b'\n') == blobs[name].replace(b'\r\n', b'\n'), 'CHECKED_GIT_INPUT_CHANGED'
canonical_hashes = {n: hashlib.sha256(b).hexdigest() for n, b in blobs.items()}
output = ROOT.parent / 'releases' / ('Drive-Original-v' + VERSION + '-' + SOURCE[:7] + '.zip')
assert output.parent.resolve() == (ROOT.parent / 'releases').resolve() and output.parent.is_dir()
assert not output.exists() and not (QA / 'local-package.json').exists(), 'NO_PACKAGE_OVERWRITE'
snapshot = output.parent / (output.stem + '-worker')
assert not snapshot.exists() and snapshot.parent.resolve() == output.parent.resolve()
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(blobs.items()):
        entry = zipfile.ZipInfo(name, (2026, 10, 3, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, data, compresslevel=9)
with output.open('xb') as handle:
    handle.write(buffer.getvalue())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert len(archive.infolist()) == len(blobs) == 65
    assert set(archive.namelist()) == set(blobs)
    assert all(archive.read(name) == data for name, data in blobs.items())
snapshot.mkdir()
for name, data in blobs.items():
    destination = snapshot / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as handle:
        handle.write(data)
assert all((snapshot / name).read_bytes() == data for name, data in blobs.items())
assert git('rev-parse', 'HEAD').decode().strip() == SOURCE, 'SOURCE_CHANGED_DURING_PACKAGE'
receipt = {
    'passed': True, 'source': SOURCE, 'version': VERSION, 'path': str(output),
    'entries':65, 'bytes':output.stat().st_size,
    'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
    'everyPublicEntryEqualsGitBlob':True, 'privateEntries':0,
    'workerAssetsPath':str(snapshot), 'workerAssetsEqualGitBlobs':True,
    'publicGitSha256':canonical_hashes,
    'producerSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'deployment':False, 'scope':'Local public runtime/corresponding-source package only; requires existing same-origin authentication backend.'
}
with (QA / 'local-package.json').open('x', encoding='utf-8', newline='\n') as handle:
    handle.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
