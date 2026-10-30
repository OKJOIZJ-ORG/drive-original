# CHECKPOINT — Drive Original

Updated 2026-10-30. Current work: buffering plus actual-format compatibility for the named root and all descendants (D131).

## Current identity

- Canonical repository: `C:\Projects\Drive-Original\source`; branch `codex/playback-buffering-20261030`.
- Verified product candidate: `d35be2c24e20e51eb0facbea6a8b9183c418201d`; preceding buffering unit `1e4c106`. Full suite 1,103/1,103 passed. Later memory-only savepoints do not change this tested product code.
- Production remains **1.23.22**, runtime `2499570`, Worker `40123793`. No merge, push, version bump, or deployment occurred in this task. Proposed release is 1.23.23, subject to D106 request-specific approval.

## What is done

- Bounded buffering / larger sequential reads eliminate subsequent waits in the recorded original-file trial; read freshness, owner, cancellation, and cleanup fences remain.
- Complete 12,289-file / 6-folder inventory; 336 extension/content mismatches. Private list: `qa/buffering-20261030/format-mismatches-private.tsv`.
- AVC-only TS route; both actual files reached normal-Chrome EOF. HEIC primary-image PNG compatibility: 24/24 decoded, native HEIC retained when available. Raster mismatch first-image decoding: 61/61. Original Drive bytes/names were preserved.
- Six fully zero-filled files cannot be repaired by a player. Private list: `qa/buffering-20261030/unrecoverable-private.tsv`. App gives a precise zero-header message after native rejection.
- Shared first-active browser-error diagnostic is sanitized and survives cleanup. Full media QA staging removed; private hashes/results retained. All owned browser tabs and test servers closed.

## What remains / next action

- **Intermittent normal-profile decoder failures are not solved.** Two silent-TS attempts failed, two later full runs passed; one strict-TS witness also failed once and then replayed successfully. Source/output decoding and paced read tests did not identify the browser cause. Failing appended bytes plus the new diagnostic are the next useful discriminator.
- Read `qa/buffering-20261030/README.md` and `compatibility-validation-redacted.json` before making claims. Prefix classification is not whole-library playback verification; native image checks cover the first image, not every animated frame. HEIC fallback is primary 8-bit PNG and does not promise original HDR/ICC/color fidelity.
- If the user approves release, align the version, review the exact branch diff, use the clean-worktree D106 release workflow, and verify actual served assets and normal Chrome. Do not treat the local candidate as already deployed.
- D079: no Notion release work. Automation stays PAUSED. Do not restart the explicitly stopped physical iPhone/Safari queue.

## Preserved previous return point

The outgoing CHECKPOINT was copied and SHA-256 verified at `H:\내 드라이브\CODEX BACKUP\Drive-Original\2026-10-30-playback-format\CHECKPOINT-before-format-candidate.md` before replacement. Prior release facts and unresolved thumbnail/device questions remain in that snapshot and the release records.
