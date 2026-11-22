# CHECKPOINT — Drive Original

Updated 2026-11-09. D151 fix for the library page panning sideways on iPhone, released as 1.24.3 under D152.

## Current identity

- Canonical repo: `C:\Projects\Drive-Original\source`; branch `main`.
- Production **1.24.3**, Worker `eb5ff808-c245-4228-a820-63f010f66337`, runtime `2d24226` (D151 toolbar bleed and root `overflow-x: clip` on top of 1.24.2). Release record: `qa/release-1.24.3/README.md`. Dry run and deployment use the clean committed detached worktree. Prior 1.24.2 Worker 88ab2717 / runtime 66c241a and 1.24.0 Worker 2e05bec1 are history.
- The working tree holds uncommitted D149 login-consent code in `auth/`, `worker/` and `tests/`, on hold by D150. `npm run deploy:release` refuses while `worker/` is dirty: park exactly those five files with `git stash push -- <files>` for the deploy and pop them right after (done for 1.24.3; diff hash unchanged). Never commit or deploy them without the user's word.
- Trash and move run on the server (`worker/drive-jobs.mjs`) and keep going after the app closes. Production run with 72 disposable files, tab closed: 72 confirmed, 0 failed, about 4 files per second. See `qa/server-drive-jobs-20261104/README.md`.
- A deployment does not replace the account Durable Object's code while its queue alarm keeps firing. Check `lastFailure` and `alarmAt` in `/api/drive-jobs/status` after a Worker change, and expect the old code until the queue is idle.
- D138 scroll stability shipped in 1.24.1. Its exact user symptom was never reproduced, so "fixed" stays assumed until the user confirms it on a device.

## Completed

- D151: the library page no longer pans sideways. Production `?demo=1` at 393px: document 394px wide (1234px with the 1.24.2 CSS on the local demo), programmatic horizontal scroll stays at 0. User-confirmed on the iPhone app after the update ("안 밀림", A-015 closed).
- D135: WebP cards with a `thumbnailLink` use the native image path. Production: 12 visible WebP thumbnails loaded by 1,654 ms, 0 canvases.
- D136: the four date sorts show year-month dividers. Production: 3 dividers in a 5,255-file folder, no console errors. Dividers follow Drive dates; `createdTime` on this account is the upload date, and the user kept this and declined filename-date grouping. Phones and WebKit not verified.
- D133: move dialog lists and searches only top-level folders by default; settings checkbox restores the full listing. Production signed-in read-only index: 1,006 ms for 7 rows (D114 full index: about 150 s for 43,860 folders). Dialog UI with a real file on production, shared drives and phones not verified.
- Everything below in this section is the D132 1.23.24 work.

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
