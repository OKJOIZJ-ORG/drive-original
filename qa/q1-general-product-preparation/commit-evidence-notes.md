# Curated Q1 commit evidence

`commit-manifest.json` lists exact owned paths, byte counts and SHA-256 values.
It is a staging/review proposal; creating it does not stage or commit files.
The manifest's own hash is intentionally excluded to avoid a circular hash.
`prepare-commit-manifest.mjs` regenerates the inventory after an authorized change.

Historical producers and reports remain byte-for-byte unchanged. The original
QA fork, vendor bundle, patch and independent oracle are distinct from the newer
product fork. In particular, original direct-versus-MSE RGB counterevidence and
the observer's limits remain in native-diagnosis.json. The existing completion
reports are historical snapshots, not manifests for subsequently edited notices
or new publication files. New package verification is publication-verification.json.

The public source TGZ contains matching preferred source and build inputs,
without compiled runtime duplicates or SDK caches. It is independent from the
old QA preferred-source archive. The candidate notice must travel with the
matching runtime and source download; root owns publication and allowlists.

Only the raw FFprobe source reports consumed by the preserved native diagnosis
are included. Other per-packet FFprobe dumps and remuxed output copies can be
regenerated with the retained producer/oracle. The exact source fixture bytes
used by the original oracle are retained where owned here; pre-existing or
other-owner fixture dependencies are listed separately in the manifest.

The 37,684,600-byte long TS and generated video-only/test copies are not included
as redundant large evidence. Their exact hashes and generator commands are in
`regenerableFixtures`. Existing `tests/general-q1-fixture.mjs` embeds the tiny
self-contained test input. Recreating encoded fixtures on another FFmpeg build
may change their bytes; compare the recorded hash instead of assuming identity.
The already-recorded native trial is not replaced by such a recreation.

Root integration order:

1. Review the exact owned-file list and external dependencies. Preserve historical
   producers/reports with root-owned `.gitattributes` (`-text`), and the source
   `.tgz` as binary. Respect listed raw-byte preservation requirements before
   staging; do not silently normalize a hash-bound old producer.
2. Stage only the chosen exact task-owned paths, including this manifest itself.
   Resolve any missing external fixture/archive dependency through its owner or
   the pinned provenance. No QA import belongs in product runtime code.
3. Add the source download, license/notice and required runtime modules to the
   root-owned candidate manifest/allowlist. Wire the reviewed player API and
   retain the existing TS route and explicit qualification boundaries.
4. Validate committed/candidate bytes against this manifest, verify the candidate
   source-download response and notice link, and retain the demonstrated
   lifecycle, clock, payload and color evidence distinctions. Publishing a
   candidate and any production deployment remain separate root decisions.
