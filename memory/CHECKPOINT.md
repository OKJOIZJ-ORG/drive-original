# Checkpoint — V2-05A mutation readback verified locally — 2026-09-26

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics. V2-02A is committed at 8b16fae; V2-02B at e68d579. V2-05A now has account-owned persistent per-file operations, independent GET postconditions, read-only reload/refresh recovery and truthful partial-result counts. Response loss, malformed JSON, 404 and changed-account results never imply success or unconditional replay. Initial confirmed evidence remains separate from later external changes.

Evidence: tests/mutations.test.js 22/22; combined suite 298/298 before the final input-snapshot regression fix (focused 22/22 after it). Browser qa/v2-mutations-integration/results.json 22/22; defensive null/readback changes rechecked by qa/v2-mutations-final/results.json 3/3. Independent review findings fixed; final main review additionally reproduced/fixed asynchronous UI snapshot drift. Local only, no deployment, no real Drive mutation, no physical-device claim. Earlier browser resource failure remains historical; the current full browser run succeeded with the pinned synthetic seed.

## Decided

- D-050/D-051/D-052 remain active. No main merge/push/production replacement, original mutation, public sharing, billing or automation restart.
- Browser owns Drive mutations; auth-only Worker remains unchanged. Candidate driveMutationsEnabled stays false.
- Web Locks plus local persistent ledger serialize same-origin account writes. Unsupported locking or storage failure stops writes, not read/playback. Natural storage limits remain fail-closed; no history is silently pruned.
- A new explicit UI retry may send one PATCH only after fresh original version/state readback and another preflight match. Reload/refresh and duplicate operation IDs never resend. Preflight is not atomic protection from other apps/devices.

## Waiting on the user

No decision needed for local implementation. Live Google/device acceptance and final production transition remain user-controlled gates. Current isolated candidate is unauthenticated; do not borrow a personal browser session or count historical iPhone auth confirmation as current media evidence.

## Next first action

Inspect qa/v2-03b and the priority MPEG-TS evidence, then implement the smallest bounded local Q1 transmux/seek-preservation discriminator; use synthetic media and read-only priority evidence before adopting a product library.

## Tried

- Legacy mutations accepted unreadable PATCH responses or fabricated destination parents; baseline two tests failed, now independent GET owns success.
- First ledger draft lost prior confirmed evidence, imposed an arbitrary 2000-row ceiling and rejected parentless destinations; review reproduced all, fixed and tested.
- Repeated 404 exposed null/stale readback reuse during explicit retry; fixed with fresh-observation clearing and exact null-safe guards.
- Mutable UI file objects could change intent during preflight; a discriminating red test now passes after input snapshotting.
- Expanded V2-02B browser run previously stopped at ERR_INSUFFICIENT_RESOURCES; later complete 22/22 synthetic run succeeded. OS paging and user processes were not changed.
- Rollback: revert the isolated local unit while retaining candidate read-only configuration and private local ledger; no original or remote data recovery is needed.
