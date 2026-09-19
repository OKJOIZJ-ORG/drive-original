# Checkpoint — V2-04B callback recovery verified — 2026-09-20 01:09 KST

## The story so far

The real consent failure is localized to the deliberate 10-minute transaction/cookie expiry, not Durable Object routing or storage. `1.22.0-rc.2` now redirects only allowlisted recoverable callback failures to the app, removes the error query from browser history, and announces a concise retry message through a polite atomic live region. Callback recovery is armed only after all three cryptographic keys pass format/import validation; unknown, repeated and inherited query keys are discarded. The full nine-file suite passes 206/206, syntax and `git diff --check` pass, the Worker build/dry-run passes with auth enabled and Drive writes disabled, and independent security re-review reports no remaining blocker. The verified change is still uncommitted and not yet deployed.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are verified by binding name and live auth is enabled on the candidate only.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- Keep the 10-minute OAuth transaction TTL. Recover expiry safely in the app instead of weakening the replay window.
- Callback recovery never masks missing or malformed Worker crypto configuration, and query parsing accepts only own, string-valued allowlist entries.
- Candidate remains read-only: `CANDIDATE_DRIVE_WRITES_ENABLED=false` and public `driveMutationsEnabled:false` are unchanged.

## Waiting on the user

- Empty. Authentication UI may still require the user at the final boundary, but all code, tests and live failure-path checks can proceed without interruption first.

## Next first action

Stage and commit the exact recovery/code/test/checkpoint paths, then deploy the clean committed HEAD with `npm --prefix worker run deploy:candidate`.

## Tried

- The first real consent callback took about 15 minutes, exceeding the 10-minute transaction/cookie lifetime; repeating the same flow without a fresh transaction cannot succeed.
- A raw JSON callback failure is technically safe but fails the integrated spec's recoverable UX requirement; use an allowlisted same-origin redirect with query cleanup.
- Moving recovery after `createAuthCrypto()` was insufficient because key import validation is asynchronous; the final fix awaits all HMAC/account/AES imports before enabling recovery.
