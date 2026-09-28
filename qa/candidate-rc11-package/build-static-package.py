"""Export an explicit fixed candidate's public Git blobs; verify every ZIP byte."""
import argparse
import datetime
import hashlib
import io
import json
import pathlib
import re
import subprocess
import zipfile


def digest(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--delivery-record", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.source):
        raise ValueError("EXACT_COMMIT_REQUIRED")
    repo = pathlib.Path(__file__).resolve().parents[2]

    def git(*values):
        return subprocess.check_output(["git", "-C", str(repo), *values])

    if git("rev-parse", "--show-toplevel").decode().strip().replace("\\", "/") != repo.as_posix():
        raise ValueError("REPOSITORY_IDENTITY_MISMATCH")
    if git("rev-parse", f"{args.source}^{{commit}}").decode().strip() != args.source:
        raise ValueError("SOURCE_NOT_EXACT_COMMIT")
    public_source = git("show", f"{args.source}:scripts/public-files.cjs").decode()
    body = public_source.split("Object.freeze([", 1)[1].split("]);", 1)[0]
    files = re.findall(r"'([^']+)'", body) + [".nojekyll"]
    if len(files) != 19 or len(set(files)) != len(files):
        raise ValueError("PUBLIC_ALLOWLIST_MISMATCH")
    for file in files:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", file) or ".." in file.split("/"):
            raise ValueError("UNSAFE_PUBLIC_PATH")
    record_path = (repo / args.delivery_record).resolve()
    record_path.relative_to(repo)
    delivery_bytes = record_path.read_bytes()
    delivery = json.loads(delivery_bytes)
    payload = {file: git("show", f"{args.source}:{file}") for file in files}
    version = json.loads(payload["version.json"])["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+", version):
        raise ValueError("CANDIDATE_VERSION_REQUIRED")
    if delivery["source"] != args.source or delivery["version"] != version or delivery["passed"] is not True:
        raise ValueError("FIXED_DELIVERY_PROOF_MISMATCH")
    assets = delivery["assets"]
    if len(assets) != len(files) or {row["file"] for row in assets} != set(files):
        raise ValueError("DELIVERY_ALLOWLIST_MISMATCH")
    for row in assets:
        if row["gitEqual"] is not True or row["bytes"] != len(payload[row["file"]]):
            raise ValueError("DELIVERY_BYTE_PROOF_MISMATCH")
    timestamp = int(git("show", "-s", "--format=%ct", args.source))
    date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as output:
        for file in files:
            info = zipfile.ZipInfo(file, date.timetuple()[:6])
            info.external_attr = 0o100644 << 16
            output.writestr(info, payload[file])
    contents = archive.getvalue()
    with zipfile.ZipFile(io.BytesIO(contents)) as check:
        if check.namelist() != files or check.testzip() is not None:
            raise ValueError("ZIP_ENTRY_OR_CRC_MISMATCH")
        for file in files:
            if check.read(file) != payload[file]:
                raise ValueError("ZIP_GIT_BYTE_MISMATCH")
    destination = (repo.parent / "releases" / "candidates").resolve()
    destination.relative_to(repo.parent.resolve())
    destination.mkdir(parents=True, exist_ok=True)
    zip_path = destination / f"Drive-Original-{version}-{args.source[:7]}.zip"
    if zip_path.exists() and zip_path.read_bytes() != contents:
        raise ValueError("EXISTING_PACKAGE_DIFFERS")
    if not zip_path.exists():
        with zip_path.open("xb") as output:
            output.write(contents)
    if zip_path.read_bytes() != contents:
        raise ValueError("SAVED_ZIP_REREAD_MISMATCH")
    report = {
        "schema": "drive-original.fixed-public-candidate-package/1",
        "source": args.source,
        "version": version,
        "scope": "Public static assets only; evidence package, not production acceptance or deployed rollback",
        "package": zip_path.as_posix(),
        "zipBytes": len(contents),
        "zipSha256": digest(contents),
        "producerSha256": digest(pathlib.Path(__file__).read_bytes()),
        "deliveryRecordSha256": digest(delivery_bytes),
        "entries": [{"file": file, "bytes": len(payload[file]), "sha256": digest(payload[file])} for file in files],
        "verified": {"publicAllowlist": True, "gitBytes": True, "zipCrc": True, "savedReread": True},
        "originalMediaOrPrivateEvidenceIncluded": False,
        "productionChanged": False,
    }
    report_bytes = (json.dumps(report, indent=2, ensure_ascii=False) + "\n").encode()
    report_path = pathlib.Path(__file__).with_name("package-results.json")
    report_path.write_bytes(report_bytes)
    print(json.dumps({key: value for key, value in report.items() if key != "entries"}))


if __name__ == "__main__":
    main()
