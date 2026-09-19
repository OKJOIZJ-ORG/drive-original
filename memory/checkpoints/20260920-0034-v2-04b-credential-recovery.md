# Checkpoint — V2-04B candidate credential recovery — 2026-09-20 00:25 KST

## The story so far

V2-04A is closed. V2-04B is implemented on `codex/v2-kickoff-diagnostics` through `175352f`: the Cloudflare Worker adapter, committed-byte candidate build, exact candidate origin and existing Google client id are committed; focused auth tests and Wrangler dry-run passed. The no-cost candidate is live at `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; Static Assets and SQLite Durable Objects deployed without a card, production Pages is untouched, and Drive/appData writes remain fail-closed. Google now has the exact server callback while the existing production and localhost JavaScript origins and old secret remain intact. Three generated Worker secrets are installed. A newly created Google client secret was accidentally exposed in automation metadata, was never installed, and its disable confirmation is open; it must be disabled before creating a clean replacement without reading its value.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- Live auth and Drive/appData writes remain separately gated. Enable auth only after all four Worker secrets are read back by binding name; keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare.
- The accidentally exposed new Google secret is compromised evidence, not a usable credential. Disable it, do not delete the preserved old secret, and create one clean replacement without inspecting or logging its value.

## Waiting on the user

- None now. The user explicitly confirmed the replacement-secret creation and transfer to Cloudflare and asked work to continue without routine pauses.
- Hand off only if Google requires password, two-factor authentication, consent, CAPTCHA, or another user-only account interaction. Stop before payment, permanent deletion, production replacement, main merge, or push.

## Next first action

Confirm-disable the exposed newly created Google OAuth secret in the already-open Cloud Console dialog, then create one replacement, copy it without reading it, pipe the clipboard directly into `wrangler secret put GOOGLE_CLIENT_SECRET`, and clear the clipboard.

## Tried

- Reading the Google secret row's accessibility label exposed the first new secret in a tool result. It was not installed; never inspect secret-bearing aria labels or full snapshots while a replacement is visible.
- The original Google secret cannot be viewed or downloaded in Cloud Console. Preserve it and add one new candidate secret instead.
- `AUTH_ENABLED=false` currently makes `/auth/google/start` fail closed with 503; this is expected until the replacement secret binding is verified and the committed auth gate is changed.
