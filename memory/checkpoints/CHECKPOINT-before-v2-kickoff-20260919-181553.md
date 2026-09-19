# Checkpoint — v1.21.0 production verified — 2026-09-19

Canonical Git source: `C:\Users\jbs\Desktop\폴더모음\자작프로그램\Drive-Original\source`.
Runtime commit `e08989a6caecc51bc2fdd37f538619fa8ed5900d` is live through public
deployment `ef9c24b7c5b4d0ef746a75e7300d48b1245d14d2`. Pages is built; Actions
`35425467582` succeeded. All eleven nonempty public assets match source Git blobs;
internal memory/tests/qa routes return 404. Cold production mobile/desktop demo
smoke passed with bottom controls, player-only back, zero axe/console/page errors.

The nine user requests are implemented and mapped to evidence in
`IMMERSIVE-20260919.md`, D-048 and `RELEASE-1.21.0.md`. Main includes the reviewed
`9a13076` sync/one-shot-edge candidate; PR #1 is merged. Current follow-up changes
to documentation/QA do not change the runtime identity above.

Verified: 144 Node tests, 12 functional browser groups, 50 Chrome/WebKit layout
states, 8 edge groups, 4 independent-context propagation groups and an actual
v1.20.0 Git-shell-to-v1.21.0 offline-preserving update fixture. Strict offline
replay A-003 is closed. Still open: physical iPhone Safari/PWA A-001, actual two
Google-authenticated devices A-002 and actual long-duration renewal A-004.

Controls reveal only from the bottom pointer/touch zone or explicit keyboard
access, not pause or generic movement. Back and video swipe have separate owners.
Same-account renewal preserves the view; file permission errors are not logout.
Do not promise perpetual login or treat mock/viewport tests as hardware proof.

Publish only with `node scripts/publish-pages.cjs` from a clean committed source.
The gh-pages branch contains only the public allowlist; leave the old repository-
wide workflow disabled. Source tests/QA and private records must not be published.
The paused automation was not restarted. No Antigravity delegation, real Drive
mutation or external Notion maintenance was performed.

The outgoing checkpoint is preserved at
`checkpoints/CHECKPOINT-before-v1.21.0-20260919.md`. Workspace layout/recovery is
owned by the parent README. Future packages go to parent `releases`; do not
recreate old scratch/Downloads copies. Reproduce new user reports against the
served v1.21.0, retaining the explicit real-device acceptance boundaries.
