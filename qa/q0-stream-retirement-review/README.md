# Native source lease consumer-drain review

QA-only follow-up to `../q0-version-fence-stream`, based on source7f3ef0f0bd7bac4ec8c9d725f89d6cf0f69be704. This leaf preserves the earlier prototype unchanged and tests a copied owner against the canonical `media/drive-source.mjs`.

The original two discriminators reproduced `close().settled=true` while native pull work remained:2 active/queued reads, or1 read during reopening. Upstream callbacks were already0 and the public readers errored, which is insufficient to authorize a replacement. `before.log` retains those initial failures. No actual Google media or browser was used for these lease fixtures.

The copied owner separates internal retirement from external close. Internal retirement aborts sources and errors responses without waiting for its own pull. Public close joins source cleanup and a bounded consumer drain, reports pending consumer reads, and shares a sticky terminal outcome. A callback that ignores cancellation remains an unsuccessful replacement barrier even after late completion. Final source statistics are refreshed after consumer drain.

Verification: canonical15/15 and generated classic15/15 pass, including the11 original cases plus active/queued close, responsive reopening close, uncancellable callback and external abort. `baseline-current.log` runs the final four discriminators against the unchanged original owner; `after.log` and `classic-after.log` use the repaired copy. The classic build strips only explicit module declarations from hash-pinned canonical source and the copied owner; `provenance.json` pins the source/owner/build/output.

This is not product integration or actual native Chrome/Drive cancellation evidence. The optimistic per-chunk content fence still costs metadata before and after each bounded read. A23MiB front index may need46 extra metadata roundtrips. The actual revision-download discriminator in `../q0-revision-download-rc13` investigates a separate provider-pinned path; changed-revision immutability and native performance are separate gates. Generic upstream cleanup remains unknown.

Commands:

```
node qa/q0-stream-retirement-review/build.cjs
node --test qa/q0-stream-retirement-review/drain.test.mjs qa/q0-stream-retirement-review/owner.test.mjs
set Q0_CLASSIC_TEST=1&& node --test qa/q0-stream-retirement-review/drain.test.mjs qa/q0-stream-retirement-review/owner.test.mjs
set Q0_REVIEW_BASELINE=1&& node --test qa/q0-stream-retirement-review/drain.test.mjs
```
