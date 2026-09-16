# Checkpoint — v1.18.1 released and authenticated — 2026-09-16 23:52

## The story so far

Drive Original v1.18.1 is released from `cac0d0604d1d2d6fd30d863c6bc8c4e77143403b`. GitHub Pages run `35110287933` succeeded, and live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` matched the release Git blobs byte-for-byte. Authenticated Chrome validation loaded the real Drive corpus and proved both the small OPFS path and the repaired large-file Range path; a 1.01GB file returned verified original `206` evidence and played past 13 seconds without an OPFS confirmation or compatibility downgrade.

## Decided

- The supplied OAuth client ID is a user-confirmed project value and may ship as the default so first-run users do not type it manually; OAuth still requires a client ID before Google sign-in can start.
- `G:\내 드라이브\ㅇㅎㅎ` is the user-authorized validation corpus for this work; destructive verification remains out of scope unless separately authorized.
- The new icon request supersedes D-030's blue-dot removal, and the new GIF request supersedes D-029's placeholder-only presentation while retaining a static/non-animating library card.
- Adaptive routing is transport-only and never a quality choice: every automatic route uses exact Drive original bytes. Small known-size videos use OPFS first only when writable storage and the 80% quota guard prove it safe; large, unknown-size, or unsupported cases use Range first. Failure crosses to the other original-byte route before bounded memory and Google compatibility preview. No duplicate full-file and Range transfer runs in parallel.
- A `206` whose `Content-Range` is hidden may be accepted only when the same-origin media URL carries the known Drive file size and the CORS-safelisted `Content-Length` proves an exact response interval compatible with the requested Range. A visible but invalid `Content-Range`, missing size, missing/invalid length, or out-of-bounds interval must still fail closed.

## Waiting on the user

- None. The supplied fixed values are sufficient to continue.

## Next first action

No release work remains. Physical iPhone Safari remains the only material device-specific verification boundary.

## Tried

- `node --check app.js`, `node --check sw.js`, the complete Node suite (68/68), and `git diff --check` passed. Independent Sol review found no P1/P2 and its two P3 test/checkpoint gaps were fixed before release.
- Live 390 x 844 Chrome replayed a 207MB file and a 1.01GB file through `Drive 원본 파일 · Range 무변환 전송`. The 1.01GB sample reported `status=206`, `contentRangeInferred=true`, `rangeSatisfied=true`, `readyState=4`, no media error, and currentTime advancing beyond 13 seconds; no original-buffer prompt or compatibility preview appeared.
- v1.18.1 produced no new console warning/error. The diagnostic listeners and temporary viewport override were removed, and the player was closed after verification.
- `Drive-Original-v1.18.1.zip` and `Drive-Original.zip` are each 102,418 bytes, contain 16 entries/15 files, match every packaged Git blob, and share SHA-256 `B5FF1DB7CC7BEF25C497DED75BEAE497EC1E246C6B898DA917BA906151B9DB53`.
- The Notion maintenance page records v1.18.1, run `35110287933`, the authenticated 1.01GB proof, D-040, hash/size, and both attached packages; targeted re-fetch checks passed.
