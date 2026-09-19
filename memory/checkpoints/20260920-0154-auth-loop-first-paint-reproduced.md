# Checkpoint — V2-04B OAuth callback recovered; client session-return loop under diagnosis — 2026-09-20 01:45 KST

## The story so far

Commits `c4d2ab0` and `7ebaabf` were deployed to the candidate as Cloudflare Worker version `6007c078-46fa-4505-a47e-e02e2e254757`. The fixed-stage diagnostic first proved `google_token_fetch_failed`; local Miniflare/workerd then reproduced that `redirect: 'error'` is rejected before a network request. All four Google server fetches now use `redirect: 'manual'` and explicitly reject every 3xx before parsing or using the response. A clean no-consent probe changed from `google_token_fetch_failed` to Google `invalid_grant`, proving the configured client pair reaches Google without claiming a successful real login.

A fresh real consent in the controlled Chrome candidate returned by 303, installed the session, and made `/api/session/credential` return 200. The app displayed `Drive 연결됨` and listed real My Drive folders/media. This closes the server token-fetch blocker for that controlled browser session. The user's latest report says repeated connection attempts still return to the main screen in a loop; its device/surface and exact cookie/session request identity are not yet discriminated, so the loop is an active client/session-return defect rather than being counted as closed.

The priority sample remains read-only: Drive ID `17FhpF8e0lElLZSA3-yuDkgXJnMdwOB_u`, version counter `26`, 208,001,508 bytes, MPEG-TS under an `.mp4` name and `video/mp4` MIME, H.264/AAC streams. In the authenticated candidate the original-first attempt still fell back to the Google preview iframe and displayed `Google 호환 재생 · 원본 화질 미확인`. This is a reproduced product failure, not playback success. V2-03B already proved browser-side stream-copy remux of this same byte source succeeds; product integration remains pending after the session loop is closed.

## Decided

- D-050 and D-051 remain in force: same-origin serverless auth is the control plane, while original Drive bytes remain direct browser/service-worker data-plane traffic.
- Candidate origin is fixed to `https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev`; production/main/remotes remain untouched.
- All four Worker secrets are verified by binding name. A real callback and credential 200 prove the client pairing and server callback for one controlled Chrome session, but do not yet prove installed-PWA or iPhone session persistence.
- Auth and Drive/appData writes remain separate gates. Keep `driveMutationsEnabled:false` through identity and appData snapshot/read/compare even after login works.
- Keep the 10-minute OAuth transaction TTL. Recover expiry safely in the app instead of weakening the replay window.
- Callback recovery never masks missing or malformed Worker crypto configuration, and query parsing accepts only own, string-valued allowlist entries.
- Diagnostic output remains limited to an allowlist of fixed stage labels. `invalid_grant` is only the no-consent discriminator; the separate real callback/session 200 is the successful-login evidence.
- Do not treat a return to `/` as connected. The app must prove the same browser context can obtain a server credential and complete a Drive API request without starting another consent loop.
- Candidate remains read-only: `CANDIDATE_DRIVE_WRITES_ENABLED=false` and public `driveMutationsEnabled:false` are unchanged.

## Waiting on the user

- Empty. Diagnose the currently available browser/session evidence first; request a physical-device action only if the failing surface cannot be discriminated otherwise.

## Next first action

Reproduce one full login-to-root cycle while correlating the callback response, `Set-Cookie`, subsequent cookie-bearing `/api/session/credential`, app auth-state transition, and service-worker/navigation behavior. Fix the earliest failed ownership boundary, add a realistic regression test, run full integration checks, review the diff, deploy a new free candidate version, and re-run the same cycle before resuming V2-03B product remux integration.

## Tried

- The earlier delayed consent exceeded the 10-minute transaction lifetime; safe recovery remains deployed and verified.
- `redirect: 'error'` was incompatible with Cloudflare workerd. `manual` plus explicit 3xx rejection preserves the no-follow security contract and passes the focused 17/17 and full 210/210 suites.
- The controlled Chrome browser completed consent and loaded Drive, while another cookie-less request returned 401. That contrast makes session/context continuity the next discriminator; it does not prove the user's reported loop is a Google consent failure.
