# 1.23.18 operating verification — D116 (2026-10-26)

User request (D117): "D116을 1.23.18로 버전 올려서 main 병합·push·운영 배포하고, 실제 Chrome에서도 확인해줘."

| Release | Commit | Worker version |
|---|---|---|
| 1.23.17 (before) | `cd18847` | `5a6bd648-3886-410e-aaa3-fe9ab1d5b012` |
| **1.23.18** | `b35fa8c` (main fast-forward from `claude/background-actions-20261026`, pushed) | **`706fec6e-2589-469c-9682-e70616eb80df`** |

Deployed with `npm run deploy:release` after a passing `-- --dry-run` (D106 clean temporary worktree of HEAD): 14 changed assets uploaded, 68 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 1009/1009 on the release commit before push (3 new in `tests/background-drive-actions.test.js`) |
| Served bytes | 81/81 public files equal to `b35fa8c` ([served.json](served.json)) |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Update | User-profile Chrome, own background tab (closed after): `APP_VERSION` 1.23.18 on first open, signed in, `#driveActionStatus` present |
| Trash flow | In 추억 (6 files), two files selected → 휴지통 → dialog "2개 파일 · x_20260820_c15ab1de.mp4 외 1개" → 확인: dialog closed **14 ms** after the click, grid went 6 → 4 cards, bottom status "휴지통으로 이동 중 0/2", selection mode ended. When the job ended the status disappeared and both files were back (6) with the failure toast |
| Move flow | One file → 폴더로 이동 → server search `영상` → 확인: dialog closed at once, grid 6 → 5, status "'영상'(으)로 이동 중 0/1". **While the job ran, 상위 폴더 navigation to 내 드라이브 worked** (1.23.17 blocked it) with the status still shown ([screenshot](background-move-status.jpg)). On end: status hidden, failure toast, file back in 추억 |
| No user change | The page's `trashDriveFile`/`moveDriveFile` were replaced in that tab with a 4–12 s delay followed by a rejection, so no Drive write was sent. Afterwards a fresh 추억 listing had 6 files and a Drive GET of the moved target showed `trashed:false` with 추억 still its parent. No console errors or warnings |

## Not verified

A real successful trash or move in production (the success path is covered by unit tests and the demo-mode browser check; no user file was changed). The beforeunload prompt during a real job. Physical mobile devices, WebKit/iOS.
