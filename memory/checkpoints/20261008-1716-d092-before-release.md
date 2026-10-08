# Checkpoint — D092 photo controls verified locally — 2026-10-08 17:01

## The story so far
Local branch codex/photo-control-cleanup starts from D091b41d810. Photos retained0:00/0:00 because the time wrapper lacked video ownership. Existing common setter now hides video UI/time/hints and retires speed-menu/feedback state on photo/source clearing, with selected presentation guarding stale native video and byte-verified raster. Photo actions stay trailing; no new dependency/state abstraction. Final app9dc36252/style13754107/shell2c28eb89 match QA receipts. Full932/932 tests; native four-layout14photo paint/AX/Tab cases and4video recoveries pass. Separate390x844 persistent-feedback/menu retirement passes beyond normal expiry. D091 hold2x retained. qa/image-control-cleanup/README.md owns exact scope. OperatingD0901.23.4 unchanged; physical-device/account/production proof is absent.

## Decided
D092: remove all video playback remnants on mobile photos and verify return to video; common photo actions and D091/KISS persist.

## Waiting on the user
None for local patch/QA. New operating delivery authority is absent; no unattended deployment/device queue.

## Next first action
Read source/qa/image-control-cleanup/README.md for the completed local evidence and delivery limits; no further rollout or device action is scheduled.

## Tried
CSS override hypothesis rejected: global hidden already display:none!important and real direct-photo progress/track/rotation/PiP controls disappear; the time wrapper never received hidden ownership.
MCP viewport change invalidated a UID; fresh snapshot/retry opened the ordinary demo photo. Inspecting before actual open was not evidence of the photo defect.
Initial native baseline attempted a desktop photo menu inside the hidden custom-video-controls parent; keep the failure receipt and qualify only available photo UI, with ordinary desktop photo controls checked separately.
Visibility-only video recovery re-enabled actions for a byte-verified raster with stale video visibility; selected presentation now guards the common setter. The image-owner test checks nonempty all-false actions rather than an idempotent setter's call count.
The first native recovery oracle required a permanently hidden legacy center button; ordinary trusted center taps are the valid playback check.
The broad fixture passed boolean true instead of {persistent:true} and omitted the speed-menu flag; its persistent ownership claim was withdrawn. Corrected focused390x844 proof verifies state remains active1.35s and synchronously retires on photo transition.
