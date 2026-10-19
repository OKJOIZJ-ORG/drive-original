# 1.23.10 operating verification — D099 root-cause fixes

User request after 1.23.9: "모두 알아서 근본적으로 해결 ㄱㄱ." Runtime b4c27e2403f44b26ce3ac950faf8e65c33b67551 (main 02d925b→b4c27e2, pushed); Worker version 02b55d4c-a8c3-4578-9be3-5610335a2ef1 (previous 009e4b6c). No visible UI change.

## Causes and fixes

| Issue | Cause | Fix |
|---|---|---|
| Q3 codec served bytes ≠ license manifest | Emscripten's `video-q3-codec.mjs` ends with two CRLF lines. `/media/** text eol=lf` made Git store an LF blob (13110 B, 9f6f66f2…), while the published corresponding source and manifest pin the original 13112 B (32561bde…). Materialize serves the blob. | `.gitattributes`: `/media/video-q3-codec.mjs -text`; blob renormalized to 32561bde…. Static test: every license-pinned product file that contains CR must be `-text`. A scan found no other public file whose working-tree bytes differ from its blob. |
| Recurring materialize failure (`Extra or linked _site file`, nlink 2) | `C:\Projects` is backed up by Google Drive for desktop. About 2.5 s after a file's content changes, its uploader hard-links that file into `C:\Projects\.tmp.driveupload\<n>` (seen with `fsutil hardlink list`) and removes the link after the upload. build-pages followed by materialize rewrites changed files, so they get linked while being checked. The codec file (CRLF copy, then LF blob) changed on every build, so it was hit every time. | The materializer treats a second hard link, and only that condition, as retryable: it polls every ≤1 s for up to 120 s in the CLI (library default 0 = strict). Symlinks, realpath aliasing, extra/missing files and content/HEAD checks still fail immediately. Tests: a transient link that clears → success; a persistent link → fails at the bound with no write; aliasing is never retried. |
| Q3 masked source failures (2026-10-19 open question) | The Q3 stream allowlist `GENERAL\|Q3\|TIMING` turned `Q1_SOURCE_*` / `Q1_EXACT_*` causes into `Q3_PIPELINE_FAILED`, while Q1/Q2, the worker and the owner already pass them through. The user-facing message is the same, but diagnostics lost the real cause and the `recovery` field. | Allowlist is now `GENERAL\|Q3\|TIMING\|Q1_EXACT\|Q1_SOURCE`, with a behavioral test via `streamGeneralQ3` (it fails on the old code). The Q3 source package was first reproduced byte-for-byte with the unchanged script, then regenerated: archive 1750028 B, all product-source hashes match the manifest. |

Checked, not changed: `audio-runtime.mjs` and `audio-codec-build.json` differ from the audio package snapshot. Both are the project's own glue/build record, changed by later releases, and the package README says the snapshot is not the current adaptation source. The LGPL decoder files (`audio-codec.wasm`/`.mjs`, license) match.

## Delivery evidence

| Evidence | Verified scope |
|---|---|
| Tests | 947/947 |
| Deployment | Unmodified `npm run deploy:candidate`: the materializer logged four waits for the Drive link, then materialized 64 assets from HEAD; 7 changed assets uploaded |
| Served bytes | 65/65 public files 200 and equal to committed bytes, including codec 32561bde… = manifest; private paths 404 ([served](served.json)) |
| Backend continuity | 11 bindings and 4 secret names equal ([comparison](bindings-comparison.json)) |
| Auth endpoints | Anonymous credential 401/no-store; start 303 with `__Host-` pre-auth cookie attributes; callback without cookie 303 → `?authError=transaction_invalid` |
| Actual normal Chrome | Own tab in the user's profile, closed after: v1.23.10, SW activated, 1.23.9 cache removed after activation; same account with a usable credential; 23 folders; 20 likes / 20 favorite cards; smallest liked clip on the original range, first frame 4880 ms, 54 frames, error 0; player closed, rate 1, filter 전체 |

Not verified: Q3 transcoding of an actual MPEG-4 Part 2 file in production, physical devices, WebKit, a fresh OAuth consent run. No original media, auth/OAuth config, origin, Notion or automation change.
