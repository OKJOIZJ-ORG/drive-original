# AUTH-05 capability handling — local implementation, 2026-09-29

The former mandatory-all-scopes token validator rejected valid partial feature
grants as an authentication outage. The Worker now retains a verified granted
scope snapshot and sends versioned `driveRead`, `driveWrite`, and `appData`
capabilities. OIDC, audience, nonce, signature, PKCE, account, revision, refresh
lease, and deployment write locks remain enforced. Requested Google scopes have
not changed. No consent, account, browser, grant or live-provider action occurred.

## Behavior and compatibility

- Explicit refresh scopes replace the snapshot, including reductions; omission
  inherits only the previous verified snapshot. Malformed or non-OIDC scopes fail
  closed. Per-file and metadata grants do not authorize whole-library reading.
- The exact legacy durable access shape is migrated once, based on the prior
  validator's mandatory three scopes. A persistent `scopePolicyVersion` marker
  prevents a later old-Worker access overwrite from masquerading as legacy data.
  Unknown versions fail closed. Rollbacks retain the matching access/scope pair.
- New clients request credential protocol 2 and reject missing/unknown capability
  responses. The new server serves protocol-less clients only when all three
  features remain authorized; otherwise it returns `client_update_required`.
  Ship Worker and client together. New client + old Worker fails closed on the
  new request field. Rolling the Worker back after partial grants is unsupported;
  restore this capability-aware Worker rather than relying on the old validator.
  If an old Worker already overwrote the access snapshot, only a fresh verified
  explicit regrant can repair it; ordinary credential requests remain closed.
  The repair preserves account/revision/encrypted-refresh fences. Regression:
  `node --test tests/auth-session.test.mjs`, 30/30 pass (`recovery-tests.txt`).
- Missing appData aborts only account-state work and stops its polling/retries;
  pending local records, selection and playback sessions remain. Ordinary Drive
  reads continue. Reauthorization restores the existing remote merge before
  writes. Missing ordinary Drive access still allows scoped appData operations.
  Media credential handoff clears its Worker credential and sends no token when
  `driveRead` is unavailable. General Drive writes still honor deployment locks.
- The existing reconnect button is visible for partial grants. It remains the
  user's explicit action; no automatic OAuth flow is introduced. File-level 403
  errors are no longer automatically described as a missing OAuth grant.

## Verification

Deterministic Node checks only; not proof of a live Google partial-consent flow:

```
node --test tests/auth-scopes.test.mjs tests/auth-session.test.mjs tests/cloudflare-auth-worker.test.mjs tests/app.test.js
node --test tests/account-state.test.js tests/acceptance.test.js tests/mutations.test.js tests/audit.test.js tests/immersive.test.js
git diff --check
```

First group: 157/157 pass (`tests-verified.txt`). Second group: 88/88 pass
(`affected-fixtures-tests.txt`). Existing synthetic credential fixtures now declare
full verified capabilities explicitly; new cases exercise reductions, omissions,
legacy migration, protocol skew, malformed scopes, unavailable appData with local
and playback preservation, appData-only requests and writes, and media handoff.
The parent owns full-suite integration, candidate packaging/versioning and any
later authorized candidate deployment.

## Primary contract references

- [Google OAuth web-server Step 6](https://developers.google.com/identity/protocols/oauth2/web-server?hl=en#step6): inspect actually granted scopes and disable dependent features.
- [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth#drive_api_scopes): ordinary Drive, read-only, per-file and appData are distinct authorities.
- [Drive about.get scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get#authorization-scopes): account permission ID remains available with appData scope.
