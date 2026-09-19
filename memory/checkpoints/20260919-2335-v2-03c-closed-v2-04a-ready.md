# Checkpoint — V2-03C closed / V2-04A auth contract next — 2026-09-19 22:32 KST

## The story so far

The v3.0 integrated spec remains the single execution authority on branch `codex/v2-kickoff-diagnostics`. V2-03C is closed by D-051 and `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`: a separate Cloudflare candidate will serve the PWA shell and the smallest OAuth/session API from one HTTPS origin, while the browser and its client-scoped service worker continue to read original bytes directly from the official Drive API. A short-lived transaction object owns and atomically consumes pre-auth state/PKCE/OIDC nonce before the Google account is known; after signed subject verification, a SQLite-backed account Durable Object owns encrypted refresh credentials, session state, monotonic credential revision and a persisted refresh lease. Worker Secrets hold static secrets. Missing refresh-token fields never erase prior credentials; one-device logout, explicit disconnect/revoke and bounded final-session retention are separate. There is no media/Drive API relay, Drive byte cache, FFmpeg, remux/transcode or mutation path in the Worker. Existing Pages v1.21.0 remains unchanged as rollback. Read-only Console evidence found External/Testing, one Web client, zero redirect URIs, and a `drive.readonly` listing that conflicts with current code requesting `drive` plus `drive.appdata`. Cloudflare reached sign-in only, so no-card account activation, hostname and Durable Object binding are not yet proven. No external configuration or data changed.

## Decided

- D-050 and D-051 are in force. Browser/PWA remains the product and direct Drive API access remains the data plane.
- Cloudflare Worker Static Assets plus a minimal same-origin auth API and per-account SQLite-backed Durable Object is the candidate control plane. Access credentials live only in browser/SW memory; refresh credentials and client secrets never enter the browser.
- Media relay/conversion, a cross-origin auth cookie service, KV-only coordination, a new OAuth project/client, native deployment and always-on personal infrastructure are rejected or deferred as recorded in the architecture decision.
- Existing project/client and appData identity are reused first. Candidate writes remain disabled until same-account snapshot/read/compare succeeds and the new origin receives a distinct writer ID.
- V2-04A is the sole READY unit. Cloudflare/Google live configuration is not required for its local provider-contract fixtures.

## Waiting on the user

- Nothing blocks local V2-04A.
- At the later live gate, the user must complete ordinary Cloudflare login/signup/terms if needed; stop if a card, paid plan or automatic billing is required.
- Google Console origin/redirect/scope/publishing changes wait for a literal candidate URL and action-time readback. Physical iPhone Chrome/PWA checks wait for a runnable candidate with an exact URL/version and two or three checks.

## Next first action

Implement V2-04A locally: define the credential-provider boundary for same-origin serverless auth, keep access state in memory, and exercise deterministic account/revision fencing, concurrent refresh single-flight, expiry, late 401, offline failure, logout and service-worker restart. Do not deploy or mutate OAuth/Cloudflare configuration in this unit.

## Tried

- Current GIS timers and 401 retries improve a live tab but do not prove unattended long-lived PWA login; two simultaneous token owners must not survive the migration.
- GitHub Pages plus a cross-origin cookie auth host was rejected because it restores an iOS/PWA third-party-cookie and CORS boundary.
- KV was rejected as auth state/lock because eventual consistency cannot provide the adopted single-flight/revision contract; an external `fetch()` inside a Durable Object can interleave, so the lease/revision is persisted rather than assumed from in-memory execution.
- Official Cloudflare documentation proves published Free capabilities/limits, not this account's no-card eligibility. The actual UI gate remains A-008.
- The current OAuth configuration is internally inconsistent with product code and has no server callback. Cached consent is not acceptance evidence; A-009 owns the exact client/scope/publishing/appData readback.
