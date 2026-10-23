# 1.23.15 operating verification — D107 + D108 (2026-10-23)

User request (D109): "1.23.15(D107+D108)로 main 병합·push·운영 배포하고 실제 Chrome에서 확인까지 해줘."

| Release | Commit | Worker version |
|---|---|---|
| 1.23.14 (before) | `482484b` | `10a444bb-1486-41c5-adf4-da75402e1060` |
| **1.23.15** | `38047e3` (main fast-forward from `claude/initial-load-perf-20261023`, pushed) | **`75f98a18-a161-4fb2-8796-83fc97170c5f`** |

Deployed with `npm run deploy:release` (D106 clean temporary worktree of HEAD): 9 changed assets uploaded, 73 reused.

## Evidence

| Check | Result |
|---|---|
| Tests | 986/986 on main before push |
| Served bytes | 81/81 public files equal to `38047e3` ([served.json](served.json)). The very first fetch, seconds after the deploy, still returned the old `index.html` from the edge (same length: only the version string differs); every later fetch matched. |
| Private paths | 404: `app.js`, `app/README.md`, `tests/app-loader.cjs`, `memory/DECISIONS.md`, `scripts/public-files.cjs`, `worker/index.mjs`, `.git/config` |
| Auth | Anonymous `POST /api/session/credential` → 403 `no-store`; Worker/auth code unchanged |
| Worker bindings | 11 (incl. 4 secret names) equal to `10a444bb` |
| Update | User-profile Chrome, own background tab (closed after): auto-updated to v1.23.15; only cache `drive-original-shell-1.23.15` remains |
| Account | Same account, 22 likes, 402 viewed, no sync error |
| First load (reload) | credential 596 ms → root listing requested at 606 ms → summary **1554 ms**; account state 1850 ms with 0 writer downloads, 1 about, 1 catalog (1.23.14: summary 6.1–7.3 s) |
| 2158-item folder | first page (100) shown at **978 ms**, all pages 8.8 s in 4 requests (100/1000/1000/58), parents recorded |
| Photo | 360 KB JPEG after a 400 ms hover: 1815 ms (pin prewarmed; 1.23.14 2.8 s) |
| Next item after the swipe commits | photo 1205 ms, video 1164 ms, both adopting the next-item prewarm (1.23.14: 2.3–3.0 s) |
| Playback | 3 smallest liked videos (0.9/1.5/2.2 MB) by card press+click from 좋아요: all `original-range`, played past 1.5 s, first progress 3675/3290/2331 ms (1.23.14: 3980/3391/2578), no error |
| Console | no errors or warnings |
| State restored | filter 전체, player closed |

Background-tab caveat: rAF/WAAPI are throttled in a background tab, so page gaps and the 220 ms swipe animation are longer than in a foreground tab; transitions are measured from the commit.

## Not verified

Physical mobile devices, WebKit/iOS, a first-ever visit (SW install) on a slow network.
