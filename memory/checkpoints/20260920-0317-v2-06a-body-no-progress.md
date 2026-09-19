# Checkpoint — V2-06A first-byte watchdog closed; body no-progress next — 2026-09-20 03:02 KST

## The story so far

Commits `c4d2ab0` and `7ebaabf` were deployed to the candidate as Cloudflare Worker version `6007c078-46fa-4505-a47e-e02e2e254757`. The fixed-stage diagnostic first proved `google_token_fetch_failed`; local Miniflare/workerd then reproduced that `redirect: 'error'` is rejected before a network request. All four Google server fetches now use `redirect: 'manual'` and explicitly reject every 3xx before parsing or using the response. A clean no-consent probe changed from `google_token_fetch_failed` to Google `invalid_grant`, proving the configured client pair reaches Google without claiming a successful real login.

A fresh real consent in the controlled Chrome candidate returned by 303, installed the session, and made `/api/session/credential` return 200. The app displayed `Drive 연결됨` and listed real My Drive folders/media. On a controlled reload, the exact visible loop mechanism was then reproduced: at `DOMContentLoaded` the static shell exposed `연결 안 됨` and an actionable `Google Drive 연결하기` screen, while the cookie-bearing credential POST was still in flight. That request returned 200 and the same page became `Drive 연결됨` about 1.2 seconds later. Pressing the exposed button inside that window starts a redundant OAuth flow even though the session is valid.

Commit `213211f381d2181479501fb22183d700f9984713` ships version `1.22.0-rc.3`, which renders the initial connection state as busy, disables the connect action before JavaScript runs, and keeps it inert until the existing-session probe settles. It is deployed to the same candidate as Cloudflare Worker version `7dc03568-97e1-4a30-ab45-58b6c6cbd189`. All 12 public files were fetched from the live candidate and matched the commit byte-for-byte; three internal routes returned 404. Version readback keeps auth/diagnostics enabled, Drive writes false, the exact public origin/client ID, four secret binding names only, and the SQLite Durable Object.

The deployed candidate was reloaded with `/api/session/credential` deliberately paused. While pending, the live DOM showed `연결 중…` and only a disabled `기존 Drive 연결 확인 중…` button. The request carried the existing session cookie, returned 200, and the same page settled to `Drive 연결됨`, visible My Drive data, and `v1.22.0-rc.3` without another OAuth navigation. This closes the confirmed PC Chrome false-reconnect loop. Focused tests pass 79/79, the full nine-file suite passes 212/212, syntax/diff checks and Worker dry-run pass, and independent review found no blocking defect.

A new same-profile Chrome tab independently sent its session cookie, received one credential 200 and showed the library without consent. Three concurrent client refresh calls with the same rejected revision produced exactly one network credential request, advanced the live revision from 1 to 2, kept the same account, and left the library connected. The active service worker is the candidate's same-origin `sw.js` in `activated` state and controls the page. This supplies live PC evidence for session restart and single-flight refresh, without claiming a physical iPhone result.

The first bounded `V2-06A` unit is committed at `7e06c9af44d24c063b8a51b25120db89596f1009`. A deterministic never-resolving upstream fixture first failed 0/1 because no headers timer existed. The service worker now gives each Drive media attempt a separate 10-second headers deadline, aborts only that upstream attempt, reports one redacted `headers-timeout` trace plus one `MEDIA_PROXY_ERROR` with status 504/category `timeout`, and leaves retry ownership with the existing app playback intent. Caller cancellation remains distinct.

Independent review caught that the first implementation detached caller cancellation as soon as headers arrived. A second fixture reproduced `upstreamAborted:false`; the helper now clears only the headers timer on success and keeps its one-shot caller-abort link through the live response body. The focused four cancellation/timeout cases pass 4/4, the worker suite passes 31/31, the full nine-file suite passes 214/214, JavaScript syntax and diff checks pass, and the repeated independent review is clean. This closes only the headers-wait clock; first-byte, body, frame and seek clocks remain open.

The Q0 initial router is now committed at `38b440481343ce8f6195633cb8057b1d106ad494`. Video no longer awaits OPFS policy or starts a full-file transfer before assigning the original Range source; OPFS and bounded memory remain recovery routes. The inverted unit test failed before the change and now proves storage-policy/full-download stubs are untouched. The final functional browser audit passes 13/13: writable OPFS still starts `original-range` with one Range request and no full request, while an intentionally invalid Range response recovers to OPFS with an exact source SHA-256. The full nine-file suite passes 214/214, syntax/diff checks pass, and two independent reviews found no runtime defect.

This is route-order evidence, not yet QA-TR-01 first-frame-before-complete proof. The existing browser fixture fulfills the requested Range body at once, so a slow-tail chunked fixture must still compare `requestVideoFrameCallback` time with delivered bytes. README wording was narrowed to the actually implemented classified-error recovery, and now distinguishes verified PC candidate auth from the still-unverified physical iPhone/PWA session.

The first-byte body-boundary unit is committed at `171eecf384f154fa99bcc65b110dcef867231b5f`. Its 15-second clock starts only on an actual downstream pull, ignores zero-length chunks, clears on the first positive byte, EOF or cancellation, and atomically owns timeout over a late byte, caller abort or consumer cancel. The service worker waits for the one classified `MEDIA_PROXY_ERROR` delivery before terminating the stream, preserves backpressure with a zero high-water mark, and keeps one app recovery owner: one Range retry, then the existing complete-original buffer route. Validated 206 spans now also reject short EOF and oversized chunks before corrupted bytes can be accepted.

The final focused app/worker run passes 106/106, the nine-file suite passes 226/226, JavaScript syntax and diff checks pass, and the functional browser audit passes 13/13. Independent review is clean after fixing notification lifetime and custom abort-reason classification. This is deterministic local evidence only; `171eecf` is not deployed and does not yet prove body no-progress, decoded-frame progress, seek completion, or the physical priority sample.

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

- Completed automated/live-PC unit: `V2-04B` / WP-04 is `BLOCKED(physical iPhone/PWA)` only for QA-SL-05 and true sleep/wake/device behavior; AUTH-03~09, QA-AU-01/02/05/06/07/09 and QA-SL-01/03 remain the governing verified subset.
- Active READY unit: `V2-06A` / WP-06, with headers watchdog `IMPLEMENTED_LOCAL` at `7e06c9a`, Range-first router at `38b4404`, and first-byte watchdog/body-length guard at `171eecf`; body/frame/seek clocks and the remaining QA-TR matrix still govern completion under TR-01~10 and QA-TR-01~11.
- Product commit: `171eecf384f154fa99bcc65b110dcef867231b5f` on `codex/v2-kickoff-diagnostics`. Only this checkpoint/goal/product-truth record follows it locally.
- Verified live: exact candidate PC Chrome cookie/session recovery, first-paint lock, same-profile new-tab recovery, one-request concurrent refresh with monotonic revision, credential 200, Drive listing, active controlling SW, candidate identity/config, and public-byte equality.
- Not verified: physical iPhone Chrome tab/home-screen PWA callback and session persistence, actual token-expiry/sleep-wake duration, and any Drive/appData write or migration.
- External writes completed once and read back: candidate deployment version `7dc03568-97e1-4a30-ab45-58b6c6cbd189`. Do not repeat it without a new committed change.
- The three V2-06A local units are not deployed. Production/main/remotes and the existing candidate remain unchanged.

## Waiting on the user

- Empty. Physical iPhone/standalone status remains explicitly unverified; do not stop other approved READY work or weaken cookie/Fetch Metadata policy without that surface's evidence.

## Next first action

Add the body no-progress watchdog at the service-worker body boundary. Start or refresh its approximately 15-second foreground-demand clock only around pending downstream reads after the first positive byte; do not let normal pause/no-pull, cancellation, EOF or a completed span become a timeout. Make one atomic terminal owner emit one redacted `body-no-progress` plus one classified app error, abort the exact upstream attempt, and preserve the existing single recovery budget.

## Tried

- The earlier delayed consent exceeded the 10-minute transaction lifetime; safe recovery remains deployed and verified.
- `redirect: 'error'` was incompatible with Cloudflare workerd. `manual` plus explicit 3xx rejection preserves the no-follow security contract and passes the focused 17/17 and full 210/210 suites.
- The controlled Chrome browser completed consent and loaded Drive, while another cookie-less request returned 401. That contrast makes session/context continuity the next discriminator; it does not prove the user's reported loop is a Google consent failure.
- The confirmed current-client defect is not a lost cookie: reload sent a session cookie and received credential 200. It is the static unauthenticated shell becoming actionable before asynchronous session recovery finishes.
- The headers-stall fixture failed 0/1 before the implementation because no timer was scheduled, then passed with a finite 504 after the 10-second fake clock fired.
- The first derived-signal implementation passed the timeout case but failed a post-headers caller-abort fixture. Keeping the one-shot abort link for the response-body lifetime restored close/seek cancellation without adding another retry owner.
- The old initial-router regression required safe videos to use OPFS first. Inverting it produced 0/2 before the code change; after the change the focused tests pass 2/2, app/static pass 79/79, the full suite passes 214/214 and the browser audit passes 13/13.
- The current Range fixture proves request ordering and absence of a simultaneous full transfer, but not first-frame-before-body-complete. Do not mark QA-TR-01 passed until the slow-tail frame/byte comparison exists.
- The first-byte fixture initially had no finite timer. Later reviews exposed three false-confidence gaps—zero-byte chunks, 206 under/overrun, and app retry ownership—and two real races: timeout notification could outlive the stream, and a caller abort with a custom reason could be mislabeled. The final fixtures close each case and keep timeout as the only terminal winner under late competing events.
