# Paused target-frame presentation — rc.17 local repair

**Observed baseline:** fixed rc.16 `e57d7b5` presents an owned TS target frame
while native seeking is true. After native/app seek completion at ready4, the
paused50% loader remains twice. The current composite key matches the source;
one subsequent playing frame clears it without a source or seek change. Safe
actual-account evidence is retained in `qa/rc16-actual-account`.

**Implemented local repair:** the existing decoded target/seeked completion
watchdog now calls the shared poster/readiness/loading handoff. It retains one
successful seek presentation proof for a later ready callback to reuse, checking
current target tolerance plus account ID/auth key/Drive generation, file,
media/playback session, attempt, source generation and seek generation. New
seek/source/close and canonical account invalidation clear that proof. Ordinary
presentation callbacks preserve their pending-key guard.

**Independent counterexample closed locally:** the first proposal allowed the
ordinary presentation callback to hide loading while the seek sampler had seen
the target but native/app seeking and missing `seeked` remained. Independent
review found this on the actual app VM. The shared handoff now refuses an active
current seek or native/app seeking. A maintained regression invokes sampler and
ordinary callbacks in both orders, requires the loader/key to remain until
seeked, and then completes without a further paused frame. The original baseline,
initial proposal/context errors and narrower passing scopes remain retained.

**Confirmed local checks:** focused11/11 plus complete final562/562 product
tests pass. `qa/candidate-rc17-delivery/product-tests.json` records exact complete
JS/MJS commands, stable public/test/worker/private-build before/after SHA maps and
raw-log hash. Task-owned public/test files were normalized to repository LF
before this final run. The earlier561/561 pre-gate full run is retained separately;
it is not the final repaired source.

**Pending actual acceptance:** free rc.17 delivery, real-account paused TS replay
and minimal Q0/Q2 native paused seek checks remain separate next checks. This
local repair does not promote actual acceptance until those results exist.
WebP static list-card correction remains a separate queued unit. The whole goal
continues with actual corpus/expiry/return/device/two-device/Q3 gates unclaimed.
