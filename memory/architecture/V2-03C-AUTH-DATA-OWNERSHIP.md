# V2-03C — authentication and Drive data ownership

- Decision: `D-051`
- Status: `ADOPTED_FOR_CANDIDATE`; decision record complete, product implementation not yet claimed
- Evidence date: 2026-09-19 KST
- Governing scope: D-050 and the v3.0 integrated specification

## Decision in one sentence

Use one same-origin Cloudflare Worker candidate to host the static PWA shell and the smallest possible OAuth/session API, while the authenticated browser and its client-scoped service worker continue to read original bytes directly from the official Drive API. The Worker must never become a Drive media relay, conversion service, cache, or mutation owner.

## Evidence and boundary

### Confirmed locally

- V2-01C received the exact sample's complete 208,001,508-byte original before Chrome produced `MediaError` code 4. Google iframe entry was not counted as success.
- V2-03A found byte-for-byte equality for bounded front, middle, and tail reads between the current service-worker path and an independent official Drive API reader. This does not prove every byte, but it gives no evidence that a relay would repair the failure.
- V2-03B identified MPEG-TS under an `.mp4` name. A Q1 stream-copy remux preserved the H.264/AAC streams and decoded windows, and Chrome played and sought through the MP4 derivative using valid Range requests. The exact failure is therefore a container/packaging case, not evidence for a media relay or video transcode.
- Read-only Cloud Console inspection showed an External app in Testing, one Web application client, the production origin plus `http://localhost:4173`, and no authorized redirect URI. The Data Access view listed `drive.readonly`, while the current client code requests full `drive` plus `drive.appdata`; this mismatch must be reconciled before live B-auth acceptance.
- Read-only Cloudflare inspection reached the sign-in screen only. No account entitlement, `workers.dev` hostname, Durable Object binding, no-card activation, or deployed runtime is confirmed.

### Platform facts used

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) can serve a static application and Worker API from one deployment unit and origin.
- [Static Assets billing and limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) describe free static delivery and the Workers Free request allowance. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) supplies the current CPU, memory, subrequest, and asset limits.
- [SQLite-backed Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) includes a Workers Free allowance. Durable Objects provide one stateful object with transactional storage; external `fetch()` can still interleave, so refresh ownership must be represented by a persisted lease/revision rather than an in-memory mutex alone. See [Durable Objects rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/), [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), and [storage access](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).
- [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) are the binding for the Google client secret and application encryption key. Per-user refresh credentials are dynamic data and belong encrypted at the application layer in Durable Object storage, not in static configuration.
- Google's [web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server) supports an authorization-code exchange and offline refresh credential with an exact registered redirect URI. Google's [OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies) requires secure web origins and minimum scopes.
- Google's [OpenID Connect contract](https://developers.google.com/identity/openid-connect/openid-connect) defines the signed ID-token claims and validation needed for a stable Google subject. The candidate requests `openid` only for identity fencing; Drive profile data remains the display source unless a separately justified scope is required.
- An External app left in Testing has a seven-day authorization/refresh-token lifetime for non-profile scopes; see [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) and [publishing-status help](https://support.google.com/cloud/answer/15549945). Personal-use apps with fewer than 100 known users can use the documented unverified path, with its warning and user cap, instead of claiming verification; see [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) and [unverified apps](https://support.google.com/cloud/answer/13464323).
- `drive.appdata` is an app-specific, non-sensitive scope and location according to [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [application data](https://developers.google.com/workspace/drive/api/guides/appdata).

The linked documentation describes platform capability and published free limits. It does not prove that this user's Cloudflare account can activate every required feature without a card, nor that the existing Google client can be reused without obtaining its secret. Those are live gates, not adopted facts.

## Responsibility matrix

| Concern | Sole owner | Contract | Explicit non-owner |
|---|---|---|---|
| Static shell and same-origin API | One Cloudflare Worker deployment with Static Assets | Candidate origin serves versioned PWA files and `/auth/*` / `/api/session/*` only | Existing GitHub Pages remains the untouched rollback runtime |
| OAuth pre-auth transaction | Short-lived transaction Durable Object keyed by a cryptographically random opaque state ID | Stores PKCE verifier, OIDC nonce, intended return path, creation/expiry and a digest bound to a separate pre-auth cookie; callback atomically consumes it once; creation schedules a 10-minute deletion alarm and every success/failure/expiry path deletes storage | Account Durable Object is not selected before Google identity is verified; state contains no token, account ID or return URL |
| OAuth code exchange and refresh credential | Worker plus one account Durable Object | Secret-bearing exchange stays server-side; refresh is single-flight by persisted lease and monotonic credential revision | Page and service worker never receive a refresh token or client secret |
| Browser session | Worker session record plus `__Host-drive_original_session` cookie | `Secure; HttpOnly; SameSite=Lax; Path=/`; no Domain; exact same-origin requests; `Cache-Control: no-store` | No token or session credential in URL, IndexedDB, localStorage, logs, or public assets |
| Short Drive access credential | Authenticated page memory | Returned with expiry, account identity, and monotonic revision; handed to the client-scoped service worker; discarded on reload/account change | Durable Object does not proxy media bytes |
| Drive reads and media Range requests | Browser application and client-scoped service worker | Direct calls to the official Drive API, preserving request/session ownership and stable file/version checks | Worker has no `/media` route, Drive byte cache, FFmpeg, remux, or transcode path |
| Drive mutations | Existing browser operation controller; V2-05A will define the ledger | No mutation is added by V2-03C or V2-04A | Auth Worker never moves, trashes, restores, or edits Drive files |
| Likes/viewed/app state | Existing Drive `appDataFolder` writer merge | Snapshot and compare before any candidate write; keep per-origin writer identity | Durable Object is not the product-state source of truth |

## Candidate interface and security contract

The initial interface is deliberately small:

- `GET /auth/google/start` — creates a 10-minute, single-use transaction in a transaction Durable Object keyed by a 256-bit random opaque state ID. It stores the PKCE verifier, OIDC nonce, allowlisted intended return path, creation/expiry and a keyed digest of a separate pre-auth cookie set as `__Host-drive_original_oauth=<random>; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` with no `Domain`. Creation schedules a 10-minute Durable Object alarm that deletes all transaction storage. The URL-visible state carries no secret, account ID or return URL.
- `GET /auth/google/callback` — requires the exact callback URL and matching pre-auth cookie, then atomically consumes the transaction before code exchange so replay loses. Every callback success or failure deletes the transaction storage and immediately expires the pre-auth cookie; the alarm is the abandoned-flow fallback. It validates the Google ID-token signature and `iss`, `aud`, `exp`, `iat`, `nonce` and non-empty `sub` claims. The account Durable Object key is `HMAC-SHA-256(ACCOUNT_KEY, iss || 0x00 || sub)`, so neither an email nor the raw subject names storage. Only after this verification does the Worker store/retain the encrypted refresh credential under that account owner and rotate to the application session cookie.
- `POST /api/session/credential` — exact-origin, CSRF-protected, `no-store`; returns only `{ accessToken, expiresAt, account, revision }`. Concurrent callers share one persisted refresh lease/result. A late response with an older account/revision cannot replace current state.
- `POST /api/session/logout` — ends this application session and drops browser-held access state. It does not silently revoke the entire Google grant or delete Drive/appData.
- `POST /api/account/disconnect` — separate explicit action that invalidates every application session for that Google subject, attempts Google token revocation, and deletes the encrypted server credential regardless of whether the upstream response is conclusive. An inconclusive revocation is reported as such with the Google Account manual-revocation path; no secret is retained merely to retry.

The credential object is held in page/service-worker memory only. One retry owner requests a fresh credential after expiry or an eligible 401. Offline, quota, storage, account mismatch, and stale-revision failures close safely: preserve existing Drive/appData, stop the affected request, and present one concise reconnect/status owner rather than deleting credentials repeatedly.

The initial authorization uses `response_type=code`, PKCE, OIDC `nonce`, `access_type=offline`, and the approved minimum scopes. A refresh-token field is optional even on a successful exchange. A missing field never overwrites an existing encrypted refresh credential. When no prior server credential exists, a missing refresh token fails with `reauthorization_required`; a user-initiated retry may use Google's explicit re-consent prompt. A returned replacement is committed atomically with an incremented credential revision. One-device logout invalidates only that session. Application sessions have a rolling 30-day inactivity limit and a 90-day absolute limit. When the final session ends or expires, the account object schedules a seven-day local recovery grace; a Durable Object alarm then deletes the encrypted refresh credential unless a new verified session was created. Explicit disconnect skips the grace. These candidate retention values must be visible in the privacy/readback evidence and may be shortened, not silently extended.

## Host, limits, and cost guard

The candidate host is Cloudflare Workers Free with Static Assets and one SQLite-backed Durable Object namespace. KV is rejected as the authentication source of truth/lock because eventual consistency is the wrong concurrency primitive. D1 is deferred because it adds a second state service without improving the account-level single-flight contract.

The recorded design must fit the published free ceilings: 100,000 Worker requests/day, 10 ms CPU per invocation, 128 MB memory, 50 subrequests, 20,000 static files with a 25 MiB per-file limit, and the documented Durable Object Free allowances (including request/compute and SQLite row/storage quotas). These are ceilings, not a service-level guarantee. No paid plan, card, automatic upgrade, or usage-based fallback is authorized. If account activation or a required feature requests payment, work stops at that gate. The app treats every non-success from the auth origin—including platform-generated limit/CPU/memory failures that may not use the application's JSON schema—as a bounded `auth-unavailable` result, preserves Drive/appData, and never switches media traffic through the Worker.

## Google project, scopes, and origin migration

Reuse the existing Google project and Web application client first so the application identity and existing `appDataFolder` remain stable. After a literal candidate hostname exists, add only that HTTPS JavaScript origin and its exact `/auth/google/callback` redirect URI. Do not remove the production GitHub Pages origin or the localhost development origin during candidate testing.

Before live authorization, reconcile the consent screen with the minimum operations actually required. The current product reads, moves, trashes, restores, and writes `appDataFolder`, so a read-only consent configuration cannot be treated as sufficient merely because current cached grants work. `openid` supplies the verified subject fence and `drive.appdata` remains separate and minimum for app state. Full/restricted Drive access is kept only if the required user-visible mutations cannot be expressed through a narrower applicable scope. Publishing status, warning, test-user cap, verification/security-assessment implications, refresh lifetime, and whether the existing grant actually yields a refresh credential on the offline code flow/re-consent path must be recorded from the actual console/run before acceptance. A new Google project/client is a fallback only if reuse is proven impossible and appData continuity has a tested migration.

## Existing-state migration and readback

1. Before candidate writes, record a private snapshot of verified Google account identity, appData writer IDs, file counts, favorites/viewed counts, tombstones, and relevant schema versions. Do not place private IDs or credentials in committed evidence.
2. Authorize the candidate against the same project/client/account, then read appData before enabling any write.
3. Compare identity, writer set, counts, tombstones, and version semantics with the snapshot. Any empty or mismatched view blocks writes.
4. Give the new origin a new writer ID; never copy an old origin's writer ID. Merge all existing writer files through the established union/tombstone rules.
5. Rebuild origin-local projection/cache from appData. OPFS media cache is disposable and is not migrated.
6. Keep one auth/write owner during testing behind a candidate flag. The production Pages runtime and its data remain untouched until separate operating approval.

## Rollback and exit

- Disable candidate login and candidate writes, terminate only application sessions, and return users to the committed Pages v1.21.0 runtime.
- Do not delete or rewrite Drive originals, appData writer files, tombstones, or the legacy origin's local state. Do not automatically revoke the user's whole Google grant.
- Retain the pre-migration snapshot and verify Drive/appData readback from the legacy runtime. Purge candidate Durable Object credentials only after the rollback readback succeeds; secret rotation/deletion follows the host's normal recovery procedure.
- If no-card Cloudflare activation, literal hostname creation, Durable Object availability, Google client-secret recovery, exact redirect registration, or same-client appData visibility fails, supersede the hosting selection without changing the direct-data/auth-boundary decision.

## Rejected or deferred alternatives

- **Rejected now — Worker media relay or whole Drive API proxy:** V2-03A/B supply no transport evidence for it; it adds bandwidth, secret, privacy, quota, and failure ownership without fixing this sample's container problem.
- **Rejected — GitHub Pages shell plus cross-origin cookie auth:** it recreates the very cross-site cookie/CORS boundary that is fragile in iPhone standalone mode.
- **Rejected — KV-only refresh lock/state:** eventual consistency cannot own refresh single-flight or monotonic credential revision.
- **Deferred — D1:** unnecessary for the minimum per-account auth coordinator; reconsider only with evidence that cross-object queries are required.
- **Deferred — new OAuth project/client:** risks application identity and appData continuity; use only after reuse is disproved with evidence.
- **Excluded — native deployment, always-on personal PC/NAS, server FFmpeg, bulk conversion:** outside D-050 and unnecessary for the observed failure.
- **Rollback-only — current GIS token-only model:** it remains the legacy runtime but does not prove unattended long-lived PWA sessions.

## Next discriminating unit

V2-04A implements and tests the provider/client contract locally before any host deployment or OAuth mutation: memory-only access credentials, account/revision fencing, one refresh owner, concurrent expiry, late 401, offline behavior, logout, and service-worker restart. Live Cloudflare and Google configuration remain explicit gates after the local contract is reviewable.
