# Player input and presentation quality — isolated DOM evidence

## Scope and producer

Maintained producer: `../player-input-quality-audit.cjs`.
Run `node qa/player-input-quality-audit.cjs before` for immutable Git `3fa5914`,
or `node qa/player-input-quality-audit.cjs after` for the working candidate.
Both results pin producer SHA-256 and app/CSS/shell SHA-256. External requests
are blocked; the anonymous browser is a separate Playwright Chrome instance.
No actual account, Drive media, volume/mute/output setting, release, version,
or deployment is changed. Playback commands use synthetic method counters;
mouse, touchscreen, keyboard, pointer capture routing, focus, and layout are
actual browser DOM behavior. Lifecycle/decoded handoff signals are synthetic.

## Observed causal discrimination

Before desktop: the unfocused entry is a clipped `1x1` box at `(639.5,399.5)`.
`elementFromPoint` and trusted mouse down/up/click identify `videoPlayer`, not
the entry; the click pauses once and leaves chrome hidden. Focus relocates the
entry to `(16,732)` at about `137x44`. Therefore the observed failed pointer
entry is an inaccessible pointer hit target; focus movement is a secondary
structural hazard, not a separately proven down/up relocation race. The tiny
poster is `160x90`, and the computed stage cursor is `none`.

After: the native entry always occupies full stage width and a 44-pixel bottom
zone above any safe-area padding. Its rectangle does not change on focus.
Pointer hover and gesture reservation reuse that same rectangle. A reveal
start owns its release/cancel click; a control-start drag cannot become a stage
playback click. A second touch cannot take over the primary reveal sequence.
An outside single tap dismisses visible controls without pausing; a hidden
center single tap pauses once without revealing controls. Tab/assistive entry
and native button Space preserve one owner, while pointer-button focus hands
subsequent viewing Space back to playback.

The stage-sized `contain` video supports both poster and first-frame display.
Rotation testing found flex shrink reducing a portrait rotated video box to
693 pixels instead of 844; `flex:none` and swapped viewport constraints now
keep the rotated box inside the stage. Loading uses a quiet 56-pixel ring;
normal internal diagnostic text stays hidden. Existing recoverable error
layout fits 320-pixel width. No normal pause/play/load/seek signal opens chrome.

The collection status defect is independently reproduced by the actual
`ensureAllPagesLoaded` owner with a synthetic final-page result: the final
progress update survives after `populationComplete=true`. Successful
completion now clears only its still-current status token. A newer owner
created during the old final-page request remains untouched.

## Verification and artifacts

- Before reproduction and after semantic assertions pass all four viewports:
  `1280x800`, `390x844`, `844x390`, `320x568`.
- After checks include native mouse/touch/keyboard, touch release outside,
  touch cancel, second finger, pointer focus vs keyboard focus Space, app-owned
  fullscreen, resize, rotation, simulated 24-pixel safe bottom, reduced motion,
  quiet loading, recoverable errors, and newer library-status owner protection.
- `node qa/v2-ui-audit.cjs after` passes desktop/mobile synthetic preview
  regression: no automatic external request, shared chrome owner, keyboard
  entry, explicit retry/close, and >=44-pixel actionable buttons.
- Eight focused app/static regression tests pass; app and driver syntax and
  `git diff --check` pass. Full integration checks remain coordinator-owned.
- `after/*-controls.png`, `*-poster.png`, `*-rotated.png`, `*-loading.png`, and
  `*-error.png` are public synthetic illustrations, visually inspected for
  mobile, landscape, loading, error, and rotation states.

Android hardware/emulator and iPhone tooling remain unavailable in the prior
inventory. Desktop touch emulation and app-owned fullscreen are not Android,
iOS Safari, standalone PWA, OS fullscreen, or physical safe-area proof. No
real account or native decoded-media playback acceptance is claimed here.
