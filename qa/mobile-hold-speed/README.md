# Mobile edge hold speed — local-only QA

Run from `source`: `node qa/mobile-hold-speed/audit.cjs`.

The driver serves the current local app, blocks external requests and service workers, plays the maintained local native MP4, and sends trusted Chrome touch input through CDP. It checks left/right edge and corner holds, stationary reserved-left hold, persistent feedback, exact 1.25× restoration, movement, touch cancellation, multitouch, source replacement, close, controls and paused eligibility. It also checks native pause/end and explicit speed/transition commands retiring an activated hold before subsequent movement and release: no tap, seek or controls reveal may follow. Playback snapshots must retain 1.25× during the temporary 2× hold. A dispatched blur event checks lifecycle cleanup separately.

`results.json` owns the observed results and exact app/style/shell hashes. `held-2x.png` shows the visible while-held feedback. `failure.json`, if present, preserves the latest unsuccessful run.

Observed on 2026-10-08: 19 native Chrome cases passed, and the 11 focused hold/gesture tests in `unit-results.txt` passed (8 new hold tests plus 3 existing gesture contracts). The retained `failure.json` came from the first driver's extra `touchEnd` after Chrome had already canceled the contact; the driver was corrected and rerun successfully.

The separate existing `qa/playback-gestures-local.cjs` driver stopped in its desktop controls-reveal assertion at line 93. The same failure was reproduced while serving `HEAD:app.js` through that otherwise unchanged driver, so it does not establish a hold-speed regression. Its later mobile checks were not reached in those runs.

This is local Chrome mobile emulation with a native media element. It does not establish production, account, physical Android, iOS, actual finger/OS-edge, or all-format playback acceptance.
