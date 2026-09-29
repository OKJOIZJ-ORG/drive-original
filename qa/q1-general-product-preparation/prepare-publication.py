from pathlib import Path
import hashlib, io, json, tarfile, gzip
root = Path(__file__).resolve().parents[2]
leaf = root / 'qa/q1-general-product-preparation'
source = leaf / 'reproducible-build/package'
manifest = json.loads((root / 'media/mediabunny-q1-build.json').read_text(encoding='utf8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
archive = leaf / 'reproducible-build/mediabunny-1.60.0.tgz'
assert sha(archive.read_bytes()) == manifest['archiveSha256']
changes = {r['path']: r for r in manifest['changes']}
files = {}
with tarfile.open(archive) as original:
    original_sources = [m for m in original.getmembers() if m.isfile() and m.name.startswith('package/src/')]
    for member in original_sources:
        relative = member.name.removeprefix('package/')
        before = original.extractfile(member).read()
        actual = (source / relative).read_bytes()
        if relative in changes:
            row = changes[relative]
            assert sha(before) == row['beforeSha256'], relative
            assert sha(actual) == row['afterSha256'], relative
        else:
            assert actual == before, relative
        files[member.name] = actual
    assert {m.name.removeprefix('package/') for m in original_sources} == {p.relative_to(source).as_posix() for p in (source/'src').rglob('*') if p.is_file()}
    for name in ['LICENSE', 'README.md', 'package.json']:
        original_bytes = original.extractfile('package/' + name).read()
        assert (source / name).read_bytes() == original_bytes
        files['package/' + name] = original_bytes
for row in manifest['shared']:
    name = row['url'].rsplit('/',1)[1]
    actual = (source/'shared'/name).read_bytes()
    assert sha(actual) == row['sha256'], name
    files['package/shared/' + name] = actual
assert {p.name for p in (source/'shared').glob('*.ts')} == {r['url'].rsplit('/',1)[1] for r in manifest['shared']}
files['package/tsconfig.json'] = (source/'tsconfig.json').read_bytes()
assert json.loads(files['package/tsconfig.json']) == {'compilerOptions': {'target': 'ESNext', 'useDefineForClassFields': True}}
for name in ['media/mediabunny-q1-build.json', 'media/mediabunny-q1-source.patch', 'media/mediabunny-q1.LICENSE', 'scripts/build-general-q1.cjs']:
    files[name] = (root/name).read_bytes()
assert sha(files['media/mediabunny-q1-source.patch']) == manifest['patchSha256']
for name in ['rebuild-source.cjs', 'README.md']:
    files[name] = (leaf/'publication-inputs'/name).read_bytes()
runtime = (root/'media/mediabunny-q1.mjs').read_bytes()
record = {'version': 'mediabunny-1.60.0-drive-original-q1', 'upstreamCommit': manifest['commit'],
          'upstreamArchiveSha256': manifest['archiveSha256'], 'patchSha256': manifest['patchSha256'],
          'runtime': {'path': 'media/mediabunny-q1.mjs', 'sha256': sha(runtime), 'bytes': len(runtime)},
          'sourceCoverage': {'upstreamSrcFiles': len(original_sources), 'modifiedFiles': len(changes), 'sharedFiles': len(manifest['shared']),
                             'unmodifiedSourceMatchesPinnedArchive': True, 'allModifiedSourceMatchesManifest': True},
          'files': [{'path': p, 'sha256': sha(b), 'bytes': len(b)} for p,b in sorted(files.items())],
          'selfHashPolicy': 'SOURCE-MANIFEST.json is excluded from its own inventory; the outer distribution archive SHA-256 binds it.'}
files['SOURCE-MANIFEST.json'] = (json.dumps(record, indent=2)+'\n').encode()
destination = root/'licenses/mediabunny-q1-preferred-source.tgz'
destination.parent.mkdir(parents=True,exist_ok=True)
buf=io.BytesIO()
with gzip.GzipFile(filename='',mode='wb',fileobj=buf,mtime=0,compresslevel=9) as compressed:
    with tarfile.open(fileobj=compressed,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,data in sorted(files.items()):
            entry=tarfile.TarInfo(name);entry.size=len(data);entry.mtime=0;entry.mode=0o644;entry.uid=entry.gid=0
            tar.addfile(entry,io.BytesIO(data))
archive_bytes=buf.getvalue()
if destination.exists(): assert destination.read_bytes()==archive_bytes, 'Existing publication bytes differ; retain and review before replacement.'
else: destination.write_bytes(archive_bytes)
report={'path':destination.relative_to(root).as_posix(),'sha256':sha(archive_bytes),'bytes':len(archive_bytes),'files':len(files),'runtime':record['runtime'],'sourceCoverage':record['sourceCoverage'],'deterministicHeaders':True}
(leaf/'publication-package.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps(report))
