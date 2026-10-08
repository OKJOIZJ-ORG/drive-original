# Minimal loading overlay — local Chrome QA

Run from `source`: `node qa/minimal-loading/native.cjs`. Provide the Codex bundled Node package directory through `NODE_PATH` when Playwright is not installed locally.

The driver serves only current public app assets on a temporary localhost origin, blocks external requests and service workers, and uses an isolated Chrome profile. Four viewports: 1440×900 desktop, 390×844 / 320×568 portrait mobile emulation, and 844×390 landscape mobile emulation.

Each viewport checks unknown progress, measured byte progress through `updateOriginalBufferProgress` (40%), buffered-position progress through `updateNativeLoadingProgress` (50%), and compact seek progress (75%). The loading overlay may paint only `로딩 중` and a measured percentage. The percentage and ordinary progress bar agree; compact seek retains the number and omits the bar. Unknown progress hides the number and bar instead of inventing a percentage. Accessibility exposes no storage, transport, or buffer implementation detail, and the overlay fits the viewport. Compact seek screenshots wait beyond the existing 900ms delayed reveal.

These progress states are painted calibrations through the actual product helpers; buffered ranges are explicitly supplied on the native media element. They do not measure real transfer speed or prove a real video seek. The separate source-reset/ready scenario uses ordinary `openMediaSource` demo-image acquisition and its native image load event; it checks old progress/compact state reset and loading retirement. Error retirement uses the product recovery helper.

`results.json` here is the portable receipt. Full AX/screenshot evidence is in workspace `maintenance/tools/minimal-loading/`; exact app/style/shell hashes bind the results. Failures, when present, are retained.

Observed final 1.23.5 candidate on 2026-10-08: all 24 states passed across four viewports. Paint reads exactly `로딩 중`, `로딩 중 40%`, `로딩 중 50%`, or compact `로딩 중 75%`; numeric values match product progress values. Ordinary image reopening clears the old percentage/bar value and compact state, and its native load event retires loading. Error presentation retires loading. Visually inspected portrait measured progress, 320×568 unknown progress, desktop compact seek, and landscape buffer calibration. Current file hash readback matched the receipt.

Final identity: app `b8f33a506723d5b9bf4e080275101a1ffc3b52270ee0cee4096cb028704bc8e8`; style `f1d427ea25de4980d0091cf60e4f61bd51ca99bb84741463b50064414211479f`; shell `b5eb9ddbfae4f15046f2429e4652f12ec944e18d7634176418f282275ff2bed6`. An earlier passing intermediate run is retained under `maintenance/tools/minimal-loading/intermediate-pre-location-fix`; it preceded the unrelated full-original post-load metadata variable restoration and is not final-source evidence. Its compact screenshots were taken before delayed reveal; final screenshots wait beyond it.

No Google account, Drive media, production, physical Android/iOS, or actual transfer-rate acceptance is claimed.
