"""Verify retained publication inputs without rebuilding or modifying them."""
import hashlib
import json
import pathlib
import subprocess
import tarfile
import posixpath
from html.parser import HTMLParser
from urllib.parse import urlsplit
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def inspect(relative):
    data = (ROOT / relative).read_bytes()
    return {"path": relative, "bytes": len(data), "sha256": sha(data)}


q1_proof = read_json("qa/q1-general-product-preparation/publication-verification.json")
archive = inspect(q1_proof["archive"]["path"])
assert archive["sha256"] == q1_proof["archive"]["sha256"]
assert archive["bytes"] == q1_proof["archive"]["bytes"]
with tarfile.open(ROOT / archive["path"], "r:gz") as bundle:
    members = {m.name: m for m in bundle.getmembers()}
    assert all(m.isfile() for m in members.values())
    assert all(not pathlib.PurePosixPath(name).is_absolute()
               and ".." not in pathlib.PurePosixPath(name).parts for name in members)
    source = json.load(bundle.extractfile("SOURCE-MANIFEST.json"))
    assert set(members) == {row["path"] for row in source["files"]} | {"SOURCE-MANIFEST.json"}
    for row in source["files"]:
        data = bundle.extractfile(row["path"]).read()
        assert len(data) == row["bytes"] and sha(data) == row["sha256"], row["path"]
q1_runtime = inspect(q1_proof["archive"]["runtime"]["path"])
assert q1_runtime["sha256"] == source["runtime"]["sha256"]
assert q1_runtime["sha256"] == q1_proof["rebuild"]["runtimeSha256"]

audio = read_json("licenses/audio-source-manifest.json")
combined = hashlib.sha256()
audio_parts = []
for row in audio["parts"]:
    data = (ROOT / "licenses" / row["path"]).read_bytes()
    assert len(data) == row["bytes"] and sha(data) == row["sha256"], row["path"]
    assert len(data) <= audio["partLimitBytes"]
    combined.update(data)
    audio_parts.append({"path": "licenses/" + row["path"], "bytes": len(data), "sha256": sha(data)})
assert sum(row["bytes"] for row in audio_parts) == audio["bytes"]
assert combined.hexdigest() == audio["sha256"]
audio_build = read_json("media/audio-codec-build.json")
audio_artifacts = []
for row in audio_build["artifacts"]:
    actual = inspect(row["path"])
    assert actual["sha256"] == row["sha256"], row["path"]
    audio_artifacts.append(actual)

inventory_js = """const fs=require('node:fs'),vm=require('node:vm');
const files=require('./scripts/public-files.cjs');
const match=fs.readFileSync('sw.js','utf8').match(/const SHELL_FILES = (\\[[\\s\\S]*?\\]);/);
if(!match)throw Error('missing cache list');
const cached=vm.runInNewContext(match[1],{}, {timeout:1000}).filter(p=>p!=='./').map(p=>p.replace(/^\\.\\//,''));
process.stdout.write(JSON.stringify({files,cached}));"""
public = json.loads(subprocess.check_output(["node", "-e", inventory_js], cwd=ROOT))
assert len(set(public["files"])) == len(public["files"])
assert len(set(public["cached"])) == len(public["cached"])
assert set(public["cached"]) <= set(public["files"])
downloads = [p for p in public["files"] if p.endswith(".tgz") or ".tar.gz.part" in p]
assert len(downloads) == 8
assert not set(downloads) & set(public["cached"])
assert all((ROOT / p).is_file() for p in public["files"])
assert not any(p.startswith(("qa/", "memory/", "worker/", "tests/")) for p in public["files"])

readable = []
for row in audio_build["correspondingSource"]["readableCurrentAdaptations"]:
    actual = inspect(row["path"])
    assert actual["sha256"] == row["sha256"]
    assert row["path"] in public["files"] and row["path"] in public["cached"]
    readable.append(actual)
current_manifest = audio_build["correspondingSource"]["archiveManifest"]
assert inspect(current_manifest["path"])["sha256"] == current_manifest["sha256"]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.extend(value for key, value in attrs if key == "href")


links = Links()
links.feed((ROOT / "licenses/index.html").read_text(encoding="utf-8"))
linked = []
for href in links.hrefs:
    url = urlsplit(href)
    assert not url.scheme and not url.netloc
    target = posixpath.normpath(posixpath.join("licenses", url.path))
    if target == ".":
        target = "index.html"
    assert target in public["files"], (href, target)
    linked.append(target)
assert {row["path"] for row in readable} <= set(linked)

report = {
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "passed": True,
    "scope": "Current local bytes and publication inventory; historical rebuild/relink evidence reused by exact artifact identity.",
    "q1Archive": archive,
    "q1Runtime": q1_runtime,
    "q1SourceFilesVerified": len(source["files"]),
    "q2Archive": {"bytes": audio["bytes"], "sha256": combined.hexdigest(), "parts": audio_parts},
    "q2RuntimeArtifacts": audio_artifacts,
    "publicFiles": public["files"],
    "cachedFiles": public["cached"],
    "sourceDownloadsNotPrecached": downloads,
    "readableCurrentAudioSource": readable,
    "licensePageLinksVerified": linked,
    "reusedEvidence": [inspect(p) for p in [
        "qa/q1-general-product-preparation/publication-verification.json",
        "qa/q2-audio-source-publication/relink-results.json",
        "qa/q2-audio-source-publication/bridge-recompile-results.json",
        "qa/q2-audio-source-publication/publication-results.json",
    ]],
    "limits": ["No new full toolchain build or relink", "No public delivery", "No real account/device playback or production change"],
}
report["producer"] = inspect("qa/q1-q2-release-integration/source-integrity.py")
(OUT / "source-integrity.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"passed": True, "q1SourceFiles": len(source["files"]), "q2Parts": len(audio_parts),
                  "publicFiles": len(public["files"]), "cachedFiles": len(public["cached"]), "uncachedDownloads": len(downloads)}))
