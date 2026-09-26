# Checkpoint — product Q1 integration in progress — 2026-09-27 00:45

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics; HEAD fad6593 closes continuous seek QA (native3/browser9, related128 tests; prior checkpoint has details). Current uncommitted product unit adds media/ source-owner/player/bundles, native-first Q1 fallback, rc.5 local version and public assets. App/static110, core37 and source-owner20 tests pass. Actual app+SW synthetic browser run reaches Q1 first-frame but fails a later seek with WORKER_CONSUMER_FAILED. Source-owner helper finalized bounded async cleanup; main player has not yet integrated that cleanup result. Dirty paths belong to this unit and must be preserved.

Same-start independently extracted original AAC and output have exact compressed bytes/all PCM. Uninterrupted10% PCM differs in16 int16 values by1; retained false, no tolerance added. Decoder-history/PNS cause remains hypothesis. Public media cleaned. Browser muted; audibility/color/total memory open. QA-only, not product/Drive/priority/iPhone/all-format success. Candidate remains rc.4/3597e63, isolated browser unauthenticated/mutations locked; prior user PWA auth acceptance separate. Priority4MiB strict decode false. No original/Drive mutation, deploy, merge or push.

## Decided

D-050/051/052 unchanged: direct-original browser/PWA, auth-only free layer. Integrate a safe product vertical slice now, not a complete format platform. Full format/device acceptance stays open.

## Waiting on the user

No new local decision. Authenticated Drive/device and operating transition remain separate gates.

## Next first action

Inspect qa/q1-product/results.json and preserve the exact onFragment error in media/ts-player.mjs; fix earliest seek failure and await source-owner cleanup before rerunning actual app browser QA. Drive fence uses fresh headRevisionId/content metadata pre/post each bounded read, not version (view counter) or an atomic pinned revision. No keepForever mutation. Product bundles reuse canonical QA primitives without shipping QA runtime imports.

## Tried

- Arbitrary cuts/decoder stderr invalidate preservation; complete IDR/PES boundaries matter.
- Sparse clock is sampled-candidate, not unseen global continuity/wrap support.
- B-frame presentation/decode clocks and original/virtual offsets differ.
- Same-start native decode controls decoder history; uninterrupted comparison stays separate.
- Relative timing misses common shifts; seek now checks absolute PTS/DTS.
- Intentional tail pause has no fixed lifetime; media error precedes cleanup cancellation.
- Actual rVFC/frame progress/ended, not just append, prove local playback.
- First product browser run failed on later seek; WORKER_CONSUMER_FAILED currently hides its inner error. No successful product-unit claim.
- Source abort returns bounded cleanup evidence; unsettled callbacks must block replacement transport owners.
