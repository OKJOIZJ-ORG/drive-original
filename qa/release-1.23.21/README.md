# 1.23.21 operating verification — D125 + D126 + D127 (2026-10-29)

User request (D128): "1.23.21 배포" (proposed: D125+D126+D127 as 1.23.21, main merge, push, production deploy, actual Chrome check of the photo trash button, subfolder loading and end-of-playback action).

| Release | Commit | Worker version |
|---|---|---|
| 1.23.20 (before) | `4ed1c70` | `8bf12c8f-58dc-4e37-a29a-972b52b9884f` |
| **1.23.21** | `a42bce8` (main fast-forward from `claude/photo-delete-20261029`; pushed) | **`f0c33cae-6c89-4742-be9c-d6dd59670ed6`** |

Deployed with `npm run deploy:release` after a passing `-- --dry-run` (D106 clean temporary worktree of HEAD; 83 public assets materialized byte-for-byte): 12 changed assets uploaded, 72 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 1044/1044 on the release commit before push |
| Served bytes | 83/83 public files equal to `a42bce8` ([served.json](served.json), [served-check.cjs](served-check.cjs)) |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Update | User-profile Chrome, own background tab (closed after): `APP_VERSION` 1.23.21 on first open, signed in (내 드라이브, 6 folders) |
| D126 loading (real Drive, requests counted by wrapping `driveFetch` in the tab) | Opening 에셋백업: 1 listing request. Subfolder picker for it: 0 requests (taken from the complete listing). First "all subfolders" scan: 24 folders, 13,313 files, 55 s. Afterwards: subfolders off → 0 requests; all again → 0 requests (0.18 s); off again → 0; opening NAI-originals, P01 and deeper folders and coming back → 0 requests each, served from the cache |
| D125 photo trash | validation/`P03_sr1_s1.png` (878 KB) opened as an original image; the topbar showed 휴지통으로 이동 between 다음 이미지 and 닫기. A real click opened the trash confirmation with the file name; 취소. A real Delete key press opened it again; 취소. The file stayed listed, no job was queued, nothing was trashed. (The screenshot shows the user's image and is kept out of this public repository.) |
| D127 end action (real Drive, `range` original playback) | `8(@ha8usy)_20261026_…_20261027.mp4` (187 KB, 7.9 s): default 처음부터 → from 6.7 s, `ended` at 7.89 then seek 0 and play; playing at 3 s two seconds later. Three real clicks on 더보기 → 끝나면 changed it to 멈춤 (stored `stop`): `ended` at 7.89, stayed paused. Two more real clicks → 다음 영상: on `ended` the next file `…2114708176021135724…mp4` opened. Restored to 처음부터 (stored `repeat`) |
| Console | No errors or warnings in the tab |

## Not verified

- The old code's real-Drive time for the same 55 s scan (the before/after comparison is the simulation in `qa/subfolder-load-20261029`).
- 랜덤 쇼츠 on real Drive, end actions on Q1/Q2/Q3 sources, phones (mobile ⋯ menu checked in the local demo only).
- The user's own already-open Drive Original tab keeps the old code until it is refreshed.
