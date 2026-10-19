# 1.23.12 operating verification — D101 moov-at-end head continuation (D102)

User request after the D101 local result: "Merge the moov continuation branch into main as 1.23.12, deploy it, and measure it on real Drive." Branch `claude/q0-moov-continuation-20261019` fast-forwarded onto main. Release commit `8232669` (pushed); Worker version `bb66276a-5c22-4f49-9635-ff6fe22e0479` (previous `ac8f076c`). The only runtime change is sw.js; the version strings were also bumped.

## Delivery evidence

| Evidence | Verified scope |
|---|---|
| Tests | 967/967 (`node --test tests/*.test.js tests/*.test.mjs`) |
| Deployment | Unmodified `npm run deploy:candidate`; 4 changed assets uploaded, 61 unchanged |
| Served bytes | 64/64 public files 200 and equal to committed bytes; private paths 404 ([served](served.json)) |
| Auth | Anonymous `POST /api/session/credential` rejected with `no-store`; Worker/auth code unchanged |
| Actual normal Chrome | Own background tab in the user's profile, closed after: v1.23.12, SW activated, 1.23.11 cache removed, same account signed in, 20 likes; filter restored to 전체, player closed |

### Deployment notes (observed)

- The first two runs stopped at the materializer and deployed nothing. First cause: the user's global `~/.gitconfig` gained `core.autocrlf = false` at 2026-10-19 22:53, after the 1.23.11 deployment and not by this session. That overrides the system `autocrlf = true`, so `git hash-object` saw CRLF checkouts of unattributed files (worker/*, scripts/build-pages.cjs, licenses/video-q3-source-manifest.json) as differing from HEAD. The global setting was left unchanged. The deploy ran with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true` for that command only, which reproduces the previous release environment. With it, all 77 publication inputs hashed equal to HEAD.
- Second cause: Google Drive for desktop's upload staging (`C:\Projects\.tmp.driveupload`, about 9,400 entries) held hard links on the four changed files for about 51 minutes, past the materializer's 120-second bound. On the user's choice, sync stayed on and a wait loop deployed once the links cleared.

## Real Drive measurement (observed)

Signed-in production app, liked videos, ordinary tap gesture (pointerdown → 100 ms → pointerup + click), with the app's own diagnostic sink, which carries the SW stages and the `reason: 'continuation'` field. Times are from press, so they are about 0.1 s longer than "click →" figures. File identities are omitted.

| File | Opens | Restart served by continuation | Press → first frame (ms) | Median |
|---|---:|---:|---|---:|
| #16, 0.9 MB, moov at end | 8 | 8/8 (`bytes=32768-`) | 3774, 3708, 4991, 3441, 3352, 5527, 4074, 3321 | 3741 |
| #9, 15.1 MB QuickTime, moov at end | 7 | 7/7 (`bytes=32768-`) | 4539, 3731, 6258, 3830, 3736, 3753, 3715 | 3753 |
| #6, 806.8 MB, moov at end | 3 | 0/3: restart at ~8.3 MB, outside the 4 MiB window (by design) | 3643, 3274, 3695 | 3643 |
| #10, 232 MB, faststart (control) | 3 | no restart | 2079, 2843, 2835 | 2835 |

Stage timeline of the last 8 opens (#16/#9, ms from trace start): the tail request's headers arrive at 2766–4525. The restart request starts 4–9 ms after them, and **its first byte comes 0–1 ms after it starts**. Before, that wait was a fresh Drive TTFB of 1.0–1.2 s (D100). `loadeddata` follows 46–144 ms later.

Comparison. Earlier figures are click→frame medians, so subtract about 0.1 s from the figures here.
- D100 baseline, 1.23.10: #16 4988, #9 4973.
- D100 candidate, equal to the 1.23.11 page path: #16 4507, #9 4590.
- Live 1.23.11 by the D100 session: 0.9 MB 3.8–4.6 s.
- 1.23.12 here: #16 3741, #9 3753 → roughly −0.7 to −0.9 s against 1.23.11 for moov-at-end files whose restart falls inside the window.

Outliers (4991, 5527, 6258) moved the tail request start itself later (Q0 pin/Drive delay before the continuation matters), as seen in 1.23.11.

## Not verified / limits

- #6-type large files whose restart offset is beyond 4 MiB get no benefit. A larger window would trade more held memory and extra Drive transfer. This is not decided.
- The waste case, where a head is parked and never adopted (≤ 4 MiB, ≤ 10 s), is covered by unit tests only.
- Not tested: physical mobile devices, WebKit, sustained playback.

No original media, auth/OAuth config, origin, Notion or automation change.
