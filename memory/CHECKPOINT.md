# Checkpoint — source-bound actual seek frames — 2026-09-27 00:06

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Prior QA3e07fad; last product ced16ef. One-GOP source-bound TS packager independently revalidates PSI/RAP/clocks, copies full selected PES bytes/timestamps, includes AAC preroll/coverage, and changes only transport packetization/CC/adaptation.10 new tests, related112/112 pass.

Public180s/21,992,052-byte native3 + real Chrome153/Worker5 pass.10/50/90% rVFC times18.021333/90.121333/162.221333 are within one frame of targets and map to native source PTS. Each reads1,637,856 bytes and packs239,512–243,084.60 video frames/interval match full source; exact expected PCM size and source PCM match after one AAC decoder warmup frame. Replacement cancels a held old read with zero old appends; identity drift blocks appending. Buffer/URL/worker cleanup checked. Review fixed potential empty PCM comparison and missing oracle producer hashes; report qa/v2-07b-ts-q1/seek-playback-results.redacted.json pins final sources.

This is one local GOP only, not continuous post-seek/product/Drive/priority/iPhone or all-format proof. Full source native buffers are QA-only; browser muted and color/total heap unverified. Generated public media cleaned. Isolated candidate browser remains unauthenticated, deployed rc.4/3597e63/mutations locked; prior user-confirmed PWA auth acceptance remains separate. Priority4MiB strict decode false. No original/Drive mutation or deploy/merge/push.

## Decided

D-050/051/052 unchanged. Direct-original browser/PWA, auth-only free layer; full format/device acceptance. Integrate safe product vertical slice without building every format platform first.

## Waiting on the user

No new local decision. Actual authenticated Drive/device and operating transition remain separate gates.

## Next first action

Implement bounded continuous raw-source seek bootstrap for existing gop-stream/transmux-session, not repeated isolated GOP muxes with overlapping AAC. Use validated prepared PAT/PMT prefix, original readStart=min(selected audio-preroll PES, RAP) and original source size. Pass each subsequent source packet once; replace leading pre-RAP video / partial initial PSI with null packets, validate source transport/CC separately then normalize output CC to join bootstrap. Preserve every selected PES/timestamp after admitted starts; exact virtual size=prefix bytes+sourceSize-readStart.188-byte carry and64KiB input/ACK owner, abort/generation fences. Verify forward-to-EOF compressed/native/frame continuity and bounded real Chrome seek playback, then move a coherent Q1 vertical slice into product. Do not present packaging timestamps/source offsets as interchangeable.

## Tried

- Arbitrary TS cuts duplicate media; complete IDR/PES boundary and decoder stderr matter.
- Sparse timestamps are candidates, not unseen-clock/format proof; no fabricated final EOF frame.
- B pictures require presentation and decode/byte bounds kept distinct.
- Repacketized local GOP needs preceding AAC for decoder warmup and coverage through video end.
- PCM nonempty is insufficient: exact expected all-frame byte count prevents empty post-warmup equality.
- Actual rVFC plus native source PTS is required; appended data alone is not seek success.
- Cancellation settles previous cleanup before new video ownership; clear prior-owner links.
