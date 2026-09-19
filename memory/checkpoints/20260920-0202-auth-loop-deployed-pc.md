# Checkpoint — V2-04B false reconnect loop fixed and verified on candidate PC Chrome — 2026-09-20 01:59 KST

## The story so far

Commits `c4d2ab0` and `7ebaabf` were deployed to the candidate as Cloudflare Worker version `6007c078-46fa-4505-a47e-e02e2e254757`. The fixed-stage diagnostic first proved `google_token_fetch_failed`; local Miniflare/workerd then reproduced that `redirect: 'error'` is rejected before a network request. All four Google server fetches now use `redirect: 'manual'` and explicitly reject every 3xx before parsing or using the response. A clean no-consent probe changed from `google_token_fetch_failed` to Google `invalid_grant`, proving the configured client pair reaches Google without claiming a successful real login.

A fresh real consent in the controlled Chrome candidate returned by 303, installed the session, and made `/api/session/credential` return 200. The app displayed `Drive 연결됨` and listed real My Drive folders/media. On a controlled reload, the exact visible loop mechanism was then reproduced: at `DOMContentLoaded` the static shell exposed `연결 안 됨` and an actionable `Google Drive 연결하기` screen, while the cookie-bearing credential POST was still in flight. That request returned 200 and the same page became `Drive 연결됨` about 1.2 seconds later. Pressing the exposed button inside that window starts a redundant OAuth flow even though the session is valid.

Commit `213211f381d2181479501fb22183d700f9984713` ships version `1.22.0-rc.3`, which renders the initial connection state as busy, disables the connect action before JavaScript runs, and keeps it inert until the existing-session probe settles. It is deployed to the same candidate as Cloudflare Worker version `7dc03568-97e1-4a30-ab45-58b6c6cbd189`. All 12 public files were fetched from the live candidate and matched the commit byte-for-byte; three internal routes returned 404. Version readback keeps auth/diagnostics enabled, Drive writes false, the exact public origin/client ID, four secret binding names only, and the SQLite Durable Object.

The deployed candidate was reloaded with `/api/session/credential` deliberately paused. While pending, the live DOM showed `연결 중…` and only a disabled `기존 Drive 연결 확인 중…` button. The request carried the existing session cookie, returned 200, and the same page settled to `Drive 연결됨`, visible My Drive data, and `v1.22.0-rc.3` without another OAuth navigation. This closes the confirmed PC Chrome false-reconnect loop. Focused tests pass 79/79, the full nine-file suite passes 212/212, syntax/diff checks and Worker dry-run pass, and independent review found no blocking defect.

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
- Do not weaken the hardened session cookie or Fetch Metadata gate without failure evidence from the affected execution context. Missing Fetch Metadata and a separate iPhone PWA cookie jar remain distinct hypotheses, not the reproduced first failed boundary.
- Candidate remains read-only: `CANDIDATE_DRIVE_WRITES_ENABLED=false` and public `driveMutationsEnabled:false` are unchanged.

## Current execution state

- Active task: `V2-04B` / WP-04 `IN_PROGRESS`; AUTH-03~09, QA-AU-01/02/05/06/07/09 and QA-SL-01/03/05 remain the governing auth/session acceptance set.
- Branch/HEAD: `codex/v2-kickoff-diagnostics` at `213211f381d2181479501fb22183d700f9984713`; working tree clean; `main...HEAD = 0/20`.
- Verified live: exact candidate PC Chrome cookie/session recovery, first-paint lock, credential 200, Drive listing, candidate identity/config, and public-byte equality.
- Not verified: physical iPhone Chrome tab/home-screen PWA callback and session persistence, actual token-expiry/sleep-wake duration, and any Drive/appData write or migration.
- External writes completed once and read back: candidate deployment version `7dc03568-97e1-4a30-ab45-58b6c6cbd189`. Do not repeat it without a new committed change.

## Waiting on the user

- Empty. Continue safe V2-04B lifecycle checks and keep physical-device status explicit; do not repeat consent or deployment without new evidence/change.

## Next first action

Open a second same-profile candidate tab and exercise reload/service-worker restart style recovery without consent, proving one cookie/session yields one credential 200 per page and no duplicate auth owner; then record the remaining physical iPhone tab/PWA boundary before selecting the next READY product unit.

## Tried

- The earlier delayed consent exceeded the 10-minute transaction lifetime; safe recovery remains deployed and verified.
- `redirect: 'error'` was incompatible with Cloudflare workerd. `manual` plus explicit 3xx rejection preserves the no-follow security contract and passes the focused 17/17 and full 210/210 suites.
- The controlled Chrome browser completed consent and loaded Drive, while another cookie-less request returned 401. That contrast makes session/context continuity the next discriminator; it does not prove the user's reported loop is a Google consent failure.
- The confirmed current-client defect is not a lost cookie: reload sent a session cookie and received credential 200. It is the static unauthenticated shell becoming actionable before asynchronous session recovery finishes.
