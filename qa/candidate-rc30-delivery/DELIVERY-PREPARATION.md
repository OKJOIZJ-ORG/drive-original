# Candidate30 delivery preparation — source binding required

Only the local binder and this guide are prepared. The final rc.30 product SHA
has not been supplied, no source is bound, and no materialization, ZIP, network,
browser, provider readback or deployment has been performed by this preparation.
Historical candidate29 files and evidence remain unchanged.

`bind-source.cjs` accepts exactly `--bind FULL_40_LOWERCASE_SHA 1.22.0-rc.30`.
It requires that SHA to be the current committed HEAD, then derives eight scripts
from exact hash-pinned rc29 producer blobs in frozen commit
`5f6dae39a6a601207ff2c9e462b3ec8d610e91b4`. It changes only enumerated delivery
identity literals, output leaf paths, and descriptive candidate labels. Codec
toolchain revisions, preferred-source hashes and historical distributionEvidence
are preserved. The generated guard checks rc30 public/runtime/Worker inputs before
the binder creates files. Existing differing bound scripts are rejected rather
than overwritten. Binding is local preparation, not delivery evidence.

The inherited guard requires exact repo/HEAD, clean public/build/Worker inputs,
regular non-linked/non-hardlinked files and normalized Git blob identity. Its
51-file public allowlist and empty .nojekyll form the exact 52-entry byte manifest.
It requires candidate:true, general Drive writes:false, accountStateWrites:true,
the exact candidate Worker/origin, workers.dev:true, preview_urls:false, no routes
or environment override and the ASSETS binding. Raw CLI output remains private
QA files and is never printed by deploy/readback/audit wrappers. Wrangler metrics
are disabled. The separately committed generic audit producer is byte checked.

Materialization and packaging create a new candidate30 destination under
`C:\extensions\Drive-Original\releases\candidates`; retained assets/packages
are verified without overwriting. Deploy/readback/audit retain the literal
`--execute` gate. Audit retains the available-memory and installed-Playwright
checks without ADB/device/process probes. Source-readiness requires exact
deployment/readback/public/cache/package evidence, rejects `--write`, and verifies
canonical preferredSource/artifact/readable-adaptation hashes. If product changes
affect those hashes, the root must update canonical metadata before the final
source commit; this binder does not fabricate or rewrite source-readiness.

Run from `C:\extensions\Drive-Original\source` after root's reviewed rc30 product
commit. Replace `<FULL_SHA>` with that commit's real full SHA:

```powershell
node qa/candidate-rc30-delivery/bind-source.cjs --bind <FULL_SHA> 1.22.0-rc.30
node qa/candidate-rc30-delivery/materialize-candidate.cjs
python qa/candidate-rc30-delivery/build-release.py <FULL_SHA>
node qa/candidate-rc30-delivery/delivery-guard.cjs
```

Only under root's existing candidate execution authority and after review:

```powershell
node qa/candidate-rc30-delivery/deploy-candidate.cjs --execute
node qa/candidate-rc30-delivery/readback-candidate.cjs --execute
node qa/candidate-rc30-delivery/redact-readback.cjs
node qa/candidate-rc30-delivery/audit-with-memory-guard.cjs --execute
python qa/candidate-rc30-delivery/finalize-source-readiness.py
```

Every generated action rechecks exact HEAD; subsequent commits invalidate that
binding. No copied rc29 result is rc30 evidence. Product tests and actual PC /
Android playback acceptance are independently owned by root and are not rerun
or promoted by this preparation. Generated-script syntax and default execute
denial must be checked again after binding; local preparation verification can
only establish binder syntax, denial with missing/invalid arguments and frozen
template availability before the final SHA exists.
