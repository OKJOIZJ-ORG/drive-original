# Checkpoint — Chrome MSE first frame before EOF — 2026-09-26 22:46

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Last product ced16ef; prior QA fd3f976. Main-thread Q1 browser discriminator now decodes a real360x640 frame with only206,800/958,800 public source bytes received and server tail held. EOF-only control cannot emit until completion. Incremental full completion yields six appends/progressing frames.

Five isolated Chrome153 trials pass: negative, incremental, tail cancel, invalid init and injected play rejection. Review found mux.dispose retained cache; reset/drop/reader-lock/SourceBuffer cleanup and shared cleanup promise now verify populated cache->zero. Syntax/static19/19 passes. Proof at qa/v2-07b-ts-q1/mse-results.redacted.json. Local public fixture only; no product/Drive/iPhone/worker/indexed-seek claim.

Earlier native strict preservation and metadata tests171/171 remain valid. Priority arbitrary4MiB prefix has source/output decoder diagnostics, so strict preservation remains false. Candidate rc.4/3597e63 remains unchanged, unauthenticated and mutation locked; last product checks299/299 and browser22/22.

## Decided

- D-050/051/052 unchanged; no original mutation, push/merge/production/billing.
- Browser first-frame evidence is separate from source version/account, color/audio equivalence, total memory and full-format support.
- Pinned mux dispose is listener-only; reset and release references on every terminal path.

## Waiting on the user

No new local decision. Authenticated Drive/device and production gates remain separate.

## Next first action

Implement a QA worker session under qa/v2-07b-ts-q1 that admits one bounded transferred input chunk, emits one source-bound fragment at a time, waits for matching generation/sequence ACK, and cancels/releases pending ownership; test ACK/abort races before integrating with the MSE driver.

## Tried

- Arbitrary packet/PES flushes duplicate video; initial CFR/ADTS constraints remain.
- EOF-only mux needs full input; held-tail negative proves the distinction.
- updateend follows errors too; require update and no error before ACK.
- dispose alone retains GOP/PES cache; reset and null all retained owners.
- Native decoder concealment and exact SPS binding are separate quality gates.
- Non-square SAR still needs display-geometry proof; worker/sustained memory/indexed seek are not done.
