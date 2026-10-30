# Buffering and format compatibility evidence — 2026-10-30

The controlled test below was observed in isolated real Chrome (`playwright` channel `chrome`, headless), public synthetic TS only. That driver accessed no user Chrome, account, production, or original Drive media. Separate live observations follow below. The temporary localhost server bound an OS-assigned free port and was closed with Chrome after the run.

The baseline module was read from Git `adbe705388c3cf6c3ad15984939f85eee34d7f52` (full identity and SHA-256 values are in `synthetic-results.json`). Current and baseline imported the same other product modules. Both used the actual `openDriveQ1Source`, worker and native MSE implementation. Metadata callbacks delayed each preflight/postflight by450 ms; each source range delayed by900 ms plus one second perMiB. This produces roughly2.05 s per256KiB read before runtime overhead and2.8 s perMiB read. Fresh pre/post identity checks and abort signals remain active.

Each variant first filled its paused buffer until real backpressure was observed, then made no further range reads during two1.2 s pause observations. It played at2× for45 wall seconds. The long fixture is360 s /37,684,600 bytes. This warm-buffer trial measures sustained supply under latency, not cold-start speed.

| Observed | Baseline | Current |
|---|---:|---:|
| Media seconds advanced in45 wall seconds |53.735|89.910|
| Post-start waiting events |12|0|
| Time between waiting and playing events |18.113 s|0 s|
| Peak ahead, including a final GOP append |7.936 s|31.829 s|
| Range requests through end of sample (incl. probe/warmup) |26|15|
| Post-warmup sequential source read |256 KiB|1 MiB|

Both variants then passed close cleanup: source cleanup settled, worker terminated, source URL revoked, and no new callbacks/requests in the subsequent1.2 s observation. All worker input chunks stayed at or below64 KiB.

A separate short-fixture run without delay reached native EOF for both variants, then sought to4 s with generation2 and settled prior ownership, and closed cleanly. The six emitted fragment payload SHA-256 hashes matched exactly in order across baseline/current. The recorded first-run fragment `size` field is0 because it was read after transfer/detachment; hashes were calculated from an earlier copied buffer and are valid. The driver now captures size before transfer for future runs. Size was not used to establish payload identity.

Run: `node qa/buffering-browser.cjs`. The driver asserts a meaningful advancement improvement, source/worker/URL cleanup, bounded worker input, EOF/seek, and fragment equivalence. `synthetic-results.json` retains event timings, source ranges/metadata, stats and hashes. Its summary was calculated from those event timings after the run.

Boundary: this establishes a causal result for the combined30/12 s window + larger sequential read patch on this finite controlled workload. It does not isolate each change's marginal effect, establish arbitrary-bitrate/network performance, prove live Drive throughput, or qualify mobile/Safari. No production acceptance or deployment is implied.

## Source audit after a separate real-source intermittent media error

The proposed overlap of the outer `admit()` and fragment callback `admit()` is unsupported by the current protocol. The worker stops pumping while a fragment awaits ACK. The client sends ACK only after `onFragment` resolves, and the worker emits `input-done` only after its output/fragment hold is cleared. The outer source loop awaits every `worker.push()`. These ordering constraints serialize those two admission sites. A protocol violation is also rejected by the client while `fragmentBusy` is true.

Focused existing checks passed4/4: held fragment input retention, synchronous ACK/input completion, overlapping input/wrong ACK rejection, and ACK-post-failure cleanup (`node --test --test-name-pattern="held fragment|synchronous ACK|overlapping input|ACK post failure" qa/v2-07b-ts-q1/worker-client.test.mjs qa/v2-07b-ts-q1/transmux-session.test.mjs`). This is protocol evidence; it does not explain an actual decoder error.

The controlled long baseline completed14 removals /28 appends; current completed24 removals /56 appends without a media error. The retained six-second backbuffer cutoff is unchanged by this patch. A private-source report of `Q1_MEDIA_ERROR` cannot be assigned to removal or fragment corruption from these observations. The discriminating next evidence is the actual video's error details correlated with SourceBuffer append/remove arguments, before/after ranges, update/error events, and recent fragment timestamps. No product change followed this audit.


## Actual signed-in Chrome observation (local patch, not deployed)

The user's existing production1.23.22 video (101,372,984 bytes /810.73s) was actually TS despite its MP4 extension and Drive video/mp4 MIME. Passive observation over355.3s recorded12 waiting events totaling29.214s; sampled buffer ahead ranged0.125–6.642s. The last100 media reads were256KiB each, with fresh metadata before and after each read. Raw sanitized evidence: baseline-observation.json.

In a separate owned tab on the same signed-in Chrome profile, only the local ts-player module was temporarily injected (imports still used the unchanged production core/worker/source). No original file or production asset changed. The same file sought to360s; observation stayed attached308.5s, with180 periodic samples through185.0s. One1.460s waiting event occurred immediately after that seek; no subsequent waiting event was recorded. After5s, sampled ahead stayed9.680–30.378s. Requests became1MiB. See patched-live-observation.json. The first tab was not paused/navigated/reloaded; the comparison was sequential, not a matched cold-start experiment. Test-tab media-view writes were disabled. Close settled source callbacks, terminated worker and revoked its URL.

## Shared general playback and checks

Q1/Q2/Q3 general playback explicitly opts into512KiB streaming reads and a1MiB two-block source LRU; ISO discovery and subtitles retain their previous policy. After confirmed TS admission only, discovery also uses512KiB reads, with its existing byte/request budgets. The vendor cache stays independently bounded. A discovered race where a pending64KiB discovery read could poison the new cache was reproduced and fixed; a full-suite subtitle regression was fixed by limiting opt-in to playback. Initial failed log is retained. Final product tests1054/1054 pass. Tests cover byte equality, sparse/interleaved reads, EOF, cancellation, revision drift and phase transition. Source+vendor cache bound is1.5MiB at most, excluding transport/returned copies/output/native memory.

The existing native preload setting is a browser hint, not an instruction to override this app-owned MSE pipeline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preload)). Whole-file disk prefetch was considered but not added: it requires separate disk quota/eviction/revision lifecycle and duplicate-download avoidance, while the measured failure is already fixed by amortizing serial request latency. The30s threshold bounds exposed media time rather than all decoded memory; sustained slow links and all devices/formats are not guaranteed.


## Complete format survey and app compatibility candidate

The read-only survey covered the named root itself plus descendants:6 folders,12,289 files, complete pagination, no listing/signature-read errors. A bounded 1024-byte prefix was read per file. `format-summary-redacted.json` and `.md` contain counts only. The report initially treated MP4/QuickTime names as aliases; complete `ftyp` brands revealed 13 additional mismatches (8 MP4 names with QuickTime-only brands,5 MOV names with MP4-only brands), correcting 323 to 336. The distinction follows Apple's [file type atom specification](https://developer.apple.com/documentation/quicktime-file-format/file_type_compatibility_atom). Truncated/unrecognized brands remain ambiguous; ISO alone never proves video rather than M4 A.

| Actual content / naming problem | Files | Candidate behavior and evidence |
| --- | ---: | --- |
| MPEG-TS with another extension | 237 | Existing byte-based TS route; larger bounded buffering/read batches. All 239 TS headers (including 2 correctly named files) had CRC-valid complete PAT/PMT:237 AVC + AAC and 2 AVC-only. This is topology evidence, not full decoding of 239 videos. |
| WebM named MP4 | 1 | Existing native route actually played in normal Chrome; separate 38 WebMheaders reported 31 VP8/7 VP9 video-only. |
| MP4/QuickTime brand/name mismatch | 13 | Existing byte-based ISO/QuickTime admission; reported separately rather than hidden as aliases. No individual full-playback claim. |
| HEIC named JPG | 24 | Native HEIC probe first; if unavailable, one bounded local worker decodes the primary 8-bit image to PNG.24/24 actual files decoded and PNGs reopened in normal Chrome; representative app displayed 1440×1440 with an explicit PNG compatibility label and unchanged file metadata. |
| JPEG/PNG/GIF/WebP cross-extension mismatch | 61 | 61/61 actual files decoded their first image natively in normal Chrome using their declared MIME, with 87,746,005 pinned bytes read; no re-encoding. This does not check every animated frame. |

`qa/media-format-inventory.js`, `qa/media-format-survey.js`, and `qa/media-format-report.mjs` own reproducible collection/reporting; `qa/media-format-image-check.js` owns the native raster check. Private inventory, prefixes, exact names, IDs, folder mapping, and per-file playback logs remain ignored. User review lists are `format-mismatches-private.tsv` (336 rows) and `unrecoverable-private.tsv` (6 rows); neither is a publication input. No Drive files were renamed, overwritten, deleted, or transcoded.

The 6 zero-header MP4 files were additionally read in full with original identity checks:70,568,729 bytes, allzero. Their media cannot be reconstructed from these bytes. App Q1 now reports the observed zero header only after native rejection and settled sniff cleanup; initial native acceptance and permission/owner/cleanup failures keep priority. An actual file produced the specific message and only the close action.298 remaining unknown signatures are SRT sidecars, not broken media.

### Silent TS, diagnostics, and limits

Only a complete current single-program CRC-valid PAT/PMT with one AVC stream and matching PCR qualifies the AVC-only route to the existing general engine. Incomplete/invalid PSI and other topologies keep the prior strict path. Q2/Q3 permission gates remain unchanged. TS-only 512 KiB discovery reduces actual first-window reads 50→9 and 39→10. All original revision, account, generation, cancellation, and cleanup fences remain.

Both actual AVC-only files played to EOF in isolated Chrome (902 and 7,037 frames), including the second file's 100 s seek. The first also passed a 1.8 smetadata plus 1 s/MiB body pacing trial. In normal authenticated Chrome with the local candidate graph, the first file passed two full 902-frame runs; the second passed 7,037 frames/234.566666 s. Captured first-file live MSE output decoded identically to all 902 original frames. However, two earlier normal-profile first-file runs failed, one preserving code 3/PIPELINE_ERROR_DECODE at 17.635 s. Separately, one strict-TS/MKV-named witness failed once and then replayed 260 s without error. These intermittent failures are **not marked solved**: source/output decoding, paced transport, and safe RAP retirement did not establish the browser cause. The shared TS/general first-active-error record now retains bounded code/token/target/operation/time before cleanup, never raw browser messages, URLs, or file IDs. No blind retry or codec rewrite was added.

HEIC fallback supports a primary 8-bit image,32 MiB input,16 million pixels, 30 s deadline; it retains native HEIC when available. It does not claim original HDR/ICC/color fidelity or all multi-image frames. All 24 observed files contained one primary image, at most 2,073,600 pixels; worker-to PNGdecode time was 216.4–852.6 ms, excluding Drive transfer. Abort, late-result publication, module-load failure, URL cleanup, and ownership changes are tested. Source/license artifacts and hashes are under `licenses/heif-source-*`; the source bundle was verified but not rebuilt from scratch. Runtime assets enter the shell cache; corresponding-source downloads do not.

Final full product suite:1,103/1,103 passed. This is a local candidate on `codex/playback-buffering-20261030`; production is still 1.23.22. Physical iPhone/Safari acceptance remains stopped. This evidence does not promise uninterrupted playback on every device, every video frame, or an indefinitely slower-than-media network.
