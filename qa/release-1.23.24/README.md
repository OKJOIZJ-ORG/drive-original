# 1.23.24 release —2026-10-30

D132 authorizes the combined D131 buffering/format investigation, real name correction, linked fixes, merge/push and deployment. The scope isㅇㅎㅎ itself and descendants, in Drive Original.

| Field | Evidence |
|---|---|
| Runtime | `de96ca2` release; startup change `55ceb4a`; main fast-forwarded and pushed |
| Worker | `0f771f2d-cbb0-4370-afc6-bd74c621c8b5` at the existing origin |
| Delivery | `npm run deploy:release -- --dry-run`, then `npm run deploy:release`; both committed detached worktrees |
| Full suite |1,128/1,128 passed after the final product/version changes |
| Served bytes |91/91 public files equal Git runtime; four private paths404, in served.json |
| Authenticated runtime | Normal Chrome APP_VERSION1.23.24; identity ready, service worker controlled |

## Playback evidence

The TS player keeps30/12-second high/low lookahead, reads at most1MiB from the first streaming batch, and feeds at most64KiB per worker input. Revision checks, single ownership, seek/close retirement and byte preservation remain. Continuous bounded replenishment avoids unbounded whole-file memory/download growth.

Controlled sustained and startup-only comparisons are in ../buffering-20261030/README.md and ../ts-startup-20261030/README.md. Their emitted fragment bytes remained equal; EOF/seek/cleanup passed. The normal-profile injected candidate reduced the earlier1.821s startup wait to none over30s.

The actual deployed runtime was then tested without injection on the same real source. First playing14.374s; no post-start waiting or media error across30s; media reached30.788838s and cleanup settled. Network timing varies: this run does not support a universal faster-first-frame claim. Native quality counted927frames/84dropped, so absence of buffer starvation does not establish perfect frame presentation. playback.json preserves these limits, not just the passing event count.

## Files and compatibility

Initial12,289 files /6 folders,336 extension mismatches;335 corrected names. Independent receipt reads preserve IDs, parents, content checksums/size and head revisions. One target was already trashed before mutation. Final12,287 files /6 folders, zero extension mismatches/content drift/new files; two initial files confirmed externally trashed. No body uploads, trash, moves or restores by this task. MIME-only PATCH returned200 but changed no metadata; actual-byte routing avoids reuploading13.94GB solely for metadata. D124 keeps Drive's default modifiedTime on rename.

All24 HEIC primary images and61 mismatched raster first images were decoded in the earlier normal-profile audit. Deployed1.23.23 HEIC/GIF display and zero-header messaging were confirmed; these paths are unchanged in1.23.24. HEIC output is explicitly a primary8-bit PNG, not HDR/ICC fidelity. Active rename, cache transition, silent-TS admission and sanitized error retention are covered by the product suite.

Private filename/receipt tables, initial/final inventories, zero-revision checks and exact failing source/output bytes are hash-verified in the canonical Drive backup. Public aggregate evidence lives in ../buffering-20261030/repair-summary-redacted.json, post-repair-summary-redacted.json, release-images-redacted.json and decoder-investigation-redacted.json. No private IDs/names/media are committed.

## Unresolved boundaries

Six completely zero files each have only one zero-content revision; no recoverable source exists in their available revisions. The app cannot reconstruct missing bytes.

Intermittent normal-profile decoder failure remains open. Exact failed appends/source both decode902 equal frame hashes with no FFmpeg error. Exact-data MSE replays with/without original removal timing and native MP4 all reached EOF. No deterministic payload/timestamp/GOP/eviction cause was established; no blind retry was added. Silent-TS duration discovery can scan a complete small source before first output; a tail-only replacement remains unproved.

The full inventory is a format/metadata survey, not every frame of every video or animation. Physical iPhone/Safari acceptance remains stopped; automation stays PAUSED, Notion excluded, thumbnail redesign held. Earlier candidate/deployment records are history; CHECKPOINT.md owns the current identity.

## Focused presentation follow-up

A subsequent valid per-second observer found47 dropped frames accumulated byabout2.3s, then no further drop through30.2s; the video was visible,360×640, readyState4 with buffered media. No main-thread long task over50ms was observed. No post-start waiting or media error occurred. presentation.json preserves the samples. Thus this observation narrows the drop to startup, but does not establish the browser/decoder/compositor cause or a complete fix. A preceding observer referenced the wrong element and produced no samples; it is excluded from this finding and corrected only in the owned QA tab. No product change followed unsupported inference.
