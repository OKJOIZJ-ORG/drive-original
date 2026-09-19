# Checkpoint — V2-04A closed / V2-04B live candidate next — 2026-09-19 23:35 KST

## The story so far

The v3.0 integrated specification remains the execution authority on branch `codex/v2-kickoff-diagnostics`. V2-04A is closed locally at implementation commit `ed8b619` and recorded in `memory/architecture/V2-04A-AUTH-CONTRACT.md`. The candidate source no longer uses browser GIS/client-ID override/token persistence: the page obtains one strict `{accessToken, expiresAt, account, revision}` credential from the same-origin session API, keeps it only in memory, and shares it only with its client-scoped service worker. Account, credential revision and Drive-session generation fence page, JSON completion, worker messages and media requests. The service worker asks only the requesting client after restart and retries a 401 only with a newer revision. The dependency-free server core owns opaque sessions, encrypted refresh state, persisted refresh lease/revision, one-use PKCE/OIDC transactions and bounded retention. Drive REST and original media bytes still travel directly between browser/service worker and the official Drive API; there is no auth-server media relay, cache, transform or mutation route. The final explicit suite passed 187/187, auth passed 26/26, syntax/diff/build checks passed, and final independent auth/SW rereview passed 55/55 with no remaining confirmed material defect. No live Cloudflare/Google adapter or deployment was claimed.

## Decided

- D-050 and D-051 remain in force. Browser/PWA is the product; same-origin serverless auth is the control plane; direct Drive access is the data plane.
- V2-04A is `IMPLEMENTED_LOCAL`. Production Pages v1.21.0 remains the untouched rollback runtime.
- A session is not returned without an installed retention alarm. Persistent alarm failure removes the failed session and, when necessary, shortens credential retention rather than silently extending it. `invalid_grant` requires a fresh refresh credential on the next verified code exchange.
- Logout ends one application session. Disconnect removes all application sessions and the server credential, and reports an uncertain Google revoke as inconclusive.
- V2-04B is the sole READY unit. It may add the actual Cloudflare host adapters/bindings, make reversible candidate-only Google OAuth settings and perform a no-cost candidate deployment under the user's existing authorization. It may not introduce a media proxy, replace production, push/merge, require payment, or enable Drive/appData writes before the identity/state comparison gate.

## Waiting on the user

- No user action blocks the first local V2-04B adapter/configuration work.
- When Cloudflare or Google requires normal account sign-in, two-factor authentication, terms acceptance or an account/path choice, request only that concrete interaction. Stop before any card, paid plan or automatic billing.
- When a runnable fixed candidate exists, provide only its exact address/version and two or three PC/iPhone/PWA checks. User participation is not automatic-control authority and is not itself acceptance evidence.

## Next first action

Start V2-04B from `ed8b619`: inspect the current Cloudflare tooling/account state and implement the missing Worker host adapter for Static Assets, transaction/account Durable Objects, authenticated encryption, session indexing and real Google authorization-code callback. Establish the literal no-cost candidate origin before making the minimum reversible Google origin/redirect/scope changes, then read them back. Keep candidate Drive/appData writes disabled until same-account snapshot/read/compare succeeds.

## Tried

- The first V2-04A server core passed ordinary deterministic tests but independent review found three retention/auth edge classes: known-invalid refresh reuse, session success without a cleanup alarm, and concurrent failed establishments/final logout extending retention. All were reproduced, fixed, added to fixtures and cleanly rereviewed.
- A static `_site` build still contains exactly 12 public shell files, but it is not a runnable authentication candidate. GitHub Pages cannot provide the adopted same-origin `/auth/*` and `/api/session/*` control plane.
- Read-only Cloud Console evidence still shows External/Testing, one existing Web client, zero redirect URIs and a `drive.readonly` listing inconsistent with current `drive` plus `drive.appdata` operations. A-009 remains open.
- Read-only Cloudflare inspection previously reached sign-in only. Workers Static Assets, `workers.dev`, SQLite Durable Objects and no-card eligibility for this account remain A-008, not assumed facts.
- Existing Pages production, original Drive media, appData, OAuth/Cloudflare settings, `main`, remotes and the paused automation were not changed by V2-04A.
