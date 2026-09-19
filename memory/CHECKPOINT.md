# Checkpoint — V2-04B auth live / account consent handoff — 2026-09-20 00:38 KST

## The story so far

V2-04A is closed. V2-04B authentication is committed at `beeab95` and deployed to the no-cost candidate `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev` as Worker version `2afed8aa-149b-46f6-a13c-f5a37d2b25fc`. The deployed version readback proves all four secret binding names, exact public origin/client id, SQLite Durable Object, `AUTH_ENABLED=true`, and `CANDIDATE_DRIVE_WRITES_ENABLED=false`. A no-follow live start request returns 303 to Google's authorization-code endpoint with exact callback/client, PKCE S256, 64-character state, offline access, `prompt=consent`, the expected Drive/appData/openid scopes, `no-store`, `no-referrer`, and a `__Host-` HttpOnly/Secure/SameSite=Lax root cookie. The public app write gate remains `driveMutationsEnabled:false`. The candidate Chrome tab is now at Google's account chooser; authentication dialogs and consent must be completed by the user before session, appData and media evidence can be collected.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are verified by binding name and live auth is enabled on the candidate only.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- The exposed task-created secret was never installed and is deleted. The preserved old Google secret remains enabled; the clean replacement exists only in Google and the Cloudflare secret binding.

## Waiting on the user

- In the preserved candidate Chrome tab, select the Drive account that owns the test corpus (`yundda2@gmail.com` was the prior active account), complete any Google login step, and approve the displayed Drive permissions. Authentication UI is intentionally not automated.
- Stop before payment, permanent deletion, production replacement, main merge, or push.

## Next first action

After the user finishes Google account selection and consent, inspect the returned candidate tab for an authenticated same-account session, then verify Drive listing/appData read-only state and the priority sample's exact metadata and original-direct playback evidence.

## Tried

- Reading the Google secret row's accessibility label exposed the first new secret in a tool result. It was not installed; never inspect secret-bearing aria labels or full snapshots while a replacement is visible.
- Disabling the exposed secret did not free Google's two-secret quota; the task-created disabled entry had to be explicitly deleted before a clean replacement could be created.
- The original Google secret cannot be viewed or downloaded in Cloud Console. It remains preserved; the candidate uses the separate new binding.
- Account selection and OAuth consent are user-authentication/permission dialogs and are not automated; the live candidate tab is preserved at that exact boundary.
