# Comprehensive audit — 2026-09-17 — in progress

## Authority and preserved contracts

- User requested autonomous full source/workflow/UI/UX/PC/mobile inspection, stabilization, optimization, visual verification, and completion.
- No Notion connector. Canonical maintenance page is accessed only through local `ntn`.
- Preserve original-byte-first playback, one video decoder, full-population navigation, existing rounded navy/blue-dot icon, personal data, and release history.
- Never exercise destructive actions against real Drive content. Use isolated fixtures for mutations and faults.

## Observed baseline

- Starting commit: `645914986daf09b335cdc106aec6b87e1f7c3fb9`, v1.19.1, clean tree.
- Working branch: `codex/comprehensive-audit-20260917`.
- JavaScript syntax checks and 84 automated tests passed.
- All runtime source (app.js, sw.js, styles.css, index.html), existing tests, agent rules, deployment workflow, decision ledger and release documents inspected.
- Canonical maintenance page fetched live with `ntn pages get`; full JSON snapshot stored outside repository.
- Audit tooling/evidence directory: sibling `drive-original-audit-20260917` (not a public deployment asset).
- Desktop observe connector returned `Tool observe not found`; visual verification will use the installed Chrome via Playwright and screenshots through Core.

## Confirmed source defects awaiting regression tests / fixes

- Global cache-reset actions unregister/delete sibling apps on the shared origin.
- Favorites selection resolves IDs against the underlying folder rather than the favorites population.
- Empty selection may fall through to a stale player selection.
- App Retry-After parser clamps server wait time to ten seconds.
- Seekbar keyboard events also reach global player shortcuts.
- Late media download cleanup is not scoped to its session; startup OPFS cleanup is not scoped to active tabs.
- Deployment uploads the entire repository instead of an explicit public shell allowlist.

## Verification status

No new release yet. No physical-device or authenticated Drive verification claimed. Browser baseline, behavioral regressions, source fixes, deployment and maintenance write-back remain in progress.
