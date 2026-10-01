"""Bind the private codec delivery flag to fixed-source candidate evidence.

Run after exact candidate33 HTTP audit/readback/package verification.
Writes QA evidence only. Canonical build metadata and historical evidence stay intact.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SOURCE = '5174485b3c17d047259701bbdd889f9b0740f555'
assert not sys.argv[1:], "Read-only canonical metadata; no --write option"
GUARD = "require('./qa/candidate-rc33-delivery/delivery-guard.cjs').assertSource()"
subprocess.check_call(['node', '-e', GUARD], cwd=ROOT)
WORKER = json.loads((HERE / 'deployment.json').read_text(encoding='utf-8'))['workerVersion']
BASE = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def git_blob(path):
    return subprocess.check_output(['git', 'show', f'{SOURCE}:{path}'], cwd=ROOT)


def canonical_working_bytes_match(name, working, canonical, owned_lf):
    if working == canonical:
        return True
    return (name in {'media/video-q3-worker.mjs', 'media/video-q3-codec.mjs'}
            and owned_lf is True
            and working.replace(b'\r\n', b'\n') == canonical)


deployment = load(HERE / 'deployment.json')
audit = load(HERE / 'results.json')
control = load(HERE / 'redacted-readback.json')
package = load(HERE / 'package.json')
assert deployment['passed'] and deployment['stable'] and deployment['exitCode'] == 0
assert deployment['source'] == audit['source'] == control['source'] == package['sourceCommit'] == SOURCE
assert deployment['workerVersion'] == control['workerVersion'] == WORKER
assert deployment['candidateUrl'] == audit['base'] == BASE
assert audit['passed'] and audit['version'] == package['version'] == '1.22.0-rc.33'
assert control['publicFlags'] == {'AUTH_ENABLED': 'true', 'AUTH_DIAGNOSTICS': 'true', 'CANDIDATE_DRIVE_WRITES_ENABLED': 'false'}
assert control['producerSha256'] == digest((HERE / 'redact-readback.cjs').read_bytes())
assert deployment['producerSha256'] == digest((HERE / 'deploy-candidate.cjs').read_bytes())
assert len(audit['assets']) == len(deployment['assets']) == package['entries'] == 61
assert all(row['gitEqual'] for row in audit['assets'])
assert len(audit['cached']) == 46 and all(row['gitEqual'] for row in audit['cached'])
assert len(audit['uncachedSourceDownloads']) == 9 and all(not row['cached'] for row in audit['uncachedSourceDownloads'])
assert len(audit['privateRoutes']) == 6 and all(row['status'] == 404 for row in audit['privateRoutes'])
assert audit['cold']['accountPresent'] is False and audit['cold']['writes'] is False
assert audit['cold']['controlled'] and audit['offline']['controlled'] and audit['pageErrors'] == 0
delivered = {row['file']: row for row in audit['assets']}
assert len(delivered) == 61
bound_assets = []
working_newline_normalization = []
for row in deployment['assets']:
    name = row['file']
    data = git_blob(name)
    assert len(data) == row['bytes'] == delivered[name]['bytes']
    assert digest(data) == row['sha256']
    working = (ROOT / name).read_bytes()
    if working != data:
        attrs = subprocess.check_output(['git', 'check-attr', '-z', 'text', 'eol', '--', name], cwd=ROOT).decode().split('\0')[:-1]
        owned_lf = {attrs[i + 1]: attrs[i + 2] for i in range(0, len(attrs), 3)} == {'text': 'set', 'eol': 'lf'}
        assert canonical_working_bytes_match(name, working, data, owned_lf), name
        working_newline_normalization.append({'path': name, 'workingSha256': digest(working), 'gitSha256': digest(data), 'crlfOnly': True, 'gitAttributesOwnedLf': True})
    bound_assets.append({'path': name, 'sha256': digest(data)})

build_path = ROOT / 'media/audio-codec-build.json'
build = load(build_path)
for row in build['preferredSource'] + build['artifacts'] + build['correspondingSource']['readableCurrentAdaptations'] + [build['correspondingSource']['archiveManifest']]:
    assert digest((ROOT / row['path']).read_bytes()) == row['sha256'], row['path']
for row in build['artifacts'] + build['correspondingSource']['readableCurrentAdaptations'] + [build['correspondingSource']['archiveManifest']]:
    assert row['path'] in delivered and digest(git_blob(row['path'])) == row['sha256']
assert package['passed'] and package['everyPublicEntryEqualsGitBlob'] and package['extraPrivateEntries'] == 0
assert digest((ROOT.parent / package['packagePath']).read_bytes()) == package['sha256']
evidence = {
    'sourceCommit': SOURCE, 'workerVersion': WORKER, 'candidateUrl': BASE,
    'deliveryReport': {'path': 'qa/candidate-rc33-delivery/results.json', 'sha256': digest((HERE / 'results.json').read_bytes())},
    'deploymentRecord': {'path': 'qa/candidate-rc33-delivery/deployment.json', 'sha256': digest((HERE / 'deployment.json').read_bytes())},
    'controlPlaneRecord': {'path': 'qa/candidate-rc33-delivery/redacted-readback.json', 'sha256': digest((HERE / 'redacted-readback.json').read_bytes())},
    'auditProducer': {'path': 'qa/candidate-delivery-audit.cjs', 'sha256': digest((ROOT / 'qa/candidate-delivery-audit.cjs').read_bytes())},
    'scope': 'Technical same-candidate runtime/notice/preferred-source delivery only; no production, patent, device or broad-format qualification'
}
assert build['distributionReady'] is True and build['blockingDistributionRequirements'] == []
# Historical build distributionEvidence is deliberately not rewritten/relabelled.
subprocess.check_call(['node', '-e', GUARD], cwd=ROOT)
report = {
    'passed': True, 'sourceCommit': SOURCE, 'workerVersion': WORKER,
    'publicAssets': 61, 'cacheAssets': 46, 'uncachedSourceArchives': 9, 'private404': 6,
    'preferredSourceHashesChecked': len(build['preferredSource']),
    'currentReadableAdaptations': len(build['correspondingSource']['readableCurrentAdaptations']),
    'distributionEvidence': evidence,
    'buildRecordSha256': digest(build_path.read_bytes()),
    'canonicalBuildMetadataWritten': False,
    'workingTreeNewlineNormalization': working_newline_normalization,
    'producerSha256': digest(Path(__file__).read_bytes()),
    'fixedSourceAssetBindings': bound_assets
}
(HERE / 'source-readiness.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({k: report[k] for k in ['passed', 'sourceCommit', 'publicAssets', 'preferredSourceHashesChecked', 'currentReadableAdaptations']}))
