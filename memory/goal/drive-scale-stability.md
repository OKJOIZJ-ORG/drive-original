# Goal — Drive-scale stability

Goal: Audit and patch Drive Original so large Google Drive media libraries remain responsive and the four requested behaviors are correct.

Definition of done: GIF cards never animate; move search covers every accessible folder with permission-safe behavior; random sort and shorts use the complete supported-media population; discovered regressions are repaired; checks pass; `main` is pushed and Pages plus Notion maintenance data are current.

## Terrain map — cut v1 — 2026-08-23

- `observed`: `renderFiles()` rebuilds every loaded card after every page; the `G:\` sample has 9,788 supported media items, so DOM work and thumbnail work grow without a bound. Source: `app.js`, local metadata count.
- `observed`: GIF files receive `thumbnailLink` directly in an in-DOM `<img>`, leaving animation behavior uncontrolled. Source: `app.js:createFileCard`.
- `observed`: random completion uses polling and a 100-page guard; playback prefers the display filter/query subset. Source: `app.js:ensureAllPagesLoaded`, `getPlaybackFileList`, `playRandomFile`.
- `observed`: move-folder rendering truncates to 300 rows and has no explicit shared-drive roots. Source: `app.js:renderMoveFolderList`.
- `observed`: folder/media requests can write stale responses after navigation because there is no request generation or abort ownership. Source: `app.js:loadFiles`.
- `retrieved`: Drive `files.list` supports `user` and per-`drive` corpora, returns `nextPageToken`, and exposes `incompleteSearch`; `drives.list` is independently paginated. Source: Google Drive API reference, opened 2026-08-23.
- `unknown`: live-account permissions and shared-drive topology for the user's Google account cannot be inferred from the mounted `G:\` layout alone; implementation must degrade safely and expose API errors clearly.
- `hearsay`: Gemini recommends a bounded viewport window and a flat move catalog, and warns that canvas GIF capture may fail under CORS. Source: Gemini advisory conversation above; Codex must verify in code/tests.

Sub-foundations exposed: Drive corpus enumeration — not atomic → split into user corpus, shared-drive discovery, per-drive pagination, deduplication, and orphan/root modeling; large-library rendering — not atomic → split into population storage, projection, bounded DOM window, and thumbnail lifecycle.

## Mobilization

| Branch | Needs | Held | Gap → first move |
|---|---|---|---|
| GIF thumbnails | A no-animation guarantee and bounded decoder work | `app.js` thumbnail queue; D-008/D-009 | Direct thumbnail assignment is unsafe → test a placeholder-first/static-only card path |
| Folder moves | Complete API enumeration, roots, permissions, pagination, search | D-013/D-016/D-017; current Google API docs | Shared-drive roots and 300-row cap missing → build a flat catalog fixture first |
| Random/shorts | Complete population, unbiased selection, cancellation | D-015; `ensureAllPagesLoaded` | Display state is conflated with population → separate store/projection |
| Performance | Hard DOM/resource bounds at 9,788 items | `G:\` observed counts; existing IntersectionObserver | Current rendering is unbounded → introduce a real window with replacement, not accumulation |
| Audit/reliability | Race ownership, single-flight async work, truthful docs | Source inventory; Notion SSOT; README | Add request generations/tests, then sweep contradictions |
| Delivery | Version, package, checksum, deploy, Notion sync | Workflow and project rule | Run only after all checks pass |

## Skeleton — cut v1

- 1. Complete population is correct and independent of display state.
  - 1.1 `named-unfilled`: A folder request owns an abort signal and generation. Lead: `app.js:loadFiles`.
  - 1.2 `named-unfilled`: Pagination ends only when `nextPageToken` ends or progress is proven impossible. Lead: Drive `files.list` reference.
  - 1.3 `named-unfilled`: Population append does not rebuild every card. Lead: `app.js:renderFiles`.
- 2. Rendering has a hard resource bound.
  - 2.1 `named-unfilled`: Projection is filter/sort only and does not mutate the population. Lead: `app.js:filteredAndSortedFiles`.
  - 2.2 `named-unfilled`: The DOM window replaces off-window cards and preserves scroll continuity. Lead: no source yet; behavior test first.
  - 2.3 `named-unfilled`: Thumbnail/prefetch queues drop stale/disconnected work. Lead: current queue code.
- 3. GIF thumbnails cannot animate.
  - 3.1 `named-unfilled`: GIF detection covers MIME and case-insensitive extension fallback. Lead: Drive file metadata.
  - 3.2 `named-unfilled`: No GIF card receives an animated URL in an attached image. Lead: card construction test.
  - 3.3 `named-unfilled`: Static enhancement failure keeps a non-animated placeholder. Lead: CORS risk in Drive docs/Gemini review.
- 4. Move destinations cover accessible Drive folders safely.
  - 4.1 `named-unfilled`: `drives.list` pagination discovers all shared-drive roots. Lead: Drive `drives.list` reference.
  - 4.2 `named-unfilled`: user and per-drive folder pages are exhausted and deduplicated. Lead: Drive `files.list` reference.
  - 4.3 `named-unfilled`: roots, missing-parent/orphan nodes, cycles, and permission-disabled nodes remain searchable. Lead: synthetic catalog tests.
  - 4.4 `named-unfilled`: search results are not correctness-truncated and DOM rendering remains bounded. Lead: current `slice(0, 300)` defect.
  - 4.5 `named-unfilled`: move execution uses actual parent IDs and returns actionable errors. Lead: Drive folder move guide.
- 5. Random sort and shorts use the complete supported-media population.
  - 5.1 `named-unfilled`: both entry points await the same complete-population promise. Lead: D-015 and current handlers.
  - 5.2 `named-unfilled`: playback selection is independent of display search/filter. Lead: current `getPlaybackFileList` defect.
  - 5.3 `named-unfilled`: rapid requests and folder changes cannot play stale choices. Lead: generation tests.
- 6. The surrounding application remains truthful and stable.
  - 6.1 `named-unfilled`: static syntax/JSON/CSS/HTML-ID checks pass. Lead: D-012/D-015 historical checks.
  - 6.2 `named-unfilled`: README storage/scope statements match source behavior. Lead: README vs `app.js` observation.
  - 6.3 `named-unfilled`: browser demo checks desktop/mobile interaction without console errors. Lead: demo mode.
  - 6.4 `named-unfilled`: production deploy serves the new version and Notion records version/SHA/HEAD/history. Lead: project rules and Notion SSOT.

Single next leaf: 1.1 — write a failing generation/cancellation behavior test.

## Known gaps

- Live Google API behavior requires an authenticated browser session; synthetic tests cover correctness before live smoke verification.
- A static first-frame GIF preview is optional progressive enhancement; the hard requirement is no animation and no sustained GIF decoder load.

## Done-check

- `pass`: `node --check app.js` and `node --check sw.js`.
- `pass`: `node --test tests/*.test.js` — 14/14.
- `pass`: 9,788-item / 501-GIF fixture — 240 cards mounted, zero GIF `img` nodes.
- `pass`: browser demo desktop interaction and 390×844 mobile layout — no console warnings/errors or horizontal overflow.
- `pass`: local and remote `main` matched; GitHub Pages Actions completed successfully.
- `pass`: live Pages `version.json` returned HTTP 200 and v1.14.0.
- `pass`: release and alias ZIPs matched at SHA-256 `2392AC0DECCA44211E579282D9ECB771D775EC7C788E2E9B5498C22851A59DA1`.
- `unavailable`: an authenticated destructive cross-drive move was not used as a smoke test; permission/API errors remain explicit.
- `delivery gate`: update Notion with the final HEAD and this verification record after the checkpoint commit.

## Superseded cuts

- None.
