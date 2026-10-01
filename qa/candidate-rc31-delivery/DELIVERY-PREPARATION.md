# Candidate31 delivery preparation — binding required

This additive leaf contains a local binder and verification only. Source31 is not
bound; materialization, ZIP creation, provider/network/browser actions and actual
deployment remain unperformed. Root owns the final product commit, tests, review
and candidate execution. Current production and frozen rc29/rc30 are preserved.

The immutable predecessor is rc30's binder from commit
`aa46bd083ce8c21f55cf7d9a4759f0d6709188c2`, SHA256
`be3d5f4472cea786e4d09fee6480a166cb9941cc6ff6e7897262963d83a3574e`.
The new binder checks that exact predecessor and derives the same eight reviewed
producer templates from immutable commit
`5f6dae39a6a601207ff2c9e462b3ec8d610e91b4`, retaining their individual SHA256 pins.
Only enumerated delivery identities, output paths and candidate labels change.
No source revision/toolchain/preferred-source metadata or old evidence is relabelled.

Binding accepts exactly `--bind FULL_40_LOWERCASE_SHA 1.22.0-rc.31`, with no HEAD
fallback. The supplied SHA must be the real current committed HEAD. Before writing
eight pinned scripts, the generated guard requires clean governed public/build /
Worker files, ordinary nonlinked/nonhardlinked files, exact Git blob identity,
51 public files plus empty .nojekyll, version31 and candidate runtime flags:
general Drive writes:false, accountStateWrites:true. Candidate Worker guards
retain the exact candidate name/origin, workers.dev:true, preview_urls:false,
no route/environment overrides, ASSETS binding and general writes:false. The
separate audit producer must equal that committed source. Differing existing
bound scripts/evidence are rejected rather than overwritten.

Materialization creates only a new source-specific release directory; ZIP creation
retains deterministic exact public bytes and verifies existing retained output.
Deploy/readback/audit require literal `--execute`, retain private raw logs without
printing them, disable Wrangler metrics, and recheck exact source. Source-readiness
retains independent delivery/readback/cache/package and canonical preferred-source
hash checks; it writes QA evidence only and rejects `--write`. Original media,
canonical historical distributionEvidence, production/main/push and automation
are outside these scripts' scope.

From `C:\extensions\Drive-Original\source`, after root's reviewed final commit:

```powershell
node qa/candidate-rc31-delivery/bind-source.cjs --bind <FULL_SHA> 1.22.0-rc.31
node qa/candidate-rc31-delivery/materialize-candidate.cjs
python qa/candidate-rc31-delivery/build-release.py <FULL_SHA>
node qa/candidate-rc31-delivery/delivery-guard.cjs
```

After root review, within its existing actual candidate execution authority:

```powershell
node qa/candidate-rc31-delivery/deploy-candidate.cjs --execute
node qa/candidate-rc31-delivery/readback-candidate.cjs --execute
node qa/candidate-rc31-delivery/redact-readback.cjs
node qa/candidate-rc31-delivery/audit-with-memory-guard.cjs --execute
python qa/candidate-rc31-delivery/finalize-source-readiness.py
```

See local-delivery-preparation.json for local syntax/denial checks and explicit
bind-required verification. No copied rc30 result establishes rc31 delivery or
PC/Android acceptance. A later commit invalidates the exact-source wrappers.

Initial task-owned staging manifest (all three are ignored and require exact-file
force staging by root):

- qa/candidate-rc31-delivery/bind-source.cjs
- qa/candidate-rc31-delivery/DELIVERY-PREPARATION.md
- qa/candidate-rc31-delivery/local-delivery-preparation.json

After binding, the additional exact task-owned files are binding.json,
delivery-guard.cjs, materialize-candidate.cjs, deploy-candidate.cjs,
readback-candidate.cjs, redact-readback.cjs, audit-with-memory-guard.cjs,
build-release.py and finalize-source-readiness.py. Generated delivery results
must be evaluated separately; private raw CLI files must not be staged.
