# Candidate29 fixed-source delivery preparation

Fixed SOURCE: `10f1dd2ee9550866933e693dbf41c62e1fb2daad`, version
`1.22.0-rc.29`. Existing candidate29 test drivers/results and frozen candidate28
delivery evidence are preserved. No network/browser/device/provider/deployment
action was executed by this preparation.

New materialization is
`C:\extensions\Drive-Original\releases\candidates\Drive-Original-1.22.0-rc.29-10f1dd2`.
All 52 entries (51 public allowlist files plus empty .nojekyll) equal fixed Git
blobs. The existing `_site` is untouched. The materializer creates only a new
directory and uses exclusive file creation; an existing directory is verified,
never overwritten or deleted.

ZIP: `releases/candidates/Drive-Original-1.22.0-rc.29-10f1dd2.zip`,
54,790,661 bytes, SHA256
`dea40a381bfb478cd7ee73ec54bcc2c14249944fd489a2bbfa1ffe08e1d80052`.
All 52 entries equal Git, no private extras, CRC passes, fixed ZIP timestamps and
metadata, and retained ZIP bytes equal independently generated deterministic
bytes. See package.json and materialization.json.

## Guards

`delivery-guard.cjs` requires exact repo/HEAD SOURCE, clean tracked public/build
and Worker inputs, normal non-linked files and Git-normalized input blob identity.
It evaluates fixed runtime flags and version: candidate:true, general writes:false,
accountStateWrites:true. Worker config must use the exact candidate name/origin,
workers.dev enabled, preview disabled, no routes/environment override, ASSETS
binding, and general writes:false. It never prints credential/config values.
Deployment receives `--assets <new29 directory>` rather than changing canonical
wrangler config or `_site`. Local installed Wrangler's own CLI source confirms
support for this deploy option. Wrangler metrics are disabled in spawned CLI.

Deploy/readback/audit require literal `--execute`; none was invoked with it here.
Readback requires a successful exact-source deployment record and exact version
ID. Audit requires deployment, fixed audit-producer bytes, available local Chrome
launch memory (>1GiB physical and >1.5GiB virtual) and installed Playwright; its
narrow resource probe does not call the old ADB/device/process preflight.
Every action rechecks fixed HEAD after it finishes. Any subsequent commit makes
the wrappers fail until root deliberately pins a newly reviewed source.

Source-readiness finalization writes only its QA source-readiness.json after
matching deployment/readback/public/cache/package evidence. It rejects --write;
canonical media/audio-codec-build.json and its historical distributionEvidence
remain untouched. Existing broad claims/acceptance are not promoted by packaging.

## Exact root execution sequence after review and actual GO

Working directory for every command is `C:\extensions\Drive-Original\source`.
The local materialization and package steps are already complete; guard verifies
the preserved materialization without rewriting it:

```powershell
node qa/candidate-rc29-delivery/delivery-guard.cjs
node qa/candidate-rc29-delivery/deploy-candidate.cjs --execute
node qa/candidate-rc29-delivery/readback-candidate.cjs --execute
node qa/candidate-rc29-delivery/redact-readback.cjs
node qa/candidate-rc29-delivery/audit-with-memory-guard.cjs --execute
python qa/candidate-rc29-delivery/finalize-source-readiness.py
```

Regeneration/verification commands, if a new relevant concern warrants them:

```powershell
node qa/candidate-rc29-delivery/materialize-candidate.cjs
python qa/candidate-rc29-delivery/build-release.py 10f1dd2ee9550866933e693dbf41c62e1fb2daad
```

Only `materialize-candidate.cjs` and `build-release.py` were executed as local
creation/verification during preparation. JS syntax checks and Python AST parsing passed. No product suites
were repeated; candidate29's existing test evidence remains separately owned.
Raw deployment/control-plane output will be private QA files if root later
executes those steps; the redactor omits identity/config values and secret bodies.
