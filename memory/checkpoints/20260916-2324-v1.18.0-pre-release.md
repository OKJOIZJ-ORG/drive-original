# Checkpoint — v1.18.0 authentication, thumbnails, and player polish — 2026-09-16 23:24

## The story so far

v1.17.0 is released and clean at `723f901`. Work is isolated on `codex/v1-18-auth-gif-player-stability`. Commit `fc621a8` ships the supplied OAuth client ID as the default and restores the historical blue-dot icon assets. The working tree now contains the second unit: static one-frame GIF canvases; a safe adaptive original-byte route (small auto-approved videos may use OPFS first, otherwise Range first); OPFS failure back to Range before compatibility preview; frozen swipe targets and axis-locked commit rules; first-frame poster handoff; synchronized mobile idle overlays; transform-only progress motion; and a compact desktop controls hierarchy with destructive actions in a more menu.

## Decided

- The supplied OAuth client ID is a user-confirmed project value and may ship as the default so first-run users do not type it manually; OAuth still requires a client ID before Google sign-in can start.
- `G:\내 드라이브\ㅇㅎㅎ` is the user-authorized validation corpus for this work; destructive verification remains out of scope unless separately authorized.
- The new icon request supersedes D-030's blue-dot removal, and the new GIF request supersedes D-029's placeholder-only presentation while retaining a static/non-animating library card.
- Adaptive routing is transport-only and never a quality choice: every automatic route uses exact Drive original bytes. Small known-size videos use OPFS first only when writable storage and the 80% quota guard prove it safe; large, unknown-size, or unsupported cases use Range first. Failure crosses to the other original-byte route before bounded memory and Google compatibility preview. No duplicate full-file and Range transfer runs in parallel.

## Waiting on the user

- None. The supplied fixed values are sufficient to continue.

## Next first action

Commit the verified second implementation unit, synchronize every version surface to v1.18.0, rerun the complete suite, and perform the release/deployment workflow with raw-byte Pages verification.

## Tried

- `node --check app.js`, `node --check sw.js`, the complete Node suite (64/64), and `git diff --check` pass after the reviewer-found OPFS retry, GIF backing-store retention, and GIF draw-exception paths were fixed.
- Desktop and 390 x 844 mobile browser QA passed without console warnings or horizontal overflow. Mobile top and bottom chrome hid together, the expanded action tray blocked idle hiding until it closed, a real local MP4 retained its poster until the first frame, and a representative 1.78 MiB GIF from `G:\내 드라이브\ㅇㅎㅎ` allocated a 320 x 320 static canvas only near the viewport and returned to 1 x 1 after exit.
- Real Drive OAuth, authenticated Range/OPFS behavior, and physical iPhone gestures remain unverified until live/manual validation. The local demo and automated contracts cannot prove those boundaries.
