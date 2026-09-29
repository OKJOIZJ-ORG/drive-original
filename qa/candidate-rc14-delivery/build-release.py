"""Create and verify the rc.14 static package from immutable Git blobs only."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "067bcb94329a99f6dcec78657ca3882dbf9d8aad"
VERSION = "1.22.0-rc.14"
OUTPUT = ROOT.parent / "releases" / "candidates" / f"Drive-Original-{VERSION}-{COMMIT[:7]}.zip"
EXPECTED_RELEASE_SHA256 = "604942d57cb2c541e3480ea5af0701ef3c88102ba6986d4ef14ae73edb740bfe"

def git_blob(name):
    return subprocess.check_output(["git", "show", f"{COMMIT}:{name}"], cwd=ROOT)

manifest = git_blob("scripts/public-files.cjs")
loader = "const vm=require('node:vm'),fs=require('node:fs');const c={module:{exports:null},Object};vm.runInNewContext(fs.readFileSync(0,'utf8'),c);process.stdout.write(JSON.stringify(c.module.exports));"
names = json.loads(subprocess.check_output(["node", "-e", loader], input=manifest, cwd=ROOT))
assert len(names) == 19 and len(set(names)) == 19
assert all(not name.startswith("/") and ".." not in Path(name).parts for name in names)
blobs = {name: git_blob(name) for name in names}
assert json.loads(blobs["version.json"])["version"] == VERSION
blobs[".nojekyll"] = b""
archive = io.BytesIO()
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for name in sorted(blobs):
        info = zipfile.ZipInfo(name, date_time=(2026, 9, 29, 6, 20, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        package.writestr(info, blobs[name], compresslevel=9)
data = archive.getvalue()
with zipfile.ZipFile(io.BytesIO(data)) as package:
    assert set(package.namelist()) == set(blobs)
    assert package.testzip() is None
    assert all(package.read(name) == body for name, body in blobs.items())
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
if OUTPUT.exists():
    existing = OUTPUT.read_bytes()
    assert hashlib.sha256(existing).hexdigest() == EXPECTED_RELEASE_SHA256, "Historical package hash changed"
    assert existing != b"", "Historical package is empty"
    if existing != data:
        with zipfile.ZipFile(io.BytesIO(existing)) as prior:
            prior_infos = prior.infolist()
            prior_equal = (len(prior_infos) == len(blobs)
                           and set(prior.namelist()) == set(blobs)
                           and prior.testzip() is None
                           and prior.comment == b""
                           and all(prior.read(name) == body for name, body in blobs.items())
                           and all(info.date_time == (2026, 9, 29, 6, 20, 0)
                                   and info.compress_type == zipfile.ZIP_DEFLATED
                                   and info.create_system == 3
                                   and info.external_attr == (0o100644 << 16)
                                   for info in prior_infos))
            with zipfile.ZipFile(io.BytesIO(data)) as rebuilt:
                size_deltas = {info.filename: info.compress_size - rebuilt.getinfo(info.filename).compress_size
                               for info in prior_infos if info.compress_size != rebuilt.getinfo(info.filename).compress_size}
        assert prior_equal, "Historical package members or metadata differ from fixed Git blobs"
    else:
        size_deltas = {}
    local_regeneration_sha = hashlib.sha256(data).hexdigest()
    local_regeneration_byte_equal = (existing == data)
    data = existing
else:
    assert hashlib.sha256(data).hexdigest() == EXPECTED_RELEASE_SHA256, "Current compressor cannot reconstruct exact historical package"
    with OUTPUT.open("xb") as output:
        output.write(data)
    local_regeneration_sha = EXPECTED_RELEASE_SHA256
    local_regeneration_byte_equal = True
    size_deltas = {}
assert OUTPUT.read_bytes() == data
result = {
    "passed": True, "version": VERSION, "sourceCommit": COMMIT,
    "packagePath": OUTPUT.relative_to(ROOT.parent).as_posix(),
    "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "entries": len(blobs),
    "everyPublicEntryEqualsGitBlob": True, "extraPrivateEntries": 0,
    "localRegeneratedSha256": local_regeneration_sha,
    "localRegenerationByteEqual": local_regeneration_byte_equal,
    "compressedMemberVariations": len(size_deltas),
    "scope": "Candidate static assets; authenticated backend hosting is separate.",
    "producer": "qa/candidate-rc14-delivery/build-release.py",
    "producerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "publicManifestSha256": hashlib.sha256(manifest).hexdigest()
}
(Path(__file__).parent / "package.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
