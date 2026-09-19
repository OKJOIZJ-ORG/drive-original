# Checkpoint — V2-04B credentials verified / auth deployment next — 2026-09-20 00:34 KST

## The story so far

V2-04A is closed. V2-04B is implemented on `codex/v2-kickoff-diagnostics` through `175352f`, and the no-cost candidate remains live at `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`. Google has the exact server callback; the preserved old secret and existing production/localhost JavaScript origins were not changed. The accidentally exposed task-created secret was disabled and then deleted after explicit confirmation. Its clean replacement was copied without reading, piped directly into Cloudflare, and cleared from the clipboard. The latest deployed version contains all four required secret binding names, exact public origin/client id, `AUTH_ENABLED=false`, and `CANDIDATE_DRIVE_WRITES_ENABLED=false`. The local auth-enable patch changes only the checked-in auth flag and its assertion; auth tests passed 11/11, app/static passed 75/75, syntax/diff checks and Wrangler dry-run passed. Public `driveMutationsEnabled:false` remains unchanged.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are now verified by binding name. The live version remains auth-disabled until the reviewed local change is committed and deployed.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- The exposed task-created secret was never installed and is deleted. The preserved old Google secret remains enabled; the clean replacement exists only in Google and the Cloudflare secret binding.

## Waiting on the user

- None now. The user explicitly confirmed removal of the compromised task-created secret, replacement-secret creation/transfer, and autonomous continuation.
- Hand off only if Google requires password, two-factor authentication, consent, CAPTCHA, or another user-only account interaction. Stop before payment, permanent deletion, production replacement, main merge, or push.

## Next first action

Review and commit the auth-enable diff, deploy committed HEAD with `npm --prefix worker run deploy:candidate`, then verify the live version bindings and a no-follow `/auth/google/start` 303 with exact OAuth parameters and hardened pre-auth cookie attributes.

## Tried

- Reading the Google secret row's accessibility label exposed the first new secret in a tool result. It was not installed; never inspect secret-bearing aria labels or full snapshots while a replacement is visible.
- Disabling the exposed secret did not free Google's two-secret quota; the task-created disabled entry had to be explicitly deleted before a clean replacement could be created.
- The original Google secret cannot be viewed or downloaded in Cloud Console. It remains preserved; the candidate uses the separate new binding.
