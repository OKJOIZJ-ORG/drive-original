# AUTH-05 partial-scope diagnosis — 2026-09-29

Status: confirmed local contract gap; implementation now available locally. The
counterexample below records the pre-change behavior. See implementation.md for
changes and deterministic checks. No live partial-consent or revoked-grant
reproduction, Google action, commit, or deployment was performed by this unit.

## Counterexample and responsible layers

`worker/google.mjs` validateTokenResponse rejects a valid Bearer/access/expiry/
signed-ID-token response whenever ANY requested scope is absent. The exchange
classifies that failure as `auth_unavailable` / `google_token_payload_invalid`.
refreshGoogleAccess also rejects an explicit partial scope set as auth_unavailable.
The existing test `code exchange sends verifier and rejects a token response
missing any granted scope` was executed by name: 1/1 passes. Its valid signed
fixture lacks only appData; the test currently requires the undesired rejection.

Separate local refresh calls used an injected Response.json provider, no network:

| Returned scope set | Observed current result |
|---|---|
| openid + drive + drive.appdata | accepted |
| openid + drive | auth_unavailable |
| openid + drive.readonly + drive.appdata | auth_unavailable |
| openid + drive.appdata | auth_unavailable |

This differs from AUTH-05's feature-limited explicit reauthorization while
preserving possible reading/playback. Google's granular-permission guidance
also says denied scopes disable their dependent features, not the entire app:
[OAuth web-server Step6](https://developers.google.com/identity/protocols/oauth2/web-server?hl=en#step6).

`auth/session-owner.mjs` stores only accessToken/expiresAt and publishes those
plus account/revision. `worker/index.mjs` drops any other exchange fields while
establishing the session. `app.js` normalizeSessionCredential/installSessionCredential
likewise have no capability state. Therefore a one-line removal of required
scope validation would leave appData sync and ordinary file operations unaware
of missing authorization. It is not a coherent fix.

Important existing safeguards remain valid: refresh auth_unavailable preserves
the prior encrypted refresh credential/access state, whereas invalid_grant sets
reconnect. Client auth_unavailable does not eagerly clear the old token. That
retains already-valid playback only until old access expiry; it does not expose
the new partially authorized access token. Initial partial-scope exchange never
reaches session establishment. `driveFetch` refreshes on401, not generic403;
appData initialization blocks subsequent4xx refresh polling without logout.
These should be retained, not rewritten as a missing logout fix.

## Smallest coherent proposal

1. Add a small shared scope-policy module owned by auth. Validate token schema
   separately from scope syntax. Initial exchange still requires openid and
   verified signature/iss/aud/azp/exp/iat/nonce/sub/PKCE transaction. Malformed
   scope/token and missing identity authorization remain rejected. Compute a
   normalized fixed capability object only from authenticated returned grants:
   driveRead (drive or drive.readonly), driveWrite (drive), appData (drive.appdata
   or its documented appfolder alias). Metadata-only and drive.file do not imply
   whole-library playback or blanket writes. No new authorization scopes requested.
2. Pass/store the actual grant snapshot with access credential and monotonic
   revision through worker/index -> AccountCredentialOwner -> public credential.
   An explicit refresh scope set replaces the prior set; it must not be unioned
   with capabilities no longer granted. Omitted refresh scope inherits the
   previously verified snapshot; an omitted field must never convert a partial
   grant into all permissions. Preserve missing-refresh-token behavior and lease/
   revision/account fences. Document old persisted record migration: old deployed
   records originated in the all-three-scopes validator, but unknown/new record
   shape must not silently default to full authority.
3. App normalizes and installs capabilities atomically with token/revision.
   Missing appData stops only remote state read/write/polling, preserves local
   cache/pending likes/writer identity, and keeps account identity and media reads
   usable. Do not mark an unread remote catalog empty or state migration complete.
   Missing ordinary Drive access stops ordinary list/media/mutation requests but
   need not stop appData access. Missing driveWrite with driveRead keeps media
   available. All capability gates also respect the existing global read-only
   deployment lock and normal operation authorization.
4. Expose one explicit user-operated permission reconnect action using the
   existing authorization entrypoint; never open consent automatically or clear
   usable account/media state for a denied optional feature. Per-request403 still
   distinguishes insufficient scopes from file permissions/rate limits. A grant
   snapshot describes authorization and does not guarantee a given file's ACL.

`about.get` accepts drive.appdata as well as drive/drive.readonly, so resolving
the existing permissionId-based state owner need not be replaced just because
ordinary Drive permission is missing:
[about.get authorization scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get#authorization-scopes).
Scope meanings and appfolder alias:
[Drive scope reference](https://developers.google.com/workspace/drive/api/guides/api-specific-auth#drive_api_scopes).

## Acceptance / compatibility

Required local checks: signed partial grant success without malformed-token
acceptance; openid/JWT failures still reject; scope omission versus explicit
reduction across refresh/restart; old credential snapshot migration; stale
revision/other account cannot replace capabilities; missing appData yields zero
appData requests/writes while original read/seek continue; no Drive permission
leaves existing state intact; restored grant safely resumes real catalog merge;
rate-limit/file-permission403 does not become scope reconnection; old/new shell
and worker protocol acceptance is explicit. Full current suite after integration.

Compatibility is material: old client code ignores added capabilities and may
attempt denied endpoints; old worker code has no snapshot. Ship a coordinated
candidate shell/Worker update with an explicit protocol compatibility policy,
not a worker-only scope relaxation. No new grant, OAuth Console edit, actual
consent, production change or user original mutation is needed for local work.
Actual granular consent and scope-reduction/reauthorization remain live evidence
gates and must not be inferred from these injected-provider tests.
