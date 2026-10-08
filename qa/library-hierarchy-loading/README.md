# UI hierarchy and sequential library collection — D088

Local branch `codex/library-hierarchy-loading`, based on borderless commit `368add6` and main `7399829`. No release version, merge, push or deployment belongs to this local patch.

## Observed production diagnosis

On 2026-10-08, the existing authenticated normal-Chrome app at the D086 operating address showed ㅇㅎㅎ with2folders,458media, nextPageToken present, populationComplete=false, loadingFiles=false and no listing error. Its sentinel was about20048px below the top of a695px viewport;240 cards were rendered. Source required that sentinel to intersect the viewport before requesting the next metadata page. The missing population was therefore a collection gate, not only incorrect wording.

A read-only direct-child census in that same authenticated page, using its existing Drive client without exporting credentials, deduplicated IDs across1000/1000/54-result pages and ended without a next cursor:2folders,1451videos,600images,1other file. This confirms2052direct non-folder files; supported video/image media total2051. The normal app query intentionally excludes other file types. No direct-file count was inferred from a recursive folder total. No Drive file was modified. The user tab was returned to its initial 내 드라이브 view.

Google's [files.list reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list) documents that pageSize is an upper limit, short/empty pages can precede the end, nextPageToken indicates a continuation, and incompleteSearch prevents a complete-result claim. Existing validation/fencing is retained.

## Changes and UI review

| Before | After | Why |
|---|---|---|
| Related actions used different size/radius/type rules, including dialog-specific overrides | Shared40px/14px controls,44px coarse-pointer controls,36px/13px compact controls; neutral, primary and destructive roles | Consistency by role with existing selectors and no new dependency |
| Independent typography and state colors | Shared26/17/15/14/13/12px title/heading/body/control/support/caption scale; shared selected/focus colors | Preserve hierarchy and make future changes coherent;16px form input text retains mobile focus behavior |
| Narrow settings rows truncated action labels | Intrinsic button flex basis wraps complete actions | Keep full logout/disconnect meaning at320px |
| Metadata continuation depended on the bottom-of-grid observer | Sequential single-request page chain with low-priority background continuation | Collect the whole ordinary folder while the user stays at the top; retain240-card virtualization |
| “표시 · 추가 항목 있음” left an incomplete count idle | Header partial count/status/spinner, final total, stopped state and explicit retry | Make progress and failure actionable; distinguish filtered matches from collected population |

The obsolete metadata sentinel/observer and styles were removed. First-page refresh clears stale previous-folder content immediately; search empty-state waits until collection completes. Error pages preserve files/cursor and require explicit retry. Abort/generation fencing, repeated-cursor/incomplete-search rejection, favorites/deep-scan ownership, and complete-population consumers remain intact. Player changes are typography/state styling; no transport or gesture geometry was changed.

## Verification and limits

- Product checks:918/918 passed (`node --test tests/*.test.js tests/*.test.mjs`), including sequential short/empty pages,2051media without scrolling, first/append failures and retry, coalescing, cancellation, malformed/incomplete/repeated cursors, cached navigation and partial search. `node --check app.js` and scoped diff whitespace check passed.
- Maintained native driver: `node qa/library-hierarchy-loading/native.cjs`. Actual local app in isolated headless Chrome at1440×900,390×844 and320×740; synthetic metadata, no remote requests. Four pages458/542/1000/51 collect2051media+2folders while scrollY=0. Completed summary is `폴더 2개 · 미디어 2,051개`, cards<=240, no horizontal overflow. Partial no-match, completion, header retry/no automatic failure loop, view/Escape, selection/cancel, keyboard focus, settled settings/full labels and image-player open/close are checked.
- Outputs and visually inspected captures: workspace `maintenance/tools/library-hierarchy-loading/results.json`, `product-tests.log`, `{1440,390,320}-{collecting,complete,options,settings,retry,image-player}.png`. UI input/layout checks are browser evidence; mobile sizes are emulation, not physical Android/iOS acceptance. Demo image rendering is not real-media playback acceptance.
- Actual-account evidence diagnoses the old production behavior. Candidate collection/UI is proven locally with synthetic metadata; candidate actual-account/device/production execution remains unperformed. Production remains the D0861.23.3 baseline. Historical release/device/playback limits stay with their original owners.

The first product run failed only because the existing privacy fixture lacked DOM elements newly reached by initial render; its existing render stub now preserves that test's privacy assertions, and the full suite passed. Image-player QA initially targeted a nonexistent descendant, then a catalog before restoring its root; the driver now resets the demo view and targets the existing `.file-card-open` control. Initial pointer-close/ Escape-only probes did not establish a closed player; the final driver uses ordinary Tab to reveal/focus controls, visually captures them, then clicks close and verifies hidden state. These tool/fixture failures are not product success evidence. Settings clipping found by visual review was fixed and the native scenarios rerun.
