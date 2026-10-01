# rc29 PC player scroll and duplicate favorite correction

Task status: local implementation and qualification complete; root owns candidate delivery, actual PC/Android replay, canonical goal records and integration commit.

## Observed cause and change

- Frozen product baseline: `8bb047c` (`1.22.0-rc.28`), loaded from Git by this new audit. No older QA evidence was modified.
- The stage itself fills the viewport. Its oversized, transformed ambient backdrop makes `.media-stage { overflow: hidden }` a programmatically scrollable container. At 1911x795, stage `scrollHeight=966`, `clientHeight=795`; native `ambientBackdrop.scrollIntoView({block:'end'})` or setting the stage scroll offset shifts video and chrome up171px and leaves their bottom at624. This reproduces the reported blank-bottom geometry without a missing footer or a video-height defect.
- `styles.css` changes this stage to `overflow: clip`. The backdrop remains clipped; native scrollIntoView and forced scrollTop no longer move the media or chrome. Existing flex formatting, original `object-fit: contain`, rotation/gesture transforms and pause-independent chrome owner are retained.
- While video transport is present, a CSS `:has()` selector hides its redundant topbar favorite. The transport favorite remains; images retain the topbar favorite and mobile retains the shorts favorite. Previous/next video and previous/next frame are distinct existing controls and remain intact.
- No product HTML/JS/version files were changed by this task. The upper-left rate badge in the supplied screenshot is absent from project source; its owner and the original event that caused the stage scroll remain unknown. This correction removes the scrolling mechanism regardless of its initiator. No claim about extension ownership is made.

## Verification

Run from the canonical repository:

```powershell
node qa/rc29-pc-player-layout/audit.cjs --baseline
node qa/rc29-pc-player-layout/audit.cjs
node --test --test-name-pattern="player chrome|frame.step|controls|bottom|gesture|pause" tests/app.test.js tests/static.test.js
```

- Before/after native Chrome: five viewports (1911x795,1280x800,768x1024,390x844,844x390). Baseline scroll offsets171/172/334/268/84; fixed offsets all0. Fixed video y0 and chrome bottom equal viewport height. Both native scrollIntoView and direct scroll offset are measured independently.
- Single video/image favorite at each responsive width; desktop video navigation and frame actions remain separately visible and labeled. Tab reveals controls; ordinary center movement does not; trusted bottom mouse/touch opens controls without toggling pause. Pause keeps hidden chrome inert. Native decoded synthetic MP4 is fitted with contain; every page has zero JS errors.
- Existing focused Node checks11/11 pass. `git diff --check -- styles.css` passes.
- Before/after screenshots were visually inspected for PC and390px portrait. Source is the existing public-safe synthetic fixture `qa/faststart-h264-aac.mp4`; supplied user media and its filename are not stored here.
- Isolated headless Chrome, loopback-only provider, external requests aborted, service workers blocked. Existing `qa/node_modules/playwright` is reused. Original physical/virtual launch floors are enforced before each browser launch. Browser/server close in finally. First Chrome MCP list was attempted and returned the root's managed-profile lock; no process or personal profile was touched.
- Native browser evidence is local synthetic and viewport emulation, not real-account, physical-device, candidate or production proof.

## Retained QA failure and next action

`qa-ordering-failures.json` preserves three failed sampling attempts. A control visibility transition was measured before a rendered frame at768px (zero favorites initially, one in the next measure). The audit now waits for a visible action and two animation frames before geometry sampling. Product acceptance assertions were retained; no product change was made to silence that QA ordering failure.

Root should stage only selected files from this ignored QA leaf explicitly, run required integration checks once after all rc29 edits settle, deliver the candidate within existing authorization, then repeat actual PC playback/control/focus and Android acceptance. Verify video/chrome alignment and single favorite on that candidate; do not infer actual trigger closure from these local checks.
