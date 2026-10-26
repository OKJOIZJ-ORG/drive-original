# 1.23.19 operating verification — D118 + D119 (2026-10-26)

User request (D120): "D118+D119를 1.23.19로 버전 올려서 main 병합·push·운영 배포하고, 실제 Chrome에서 하위 폴더 선택·드롭다운·확대까지 확인해줘."

| Release | Commit | Worker version |
|---|---|---|
| 1.23.18 (before) | `b35fa8c` | `706fec6e-2589-469c-9682-e70616eb80df` |
| **1.23.19** | `e9df1ec` (main fast-forward from `claude/subfolder-pick-20261026`, which contains D118 `claude/zoom-name-focus-20261026`; pushed) | **`96dd5a1a-e727-4051-a950-7c36a5c59197`** |

Deployed with `npm run deploy:release` after a passing `-- --dry-run` (D106 clean temporary worktree of HEAD): 14 changed assets uploaded, 68 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 1018/1018 on the release commit before push (4 new in `tests/media-zoom.test.js`, 5 in `tests/subfolder-selection.test.js`) |
| Served bytes | 81/81 public files equal to `e9df1ec` ([served.json](served.json)) |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Update | User-profile Chrome, own background tab (closed after): `APP_VERSION` 1.23.19 on first open, signed in (내 드라이브, 21 folders) |
| One loading message | 새로고침 sampled every 50 ms: summary "목록을 불러오는 중…" with spinner, then "폴더 21개 · 미디어 0개"; the line below stayed empty throughout |
| Dropdown | Real click on the sort button opened the app list (✓ on the current order, scrollable); choosing 이름 역순 changed `state.sort` and the button label and kept the 보기 panel open; restored to 수정일 최신순 |
| Subfolder picker | Real clicks: 하위 폴더 포함 → picker listed the 21 root folders at once (complete listing reused); expanding 추억 fetched its subfolders (사진, 영상) from Drive in 0.97 s; checking only 영상 showed 추억 as partial and 모든 하위 폴더 as partial ([screenshot](subfolder-picker.jpg)). 적용: Drive listed only 내 드라이브, 추억 (to reach the choice) and 영상, finished in 0.54 s with 285 media all from 영상; summary "… · 하위 폴더 1개 포함", button "1개"; progress text appeared only in the summary line. 포함 끄기 restored the plain root view |
| Card name popup | In 추억/사진 (2,491 media) a real click on the lower part of an untruncated card opened 파일명 "스크린샷 2026-09-18 204509.png" without opening the player; no focus ring was visible. The copy button was not pressed (it would overwrite the user's clipboard) |
| Zoom | Photo 20211215_125555_Camera.jpg (2736×3648) original loaded in 3.5 s; Ctrl+wheel events zoomed to 2.6× around the pointer with the HUD "2.6×" and lock; a real click on the lock set it (stored "1"), a further Ctrl+wheel changed nothing and showed "확대 잠금 중"; unlocked again (stored "0"); a real click on "2.6×" returned to 1× and hid the HUD; a double-click did not zoom |
| Cleanup | Sort, subfolder inclusion and zoom lock restored to their previous values; no Drive file changed; no console errors or warnings |

## Not verified

Physical phones (two-finger pinch on iOS Safari/Android Chrome), a real trackpad pinch (Ctrl+wheel was dispatched by script) and mouse-drag panning in production (verified in the local demo), the copy button with a real clipboard, video zoom on a playing video in production, shared drives and folders with more than 1,000 subfolders in the picker.
