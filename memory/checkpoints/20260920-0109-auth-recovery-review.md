# Checkpoint — V2-04B expired callback recovery fix — 2026-09-20 01:06 KST

## The story so far

V2-04B authentication is committed at `beeab95` and the no-cost candidate is live at `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`. The user's first real consent round-trip reached the callback after about 15 minutes and returned raw `transaction_invalid`; the security contract deliberately expires the transaction and pre-auth cookie after 10 minutes. An immediate start plus fake-code callback reached `auth_unavailable`, which proves Durable Object routing, SQLite persistence, cookie hashing and transaction consumption work inside the TTL. Eight product/test files now contain an uncommitted `1.22.0-rc.2` recovery change that redirects allowlisted callback failures to the app and shows a retryable accessible message. Full tests passed before independent review; the reviewer found two narrow defects that must be corrected and retested before commit/deploy.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are verified by binding name and live auth is enabled on the candidate only.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- Keep the 10-minute OAuth transaction TTL. Recover expiry safely in the app instead of weakening the replay window.
- Callback recovery must not mask Worker crypto configuration failures, and query parsing must accept only own, string-valued allowlist entries.

## Waiting on the user

- Empty. Authentication UI may still require the user at the final boundary, but all code, tests and live failure-path checks can proceed without interruption first.

## Next first action

Patch `worker/index.mjs` to arm callback recovery only after crypto setup and patch `app.js` to use an own-property string allowlist; add both regression tests and rerun the full suite.

## Tried

- The first real consent callback took about 15 minutes, exceeding the 10-minute transaction/cookie lifetime; repeating the same flow without a fresh transaction cannot succeed.
- A raw JSON callback failure is technically safe but fails the integrated spec's recoverable UX requirement; use an allowlisted same-origin redirect with query cleanup.
- The first recovery draft armed redirect fallback before crypto validation and used inherited object lookup; do not deploy it until both independent-review findings are fixed.
