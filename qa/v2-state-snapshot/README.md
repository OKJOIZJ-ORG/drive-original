# V2-08A private read-only snapshot QA

This module is QA infrastructure, not a product migration engine or write gate.
It never enables candidate Drive writes. It reads only the Drive identity and
matching legacy/writer appData files through an injected GET-only reader.

Run synthetic verification from the source repository:

```powershell
node --test qa/v2-state-snapshot/snapshot.test.mjs
```

`snapshot.mjs` is browser-importable ESM. Supply `read(url, { method, signal })`
returning a standard streaming `Response`, the actual application's
`normalizeAccountMediaState` and `mergeAccountMediaStates`, an expected Drive
`about.user.permissionId`, current-owner predicate, and optional abort signal.
The Worker's OIDC HMAC account key is a different identifier. The caller must
establish the approved legacy baseline and account through its authorized auth
owner; this module does not acquire credentials or log in.

Capture with `collectSnapshot`, then call `compareSnapshots` with the same
application functions. Private transferred/serialized captures are supported:
the comparator validates file metadata, raw schemas, writer identity, duplicates,
account/empty contracts, and recomputes the full union before accepting the supplied
remote projection. It cannot independently prove a supplied `stable:true` flag
came from a live read. Use `collectSnapshot` for that provenance; externally
supplied baselines require approved capture provenance. This is evidence QA,
and comparison never grants writes. Supply a legacy origin-local replica separately, together
with its Drive account ID. The returned local reconstruction is a private proposed
projection; it does not mean pending edits reached remote storage. Origin-local
writer IDs must not be copied to the new origin. OPFS media caches need no transfer.

Keep **all snapshots and the comparison result's `local` field private**. Only
`comparisonSummary` is intended for an approved aggregate report. Do not log,
commit, publish, or attach account IDs, writer IDs, file IDs, state payloads,
credentials, fingerprints, or real filenames. The committed tests use synthetic
IDs only. No real snapshot or generated report is included here.

The capture validates raw schema before using product normalization, reads every
page and body, and fences account/catalog stability before and after the capture.
It retries one changed catalog and reuses only bodies with identical metadata.
Failure codes contain no private identifiers. Empty captures require `allowEmpty`
and an explicitly approved empty baseline at comparison; empty candidates never
match a nonempty baseline. This includes existing blank documents with no viewed
or favorite/tombstone entries. Unknown schema, malformed maps/values, missing bodies,
duplicate file/writer identity, incomplete search, owner changes, budget exhaustion,
and cancellation reject capture. Lower configurable budgets cannot exceed defaults
(100 requests, 8 MiB total response bytes, 30 seconds, 64 files, 16 pages per listing).

Limitations: metadata stability relies on Drive updating modifiedTime/version for
content changes; the module does not lock remote writers or create an atomic Drive
snapshot. Existing clock-based merge semantics remain unchanged. Concurrent remote
changes between separately captured origins require a refreshed baseline instead
of treating a mismatch as data loss. Exact raw/schema/file metadata comparison is
conservative even when normalized unions happen to match. Schema-less legacy
documents and boolean favorite entries remain readable; numeric strings and
malformed historical values require explicit investigation, not silent coercion.
Live same-client/account appData visibility, private legacy local pending replicas,
physical devices, rollback readback, and operating transition remain unverified.

## Candidate browser adapter

`browser-adapter.mjs` captures two complete remote snapshots and compares the
current application's projection against their union plus its separate candidate
origin-local replica. It reuses actual app functions and the current memory-only
credential. Its restricted raw GET reader does not parse provider error bodies,
follow redirects, retry, refresh credentials or change the authentication owner.
keeps all private contents inside the call, and returns only counts/booleans/fixed
failure codes. A single run has a total 100-request, 8 MiB of consumed snapshot
response bytes and 30-second budget, checked again after synchronous comparison.
It requires the exact generated product version, candidate origin, read-only flag,
ready account, active service worker, visible page and idle media. Account,
generation, controller, runtime-projection and page-lifecycle changes stop it.
It neither initializes nor alters the application's state or storage.

```powershell
node --test qa/v2-state-snapshot/browser-adapter.test.mjs
node qa/v2-state-snapshot/build-browser-adapter.mjs
node --check qa/v2-state-snapshot/browser-function.generated.js
```

The generated public-source function is ignored, temporary, and suitable for
in-page DevTools execution after the actual account is ready. It returns no token,
account/writer/file ID, raw state, source fingerprint or provider error message.
Do not publish a private snapshot in order to invoke it. Anonymous candidate
execution returns `account_not_ready` before any Drive read.

Even a passing browser result only proves repeated candidate visibility and its
current runtime reconstruction. It does not prove the old production origin's
unsynced local replica, a newly created origin, physical devices or complete
migration acceptance. Those need their own approved private capture/provenance.
`legacyLocalReplicaVerified` and `deviceVerified` stay false, and no result grants
Drive write authorization.

## Actual rc.10 continuation

live-rc10-results.json records the connected user Chrome session and both failed
normal-poll captures and the passing controlled read. LoadingPromise represents
ordinary remote polling and no longer independently vetoes an unchanged owner;
SyncPromise remains excluded. Six remote documents were read twice, the actual
runtime reconstruction matched, and the separate candidate local replica still
had pending state. Writes and legacy/device acceptance remain false.

quiescent-window-rc10.js is the exact public developer wrapper from that capture,
not a product entrypoint. Execute it in the candidate main world with an audit
function accepting the remaining millisecond budget. It holds only this page's
state refresh/sync/retry timers, awaits existing operations without cancelling
them, runs the strict collector within one total30-second window and restores
eligible reservations for the same owner in finally. Do not use a default30s
collector after an additional unbudgeted wait. No credential/media owner or
storage is changed by the wrapper. The actual passing run held only refresh;
sync/retry restoration is reviewed logic, not separately proven live behavior.
The result is controlled read evidence, not ordinary concurrent write acceptance.
