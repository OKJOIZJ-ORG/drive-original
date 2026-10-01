"""Curate exact safe evidence paths; never enumerate/stage private QA directories."""
import hashlib, json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'qa/rc29-resume-20261001/saved-evidence-stage-manifest.json'
paths = set()
manifests = [
 'qa/rc29-delivery-acceptance-record/safe-staging-manifest.json',
 'qa/rc29-finite-acceptance-reconciliation/staging-manifest.json',
 'qa/rc29-finite-acceptance-reconciliation/addendum-staging-manifest.json',
 'qa/rc29-performance-preparation/staging-manifest.json',
 'qa/rc29-performance-native-gesture/staging-manifest.json',
 'qa/rc29-third-party-cookie-preparation/staging-manifest.json',
 'qa/rc29-disposable-ui-preparation/staging-manifest.json',
]
for name in manifests:
    obj = json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
    paths.add(name)
    for row in obj['files']:
        path = row['path']
        data = (ROOT / path).read_bytes()
        assert row['sha256'] == hashlib.sha256(data).hexdigest(), path
        if 'bytes' in row:
            assert row['bytes'] == len(data), path
        paths.add(path)
for leaf in ['rc28-deeper-selection-diagnostic', 'rc29-deeper-coalesced-probe']:
    obj = json.loads((ROOT / 'qa' / leaf / 'curated-savepoint.json').read_text())
    paths.update(obj['exactOwnedFiles'])
paths.update([
 'qa/rc28-resume-20261001/actual-deeper-attempt2-safe.json',
 'qa/rc29-resume-20261001/source-proof.expression.js',
 'qa/rc29-resume-20261001/derive-context.expression.js',
 'qa/rc29-resume-20261001/actual-performance-attempt2-safe.json',
 'qa/rc29-resume-20261001/curate-savepoint.py',
 'qa/candidate-rc29-delivery/DELIVERY-PREPARATION.md',
 'qa/candidate-rc29-delivery/delivery-guard.cjs',
 'qa/candidate-rc29-delivery/materialize-candidate.cjs',
 'qa/candidate-rc29-delivery/deploy-candidate.cjs',
 'qa/candidate-rc29-delivery/readback-candidate.cjs',
 'qa/candidate-rc29-delivery/redact-readback.cjs',
 'qa/candidate-rc29-delivery/audit-with-memory-guard.cjs',
 'qa/candidate-rc29-delivery/build-release.py',
 'qa/candidate-rc29-delivery/finalize-source-readiness.py',
])
rows = []
for path in sorted(paths):
    p = pathlib.PurePosixPath(path)
    assert p.parts[0] == 'qa' and '..' not in p.parts
    assert 'private' not in p.name.lower() and p.suffix != '.log', path
    data = (ROOT / p).read_bytes()
    rows.append({'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
result = {'schema': 'drive-original.rc29-root-safe-savepoint/1',
          'productSource': '10f1dd2ee9550866933e693dbf41c62e1fb2daad',
          'files': rows, 'hashedFileCount': len(rows),
          'exactStagePaths': [r['path'] for r in rows] + [OUT.relative_to(ROOT).as_posix()],
          'privateCredentialsRawLogsScreenshotsExcluded': True,
          'wholeGoalComplete': False}
OUT.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(rows), 'bytes': sum(r['bytes'] for r in rows),
                  'manifestSHA256': hashlib.sha256(OUT.read_bytes()).hexdigest()}))
