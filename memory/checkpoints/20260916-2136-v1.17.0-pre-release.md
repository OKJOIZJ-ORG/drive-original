# Checkpoint — v1.17.0 pre-release verification — 2026-09-16 21:17

## The story so far

The original-quality-first Service Worker and app playback state machine are implemented on `codex/original-quality-first-hardening` through `88a5d69`, with final review fixes and the `v1.17.0` version bump still uncommitted. The last full run passed 51/51 before the newest 403-refresh and demo-label tests; a complete rerun, round-two rehearsal, final diff review, release packaging, Pages byte verification, and Notion readback remain.

## Decided

- D-035 keeps all in-app original-byte paths ahead of automatic Google compatibility playback; external Drive remains a manual escape hatch only.
- Full-original recovery now shares a three-request budget across OPFS and memory, and a generic first 403 performs one quiet token refresh before showing in-app reconnection.
- Demo media is explicitly labeled as non-original, and the checking state hides the redundant quality badge.
- Physical iOS Safari and authenticated Google-account behavior remain explicit verification boundaries unless this release obtains fresh direct evidence.

## Waiting on the user

- None.

## Next first action

Run the complete Node suite and static checks, finish independent review plus round-two zero-context rehearsal, then commit, merge, push, verify Pages bytes, package ZIPs, and update the maintenance page with readback.

## Tried

- Gemini advisory consultation failed before content review because the local PowerShell/runtime integration failed; do not retry this turn and rely on Codex plus independent subagent review.
- The isolated Chrome DevTools profile has no saved OAuth client ID or Drive token, so authenticated real-account playback cannot be claimed from that profile.
- Round-one rehearsal found duplicate checking text and misleading demo resolution; both are patched and awaiting round-two readback.
