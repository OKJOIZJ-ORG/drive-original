# Drive Original v1.21.0 — production verified 2026-09-19

## Published identity

- Runtime/source commit: `e08989a6caecc51bc2fdd37f538619fa8ed5900d`.
- Public deployment commit: `ef9c24b7c5b4d0ef746a75e7300d48b1245d14d2`.
- Production: `https://okjoizj-org.github.io/drive-original/`.
- Pages build: `built`, no error; completed `2026-09-19T06:01:15Z`.
- Pages Actions run: `35425467582`, `completed/success`.
- Live verification completed: `2026-09-19T06:03:50.728Z`.

`main` fast-forwarded from `70ff332` through the reviewed candidate `9a13076`
to `e08989a`, then was pushed. PR #1 now reports MERGED because its candidate
history is included. Its original draft label is not physical-device evidence.
Publication used the existing `node scripts/publish-pages.cjs` command after its
syntax and 144-test gate passed. Only the 12-file public shell is on gh-pages.
The old whole-repository upload workflow remains disabled; no permission scope,
new runtime dependency, separate server or force push was used.

## Verification

- **144/144 Node tests**; 13 new immersive/auth/history regressions plus the 11
  reused candidate tests beyond the original 120.
- **12 functional browser groups** passed twice at the release version, covering
  bottom-only controls, pointer/keyboard switching, player-only back, long press,
  same-account synthetic renewal, exact-original playback, mobile actions,
  7,384-item virtualization and scoped offline storage.
- **50 layout/accessibility states**, 25 Chrome and 25 Windows WebKit: no A/AA
  findings, page/console errors or overflowing controls in the final runs.
- **8 edge groups** passed, plus the new player edge/interior separation group.
- **4 independent-context propagation groups** passed: both foreground clients
  received the union in 15,051ms, visible remote unlike in 15,034ms, explicit
  offline upstream blocking/reconnection and reload identity/tombstones.
- Isolated v1.20.0 Git-shell installation upgraded to v1.21.0 via the real app
  update action. Old shell was removed; unrelated cache/settings survived;
  offline reload retained v1.21.0. This is not a physical installed-PWA test.

Live verification re-fetched every nonempty public asset (11 files), asserted
HTTP 200 and exact equality with the runtime commit's Git blobs. Internal
`memory/DECISIONS.md`, `tests/app.test.js` and `qa/package.json` returned 404.

Fresh production demo profiles at 390x844 and 1280x800 verified initially hidden
controls, bottom-only reveal, player-only browser back and unchanged folder,
zero axe findings, no horizontal overflow and no page/console errors. The demo
does not connect a real Google account. Result and screenshots are in
`qa/release-1.21.0-production/`.

The first production verifier used the nonexistent `el.imagePlayer` selector.
Its HTTP byte/private-route checks passed, but browser verification stopped.
The verifier alone was corrected to the actual `el.imageViewer`, with natural
image dimensions checked. The failed output is retained as
`first-verifier-selector-failure.json`; the complete rerun passed. No runtime
change was required, so the deployed source remains exactly `e08989a`.

## Evidence and boundaries

Engineering evidence and the nine-request mapping: `IMMERSIVE-20260919.md`.
Machine-readable summary: `qa/immersive-results.json`; detailed local run folders
are listed there. Follow-up documentation/QA commits do not change the published
runtime byte identity above and do not require republishing identical assets.

Still OPEN: actual iPhone Safari and installed PWA gestures/callouts/safe areas
(A-001), two actual Google-authenticated physical devices (A-002), real Google
expiry and long-duration sleep/wake renewal (A-004). Synthetic OAuth and Windows
WebKit cannot close those gates. The strict offline fixture gap A-003 is CLOSED.
No actual Google Drive media was moved, deleted or modified for QA. No claim of
indefinite automatic login or control over Google's cross-origin player is made.

No Antigravity task was delegated and the paused Codex automation was not resumed.
External Notion maintenance was not changed in this release session.

## Safe operation

Canonical source remains the relocated workspace's `source` directory. For
future releases commit source first, use the public-only publisher, wait for
Pages completion and rerun the production verifier with the full runtime SHA.
Keep future packages in workspace `releases`, not Downloads or old scratch.

The pre-release production commit `c907530694b98d0d1e28dab7d7935bb28d2ffa74`
remains in gh-pages ancestry. A needed rollback must create a new fast-forward
public commit using the chosen known-good public tree, verify served bytes and
record the reason; never force-push or delete deployment history.
