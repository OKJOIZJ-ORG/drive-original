# Checkpoint — v1.16.0 original-first playback recovery ready to release — 2026-09-16 19:33

## The story so far

Drive Original v1.16.0 is implemented on `codex/in-app-playback-recovery`. It keeps original Range playback first, adds writable-OPFS or bounded-memory whole-original recovery, and uses an explicitly non-original Google compatibility page only as the last in-app fallback. Four-way direct-manipulation transitions use one decoder plus a neighbour poster; vertical random has a complete-population two-above/two-below deck and horizontal order is stable. The final Node suite passes 40/40, syntax and diff checks pass, 390×844 browser QA shows correct layout and 1:1 touch tracking, and two independent final audits approve the current diff.

## Decided

- D-033 defines the original-quality recovery ladder; D-034 defines the single-decoder spatial playback deck while preserving D-029 complete-population random selection.
- Request-scoped token recovery, no-store Range streaming, capability-gated OPFS writes, bounded memory, and server-directed Retry-After timing are the current security/performance contract.
- Physical iOS Safari and authenticated Google-account behavior remain explicit verification boundaries, not inferred successes.

## Waiting on the user

- None.

## Next first action

Stage the twelve task-owned files plus this checkpoint archive, commit v1.16.0, fast-forward `main`, push, then verify GitHub Pages bytes and update the Notion maintenance page.

## Tried

- The in-app browser could render responsive layouts but rejected synthetic touch dispatch; an ephemeral Chrome CDP session verified horizontal and vertical current/neighbor transforms instead.
- Google `/preview` cannot expose playback/login status cross-origin. Its load state is labeled only as a displayed compatibility page and persistent retry/direct-open recovery actions remain visible.
- Safari before version 26 can expose OPFS without main-thread `createWritable`; a runtime file-handle probe now degrades those versions to the bounded-memory policy.
- Early vertical random could be biased to the first metadata page; `playbackDeckComplete` now forces a full-population rebuild before the first commit.
