# V2-04A — local same-origin authentication contract

- Status: `IMPLEMENTED_LOCAL`; not deployed and not a runnable live OAuth candidate
- Implementation commit: `ed8b619` (`feat: add V2-04A session auth contract`)
- Evidence date: 2026-09-19 KST
- Governing decisions: D-050 and D-051

## Result

V2-04A replaces the browser-owned GIS token model in the candidate source with a
single same-origin credential-provider contract. The page and its client-scoped
service worker retain only `{accessToken, expiresAt, account, revision}` in
memory. An injected durable account owner retains the encrypted refresh
credential, opaque sessions, monotonic credential revision and persisted refresh
lease. A separate short-lived transaction owner retains and atomically consumes
pre-auth state, PKCE verifier, OIDC nonce and keyed cookie digest.

This unit does not contain a live Cloudflare Worker adapter, Google authorization
URL/callback implementation, secret binding or deployment configuration. It does
not claim a successful Google login, refresh credential, browser cookie, Durable
Object alarm or iPhone/PWA run. Those are V2-04B gates.

## Responsibility and interface

| Boundary | Implemented local contract | Explicitly excluded |
|---|---|---|
| Page | `POST /api/session/credential`, memory-only credential, one in-flight request, account/revision/generation fences, bounded offline/non-JSON failure, separate logout/disconnect | GIS popup/token client, browser refresh token, client ID override, credential persistence |
| Service worker | Per-client memory credential, correlated credential request after restart, account-generation and monotonic-revision checks, one 401 replay only with a newer revision | Global token owner, credential cache, media cache, auth fallback to another client |
| Media/data plane | Existing service worker still calls `https://www.googleapis.com/drive/v3/files/{id}?alt=media` directly and the page still calls Drive REST directly | Auth Worker media/Drive proxy, byte cache, FFmpeg, remux, transcode or mutation API |
| Session API | Exact HTTPS origin, custom CSRF header, same-origin Fetch Metadata, 4 KiB strict JSON, finite redacted errors, `no-store`, `__Host-` cookies | Cross-origin cookie service, token/query parameters, secret-bearing input or output |
| Account owner | Atomic store interface, encrypted refresh state, opaque session digest, persisted refresh lease, 30-day idle/90-day absolute session bounds and seven-day final-session grace | Eventually consistent KV as owner/lock, in-process mutex as the only concurrency control |
| Pre-auth owner | Ten-minute one-use state/PKCE/OIDC transaction with terminal consume and alarm cleanup | Selecting an account before signed Google subject verification |

The browser endpoints are:

- `GET /auth/google/start` — referenced by the page but deliberately left for the
  V2-04B host adapter.
- `POST /api/session/credential` — returns only the public credential object.
- `POST /api/session/logout` — ends only the current application session.
- `POST /api/account/disconnect` — removes all application sessions and the
  server credential before attempting revoke; an uncertain revoke is reported as
  `inconclusive` with the manual Google permissions URL.

`auth/routes.mjs` also exposes local POST transaction fixtures so the security
contract can be tested without pretending they are Google's cross-site GET
callback. The live adapter must use the exact callback URL, PKCE S256, state and
cookie binding, signed OIDC verification (`iss`, `aud`, `exp`, `iat`, `nonce`,
`sub`) and granted-scope inspection before calling
`establishVerifiedSession`.

## Deterministic evidence matrix

| Required behavior | Local evidence |
|---|---|
| Expiry and concurrent refresh | Twenty callers across two account-owner instances share one persisted lease/result and one newer revision. Dead-lease restart and bounded upstream failure are covered. |
| Late 401 | Page and service worker retry only with a strictly newer revision, including when Google returns the same token text. An older response cannot clear or replace a newer credential. |
| Account/generation isolation | Page response parsing, Drive JSON completion, service-worker messages and media URLs all fence account generation; each controlled client has an independent credential. |
| Offline/non-JSON/platform failure | Requests time out, return a bounded `auth-unavailable` result and preserve product/listing state. There is no media-server fallback. |
| Service-worker restart | Only the requesting client may answer the correlated request; missing client identity fails closed. |
| Logout/disconnect | Logout removes one session. Disconnect removes all sessions/secrets first and distinguishes confirmed from inconclusive Google revoke. |
| Refresh credential lifecycle | A missing refresh field preserves a healthy existing secret but cannot create the first durable session. After `invalid_grant`, a new verified code exchange must supply a fresh refresh credential. |
| Retention/alarm races | Stale, contested and failed alarm writes cannot install unchecked stale/null state. A new session is not returned without an installed retention alarm. Concurrent failed establishments each remove only their own session; a final logout whose seven-day alarm cannot be installed deletes the credential early. Alarm rearm failure propagates to the host retry path. |
| Pre-auth replay/security | Concurrent consume succeeds once; wrong state/cookie, expiry, unknown input, exchange failure and abandoned-flow alarm all delete the secret-bearing record. |
| Secret/data boundary | Strict route allowlists reject secret fields and media paths; tests and source scan find no deployed secret or bearer value. Public shell packaging excludes `auth/`, tests and memory records. |

## Verification

- Exact full suite:
  `node --test tests/app.test.js tests/static.test.js tests/sw.test.js tests/immersive.test.js tests/acceptance.test.js tests/audit.test.js tests/shell.test.js tests/auth-session.test.mjs`
  — **187/187 passed** after the final fixes.
- Authentication contract suite — **26/26 passed**.
- JavaScript syntax checks passed for `app.js`, `sw.js`, and all three auth ESM
  modules.
- `git diff --check` passed.
- `node scripts/build-pages.cjs` prepared the unchanged 12-file public shell
  allowlist. This output is not a complete auth deployment and cannot satisfy the
  same-origin server routes by itself.
- Independent Astra review reproduced and closed: stale delayed credential
  installation, failed-request stampede, disconnect revoke-result loss, alarm
  write races, `invalid_grant` reuse, concurrent failed-establishment leakage and
  final-logout retention extension. Its final rereview ran the auth/service-worker
  scope **55/55** and reported no remaining confirmed material defect or
  credential exposure.

## Still unverified — V2-04B

- This account can activate Workers Static Assets, a candidate `workers.dev`
  hostname and SQLite-backed Durable Objects without a card, paid plan or
  automatic billing (A-008).
- The existing Google Web client secret is available and the client can use the
  exact server callback, approved minimum scopes, suitable publishing status and
  offline refresh flow while preserving the existing `appDataFolder` identity
  (A-009).
- A real Cloudflare adapter correctly maps Durable Object storage transactions,
  alarms, session indexes, authenticated encryption and Worker Secrets to this
  local interface.
- PC Chrome, iPhone browser and installed home-screen PWA preserve the correct
  account/view through login, expiry, sleep/wake, service-worker restart and
  cookie/privacy restrictions.
- No candidate Drive/appData write is allowed until the same-account snapshot,
  read and compare gate succeeds and the new origin has a distinct writer ID.

## Rollback and production boundary

Revert implementation commit `ed8b619` to restore the prior browser-owned auth
source on this branch. Existing GitHub Pages v1.21.0 remains the untouched
production/rollback runtime. No Google OAuth setting, Cloudflare resource, Drive
file, appData record, `main`, remote branch, production deployment or paused
automation changed in V2-04A.
