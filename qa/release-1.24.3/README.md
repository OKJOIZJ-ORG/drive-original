# Release 1.24.3 — D151 (D152 approved)

| Item | Value |
|---|---|
| Change | D151: the library page no longer pans sideways on iPhone. The sticky toolbar's edge-to-edge background is a `border-image` outset instead of a pseudo-element with `inset: 0 -100vmax`; `html`/`body` use `overflow-x: clip` |
| Commit | 2d24226 on branch `claude/toolbar-overflow-20261109`; main fast-forwarded and pushed |
| Worker | drive-original version eb5ff808-c245-4228-a820-63f010f66337 (`npm run deploy:release`, dry run first; 5 changed assets: `index.html`, `styles.css`, `app/core.js`, `sw.js`, `version.json`; bindings unchanged) |
| Tests | 1180/1180 on the committed tree (`node --test tests/*.test.js tests/*.test.mjs`); the held D149 code and its 2 tests were parked during the run |
| Served bytes | 92/92 public files equal to Git HEAD 2d24226; 7 private paths 404; anonymous credential 403 with `Cache-Control: no-store` (`qa/release-1.23.26/served-check.cjs`, `served.json`); version.json 1.24.3 |

The first served pass stopped at `app/original-pin.js` on a connection reset (curl exit 35): `--retry` does not retry connection errors. The script now passes `--retry-all-errors`; in the second pass one reset on `app/auth.js` was retried and passed. The last `licenses/` part arrived at about 2 KB/s, the slow large-file transfer already noted in the 1.23.26 record.

## Cause

The user's iPhone PWA screenshot showed the library scrolled about 114px to the left with an empty black area on the right. D147 (1.24.2) painted the sticky toolbar's background edge to edge with `.toolbar::before { inset: 0 -100vmax }`. That box reached 100vmax (852px on a 393×852 phone) past the toolbar's right edge and counted as scrollable width: the document was 1234px wide on a 393px screen. `body { overflow-x: hidden }` is handed to the viewport; it stops user scrolling in desktop Chrome, but the screenshot shows it did not stop iOS touch panning. The toolbar is always on the library screen, so the defect was not tied to video loading.

## Fix

- `.toolbar { border-image: conic-gradient(rgba(0,0,0,.96) 0 0) fill 0 / 0 / 0 100vmax }`: the outset paints outside the box and adds no scrollable width. The pseudo-element is gone.
- `html { overflow-x: clip }` keeps body's overflow from being handed to the viewport; `body { overflow-x: hidden; overflow-x: clip }` then clips body's own content, so no descendant can widen the page. `clip` does not make body a scroll container, so `position: sticky` still binds to the viewport. Browsers without `clip` fall back to the previous viewport-level `hidden`.
- Either change alone brought the document back to 394px in the local measurement.

## Observed

- Local demo before the fix, Chrome mobile emulation 393×852: document `scrollWidth` 1234px, `innerWidth` 1234px; hiding `.toolbar::before` gave 394px.
- Local demo after the fix: document width equals the viewport at 375, 393 and 1440px; `scrollTo(800, y)` stays at x = 0; the toolbar pins at 60px and hides/shows on narrow screens; its background covers the full width at 393 and 1440px over a test stripe pattern; selection mode (static toolbar) unchanged. `ui-audit.js`: overflow 0, rows 0, grids 0, align 0 at 375 and 1440px.
- Production 1.24.3, `?demo=1`, AI Chrome mobile emulation 393×852: `styles.css?v=1.24.3` loaded, document 394px = viewport, `innerWidth` 394px, `scrollTo(500, 0)` stays at x = 0, `html`/`body` `overflow-x: clip`, toolbar `border-image-outset` `0 852px`, no `::before`.

## Not verified

- WebKit measurements. The mobile checks are Chromium device emulation. The user checked the iPhone app after the update and answered "안 밀림" (A-015 closed); no measurement was taken on the device.
- Signed-in production library: the AI Chrome profile is not signed in to production. The demo route serves the same `styles.css` and library markup.

## Known limits

- Hangul and digit labels sit 0.5–1px below center in controls and badges (ui-audit `dy` 1.0–2.1). This predates 1.24.3 and is recorded as A-016.
- Tabs that were already open keep the old CSS until the normal app update is applied.
