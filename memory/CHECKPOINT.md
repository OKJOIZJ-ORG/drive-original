# Checkpoint — v1.18.1 Range recovery ready for release — 2026-09-16 23:44

## The story so far

v1.18.0 is released and its prior completion state is archived at `memory/checkpoints/20260916-2326-v1.18.0-released.md`. Authenticated validation then restored the saved Google session, loaded the real Drive corpus, and proved that a small video uses OPFS original playback successfully. Two larger videos exposed a Range-path defect: Drive returned `206`, but its cross-origin response did not expose `Content-Range`; the service worker therefore classified both valid responses as `range-invalid`, returned 502, and unnecessarily offered full-file OPFS recovery. v1.18.1 now reconstructs that hidden header only from an exact known-size/`Content-Length` match and otherwise fails closed.

## Decided

- The supplied OAuth client ID is a user-confirmed project value and may ship as the default so first-run users do not type it manually; OAuth still requires a client ID before Google sign-in can start.
- `G:\내 드라이브\ㅇㅎㅎ` is the user-authorized validation corpus for this work; destructive verification remains out of scope unless separately authorized.
- The new icon request supersedes D-030's blue-dot removal, and the new GIF request supersedes D-029's placeholder-only presentation while retaining a static/non-animating library card.
- Adaptive routing is transport-only and never a quality choice: every automatic route uses exact Drive original bytes. Small known-size videos use OPFS first only when writable storage and the 80% quota guard prove it safe; large, unknown-size, or unsupported cases use Range first. Failure crosses to the other original-byte route before bounded memory and Google compatibility preview. No duplicate full-file and Range transfer runs in parallel.
- A `206` whose `Content-Range` is hidden may be accepted only when the same-origin media URL carries the known Drive file size and the CORS-safelisted `Content-Length` proves an exact response interval compatible with the requested Range. A visible but invalid `Content-Range`, missing size, missing/invalid length, or out-of-bounds interval must still fail closed.

## Waiting on the user

- None. The supplied fixed values are sufficient to continue.

## Next first action

Commit and deploy v1.18.1, then replay an actual large Drive video and prove Range playback advances without whole-file fallback.

## Tried

- `node --check app.js`, `node --check sw.js`, the complete Node suite (68/68), and `git diff --check` pass with guarded bounded/open/suffix/EOF/HEAD reconstruction, invalid-evidence rejection, and the app-to-worker size contract covered.
- Desktop and 390 x 844 mobile browser QA passed without console warnings or horizontal overflow. Mobile top and bottom chrome hid together, the expanded action tray blocked idle hiding until it closed, a real local MP4 retained its poster until the first frame, and a representative 1.78 MiB GIF from `G:\내 드라이브\ㅇㅎㅎ` allocated a 320 x 320 static canvas only near the viewport and returned to 1 x 1 after exit.
- Independent final review found no P1, P2, or P3 regression in `main..cf31107`; the versioned local browser showed v1.18.0 with matching cache-busted assets at desktop and 390 x 844 widths.
- Physical iPhone gestures remain unverified; desktop Chrome authenticated Drive evidence is tracked separately below.
- Authenticated browser evidence after release closed two prior unknowns: saved-session OAuth restoration works, and a 978 KiB MOV completed original OPFS playback. The remaining live failure is specifically a `206` CORS header-visibility mismatch, not a Drive refusal to return original bytes.
