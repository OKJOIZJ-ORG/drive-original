# Responsive redesign — 2026-10-04

This is the single QA summary for D081. D082 approved production1.23.0, now published on the existing origin.

## Changes

- Compact library toolbar with search, filter tabs and one native view-options menu.
- Edge-to-edge player gradient, slim seek bar, fewer primary buttons; frame controls remain in More while paused. Desktop image navigation is retained.
- Mobile current/total time; central square toggles playback, exterior taps reveal controls without changing playback. Native back-edge movement remains available.
- Measured loading: contiguous playback buffer out of the next 3 seconds (shortened at EOF), or bytes saved out of known file size. Unknown totals remain indeterminate.
- Shared timeline snapshot and unchanged-value checks avoid repeated formatting, DOM writes and seek-track layout reads. One DataView per MP4 admission scan (731 to 1 in the AAC fixture); all rejection safeguards remain.
- Correct SVG hidden attributes for play/pause, mute and fullscreen icons. System fonts remove the external font request. Consolidated component CSS replaces scattered overrides; no new dependency.

## Verification

- Final product suite: `node --test tests/*.test.js tests/*.test.mjs`, 872/872 passed. Includes stale media ownership, buffer percentage, gestures, parser boundaries and SVG-state regression.
- `node qa/responsive-redesign/layout.cjs after`: isolated Chrome, real app DOM with a synthetic catalog/poster. Eight desktop/portrait/landscape sizes (320–1920px), menus, selection, safe area, desktop image navigation and real SVG visibility. This is layout evidence, not media playback.
- Actual authenticated PC Chrome: local HTML/CSS/app/module in an owned same-origin test tab; existing service-worker controller retained. In 뷰너, the 20,891,042-byte MP4 played in original-range mode at 1920×1080; 50 frames/2.007 seconds, no media error. Native UI pause/resume and keyboard seek to 5 seconds reached readyState 4. View menu Escape restored focus. The shell was initialized in a controlled test document; normal release update is not proved by this check. Owned tab and overrides closed; original user tab untouched.
- Actual SM-F711N / Android 15: `android.cjs`, exact four local resource overrides and existing SW controller. Only three 뷰너 samples; 88 frames/3.52 seconds and 107 frames/3.50 seconds on the first/third samples; seeks 116/309ms. Portrait 360×744 and physically rotated landscape passed center pause/resume, all four exterior corners and horizontal sample switch. Trusted automated device input, not human finger or iOS acceptance. Original tab controllerchange count 0; rotation, overrides, test tab and ADB forward restored.
- Actual-device playback preceded the final SVG-only repair/version bump and desktop image-nav CSS repair. Those final changes have focused unit and DOM regression coverage; the playback pipeline is unchanged.

Private actual-media results/screenshots and temporary override bundle remain in `../../../maintenance/tools/responsive-redesign` (workspace maintenance directory; no media IDs or screenshots in public artifacts). Earlier interceptor/tool failures are not product passes. The 1.22.1/local startup comparison (3.33/3.34 seconds) does not establish a speed improvement.

## Domain and limits

The configured Cloudflare account has no custom-domain zone. The existing shorter GitHub Pages entry still redirects to the current Worker. A shorter final origin requires a Worker/account-subdomain change plus Google OAuth callback and origin-state migration; no account-wide rename or new origin was applied. Preserve the current origin for this UI release. iOS remains user validation. Earlier unrelated original-spec acceptance items remain in their existing owner; this bounded redesign does not relabel them passed.

## Operating release readback

Public8ee61df deployed as Worker c31cb961-26af-4621-bbc7-64f435142a64 after reviewed main integration/push563ea70. Six changed runtime responses equal Git bytes; unchanged assets reuse prior proof. Private memory/QA routes404. ZIP65entries equals Git; previous1.22.1 package preserved. No origin/permission/backend migration.

PC existing tab: normal reload, login retained, app1.23.0, active controller and only1.23.0 shell cache with51entries. The same20.9MB 뷰너 original-range clip decoded50frames/1.997s, seek5.016s/ready4, no native error. SVG playing icon state correct. Returned to 뷰너 library. Android existing tab: normal update settled to app and live SW VERSION1.23.0, active controller/no installing or waiting, login retained; startup2.67s,72frames/2.865s,seek62ms, center pause and exterior reveal passed. Original tab returned to closed player; no new tabs, overrides, cache deletion, unregister or clients.claim. ADB forward removed. Private result: maintenance/tools/responsive-redesign/android-production.json. Initial update-in-progress observation and driver typo were not product passes; fixed without redeployment.
