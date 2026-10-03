# Playback and portrait UX repair — 2026-10-03

`results.json` owns this local repair's combined evidence and limits. Operating
1.22.0 is unchanged. This branch has not been merged, pushed or deployed.

## Findings and responsible changes

| Before | After | Why |
|---|---|---|
| Safari fails the shared vendor import on `using T`; MP4 admission aborts before frames | Pinned build targets ES2022/Safari17 and lowers resource management with disposal semantics retained | Fix the delivered syntax, preserving the eight existing source patches |
| Valid MOV has both media and data handlers and an empty self-contained `alis` reference | Only `mdia` owns the media type; exactly empty version-0, flag-1 `url `/`alis` references qualify | Admit actual QuickTime structure while rejecting external/malformed references |
| Portrait filename squeezed between controls; overflow menu has conflicting owner offsets | Full-width shared title, 44px action row, relative menu with viewport/safe-area limits | Portrait comes first; landscape uses the same owner |
| Single taps across the stage pause; double-click opens fullscreen | Only X/Y 30–70% pauses; center pair likes, narrow side pairs seek; no double-click zoom/fullscreen | Controls, swipes, cancellation and multi-touch cancel pending taps |
| Bulky PC selection bar and uneven close control | 44px PC bar, square close control; mobile 58px bar with 44px targets | Compact proportions with separate close-button ownership |
| PC transport spans the full screen | Centered 1040px chrome and readable fractional-speed labels | Consistent spacing and shorter pointer travel |

The apparent system playback/status controls on the iPhone witness are recorded
in the original video. A video-only decoded frame confirms it; the user also
confirmed this. They are not duplicate app chrome and no source media was edited.

## Evidence actually obtained

- Actual connected iPhone Safari, same favorites view: 13 items loaded; **three
  distinct witnesses**, not a full scan. MP4 index0: 3 decoded frames/ready4;
  MP4 index1: 18 frames plus midpoint seek; MOV index10: 86 frames plus midpoint
  seek. Original-range transport/decode flags are true, native errors zero.
  The tested local module graph was temporarily substituted into operating1.22.0;
  the app planner, blob URLs and temporary globals were restored afterward.
- Actual Safari portrait 440px: all 12 visible targets are at least44px, hit-test
  centers belong to the intended controls, and bounds are inside the viewport.
  This is DOM geometry, not physical finger-input proof.
- [UI receipt](../playback-ux-ui/after/results.json): actual local app DOM,
  synthetic media, eight sizes (320/360/390/440 portrait, 667/844 landscape,
  1440/1920 PC), safe-area bounds, long-press selection and speed-label geometry.
- [Gesture receipt](../playback-gestures/results.json): trusted Chrome mouse and
  emulated touch with local native MP4; central pause/resume, outside no-pause,
  seek/like pairs, cancellation, single swipe commit and no double-click/tap
  fullscreen/viewport-scale/object-fit change. The final receipt matches current
  app/HTML/CSS. A final discriminating test reproduced delayed central pause after
  bottom-entry activation; both early returns now cancel that tap, related27 and
  one trusted Chrome rerun pass. It is not physical iPhone/Android gesture proof.
- Full Node run:879 total,877 pass,2 obsolete CSS-layout assertions fail. Only
  those assertions were aligned with the owner geometry; focused static20/20
  passed. The subsequent tap-cancellation repair passed related27 and the native
  Chrome event run. The failure
  log remains locally retained (`full-tests.log`, hash in results). No false
  fresh whole-suite claim and no unchanged whole-suite replay. Scoped counts overlap.
- [Source/build receipt](../playback-build-source/README.md): fresh source archive
  extraction byte-reproduces runtime1186a320; deterministic archivea1b9f741;
  66 upstream/eight modified/five shared files; lowered disposal tests pass.

The earlier `qa/q1-general-product-preparation/reproducible-build/build-result.json`
is preserved as historical evidence. Fresh root-producer output is saved in
`qa/playback-build-source/root-build-result.json`: its `preferredSourceSha256`
identifies the raw intermediate archive, not the deterministic distributable
in `licenses/`. `package-result.json` owns the actual distribution hash.

## Maintained commands and cleanup

Use the existing `qa/ios-webinspector` loopback9234 bridge. Re-list targets after
reconnection and explicitly bind the intended operating Safari target when
multiple pages match. No new browser consent, hidden profile change or cache
modification is part of these helpers.

```text
node qa/playback-repair/build-ios-native-probe.cjs PRIVATE_ACTOR PRIVATE_EXPRESSION
node qa/playback-repair/build-ios-ui-probe.cjs PRIVATE_UI_ACTOR
node qa/playback-repair/build-ios-native-probe.cjs PRIVATE_UI_ACTOR PRIVATE_EXPRESSION
node qa/playback-repair/ios-inspect.cjs PRIVATE_EXPRESSION NEW_PRIVATE_RESULT [PRIVATE_PNG] [CURRENT_TARGET_ID]
node qa/playback-repair/ios-inspect.cjs qa/playback-repair/cleanup-inspection.expression.js NEW_PRIVATE_RESULT "" CURRENT_TARGET_ID
node qa/playback-ux-ui/audit.cjs after
node qa/playback-gestures-local.cjs
node scripts/package-general-q1-source.cjs --check --verify
```

`ios-inspect.cjs` enforces50s overall/42s call/4s cleanup bounds, unique result
paths, intended origin and loopback socket. Product success must be judged from
the returned observations; its top-level `PASS` only means the tool completed.
Native actors must close their player in `finally`; UI's30s fallback removes its
style/DOM changes. The inspector joins UI cleanup before socket/object release.
Private account identities, names, source frames and full raw observations stay
in `maintenance/tools/playback-repair`, outside the source commit. The redacted
owner receipt binds those files by hash and preserves failed attempts.

Response interception was not qualified (unsupported Network domain, abort,
then SW delivery bypass); Fetch interception was disabled and caches preserved.
An undefined QA property and an ambiguous second target were corrected before
their discriminating observations. These were tool defects and caused no product
redeployment. Final118ms inspection confirms player closed, no temporary globals
or CSS, original planner restored, scale1, remote object released/socket closed.

Physical iPhone finger gestures/landscape menu scrolling, sound audibility and
all-favorites playback remain unqualified. Original-spec acceptance gaps remain
in `memory/RELEASE-1.22.0.md`; this repair does not replace or close that matrix.
