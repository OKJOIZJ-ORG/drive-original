# 1.23.17 operating verification — D113 (2026-10-26)

User request (D114): "D113을 1.23.17로 버전 올려서 main 병합·push·운영 배포하고, 실제 Chrome에서 이동 창 최근 폴더랑 검색까지 확인해줘."

| Release | Commit | Worker version |
|---|---|---|
| 1.23.16 (before) | `a42d82c` | `8c48f820-9be1-4f13-860b-ab78a468c87d` |
| **1.23.17** | `cd18847` (main fast-forward from `claude/move-recent-search-20261026`, pushed) | **`5a6bd648-3886-410e-aaa3-fe9ab1d5b012`** |

Deployed with `npm run deploy:release` after a passing `-- --dry-run` (D106 clean temporary worktree of HEAD): 8 changed assets uploaded, 74 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 1006/1006 on the release commit before push (6 new in `tests/move-recent-search.test.js`) |
| Served bytes | 81/81 public files equal to `cd18847` ([served.json](served.json)) |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Update | User-profile Chrome, own background tab (closed after): `APP_VERSION` 1.23.17 on first open, signed in |
| Real folder count | The full move index is **43,860 folders** (My Drive, no shared drives), read 460 per page; it took about **150 s** (1.23.16 showed nothing until then). The "2,300개" the user saw was a progress count, not the total |
| Server search | With one file selected, typed `추억` into the move search ~5 s after opening, while the index was at 920: "검색 중…" then the `추억` folder row about **1.1 s** later, with the loading note kept. After the index finished the local result was the same single `추억` |
| Recent folders | `추억` was recorded with the same function a completed move uses (no file was moved), the page was reloaded (index empty), a file in 추억/영상 was selected and the dialog opened: "최근 이동한 폴더 / 추억" was shown at once with "폴더 목록을 불러오는 중…"; selecting it enabled 이동 while the index was still at 920–2,300 ([screenshot](move-dialog-recent.jpg)). The dialog was cancelled; the file's parent was unchanged and the recorded entry was removed afterwards |

## Not verified

A real move recording its target in production (covered by unit test and demo-mode browser check; no user file was moved). Physical mobile devices, WebKit/iOS. Shared drives (the account has none).
