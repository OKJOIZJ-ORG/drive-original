# Drive Original 1.23.0 — published

Observed 2026-10-04: D082 approved the prepared D081 release. Reviewed branch fast-forwarded into main and pushed at563ea70; immutable public source8ee61df deployed once to the existing Worker as c31cb961-26af-4621-bbc7-64f435142a64. Existing origin/OAuth/backend configuration is preserved.

The library now keeps compact proportions across widths, with secondary view settings in one menu. Player controls use an uninterrupted edge gradient and slim timeline. Mobile controls show time, use a central square for playback, and reveal from the exterior. Loading reports measured buffer/byte percentages. Playback UI avoids repeated layout reads and redundant writes; MP4 admission reuses a DataView without removing malformed-file safeguards. SVG play/mute/fullscreen states now follow actual state.

Prepared public source: `8ee61df`. Workspace package: `releases/Drive-Original-v1.23.0-8ee61df.zip`, 65 public entries / 56,822,732 bytes, SHA256 `757814d41079a2b6db692257ecb6451e7c912e3fe608c21b86f03dfd411b5f8b`. ZIP and extracted Worker assets equal those committed blobs; no private extras. Wrangler dry-run succeeds with the existing configuration. Existing1.22.1/d0bdde5 package and Worker assets remain the rollback point.

[QA summary](../qa/responsive-redesign/README.md) owns the 872 product tests, eight local layouts and actual PC/physical Android playback/gesture checks using only 뷰너. Final icon/version/image-nav adjustments have scoped unit/DOM coverage. No general startup-speed or iOS acceptance claim is made.

Serving verification: all six changed public runtime files exactly match8ee61df; unchanged public assets retain prior verified Git bytes. Internal memory/QA routes return404. The legacy Pages handoff is unchanged; its old repository-export workflow remains disabled and Pages source remains gh-pages.

Actual operating PC: normal reload preserved login, loaded1.23.0 and the active controller with only shell-cache1.23.0/51entries. The20.9MB 뷰너 clip played1920×1080 original-range,50frames/1.997s with no media error, then sought to5.016s/ready4. Playing SVG pause/play attributes are correct. Returned to the existing 뷰너 library; no source override or original-media modification. Android original tab normally updated to app/live SW1.23.0 with login retained;72frames/2.865s,seek62ms,central pause/exterior controls passed. Existing tabs preserved and temporary ADB forward removed. No override/cache deletion/unregister/claim in either operating replay.

No Notion release, automation restart or domain migration. iOS is user validation; previous unrelated original-spec acceptance remains with its existing owner. Old1.22.1 package remains recoverable.
