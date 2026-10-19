# Checkpoint — D097 simple-UI pass local on branch; production still 1.23.8 — 2026-10-19

## The story so far
1.23.6 (review fixes), 1.23.7 (UI/UX) and 1.23.8 (behavior-preserving refactor, D096) are delivered to the same Worker drive-original at drive-original.jyw-drive.workers.dev; current Worker version b5aaf144, runtime f85f1c9. 940/940 tests; served bytes Git-equal; bindings/secrets unchanged; auth endpoints correct; actual signed-in Chrome on 1.23.8 with credential refresh, likes, navigation and playback. RELEASE-1.23.8.md owns proof.

## Local, not deployed
D097 "simple is best" UI pass (10 requests) on branch claude/simple-ui-20261019: 943/943 tests, native hold 19/19, before/after captures. qa/simple-ui-20261019/README.md owns details. Merge/version bump/deploy await explicit approval.

## Decided
D094 review/patch, D095 UI/UX, D096 refactor, D097 simple UI (local); each deployment explicitly requested. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
Approval to merge/bump/deploy D097. Open question: Q3 pipeline Q1_SOURCE allowlist (OPEN-QUESTIONS 2026-10-19).

## Next first action
Read source/memory/RELEASE-1.23.8.md.

## Tried
Deploy: the materialization guard sees transient nlink 2 on files build-pages just copied; `npm run deploy:candidate` can fail repeatedly. Working procedure: `npm run build:assets`, wait ~8 s, `node ../scripts/materialize-committed-pages.cjs`, `npx wrangler deploy --config wrangler.jsonc` (same guard, nothing skipped).
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
