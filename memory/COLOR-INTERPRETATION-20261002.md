# Observed native SDR interpretation — local unit

Observed: an undeclared generated AVC source and its copied MSE output have
identical encoded packets and visible NV12 samples, but Chrome154 chooses
different effective color tuples for file and MSE resources. The source's
intended color remains UNKNOWN. The result owner is
[final-adjudication.json](../qa/color-path-discriminator/final-adjudication.json);
[savepoint-manifest.json](../qa/color-path-discriminator/savepoint-manifest.json)
pins the exact producers, receipts, retained failures and dependencies.

Implemented locally: capture a complete current native 8-bit YUV SDR observation
before Q0-to-selected-audio retirement. Bind it to account/file/revision/size/
MIME/modified time/checksum and requalify it through owner/worker/read boundaries.
An entirely undeclared, geometry-matching source receives a separate derived
output config. Original packets, clocks, source config and partial/complete color
declarations are preserved. No pixel copy, encoder, persistence, guessed default,
converted-RGB/high-bit/HDR observation or Q2 color-gate relaxation is introduced.

Verified: final managed-PC generated Q1 last→2s→last generations preserve the
observed tuple, copied payload/clocks and same-last decoded YUV; all resources
settle. Physical SM-X800/Android16/Chrome153 generated Q1 initial2→last successor
generations preserve source declaration absence, derived config/observation/
reported frame tuple, AAC2, zero encoders, mapped targets and prior-owner cleanup.
All device/browser/server resources are cleaned; original candidate tabs remain.
Scoped local checks and exact commands are recorded by the result owner.

Limits: strict RGBA equality still FAILS. PC original resources differ by25 RGB
channels/max2; equal normalized resources locate the residual at browser resource
presentation, not a particular GPU/shader cause. Normalization also changes the
original rendering substantially and is diagnostic only. Android native I420
versus output RGBA cannot establish visible-YUV equality; pixel fidelity remains
NOT_QUALIFIED. The first Android failed predicate remains unchanged. A new,
predeclared tuple-propagation scenario establishes only that changed behavior.
No middle-seek pixel reference, real-account app-UI color switch, HDR/high-bit,
broad device fidelity, performance distribution, whole-goal or production pass.

Delivery: published rc35/2c2b124 and production1.21/e08989a are unchanged at this
savepoint. Audio codec bytes/source archive remain unchanged; current readable
wrapper/helper hashes were regenerated and new public delivery is unverified.
The later read-only Android check found rc35, no visible update banner and no
waiting/installing worker; no update/reload/account operation was performed.
