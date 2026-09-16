# Drive Original v1.20.0 — released 2026-09-17

## Operational release

- Source implementation: `5faf6ba5320946592928225e3aeb585db1c14e18`.
- Public deployment tree: `c907530694b98d0d1e28dab7d7935bb28d2ffa74` on `gh-pages`.
- GitHub Pages build `1219624967`: `built`, no error.
- Pages Actions `35132094392`: `success`.
- Live application: `https://okjoizj-org.github.io/drive-original/`, v1.20.0.
- Final documentation/tag/package commits retain byte-identical runtime files to the implementation commit above.

The source remains on `main`; only the twelve explicitly allowed public files (including `.nojekyll`) are published from `gh-pages`. The old whole-repository workflow is preserved unchanged but disabled. `node scripts/publish-pages.cjs` is the current release command: it requires a clean source tree, checks JavaScript syntax, runs the full regression suite, constructs public Git trees from the exact source blobs and performs a normal fast-forward push. No new OAuth scope, private key or bypass of GitHub authorization was used. See D-046 for the evidence and operating trade-off.

## Validation

- 120 Node regression tests passed three consecutive full runs, and again in the publication command.
- App and worker syntax, Git whitespace validation, and static correctness lint passed.
- Chrome and WebKit: 20 states each across 320×568, 390×844, 844×390, 820×1180 and 1280×800. Final runs had no axe A/AA violations, page/console errors, or horizontal overflow.
- An earlier WebKit run logged a service-worker access-control event during immediate navigation; the driver now waits for controller and library readiness. Raw failed output is retained; the full confirmation run passed without suppressing errors.
- Eight real-browser fixture groups passed: exact-byte OPFS, Range, 401 refresh, malformed Range→identical memory original, cross-folder favorites/partial bulk failure, mobile video actions, 7,384-item virtualization, and offline/sibling-app isolation.
- Eight edge-navigation groups passed, including 176px direct tracking, previous page and 120px scroll restoration, short/reverse/multi-touch/interrupted cancellation, vertical scroll ownership, reduced motion, prior-filter restoration, and WebKit's native iOS history policy.
- Production verification re-fetched all eleven nonempty public assets: HTTP 200 and byte-for-byte equality with their source Git blobs. `memory/DECISIONS.md`, `tests/app.test.js`, and `qa/package.json` returned HTTP 404.
- Production Chrome at 390×844 and 1280×800 loaded v1.20.0, passed axe checks and folder/back restoration, and emitted no page errors.

## Distribution and maintenance

Versioned source archive: `C:\Users\jbs\Downloads\Drive-Original-v1.20.0.zip`.
Stable source archive: `C:\Users\jbs\Downloads\Drive-Original.zip`.

Archives are produced with `git archive` from the final tagged source commit, not from Windows working-copy line endings. Every packaged file is compared with its source Git blob. Package sizes, SHA-256 values, final source commit and attachment readback are recorded in the canonical Notion maintenance page and the local `drive-original-audit-20260917/release-evidence.json`; those external package hashes avoid a self-referential archive/document hash cycle. Prior version archives are retained.

Canonical maintenance owner: Notion page `cde9b849-3a7f-473f-9915-e948b1e6defe`, updated only with the local `ntn` CLI. Historical versions remain historical; current architecture, deployment source, version, validation and packages are updated separately.

## Boundaries

No actual Drive media was moved or trashed during QA. Functional API requests were intercepted fixtures. Physical iPhone OS gestures, real multi-device account propagation and arbitrary codec/network/device combinations are not certified by Windows WebKit or these fixtures. No claim of zero bugs or equivalence to Google/Apple's entire product quality is made. These boundaries do not undo the reproduced defects, successful regression results, or verified live deployment.
