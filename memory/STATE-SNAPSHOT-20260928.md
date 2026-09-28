# Read-only state reconstruction QA — 2026-09-28

Observed local V2-08A foundation, not completed live migration. The existing
legacy-plus-writer appData union is retained; no new storage schema, writer ID
copy, conflict engine or product migration path was introduced.

`qa/v2-state-snapshot/snapshot.mjs` collects complete GET-only account/catalog/body
evidence with pre/post account and catalog checks, one bounded retry, strict raw
schema/state validation and request/byte/time caps. Changed-catalog retries reuse
only unchanged-metadata bodies. Missing files, unknown schema, incomplete search,
duplicates and unapproved empty state fail. Full private contents are compared,
including unlike tombstones, viewed timestamps, writer/file identities and raw
schema. Transferred snapshots are structurally checked and their union recomputed
with the real product merge/normalizer. External stable provenance still requires
an actual approved capture; a boolean flag is not proof.

`browser-adapter.mjs` binds the exact candidate version, current memory credential
and real merge functions, read-only mode, account/generations, active SW, visible lifecycle
and idle media. It reads twice within one total 100-request/8MiB/30s budget and
compares the app's current projection with remote union plus a separate candidate
local replica. It returns only aggregates and fixed errors; no private snapshots,
IDs, credentials or provider messages leave the closure. It never writes state,
changes the write gate or copies origin-local writer IDs.

Independent review reproduced an unchecked final synchronous deadline and found
that generic `driveFetch` consumes error JSON outside the QA byte budget. The
adapter now rechecks elapsed/current/local state before returning, and uses a
restricted raw GET with the current memory credential. It performs no retry,
refresh or redirect and never consumes provider error JSON. The byte cap applies
to consumed snapshot responses, not total network or browser memory.

Observed synthetic collector/comparator 13/13 and adapter 11/11 pass, including
same-count different IDs, strict raw schema, noncooperative read deadlines,
incomplete pagination, tombstones, local pending state, owner/controller/lifecycle
change, both-capture cumulative budgets, final synchronous time limit, generated
authenticated synthetic execution and privacy assertions. The generated function parses; actual anonymous
rc.8 DevTools execution returns `account_not_ready` before Drive reads. No current
authenticated snapshot was captured. The live Google login request is pending.

## Remaining evidence

Repeated candidate visibility alone cannot prove the old production origin's
unsynced local replica, fresh-origin reconstruction, two-device convergence or
rollback readback. The QA reports keep `legacyLocalReplicaVerified=false`,
`deviceVerified=false` and `writeAuthorization=false`. Candidate writes stay
disabled. Metadata stability relies on Drive modifiedTime/version, not an atomic
remote lock; concurrent remote changes require a refreshed baseline. Existing
clock-based merge semantics are unchanged.

Maintained driver and exact commands/limits: `qa/v2-state-snapshot/README.md`.
Keep actual snapshots private and out of commits. Production, original media,
account appData and automation remain unchanged. No merge or push was performed.
