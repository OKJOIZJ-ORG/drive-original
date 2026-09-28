# Delayed decoded seek presentation — local core fix

Observed pre-fix candidate: `b9d873926e894bb89a9faa8e638f7f0a80c0eb7e`.
Actual passive producer: `seek-presentation.expression.js`; result:
`seek-presentation-initial-results.json`. No media or account mutation is part of
this fix.

The normal Range MP4 seek targets `4789.312`. Native `seeked` reports that exact
position, then the first sampled decoded frame arrives about 886 ms later at
`4790.143528`, with contemporaneous `currentTime=4790.130449`. Both native passive
callbacks and the application sampler continue advancing at roughly 1 Hz. The
fixed target tolerance of 0.25 seconds rejects these real frames until the
15-second seek watchdog incorrectly invokes Range recovery. This evidence
discriminates a target-window defect from a dead sampling chain or absent video.

The scoped application change keeps validated target `seeked`, decoded-frame
confidence, and source/session/seek-generation ownership. Paused seeks still
require a target frame. A playing seek additionally accepts a decoded frame
matching its contemporaneous playhead within the existing tolerance, bounded
above by the validated target plus plausible elapsed playback advancement. The
per-owner envelope integrates elapsed time and observed playback rates; pause
time contributes zero. Hidden playing time may advance the scene, while the
existing watchdog active-time budget remains suspended when hidden/offline.
CurrentTime advancement without a decoded frame remains insufficient.

Local checks: `node --test --test-name-pattern="seek|delayed" tests/app.test.js`
passes 13 focused tests, including four new cases for delayed first presentation,
stale/unrelated/implausible/paint-only rejection, changed-rate/paused/hidden
accounting, and recovery without decoded-frame evidence. Existing target-first,
frame-first, timeout, source replacement, generation, and active-time tests pass.

Post-fix actual browser playback has not been performed by this agent. Root owns
that verification, full integration checks, and any commit. No UI queue changes,
version change, deployment, auth modification, or new transport retry was made.
