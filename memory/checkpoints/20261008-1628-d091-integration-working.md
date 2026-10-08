# Checkpoint — D091 rounded surfaces and mobile hold speed in progress — 2026-10-08 16:20

## The story so far
Local branch codex/rounded-surface-clipping starts from operating main f3463f1 (1.23.4 runtime e677852). Observed production DEMO filename dialog: transparent native dialog has overflow:auto and radius0; its rounded22px inner box shadow is clipped to the square host. Generic dialog now allows overflow:visible while the inner box/body retain clipping and scrolling. Mobile hold speed is implemented by the bounded Sol/high child in app.js/tests: side bands including corners, temporary2x, restore prior rate on release/cancel/lifecycle changes. Focused10 and local native14 cases pass; root integration and rounded paint/scroll QA remain. New changes are local, not deployed.

## Decided
D091: fix opaque protrusions around rounded overlays; add mobile left/right edge hold2x with previous-speed restoration. KISS, ordinary gestures and existing product boundaries persist.

## Waiting on the user
None for local implementation and verification. D090 delivered the prior1.23.4 unit and does not grant new D091 deployment.

## Next first action
Create and run source/qa/rounded-surface-clipping/native.cjs against baseline and working CSS, then review app.js lifecycle integration and run the product suite once.

## Tried
Chrome MCP screenshot filePath was outside its stale allowed workspace; screenshot without a path timed out. Use the local native QA driver for paint receipts.
Passing image base64 through a Windows command exceeded command-line size; do not repeat.
Existing playback-gestures-local.cjs desktop reveal assertion failed with both working and HEAD app.js; it does not establish a new hold-speed regression and its later mobile cases were not reached.
