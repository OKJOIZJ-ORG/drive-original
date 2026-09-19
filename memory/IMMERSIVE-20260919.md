# v1.21.0 — immersive player and session stability

## Scope and provenance

User-confirmed on 2026-09-19: continue implementation in the relocated canonical
`C:\Users\jbs\Desktop\폴더모음\자작프로그램\Drive-Original\source`.
The nine reported UX/auth defects are the requirements, not a request to redeploy
unchanged v1.20.0. No Antigravity delegation or paused automation was started.

Observed starting points: main/remote main `70ff332`, clean; preserved draft
candidate `9a13076`. The candidate's writer-owned polling and one-shot animation
completion were reviewed and reused. No unverified old standalone app.js copy
was installed. Baseline 120 tests and candidate 131 tests were rerun successfully.

## Implementation and evidence

| Request | Change | Evidence / boundary |
|---|---|---|
| 1. iPhone overlapping back pages | Safari and standalone WebKit with owned history both reserve the native edge; the app does not also animate cloned pages. | The supplied screenshot is an actual failure report. Native/custom competition is a supported causal hypothesis, not a physical-device diagnosis certified by this session. Policy tests and Windows WebKit pass; actual iPhone remains open. |
| 2. Back versus previous video | Custom back starts within 18 CSS px. Media gestures exclude this strip and 32 CSS px on iOS, even when back cancels. A player owns one history entry. | Chrome touch-input test: reverse cancels without changing video; committed edge closes only player; an interior swipe changes media without closing. These dimensions are implementation choices requiring actual iPhone acceptance, not a universal OS specification. |
| 3. Stable back completion | Preserved transition identity consumption; player closure has a separate generation-scoped deadline; old opening focus cannot affect a later player. | Existing 8 edge groups plus cancellation/late callback/duplicate completion and player deadline tests. No ghost layer after tested back transitions. |
| 4. Authentication | File permission failures no longer erase account credentials. Renewal verifies identity before publishing; same-account renewal preserves list/player/position. Unknown identity leaves the current session untouched. Request errors carry numeric credential/account generations, not bearer tokens. | Real-browser synthetic OAuth renewal preserves the same file array, selected object, media/data generations and paused 0.4-second position. Late 401, including identical token text with a newer revision, and Drive 403 are covered in Node. Actual Google long-duration expiry is not certified. |
| 5. PC Space | Pointer-clicked buttons return focus to the stage; explicit Tab/button keyboard activation stays native. The hidden controls are inert. | Browser verifies mute click then Space toggles playback, not mute; keyboard-focused mute still toggles mute only. |
| 6. Long press | Selection/drag/callout suppression is card-scoped. Movement, scroll, a second pointer, blur/visibility, pointer cancellation and detach cancel pending selection. Release click after a successful hold is consumed. | Actual Chrome mouse press/release and movement; no selected text; input text selection still works. Secondary touch cancellation is a deterministic test; native iPhone callout behavior still needs hardware. |
| 7. Transparent PC UI | Existing controls/title/actions are consolidated into one bottom gradient wrapper instead of the separate opaque floating bar. Existing control IDs/actions remain. | 1240px-wide transparent control area at a 1280px viewport; no border; screenshots and viewport bounds inspected. Mobile actions remain in their existing overflow stack. |
| 8. Pause is not visibility | Central pause/play overlay stays hidden. Passive playback events cannot reveal controls. Stage focus outlines and nonessential feedback do not interrupt the hidden state. | Browser pause/Space tests and deterministic UI-state tests. |
| 9. Bottom-only reveal | Pointer entry into the bottom activation strip or explicit bottom touch reveals the wrapper. Leaving hides it after a short delay; keyboard focus, active seek and a touched open menu remain usable. | Center mouse movement stays hidden; bottom entry reveals; keyboard-to-pointer takeover still hides on exit; fullscreen contains the same wrapper. |

The existing original-byte transport order, single decoder, complete-population
random deck, legacy read-only state migration, blue-dot icon, browser zoom and
actual Drive media are preserved. No new runtime dependency, server, permission
scope or token logging was introduced.

## Test contract changes and failures addressed

- An old assertion explicitly assumed standalone PWA had no native edge owner.
  It now checks both browser/PWA ownership and the no-owned-history negative case.
- Static chrome checks now assert the single hidden/inert wrapper rather than
  separate child animations. Legacy horizontal child transitions were removed:
  visual inspection showed a clipped play button during reveal.
- Browser tests now reveal controls through Tab or bottom touch before focusing
  them. Focusing hidden/inert elements is no longer a supported control path.
- A subsequent intermittent keyboard failure was reproduced and fixed, not
  dismissed as a flaky test: animating CSS visibility delayed synchronous Tab
  focus. Only opacity is now animated. Cleared hide timers also reset their IDs.
- One preliminary WebKit layout run logged an update-probe cancellation during
  the fixture's second full navigation. The layout driver now enters demo in
  the already initialized document, without filtering console errors. Cold
  production navigation is a separate release check. The final Chrome/WebKit
  layout runs had no page/console errors, accessibility findings or overflow.
- A stale player-close timeout found during review now cannot unlock a newer
  back operation. A new regression explicitly exercises this ordering.

## Observed local results

- Node: **144/144**. This is the original 120 plus 11 preserved acceptance tests
  and 13 new immersive/session regressions; existing assertions were strengthened
  where their contract changed.
- Functional browser fixtures: **12 groups passed**, including exact-original
  OPFS/Range/memory recovery, same-range token retry, new UX/auth cases, partial
  bulk failure, mobile actions, 7,384-item virtualization and offline shell.
- Chrome and Windows WebKit: **25 states each**, across 320x568, 390x844,
  844x390, 820x1180 and 1280x800. Includes hidden and explicitly revealed player
  chrome. Final runs: no axe A/AA findings, page/console errors or horizontal
  control overflow.
- Existing edge browser audit: **8 groups passed**.
- Isolated cached-shell upgrade: the actual `70ff332` v1.20.0 Git assets were
  installed in Chrome, then the app's update action loaded v1.21.0. The old shell
  was removed, unrelated cache/local settings were preserved, and offline reload
  still loaded v1.21.0. This is not a physical home-screen installation test.
- Two independent continuously visible browser contexts: union received by both
  in **15,051ms**; remote unlike removed the recipient's visible card in
  **15,034ms**. Explicit offline interception blocked upstream writes, preserved
  the remote store and peer's old state, then converged after reconnection.
  Reload retained cancellation records and writer identity. **4 groups passed**.

Evidence: `qa/immersive-results.json`, local `qa/release-1.21.0-*` folders and
`qa/edge-final/results.json`. Earlier raw fixture outputs remain separate local
phase directories. Do not reinterpret successful mocked API fixtures as live
Google-account or physical-device measurements.

## Open acceptance and operation

Actual iPhone Safari and installed PWA must each test completed/short/reversed/
interrupted/rapid repeated swipes, player-only back, interior media swipe,
bottom controls, long press, landscape and safe areas. Record iPhone/iOS version,
browser/PWA mode, served application version, expected and actual navigation
count, leftover layers and a screen recording. A pass on one mode is not a pass
on the other.

Two actual independently authenticated devices must test foreground bidirectional
like/unlike/viewed propagation without reload/refocus, offline replay, sleep/
wake, token expiry and same/different-account renewal. Use nondestructive sample
media; do not move/delete real Drive originals for QA.

The browser token architecture cannot justify a claim of indefinite automatic
login. Explicit renewal is available without destroying the current library.
Google's cross-origin compatibility player can still supply its own controls;
the app does not claim ownership of that remote document.

Production status and served source/deployment SHAs belong to the post-publication
`RELEASE-1.21.0.md` and current `CHECKPOINT.md`, not this implementation report.
