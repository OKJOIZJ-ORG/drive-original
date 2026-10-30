# CHECKPOINT — Drive Original

Updated 2026-10-30. D132 authorized file correction, linked fixes, merge/push and deployment.

## Current identity

- Canonical repo: `C:\Projects\Drive-Original\source`; branch `main`, runtime pushed through `de96ca2`.
- Production **1.23.24**, committed runtime `de96ca2`, Worker `0f771f2d-cbb0-4370-afc6-bd74c621c8b5`. Dry run and deployment both used the clean committed detached worktree. Prior1.23.23 runtime2237568/Worker1ccc5812 is history.
- Complete suite **1,128/1,128 passed**. Production **91/91 public assets equal runtime Git bytes**; four private source paths return404.

## Completed

- TS30/12-second lookahead and1MiB reads from the first stream batch, safe cache transition, silent-TS admission, HEIC primary-image display fallback, raster MIME retagging, preserved decoder diagnostics, coherent active-video rename restart. Earlier buffering trials and limits remain in `qa/buffering-20261030/README.md`.
- Initial inventory **12,289 files /6 folders**, **336 extension mismatches**. **335 filenames corrected**, with independent receipt reads verifying unchanged IDs, parents, size, MD5/SHA when available and head revisions. One intended correction was blocked before PATCH because the file was already trashed.
- Final full inventory **12,287 files /6 folders**, zero new files, **zero remaining extension mismatches**, zero content/location drift. Two initial files are now trashed by an external actor; no delete/restore/move was performed by this task. All335 corrected files remain present with the intended names.
- MIME-only PATCH test returned200 but made no metadata change. Names were corrected without reuploading13GB; declared MIME remains as before, and actual-byte playback handles it.
- Six all-zero files have only one available Drive revision each, with the same zero-content checksum. No recoverable revision found; preserved.

- Controlled startup-only comparison: first playing6.128→4.860s, startup638ms wait→none, identical emitted fragment hashes; both EOF/seek/cleanup passed. Same-source main-profile injected candidate:14.303→12.925s first playing and1.821s early wait→none in30s. See qa/ts-startup-20261030.

- Actual deployed1.23.24: same source advanced30.788838s without post-start waiting/error; SW controlled and retirement settled. Startup frame drops remain: focused valid sampling found47 dropped byabout2.3s and none thereafter through30.2s, with no main-thread long tasks; cause unproved. See qa/release-1.23.24/presentation.json.

## Decoder investigation still open

- Post-deploy normal Chrome silent-TS run failed at13.6089s with PIPELINE_ERROR_DECODE. Exact30 appends were captured. Both failed output and fresh pinned source decode902frames without FFmpeg errors; all902 frameMD5s match. DTS/PTS and31 independent IDR GOPs are valid in inspected evidence.
- In the same normal profile, exact captured appends without removals, with original removal timing, and native full MP4 each completed30.066s. Thus no supported deterministic source/packet/eviction cause yet; successful repeats are not a fix.
- Initial hard-reload QA had no SW controller and correctly hit cleanup fences; ordinary reload restored control. Do not weaken those fences.
- TS startup attribution: pipeline16physical reads/6,944,600B for3,177,388B source, matching local replay. Exact duration discovery scans the whole small TS before first output. Vendor tail-only duration optimization is a proposal needing timestamp/PES/wrap proof, not implemented.
- Browser internal diagnostic-page navigation is unsupported by the Chrome tool. No policy bypass attempted.

## Recovery and boundaries

- Canonical verified metadata/receipt backups and failing byte evidence: `H:\내 드라이브\CODEX BACKUP\Drive-Original\2026-10-30-format-repair`.
- Private local evidence stays ignored in `qa/buffering-20261030`; no IDs/names/media committed.
- D079 no Notion; automation PAUSED; held thumbnail redesign and stopped physical iPhone/Safari queue stay unchanged.
- Prefix survey is not whole-library full-frame decoding. HEIC fallback is one primary8-bit PNG, without HDR/ICC equivalence.
