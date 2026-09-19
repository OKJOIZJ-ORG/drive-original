# Checkpoint — V2-04B real consent callback failed at auth service — 2026-09-20 01:28 KST

## The story so far

Commit `10fdad9` was deployed to the candidate as Cloudflare Worker version `6579274f-d37e-4063-a242-f1f28ec371b8`. Live expiry and malformed-callback recovery checks passed, but a fresh real Google consent still returned to the candidate with `authError=auth_unavailable`; the app consumed that query and showed the Korean recovery message, and the subsequent `/api/session/credential` request returned 401. No session cookie was installed. This is a real callback failure after Google consent, not a successful login or a UI-only loop.

A privacy-safe diagnostic diff now classifies only fixed callback stages and never records authorization codes, state, tokens, cookies, secret values, provider bodies, or provider descriptions. The deployed-config logger is covered directly. Focused Worker tests pass 16/16, the full nine-file suite passes 209/209, syntax, `git diff --check`, secret-pattern scan, Worker build/dry-run, and two independent security/correctness reviews pass. Authentication and diagnostics stay enabled while Drive writes remain disabled. This diagnostic diff is verified but not yet committed or deployed.

The priority sample remains confirmed read-only evidence: Drive ID `17FhpF8e0lElLZSA3-yuDkgXJnMdwOB_u`, DriveFS version counter `26`, 208,001,508 bytes, MPEG-TS container under an `.mp4` name and `video/mp4` MIME, with H.264/AAC elementary streams. Existing V2-03 evidence localizes its playback failure to the container/demux boundary, but current app-authenticated Drive metadata and original-direct playback remain pending until the session works.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are verified by binding name, but their Google client pairing is not yet proven. Consent UI proves the public client/redirect path, not token exchange with the secret.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- Keep the 10-minute OAuth transaction TTL. Recover expiry safely in the app instead of weakening the replay window.
- Callback recovery never masks missing or malformed Worker crypto configuration, and query parsing accepts only own, string-valued allowlist entries.
- Do not ask the user to repeat consent until a no-consent fake-code probe distinguishes Google `invalid_grant` from rejected client credentials or another fixed stage.
- Diagnostic output is limited to an allowlist of fixed stage labels; `invalid_grant` proves only that Google classified the fake authorization code that way, not successful login or token issuance.
- Candidate remains read-only: `CANDIDATE_DRIVE_WRITES_ENABLED=false` and public `driveMutationsEnabled:false` are unchanged.

## Waiting on the user

- Empty. The current discriminator requires no user interaction.

## Next first action

Stage and commit the exact diagnostic/code/test/checkpoint paths, deploy the clean committed HEAD, start a bounded `wrangler tail`, then execute one immediate start plus fake-code callback probe and classify the fixed diagnostic stage.

## Tried

- The earlier delayed consent did exceed the 10-minute transaction lifetime, and safe recovery for that case is now deployed and live-verified.
- A new fresh consent completed within the transaction window but still returned `auth_unavailable`; therefore timeout recovery was necessary but not sufficient.
- Repeating real consent without server-stage evidence only recreates the visible loop. The next useful check is the privacy-safe no-consent token-exchange discriminator.
