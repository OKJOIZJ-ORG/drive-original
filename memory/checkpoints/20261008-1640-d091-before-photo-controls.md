# Checkpoint — D091 local rounded surfaces and mobile hold speed complete — 2026-10-08 16:28

## The story so far
Local branch codex/rounded-surface-clipping starts from mainf3463f1. Common native dialog overflow:visible fixes its square clipping of the inner rounded shadow; content clipping and scrolling remain. Six dialogs/four layouts and intended menus visually reviewed; native focus/long-scroll/end/header/close pass. Mobile lateral18% bands including corners hold450ms→temporary2x/persistent pill, retirement restores priorrate and consumes contact. NativeChrome19cases/focused11/fullproduct930/930 pass; finalapp5555217f/style1ef3f8d8 match receipts. Maintained QA owns exact proof/limits. This coherent local unit is saved; operatingD0901.23.4 runtimee677852/Worker4d0146e1 unchanged. No new production/physicaldevice proof.

## Decided
D091: fix opaque protrusions around rounded overlays; add mobile left/right edge hold2x with previous-speed restoration. KISS, ordinary gestures and existing product boundaries persist.

## Waiting on the user
None for completed local implementation. New D091 delivery authority is absent; this is not an unattended deployment or device-verification queue.

## Next first action
Open C:\Projects\Drive-Original\source\qa\rounded-surface-clipping\README.md and qa/mobile-hold-speed/README.md to review D091's completed local changes and evidence before any separately authorized operating delivery.

## Tried
Chrome MCP screenshot filePath was outside its stale allowed workspace; screenshot without a path timed out. Use the local native QA driver for paint receipts.
Passing image base64 through a Windows command exceeded command-line size; do not repeat.
Existing playback-gestures-local.cjs desktop reveal assertion failed with both working and HEAD app.js; it does not establish a new hold-speed regression and its later mobile cases were not reached.
Initial full suite929/930 failed because the old immersive fixture lacked mediaStage.contains; fixture corrected, assertions preserved, final930/930 pass.
Critical review found pause/end stop-only could leave an activated contact eligible for tap; common hold retirement now clears the recognizer and native pause/end movement/release cases pass.
