# Candidate rc.15 delivery

Fixed public source `ee0ac8449e37a982ab2204b5b65e472a6e04b6f4`, Worker version
`23c63fba-9845-443d-9c8a-9bd454d2b394`. This directory preserves candidate
delivery/source/package evidence, not authenticated media or device acceptance.
The canonical overview and open gates are `memory/CANDIDATE-RC15-20260930.md`.

- `deployment.json` pins successful candidate deployment,52 exact before/after
  output hashes and the private-log/producer hashes. `deploy-candidate.cjs` uses
  the already installed Wrangler CLI and refuses a different HEAD/name/write flag
  or any output extra/link/blob mismatch. It mutates only the authorized candidate;
  do not run it as a read-only verification command or from the later evidence HEAD.
- `results.json` is produced by `qa/candidate-delivery-audit.cjs` against the fixed
  source:52 Git-equal public bodies,40 cached bodies, eight uncached source archives,
  six private404 paths, cold/offline anonymous shell and zero page errors.
- `redacted-readback.json` retains exact Worker identity,11 binding names/types,
  public flags and configured-secret booleans. `redact-readback.cjs` requires the
  privately retained CLI version readback. Account/namespace/client/origin/author
  values and secrets/raw logs are excluded; a fresh clone cannot reproduce this
  historical control-plane observation without that private input.
- `source-readiness.json` binds fixed Git/current/delivered assets,26 local preferred
  sources and the ZIP; `finalize-source-readiness.py --write` updates only the private
  codec build flag with exact evidence. Its default mode verifies the saved binding.
  The source archives can reconstruct excluded compiler/library materials; restore
  the documented matching QA source paths before checking preferred-source hashes
  from a fresh clone. It does not deploy or recompile codecs. Subsequent normal
  codec packaging resets readiness until matching delivery is verified again.
- `package.json` and `build-release.py` pin the52-entry54,778,547-byte ZIP under
  workspace `releases/candidates`. Every member is a fixed Git blob, no private
  extras, and current-host ZIP generation is byte-equal. Pass the complete fixed
  source SHA; an existing artifact is preserved and verified rather than replaced.
- `materializer-first-failure.json` retains the reconstructed first refusal with
  unknown cause. `diagnose-materializer.cjs` adds filesystem observations while
  retaining original guards; its successful record has220 observations. That driver
  materializes the current HEAD and must not be rerun to overwrite this dated proof.
- `license-page-observation.json` retains returned MCP-managed anonymous desktop
  DOM/CSS data. `browser-boundary.json` records the failed owned-tab reconnection
  after a CUA runtime reset. Neither supplies authenticated playback/device proof.

Do not force-add this directory. Stage exact curated safe files only. Retained
`deployment-private.log` and `version-readback-private.json` stay ignored/private.
The current69-row qualification and all production/account/device limits remain
unchanged by publishing this candidate.
