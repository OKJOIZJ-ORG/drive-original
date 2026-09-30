# Candidate rc.24 — fixed delivery and auth body recovery

Confirmed delivery: source `8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7`, version
`1.22.0-rc.24`, Worker `c57f634a-377d-487e-aa81-61875598dd1d`, at the approved
[free candidate](https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/).
This is candidate publication only; production v1.21.0, main/push and the paused
automation remain separate.

The narrow change retains scheduled recovery after a successful credential
response body times out or fails with a transport TypeError. Malformed JSON,
invalid credential schema, terminal HTTP outcomes and cancelled generations
remain stopped. The shared flight still has its original 55-second deadline;
ambiguous body failure adds no in-flight HTTP replay. The opt-in parser callback
preserves other callers' default null behavior. Independent scoped review is
clean. Local full Node checks pass 643/643 with unchanged source hashes during
the run; the five streaming-body checks and 136 app checks are recorded
separately in `qa/rc23-auth-body-deadline/product-checks.json`.

`qa/candidate-rc24-delivery/results.json` passes 52 public Git-byte comparisons,
40 named shell-cache Git-byte comparisons, eight uncached corresponding-source
archives, six private-path 404 checks, a fresh anonymous controlled cold shell,
offline shell and zero page errors. The original 45-second cold criterion and
strict launch-memory floors were retained. The launch guard observed 3791652
physical/1957788 virtual KiB free, above the exclusive 1048576/1572864 KiB floors.
`source-readiness.json` binds those results to the same fixed source/Worker and
records 26 preferred-source hash checks and six readable adaptations.

The 52-entry package is `releases/candidates/Drive-Original-1.22.0-rc.24-8a2894e.zip`,
54780082 bytes, SHA256
`a12e31433c6f3eb4490f9c01870e4e8f80252f8728f76c80b5ddb2c8d7296633`.
Every public entry equals its Git blob, no private entry is included, and local
generation is byte-identical. This static package does not package the separate
authenticated backend.

Redacted control-plane readback confirms AUTH_ENABLED=true, AUTH_DIAGNOSTICS=true
and CANDIDATE_DRIVE_WRITES_ENABLED=false. Public runtime keeps candidate=true,
ordinary Drive mutations=false and separately scoped accountStateWrites=true.
These unchanged flags do not establish effective log collection/retention or
authorize broad original-file mutations. Raw control-plane/deployment logs and
binding values are excluded from the curated savepoint.

The first prepared producer retained an obsolete inner-version replacement,
derived rc.23 instead of rc.24 and failed VERSION_ASSERTION before ZIP creation.
`build-release-v1-failure.json` and `prepared-v1/` preserve that attempt. Corrected
v2 producers and `preparation-v2.json` establish the delivered package; no product
cause or failed public deployment is inferred from the packaging failure.

Actual natural renewal on this fixed24 source is not yet established by this
delivery record. PC/Android uninterrupted frames across the old expiry,
foreground/OS return, broad corpus, state/offline convergence and worker-update
integration retain their own acceptance records. The actual earlier PC failure's
missing HTTP reason remains unknown. Candidate rollback must use a previously
verified candidate through its normal publication path; no data reset, account
revocation, production rollback or migration reversal was performed here.

Exact safe producers/results and exclusion boundaries are enumerated in
`qa/candidate-rc24-delivery/curated-savepoint.json`; root owns integration.
