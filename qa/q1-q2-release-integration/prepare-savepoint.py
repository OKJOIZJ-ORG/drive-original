"""Build an exact staging proposal; never stage, rebuild or mutate product inputs."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


paths = {row["path"] for row in read_json("qa/q1-general-product-preparation/commit-manifest.json")["files"]}
paths.add("qa/q1-general-product-preparation/commit-manifest.json")
paths.add("qa/q2-audio-compatibility/synthetic-bframes-unspecified-color.mp4")
q2 = read_json("qa/q2-general-product-integration/commit-files.json")
excluded = []
for group in ["ownedRuntimeBuildTests", "coordinatedAdmissionChange", "ownedQa",
              "previousBackendProof", "syntheticFixtureDependencies"]:
    for row in q2["groups"][group]:
        if row["path"].endswith(("/synthetic-long-ac3.mp4", "/output-long.mp4")):
            excluded.append({"path": row["path"], "reason": "Regenerable long fixture/output; retained provenance, exact hashes and trial results"})
        else:
            paths.add(row["path"])
paths.update(q2["generatedManifestFiles"])

# Keep small local codec-copy build inputs. Large source/static-library inputs
# already belong to the committed seven-part corresponding-source/relink package.
for row in q2["groups"]["preferredSourceBuildRelinkInputs"]:
    if row["bytes"] <= 1024 * 1024 and not row["path"].endswith((".tar.gz", ".tgz", ".a")):
        paths.add(row["path"])
    else:
        excluded.append({"path": row["path"], "reason": "Recover from canonical licenses/audio-source-v1 package or its portable relink recipe; no duplicate SDK/source archive"})

# Exact maintained app-routing proof, including failed-before and partial runs.
for file in (ROOT / "qa/q1-q2-app-integration").iterdir():
    if file.is_file():
        paths.add(file.relative_to(ROOT).as_posix())

historical = read_json("qa/q2-original-end-integrity/evidence-manifest.json")
for row in historical["files"]:
    if row["path"].startswith("qa/q2-original-end-integrity/"):
        if row["bytes"] <= 1024 * 1024:
            paths.add(row["path"])
        else:
            excluded.append({"path": row["path"], "reason": "Historical large reconstructed/trial output is regenerable; final product end-window PCM is retained separately"})
paths.add("qa/q2-original-end-integrity/evidence-manifest.json")
for file in (ROOT / "qa/q2-player-end-window").iterdir():
    if file.is_file():
        paths.add(file.relative_to(ROOT).as_posix())

paths.update([
    ".gitattributes", "app.js", "index.html", "sw.js", "version.json",
    "qa/candidate-delivery-audit.cjs", "scripts/public-files.cjs",
    "licenses/index.html", "licenses/audio-source-NOTICE.md",
    "tests/q0-proxy.test.js", "tests/shell.test.js", "tests/static.test.js",
    "tests/general-app-routing.test.js", "tests/general-audio-probe.test.mjs",
    "tests/general-q2-end.test.mjs", "tests/sw-capability.test.js",
    "memory/Q1-Q2-INTEGRATION-20260930.md", "memory/00-INDEX.md",
    "memory/goal/commercial-player-stability.md", "memory/SESSION-LOG.md",
    "memory/CHECKPOINT.md",
    "qa/candidate-rc15-delivery/build-release.py",
])
for file in OUT.iterdir():
    if file.is_file() and file.name != "curated-savepoint.json":
        paths.add(file.relative_to(ROOT).as_posix())
for pattern in ["*-q2-q3-integration-resume.md", "*-q1-q2-final-integration.md"]:
    for file in (ROOT / "memory/checkpoints").glob(pattern):
        paths.add(file.relative_to(ROOT).as_posix())

rows = []
for relative in sorted(paths):
    data = (ROOT / relative).read_bytes()
    raw = subprocess.check_output(["git", "hash-object", "--stdin"], input=data, cwd=ROOT).decode().strip()
    filtered = subprocess.check_output(["git", "hash-object", "--path=" + relative, "--stdin"], input=data, cwd=ROOT).decode().strip()
    binding = data
    normalization = None
    if raw != filtered:
        # Only human-readable current project records may normalize newlines.
        assert relative.startswith("memory/"), relative
        binding = data.replace(b"\r\n", b"\n")
        normalization = "Git text newline normalization only"
        assert subprocess.check_output(["git", "hash-object", "--stdin"], input=binding, cwd=ROOT).decode().strip() == filtered
    row = {"path": relative, "bytes": len(binding), "sha256": hashlib.sha256(binding).hexdigest(),
           "rawBlob": raw, "filteredBlob": filtered}
    if normalization:
        row.update(workingSha256=hashlib.sha256(data).hexdigest(), normalization=normalization)
    rows.append(row)

result = {"scope": "Exact local Q1/Q2 integration and curated evidence proposal. No staging or publication by this producer.",
          "files": rows, "excluded": excluded,
          "limits": ["Historical proof manifests remain dated snapshots, not final product qualification",
                     "Large shared sources are recovered from the canonical seven-part license package",
                     "No installed SDK/cache, real-account artifacts or unrelated files selected"],
          "totalBytes": sum(row["bytes"] for row in rows)}
(OUT / "curated-savepoint.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"files": len(rows), "bytes": result["totalBytes"], "excluded": len(excluded)}))
