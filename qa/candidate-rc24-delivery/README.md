# Candidate rc24 delivery record

Fixed source `8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7`, Worker
`c57f634a-377d-487e-aa81-61875598dd1d`, version `1.22.0-rc.24`.

Observed results: 643/643 stable local Node checks; 52 public and 40 named cached
assets equal fixed Git blobs; eight corresponding-source archives uncached; six
private routes return404; fresh anonymous controlled cold/offline shell and zero
page errors pass. Existing45s cold deadline and launch floors are unchanged.
`audit-memory-guard.json` records actual memory before launch. Root performed the
checks; this metadata curation does not repeat browser/account/product suites.

`deployment.json` and `redacted-readback.json` bind the delivered Worker and
unchanged public auth/write flags. AUTH_ENABLED and AUTH_DIAGNOSTICS remain true;
CANDIDATE_DRIVE_WRITES_ENABLED remains false. Public runtime additionally enables
only separately scoped own account-state writes. No effective logging/retention,
actual renewal or seamless outage-media claim follows from these flags.

`package.json` records the54780082-byte52-entry package at
`releases/candidates/Drive-Original-1.22.0-rc.24-8a2894e.zip`, SHA256
`a12e31433c6f3eb4490f9c01870e4e8f80252f8728f76c80b5ddb2c8d7296633`.
All public entries match Git; private entries0; local generation byte-identical.
`source-readiness.json` records26preferred-source hash checks and6readable
adaptations with exact distribution/producer bindings.

Prepared-v1 failed the inner VERSION_ASSERTION before ZIP creation because it
retained the rc22-to-rc23 substitution literal. Preserve `prepared-v1/`,
`preparation.json` and `build-release-v1-failure.json`. `preparation-v2.json` binds
corrected producers, including the exact prior-version replacement and launch
guard field label. The corrected package/deployment/delivery pass is separate
from that preserved preparation failure.

`curated-savepoint.json` lists exact safe files for root integration. Excluded:
raw private deployment/control-plane logs and JSON, product console logs, ZIP
binary, account/namespace/client/origin binding values and any unrelated files.
No broad directory force-add is intended. Every historical report remains
immutable. Natural PC/Android renewal and other live gates are separate work.

The companion `memory/CANDIDATE-RC24-20261001.md` is the scoped candidate record.
