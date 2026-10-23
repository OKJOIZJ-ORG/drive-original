# D108 listing, photo and next-item loading — 2026-10-23

User request (before merging/deploying D107): "병합 배포 전에, 영상 로딩이나 사진 로딩, 그리고 파일들 불러오는거 더 성능 최대한 개선할 거 없는지 검토한 후 패치까지 해봐." Same local branch `claude/initial-load-perf-20261023`, still version 1.23.15. Not merged, pushed or deployed.

Method: actual Chrome (user profile), production 1.23.14 page, folder with 2158 direct items (≈2100 videos, 34 photos, ~200 GIFs). Baselines were taken with production code; the patched functions (`gen-inject2.cjs` output) were then evaluated into the same page. The tab was a background tab: its rAF and WAAPI timers are throttled, so page-to-page gaps and the 220 ms swipe animation show up as 0.3–3 s there; transitions are compared from the commit, not from the call.

## Findings

| Area | Observed | Cause |
|---|---|---|
| Folder listing | first page 1.5–2.3 s, all 2158 items in 5 pages, 10.4–11.4 s | requesting `parents` caps a files.list page at 460 items (1000 without it); Drive's cost is mostly per item (~0.8 s fixed + ~1.9 ms/item) |
| Photo open | 350 KB JPEG: 2.5–2.9 s | Q0 revision pin (3 Drive round trips) ~1.1–1.3 s, then Drive media TTFB ~1.1–1.5 s, body ~0.1 s. Card-intent pin prewarm (D100) covered videos only |
| Next item in the player | photo 2.3–2.8 s, video 2.3–3.0 s after the swipe commits | every next open acquired its pin after the commit |
| Grid render | `renderFiles` 2.6–4.1 ms with 2158 files | not a bottleneck |

## Changes

| Change | Where | Tests |
|---|---|---|
| Non-root folder listings omit `parents` and record `[folderId]` on items that lack it (the query names the parent). Root keeps the field (the `root` alias is not the reported id); deep scan keeps it (its guard checks reported parents). Mutations still compare against a fresh GET, so a legacy multi-parent file fails safe as a conflict. | `app/core.js` `folderListingParams`, `app/library-list.js` `loadFiles` | `list-pagination.test.js` "folder listings start with a short page…" |
| The first page of a listing asks for 100 items; later pages 1000. | same | same |
| Photo cards prewarm the revision pin on hover dwell / press like video cards; the SW adopts it through the same single-use handshake. | `app/original-pin.js` | `q0-proxy.test.js` image adoption test; skip and card tests updated |
| When the current item is on screen (image load / first video frame), the item the primary gesture opens next gets the prewarm slot: vertical deck on touch layouts, sequential next otherwise. | `prewarmNextPlaybackPin`, `app/player-presentation.js` | `q0-proxy.test.js` "the item the primary gesture opens next…" |

986/986.

## Results (same tab, same files)

| Measure | 1.23.14 | patched |
|---|---|---|
| enter the 2158-item folder → first page shown | 1.53–2.27 s | **0.95–0.97 s** |
| all pages, request loop only (3 rounds each) | 7.5–8.9 s (5 pages) | **6.5–7.2 s** (3 pages) |
| all pages in the app (background tab) | 10.4–11.4 s | 11.8 s (one run 16.9 s with an 8.5 s Drive page) — rAF gaps of the background tab dominate the difference |
| photo open, press ~100 ms before | 2.77–2.83 s | 2.06 s |
| photo open, hover 400 ms | 2.77–2.83 s | 1.82–1.89 s |
| next photo after the commit | 2.28–2.84 s | **1.15–1.21 s** |
| next video after the commit (2.7–12.5 MB mp4) | 2.29–3.03 s | **1.23–1.73 s** |
| a photo reopened within 30 s after it was prewarmed as "next" | — | 1.16–1.19 s |

The remaining photo time is Drive's media TTFB through the pinned revision URI (~1.0–1.1 s) plus the body.

## Considered, not done

- Showing a large Drive thumbnail as a preview while the original photo loads: perceived ~0.4 s, but it puts non-original pixels in the original viewer; needs a user decision.
- Parallel partitioned listing (by type or modifiedTime ranges): order/tie and incremental-render contracts make it a larger change than its gain here (one type dominates).
- Replacing the rAF page scheduler: pinned by tests and cheap in a foreground tab.

Not measured: mobile devices, first-ever visit, WebKit.
