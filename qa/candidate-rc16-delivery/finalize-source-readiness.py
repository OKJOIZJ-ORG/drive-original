"""Bind the private codec delivery flag to fixed-source candidate evidence.

Run with --write once after the HTTP audit; without it, verify the saved record.
No public runtime, source archive, deployment or account state is modified.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SOURCE = 'e57d7b5b3154a2a838d01f631cf71fa063044280'
WORKER = 'cbbafb96-b39b-4cf7-bbf8-888ed3856370'
BASE = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def git_blob(path):
    return subprocess.check_output(['git', 'show', f'{SOURCE}:{path}'], cwd=ROOT)


deployment = load(HERE / 'deployment.json')
audit = load(HERE / 'results.json')
control = load(HERE / 'redacted-readback.json')
package = load(HERE / 'package.json')
assert deployment['passed'] and deployment['stable'] and deployment['exitCode'] == 0
assert deployment['source'] == audit['source'] == control['source'] == package['sourceCommit'] == SOURCE
assert deployment['workerVersion'] == control['workerVersion'] == WORKER
assert deployment['candidateUrl'] == audit['base'] == BASE
assert audit['passed'] and audit['version'] == package['version'] == '1.22.0-rc.16'
assert control['publicFlags'] == {'AUTH_ENABLED': 'true', 'AUTH_DIAGNOSTICS': 'true', 'CANDIDATE_DRIVE_WRITES_ENABLED': 'false'}
assert control['producerSha256'] == digest((HERE / 'redact-readback.cjs').read_bytes())
assert deployment['producerSha256'] == digest((HERE / 'deploy-candidate.cjs').read_bytes())
assert len(audit['assets']) == len(deployment['assets']) == package['entries'] == 52
assert all(row['gitEqual'] for row in audit['assets'])
assert len(audit['cached']) == 40 and all(row['gitEqual'] for row in audit['cached'])
assert len(audit['uncachedSourceDownloads']) == 8 and all(not row['cached'] for row in audit['uncachedSourceDownloads'])
assert len(audit['privateRoutes']) == 6 and all(row['status'] == 404 for row in audit['privateRoutes'])
assert audit['cold']['accountPresent'] is False and audit['cold']['writes'] is False
assert audit['cold']['controlled'] and audit['offline']['controlled'] and audit['pageErrors'] == 0
delivered = {row['file']: row for row in audit['assets']}
assert len(delivered) == 52
bound_assets = []
for row in deployment['assets']:
    name = row['file']
    data = git_blob(name)
    assert len(data) == row['bytes'] == delivered[name]['bytes']
    assert digest(data) == row['sha256']
    assert (ROOT / name).read_bytes() == data
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
    'deliveryReport': {'path': 'qa/candidate-rc16-delivery/results.json', 'sha256': digest((HERE / 'results.json').read_bytes())},
    'deploymentRecord': {'path': 'qa/candidate-rc16-delivery/deployment.json', 'sha256': digest((HERE / 'deployment.json').read_bytes())},
    'controlPlaneRecord': {'path': 'qa/candidate-rc16-delivery/redacted-readback.json', 'sha256': digest((HERE / 'redacted-readback.json').read_bytes())},
    'auditProducer': {'path': 'qa/candidate-delivery-audit.cjs', 'sha256': digest((ROOT / 'qa/candidate-delivery-audit.cjs').read_bytes())},
    'scope': 'Technical same-candidate runtime/notice/preferred-source delivery only; no production, patent, device or broad-format qualification'
}
if sys.argv[1:] == ['--write']:
    build['distributionReady'] = True
    build['blockingDistributionRequirements'] = []
    build['distributionEvidence'] = evidence
    build_path.write_text(json.dumps(build, indent=2) + '\n', encoding='utf-8', newline='\n')
else:
    assert not sys.argv[1:]
    assert build['distributionReady'] is True and build['blockingDistributionRequirements'] == []
    assert build['distributionEvidence'] == evidence
report = {
    'passed': True, 'sourceCommit': SOURCE, 'workerVersion': WORKER,
    'publicAssets': 52, 'cacheAssets': 40, 'uncachedSourceArchives': 8, 'private404': 6,
    'preferredSourceHashesChecked': len(build['preferredSource']),
    'currentReadableAdaptations': len(build['correspondingSource']['readableCurrentAdaptations']),
    'distributionEvidence': evidence,
    'buildRecordSha256': digest(build_path.read_bytes()),
    'producerSha256': digest(Path(__file__).read_bytes()),
    'fixedSourceAssetBindings': bound_assets
}
(HERE / 'source-readiness.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({k: report[k] for k in ['passed', 'sourceCommit', 'publicAssets', 'preferredSourceHashesChecked', 'currentReadableAdaptations']}))
