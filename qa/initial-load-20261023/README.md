# D107 initial library load — 2026-10-23

User request: "제일 최초 이상태 들어갈 때 로딩이 느린 이유가 있어? 할 수 있다면 근본적 원인 파악하고 성능 최대한 개선 패치 해. 무제한급 관리자 권한 줄게." (screenshot: library view still showing "파일 목록을 불러오는 중…"). Local branch `claude/initial-load-perf-20261023`, version 1.23.15. Not merged, pushed or deployed.

## Root cause (observed, actual Chrome, user profile, production 1.23.14)

`resumeAfterCredential` awaited `initializeAccountMediaState()` before the first `loadFiles()`. That sync is serial: `about` → appData catalog → one `alt=media` read per writer file. The account has 16 writer files (one per browser/device that ever wrote; most unchanged for weeks, ~220 KB total). They were downloaded on every launch with a pool of 4 (~0.8–1.2 s each), so the root listing request started only at 5.4–6.6 s. Right after the sync, `scheduleAccountStateRefresh(0)` repeated `about` + catalog.

| Phase (ms from navigation) | 1.23.14 run A | 1.23.14 run B | 1.23.14 run C |
|---|---|---|---|
| credential response | 1118 | 634 | 979 |
| root listing request start | 6586 | 5388 | 6286 |
| library summary shown | 7266 | 6108 | ~6918 (list end) |
| account state loaded | 6590 | 5393 | — |
| writer downloads / about / catalog | 16 / 2 / 2 | 16 / 2 / 2 | 16 / 3 / 3 |

## Changes

| Change | Where | Evidence |
|---|---|---|
| The document's first credential (no `accountId`, no `previousAccountId`, no pending media retry, no files) starts the listing in parallel with the account sync, and does not list again afterwards. A possible account switch keeps the old order (identity first). | `app/auth.js` `resumeAfterCredential` | `account-state.test.js` "the first credential lists the folder while account state loads…" (also failed-sync and switch cases) |
| A successful initialization no longer triggers an immediate second `about`+catalog read; it only reconciles the favorites view. A failed sync keeps `scheduleAccountStateRefresh(0)`. | same | same test |
| Writer reads run with a pool of 16 (`ACCOUNT_STATE_READ_CONCURRENCY`). | `app/core.js`, `readRemoteAccountMediaState` | pool test updated: 20 stalled reads → waves 16, 4; bounded timeout behavior unchanged |
| Writer reads are kept in `localStorage['drive-original.account-state-reads.<permissionId>']` keyed by file id + Drive `modifiedTime`, restored when the in-memory read cache is empty, pruned to the current catalog, re-validated on load, best-effort (quota/parse failures fall back to Drive). | `app/account-state.js` | `account-state.test.js` "a reload reuses unchanged writer reads…" |
| Version 1.23.15 (SW `?v=` cache-first needs a bump). | index.html, core.js, sw.js, version.json, static test | 983/983 |

Merge semantics are unchanged: the remote union is still built from every writer's content, so `remoteNeedsMerge` and writes behave exactly as before.

## Actual Chrome check (patched functions injected, production origin)

`gen-inject.cjs` extracts the patched functions and installs them in a `document` `DOMContentLoaded` listener, which runs before boot's `window` listener calls `init()`. `measure.js` records the phases. Same account, same tab.

| Phase (ms) | 1.23.14 (best of 3) | patched, first run | patched, warm |
|---|---|---|---|
| credential response | 634 | 791 | 805 |
| root listing request start | 5388 | 805 | 822 |
| library summary shown | 6108 | **1481** | **1498** |
| account state loaded | 5393 | 3023 | **1914** |
| writer downloads / about / catalog | 16 / 2 / 2 | 16 / 1 / 1 | **0** / 1 / 1 |

After the warm run: 22 likes and 397 viewed entries (same as before), no sync error, periodic refresh scheduled. The read cache key (~220 KB) was written to the user's Chrome profile by the injected run; 1.23.14 ignores it.

Not measured: a first-ever visit (SW install), mobile devices, folders with 1000+ media.
