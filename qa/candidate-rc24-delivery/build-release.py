"""Create a new rc.24 public-only package from immutable committed Git blobs."""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
COMMIT = sys.argv[1] if len(sys.argv) == 2 else ""
assert re.fullmatch(r"[a-f0-9]{40}", COMMIT), "Full committed source SHA required"
VERSION = "1.22.0-rc.24"
OUTPUT = ROOT.parent / "releases/candidates" / f"Drive-Original-{VERSION}-{COMMIT[:7]}.zip"
RECORD = Path(__file__).parent / "package.json"


def git_blob(name):
    return subprocess.check_output(["git", "show", f"{COMMIT}:{name}"], cwd=ROOT)


manifest = git_blob("scripts/public-files.cjs")
loader = "const vm=require('node:vm'),fs=require('node:fs'),c={module:{exports:null},Object};vm.runInNewContext(fs.readFileSync(0,'utf8'),c);process.stdout.write(JSON.stringify(c.module.exports));"
names = json.loads(subprocess.check_output(["node", "-e", loader], input=manifest, cwd=ROOT))
assert len(names) == len(set(names)) and len(names) == 51
assert all(not name.startswith("/") and ".." not in Path(name).parts for name in names)
assert all(not name.startswith(("qa/", "memory/", "worker/", "tests/")) for name in names)
blobs = {name: git_blob(name) for name in names}
assert json.loads(blobs["version.json"])["version"] == VERSION
blobs[".nojekyll"] = b""
archive = io.BytesIO()
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for name in sorted(blobs):
        info = zipfile.ZipInfo(name, date_time=(2026, 9, 30, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        package.writestr(info, blobs[name], compresslevel=9)
generated = archive.getvalue()
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
if OUTPUT.exists():
    data = OUTPUT.read_bytes()
    if RECORD.exists():
        prior = json.loads(RECORD.read_text(encoding="utf-8"))
        assert prior["sourceCommit"] == COMMIT
        assert hashlib.sha256(data).hexdigest() == prior["sha256"], "Retained package hash drift"
else:
    data = generated
    with OUTPUT.open("xb") as output:
        output.write(data)
with zipfile.ZipFile(io.BytesIO(data)) as package:
    assert len(package.infolist()) == len(blobs) and set(package.namelist()) == set(blobs)
    assert package.testzip() is None and package.comment == b""
    assert all(package.read(name) == body for name, body in blobs.items())
    assert all(info.date_time == (2026, 9, 30, 0, 0, 0)
               and info.create_system == 3 and info.external_attr == (0o100644 << 16)
               for info in package.infolist())
assert OUTPUT.read_bytes() == data
record = {"passed": True, "version": VERSION, "sourceCommit": COMMIT,
          "packagePath": OUTPUT.relative_to(ROOT.parent).as_posix(), "bytes": len(data),
          "sha256": hashlib.sha256(data).hexdigest(), "entries": len(blobs),
          "everyPublicEntryEqualsGitBlob": True, "extraPrivateEntries": 0,
          "localGeneratedSha256": hashlib.sha256(generated).hexdigest(),
          "localGenerationByteEqual": generated == data,
          "scope": "New candidate static/runtime/corresponding-source package; authenticated backend is separate",
          "producer": "qa/candidate-rc24-delivery/build-release.py",
          "producerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "publicManifestSha256": hashlib.sha256(manifest).hexdigest()}
RECORD.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, indent=2))
