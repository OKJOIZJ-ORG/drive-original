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

Observed rc.10 lifecycle alignment: generated capture additionally requires
q1RetirementResult.settled=true before declaring media idle. Pending, false and
missing results fail as media_busy with zero Drive reads. Collector13 and
adapter12 tests pass together25/25; qa/v2-state-snapshot/adapter-tests-rc10.txt
preserves this follow-up without replacing the original11-case adapter evidence.

## Actual user-profile readback — 2026-09-28 18:14

The user reported candidate login and playback. The managed test Chrome still
had no account, but opening the same candidate in the connected user Chrome
profile restored an existing session without another login. Actual rc.10,
ready account, active SW, idle/settled media and read-only mode were observed.
The earlier login blocker applied to the isolated profile, not the user's session.

Actual failed capture reports are retained in qa/v2-state-snapshot/live-rc10-results.json.
A discriminator found the normal 15-second remote read's LoadingPromise caused
stale_owner despite unchanged identity/projection/cache. The QA adapter now
fences the applied owner/projection instead of rejecting that read promise;
write SyncPromise remains excluded. Focused16 tests pass, including concurrent
benign polling, real owner/projection/cache/lifecycle changes and write sync.
No product, schema, version or candidate assets changed. The prior frozen
verification-rc10.json still identifies the older QA adapter; it is historical
evidence, not a claim that every current QA byte has that old hash.

The candidate's pending local viewed state also queues a flush. Its non-GET is
blocked by the immutable read-only gate, but that active SyncPromise correctly
stops the strict collector. A reviewed developer window temporarily held only
this page's account-state timers, awaited active operations within a total30s,
passed the remaining budget to the maintained collector and restored eligible
timers for the same owner in finally. It did not cancel auth/media owners or
change storage, caches, credentials, revision, errors or backoff. The actual
window held/restored only the refresh timer; sync/retry restoration branches
were reviewed, not exercised in this passing run. Original timer deadlines are
not claimed to be restored exactly. Public wrapper quiescent-window-rc10.js and
the report retain exact execution/source hashes; generated syntax passes.

Observed controlled capture passed in29995ms:20GETs/102048consumed bytes/0retries,
two complete six-document reads, identical raw documents/catalog/remote union,
liked8/unliked48/viewed130 and matching actual runtime reconstruction. Candidate
local replica is present and has pending state; it is preserved, not uploaded.
Post-window readback confirms account/read-only/media readiness and restored
refresh scheduling. No private snapshot, identifier or credential was exported.

This closes current candidate visibility/projection evidence only. Legacy-origin
pending local replica, fresh-origin reconstruction, real two-device propagation
and rollback remain open; writeAuthorization/legacyLocalReplicaVerified/deviceVerified
stay false. Candidate writes remain disabled. Natural provider expiry, sleep/wake,
actual priority/full-format media and physical iPhone gates are separate.
The user requested simple device-wide silence: Windows default playback volume
was set7%to0% and independently read back0; no per-video mute loop is needed.
