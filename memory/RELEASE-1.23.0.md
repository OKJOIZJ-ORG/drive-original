# Drive Original 1.23.0 — local release prepared

Observed 2026-10-04: D081 implementation is ready on `codex/responsive-player-redesign`; production remains 1.22.1. This record is not a deployment claim.

The library now keeps compact proportions across widths, with secondary view settings in one menu. Player controls use an uninterrupted edge gradient and slim timeline. Mobile controls show time, use a central square for playback, and reveal from the exterior. Loading reports measured buffer/byte percentages. Playback UI avoids repeated layout reads and redundant writes; MP4 admission reuses a DataView without removing malformed-file safeguards. SVG play/mute/fullscreen states now follow actual state.

[QA summary](../qa/responsive-redesign/README.md) owns the 872 product tests, eight local layouts, actual same-origin local-source PC playback and physical Android playback/gesture checks using only 뷰너. Final icon/version/image-nav adjustments have scoped unit/DOM coverage. No general startup-speed claim, iOS acceptance or deployed-byte claim is made.

Remaining release action: authorize main merge, origin push and replacement of the existing Worker with this prepared version, then verify normal serving/update on the existing origin. Hostname, OAuth, backend bindings and source media stay unchanged. No Notion release or automation restart. A domain migration is not bundled into this release.
