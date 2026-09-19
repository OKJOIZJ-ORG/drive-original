# Local authentication contract

These dependency-free ESM modules are a locally testable candidate. They are not a
deployed Worker, a Google OAuth implementation, or a media proxy. No production
configuration, credentials, or Google/Cloudflare requests are included.

`AccountCredentialOwner` requires one durable atomic state store per verified
account. `storage.transaction(fn)` invokes a synchronous callback with mutable
state, commits all changes together only when the callback returns, and returns
a detached copy of its result. The adapter must serialize transactions across
instances. It must not replay callbacks with external side effects. All upstream
I/O occurs outside transactions. This interface is intended to be wrapped by a
SQLite-backed Durable Object transaction, not eventually consistent KV.

Refresh/revoke, authenticated encryption/decryption, a clock, cryptographically
secure random IDs, waiting, session digest, and alarm scheduling are injected.
The refresh adapter receives `{refreshToken, signal}` and returns
`{accessToken, expiresAt, refreshToken?}` or `error: invalid_grant`. It must honor
abort and bound upstream I/O below the persisted lease lifetime. An abandoned
lease can be recovered after expiry; the lease ID and monotonic revision prevent
an old completion from overwriting newer state. Uncertain upstream completion
cannot prove exactly-once Google execution across a host crash. Concurrent live
instances use the same lease/result; an in-memory promise only reduces local work.

Only a server-side, fully verified code exchange may call
`establishVerifiedSession`. It must validate Google signature and
`iss/aud/exp/iat/nonce/sub`, inspect granted scopes, and derive an opaque account
key from a keyed digest of issuer + subject before choosing the account object.
The owner never accepts browser refresh credentials. Access results and encrypted
refresh credentials remain server state; only the short access result crosses the
credential API. Browser/SW consumers must retain it in memory only.

Sessions have 30-day inactivity and 90-day absolute limits. A seven-day grace
starts when the last session ends/expires. `alarm()` prunes expired sessions and
removes the server credential at the deadline. The host must durably schedule
`nextAlarmAt` (including after restart) and invoke this hook. The owner serializes
local alarm writes and rereads durable `nextAlarmAt` after each write so an older
completion repairs rather than cancels a newer deadline. The host adapter must
also reconcile the stored deadline when constructing a fresh owner. Alarm API
contention that cannot converge installs a conservative near-term repair alarm,
never an unchecked stale or `null` deadline. A new session is not returned until
its retention alarm is installed; persistent scheduling failure removes only that
new session under a monotonic revision fence and, when no older session remains,
drops the credential immediately rather than silently extending retention. An
`alarm()` rearm failure propagates to the host retry path. Alarm API failure does
not undo an already committed logout/disconnect or suppress its revocation result.
Logout ends only one session. Explicit disconnect removes all
sessions and local secrets before attempting revocation and reports an
inconclusive upstream result honestly. Product data is outside this owner's store
and API.

After Google reports `invalid_grant`, the durable credential is marked for
reconnection. A later verified code exchange must supply a new refresh credential;
the normal missing-field preservation rule applies only while the prior credential
is still healthy.

`PreAuthTransactionOwner` holds one ten-minute record and deletes it atomically on
consume, including wrong-cookie/state and expired attempts. The host routes each
opaque random state to an isolated transaction object and schedules its alarm.
The constructor can receive the host-generated random `state` used to select
that object; without it the local fixture generates the state on creation.
The server-only record contains PKCE verifier, nonce and keyed cookie digest.
No field from that record may be logged. Successful consumption precedes exchange;
exchange failure cannot make a consumed transaction replayable.

`createAuthHandler` exposes POST credential/logout/disconnect and local POST
transaction contract endpoints. Every route checks exact origin, custom CSRF
header `X-Drive-Original-CSRF: 1`, same-origin Fetch Metadata, and returns
`Cache-Control: no-store`. Session and transaction resolution are injected; no
account is selected from untrusted `expectedAccount`. Host session indexing must
use opaque session credentials securely and clean stale mappings. The public
credential response is `{accessToken, expiresAt, account, revision}`. Errors are
finite redacted `{error: {code, retryable}}` values. No upstream error messages or
token payloads are returned.

Actual `GET /auth/google/start` and the cross-site Google callback need a separate
host adapter with the documented exact callback URL, cookie/state verification,
PKCE S256, secret bindings and Google verification. They must not reuse the POST
route's Fetch Metadata requirements for a Google redirect. The local transaction
routes do not stand in for verified live OAuth success. Build-URL/exchange adapters
are required; without them, these routes fail closed.

Run `node --test tests/auth-session.test.mjs` for deterministic local evidence.
Live Cloudflare atomic storage/alarms, Google offline credential issuance, real
browser cookie behavior, platform limits, and device/PWA continuity remain gates.
