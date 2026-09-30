# Renewal diagnosis - local synthetic discriminants

Run from the canonical repository: `node qa/rc22-renewal-diagnosis/diagnose.mjs`.

The page source baseline is pinned to `eb11d66:app.js`. It runs the actual page
auth functions, including the current Q1 lease check, against the actual
`AccountCredentialOwner` with serializable fake storage. Synthetic provider,
account, session, tokens and controlled clock only; no real network, browser,
device, Drive access, grants, reset, revoke or publication. `results.json` owns
the aggregate output. `policy-prototype.js` changes only the isolated VM; it is
not a public asset or a product edit.

Confirmed local baseline mechanisms:

- First natural renewal at expiry minus35s is before the owner's30s refresh
  window. The server returns the same credential five times at35/34/33/32/31s,
  then refreshes at30s. A successful HTTP response is not monotonic renewal.
- Two1904ms transient503 failures at30s/27.096s leave token revision1, retained
  account, `auth-unavailable`, no usable token and no future timer. A later
  canonical credential request returns200/revision2.
- The exact active Q1 lease can receive `requestCurrent:true` but no credential
  after a transient failure; an immediate request during the server's1s failure
  cooldown can receive another503 without another upstream refresh.
- Two independent owner instances still commit one refresh/revision. This is a
  client recovery defect; the reproduced case does not justify changing leases.

The proposed client-only policy requires newer revision using the existing
`rejectedRevision` contract, starts at `TOKEN_SKEW_MS +
AUTH_CREDENTIAL_TIMEOUT_MS +5000` before expiry, and retains one shared credential
flight under the existing55s total deadline. Only503/`auth_unavailable` or a
network `TypeError` retries, at1250ms then2500ms, at most three fetches. Exhausted
transient attempts retain at most one15s successor timer at a time while the same
account, generation, revision and expiry remain current and the page is visible
and online. Each exhausted flight may schedule its successor, including after
the old credential expires, until recovery, a terminal result or an owner/visibility/
connectivity change. This is serialized recovery during a long outage, not a
one-shot retry. Each flight keeps the three-attempt55s limit; no timers or parallel
flights accumulate. Timer callbacks must own the registered timer before mutating it.

Local prototype19 checks include two503 recovery, recovery after four503 failures,
active Q1 waiters, retired Q1 rejection, atomic two-owner refresh, terminal
reconnect/client-update/forbidden/stale-revision stop, generation clear during a
retry delay, original55s hanging-fetch deadline, hidden/offline retry suppression
and stale queued callback rejection.

## Product integration and native evidence

The narrow product implementation changes only `app.js` auth renewal/request
ownership and outcome clearing. `tests/app.test.js` updates the two obsolete
one503-attempt expectations and adds eight focused cases, including actual
`AccountCredentialOwner` atomic renewal before its cache window, three-attempt
shared recovery, exact scheduler fences, terminal/misleading503 outcomes, the
original55s total deadline across attempts, generation clearing during backoff,
competing same-generation outcome ownership and current/retired Q1 replies.

Complete app tests130/130 and related auth/session/scopes/SW-capability/controller
tests54/54 pass. Focused auth checks23/23, syntax and scoped diff whitespace pass.
Root owns the subsequent23 version/full-suite/review/publication.

`build-native-audit.cjs` derives the isolated fork `q1-auth-audit.cjs` from the
original maintained `qa/q1-auth-audit.cjs`, retaining its SHA256 provenance and
preserving that driver and historical outputs. It adjusts only the unavailable
mode's expected auth request count to three, supplies the current explicit
full-grant fixture, handles current WASM public MIME, waits for settled startup,
and records the existing >1048576KiB physical/>1572864KiB virtual launch floors.
The successful `native/q1-auth/results.json` reports17/17 native Chrome cases,
unchanged producers, actual product app/SW and synthetic-only provider. It retains
the existing exact input/output byte comparators and media retirement checks.

The first fork attempt exposed an outdated fixture that supplied no capabilities;
its initial-control timeout is preserved as `native/q1-auth/fork-v1-failed.json`.
An earlier MIME-map failure for current public assets occurred before a normal
report could be written. Those failures do not establish a product cause. Every
native attempt used an isolated owned Chrome/server and closed its resources;
no live account or device was used.

Actual PC evidence supplied by the coordinator: selected priority Q1 playback
had323 callbacks before the natural boundary and then `Q1_SOURCE_READ_FAILED`,
retained account and unchanged revision57. Its original HTTP response/error code
was not captured. Android separately observed startup credential503; a later PC
canonical recovery returned200/revision58. These facts are compatible with the
local failure mechanism but do not identify the actual PC failure's cause.
