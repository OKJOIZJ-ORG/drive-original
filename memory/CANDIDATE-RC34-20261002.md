# Candidate rc34 — 2026-10-02

Confirmed delivery of immutable source `09c61bdc1438df24e4213e348caea745823b5ee1`, version `1.22.0-rc.34`, Worker `6858a2cf-65ef-4887-81be-a65ffd55be92` at the existing free candidate origin. Production/main/push and automation are unchanged.

The product change is Q3-only 512KiB source reads/cache from committed3921b39; probe/Q1/Q2 keep their existing defaults. The88 focused reader/source/cancellation checks and106 release/shell/SW checks pass. Actual sustained Android improvement is not yet qualified; Q3-PRODUCT-20261002.md owns the previous failure and local change.

`qa/candidate-rc34-delivery/source-readiness.json` verifies61 public Git-equal assets,46 cache entries,9 uncached source archives,6 private404 routes, cold/offline controlled shell and0 page errors; Cloudflare readback matches the same Worker with existing candidate write flags. The public-only ZIP has61 Git-equal entries,56,788,506B, SHA256 `797e1e5cb69d46e0979ba9dc4e67757b0fa750561ecd7a284a0b8a6ff85efb17`. Raw control-plane and CLI records remain private and uncommitted.

The future Android proof binder's UUID/semantic-version mistake was fixed at its QA layer: four focused local guards pass, its original predicate/check snapshot remains in `qa/q3-read-coalescing-acceptance/binder-worker-identity-first-failure-safe.json`. It is bound to the completed same-source delivery proof. No full product replay or additional product deployment was performed for that tool fix. Physical Android normal update/EOF/resources are the next actual unit; original300s action/345s cleanup bounds and exact existing fixture are retained.
