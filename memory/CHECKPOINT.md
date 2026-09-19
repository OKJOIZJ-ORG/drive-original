# Checkpoint — V2-01C closed / V2-03A comparator next — 2026-09-19 20:41 KST

## The story so far

The v3.0 integrated spec remains the single execution authority on branch `codex/v2-kickoff-diagnostics`; committed HEAD is `ecf7991`. V2-01B diagnostics remain verified at 12/12 fixtures and 153/153 tests. The localhost OAuth validation origin is registered alongside the preserved production origin, the user completed account selection, and the app reports `Drive 연결됨`. V2-01C is now closed by two ordinary-Chrome current-app reproductions of the supplied read-only sample: both selected `original-opfs`, received HTTP 200 and exactly 208,001,508 bytes, then emitted media-element code 4 and terminal `container-or-decoder` before compatibility selection. `files.version` advanced from 15 to 19 while `headRevisionId`, SHA-256, size and `modifiedTime` stayed unchanged and `viewedByMeTime` advanced after compatibility preview; because Google defines `files.version` as all server-side changes, the private content identity is file ID + head revision + SHA-256 + size. The redacted evidence contains none of those private values except size. Local FFprobe independently identifies MPEG-TS under the `.mp4` name with browser-decodable H.264/AAC tracks, making a container-only issue the leading but not yet V2-03A-confirmed explanation. The original, production deployment, `main`, remotes and paused automation remain unchanged.

## Decided

- D-050: `memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md` v3.0 remains the single active requirements and execution source.
- V2-01C is `IMPLEMENTED_LOCAL`; Google iframe entry is not playback success, and the first failed layer is post-transfer browser parse/decode.
- V2-03A is the sole READY unit; authentication work remains separate from media relay or conversion.

## Waiting on the user

- Nothing for V2-03A. Physical iPhone Chrome/PWA checks remain deferred until a runnable candidate exists, when the exact URL/version and two or three checks will be supplied.

## Next first action

Run the V2-03A local read-only comparator on the authenticated tab for front, middle and tail ranges, comparing current SW bytes against a direct Drive API reader under the same private content fingerprint and recording only redacted status, length, timing and digest equality.

## Tried

- Google rejected the separate automation-controlled Chrome login as an unsafe browser; ordinary Chrome succeeded and this was not counted as an account failure.
- Ordinary Chrome initially returned `400 origin_mismatch`; adding only the exact localhost validation origin while preserving production resolved it.
- Waiting for the entire OPFS body delayed the first failure for 370 seconds on the cold first run; the second run closed in 6.4 seconds, so performance numbers are not compared across cold/warm state.
- Raw Drive `files.version` is not a stable content key for this path because compatibility preview advanced user-view/server state without changing content revision, checksum, size or modified time.
