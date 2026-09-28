# Player input and presentation quality — 2026-09-29

**Observed locally:** the old unfocused controls entry is a clipped 1px hit target
and trusted pointer input hits the video instead. The computed cursor is hidden
and loading poster uses its small intrinsic dimensions. Completed library loading
also leaves a stale progress message. These are reproduced against fixed3fa5914;
the suspected down/up focus-relocation race is not separately proven.

**Implemented:** stable native full-width lower entry with44px usable height plus
safe bottom; hover/touch share its actual rectangle. Reveal-only and control-start
input own release/cancel, including outside release and a second contact. Outside
single tap closes visible controls; hidden central single tap changes playback
without opening controls. Native button Space and pointer focus return retain one
owner. Blanket cursor hiding is removed. Video/poster fits the stage with contain,
rotation avoids flex shrink, loading uses a quiet56px ring, and completed loading
clears only its still-current status token. Source/frame handoff fences are retained.

**Verified locally:** actual isolated DOM mouse/touch/keyboard input at1280×800,
390×844,844×390 and320×568, plus cancellation/multitouch/resize/app fullscreen/
rotation/simulated safe area/reduced motion and owner-preserving status. Playback
and frame signals there are synthetic. Existing preview fixture2/2 and focused
app/static8 pass. Root inspected screenshots/diffs and Astra independent review
found no material issue. Exact original before/after producers and hashes remain
in qa/player-input-quality; subsequent version-only/LF source changes are recorded
by the integrated suite rather than silently rewriting the old execution hashes.

**Integrated rc.12:** root aligns app/SW/HTML/metadata, documents feature-level
grants, and updates the old geometry fixture to the real native-entry contract.
Initial full integration380/382 exposed the stale geometry fixture and incomplete
version bump; both are preserved, corrected, focused33/33 and final382/382 pass.
Q1 original-clock133/133 and static20/20 remain separately scoped prior checks.
Evidence: qa/v2-core-integration-rc12/final-local-results.json and complete logs.

Actual candidate/native media/mobile-size replay follows this saved unit. Android
hardware/emulator, iPhone/PWA, OS fullscreen and actual safe-area behavior remain
unproven. D-056 pause-without-overlay, D-057 mobile evidence distinctions and all
candidate/production/data/volume authority boundaries remain in force.
