# Checkpoint — v1.16.0 original-first playback recovery released — 2026-09-16 19:45

## The story so far

Drive Original v1.16.0 is released from commit `6a669fba4441e53b478dc272989c49155ac6803b`. GitHub Pages run `35085992727` completed successfully, and live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 with bytes equal to that commit. Both 114,471-byte release ZIPs have SHA-256 `2BB6D213BEB1C10B4517B527104FF69CED77E8C2F5E8E57BB08CA428DD47EC96`. The Notion maintenance page was updated, both ZIPs were attached, and the version, release commit, Pages run, package data, architecture, D-033/D-034, and verification boundaries were re-fetched successfully.

## Decided

- D-033 defines the original-quality recovery ladder; D-034 defines the single-decoder spatial playback deck while preserving D-029 complete-population random selection.
- Request-scoped token recovery, no-store Range streaming, capability-gated OPFS writes, bounded memory, and server-directed Retry-After timing remain the current security/performance contract.
- Physical iOS Safari and authenticated Google-account behavior remain explicit verification boundaries, not inferred successes.

## Waiting on the user

- None.

## Next first action

No required release work remains. If a real-account or physical-iPhone regression is reported, reproduce it against v1.16.0 while preserving the original-quality ladder and request-scoped authentication invariants.

## Tried

- The in-app browser could render responsive layouts but rejected synthetic touch dispatch; an ephemeral Chrome CDP session verified horizontal and vertical current/neighbor transforms instead.
- Google `/preview` cannot expose playback/login status cross-origin. Its load state is labeled only as a displayed compatibility page and persistent retry/direct-open recovery actions remain visible.
- Safari before version 26 can expose OPFS without main-thread `createWritable`; a runtime file-handle probe now degrades those versions to the bounded-memory policy.
- Early vertical random could be biased to the first metadata page; `playbackDeckComplete` now forces a full-population rebuild before the first commit.
- The Notion CLI briefly failed while resolving its latest API version; pinning the already-supported `2026-03-11` header completed the remaining in-place updates without duplicating content.
