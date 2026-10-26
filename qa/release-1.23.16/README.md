# 1.23.16 operating verification — D110 + D111 (2026-10-26)

User request (D112): "D110+D111을 1.23.16으로 버전 올려서 main 병합·push·운영 배포하고, 실제 Chrome에서 x_20260820_5e365a54.mov 재생과 정렬·홈 이동까지 확인해줘."

| Release | Commit | Worker version |
|---|---|---|
| 1.23.15 (before) | `38047e3` | `75f98a18-a161-4fb2-8796-83fc97170c5f` |
| **1.23.16** | `a42d82c` (main fast-forward from `claude/sort-and-home-20261026`, pushed) | **`8c48f820-9be1-4f13-860b-ab78a468c87d`** |

Deployed with `npm run deploy:release` after a passing `-- --dry-run` (D106 clean temporary worktree of HEAD): 13 changed assets uploaded, 69 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 1000/1000 on the release commit before push |
| Served bytes | 81/81 public files equal to `a42d82c` ([served.json](served.json)); `version.json` 1.23.16, `sw.js` VERSION 1.23.16, `media/general-admission.mjs` carries the terminator fix |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Update | User-profile Chrome, own background tab (closed after): v1.23.16 / `APP_VERSION` 1.23.16 on first open |
| Reported file | `x_20260820_5e365a54.mov` (18.1 MB, Samsung_Videos) opened by clicking its card: route `original-range`, played to its end (15.67 s / 15.67 s, `ended`), no `q1-failed`, no "원본 형식 확인 필요" dialog (1.23.15 stopped it at 9.3 s with `GENERAL_BOX_HEADER`) |
| Sort | The 정렬 기준 menu lists the 10 options. On the 240 rendered cards of Samsung_Videos each order was monotonic: 생성일 오래된순/최신순, 용량 작은/큰 순, 재생 시간 긴 순, 수정일 오래된순, 이름순, 이름 역순. Restored to 수정일 최신순 afterwards |
| Brand → home | From Samsung_Videos, clicking "Drive Original" (title 홈으로 이동) landed on root (`folderStack` empty, filter 전체, scroll top, heading 내 드라이브) |

## Not verified

Physical mobile devices, WebKit/iOS; a QuickTime file with AC-3 audio in a sound description v1 (none available, see OPEN-QUESTIONS).
