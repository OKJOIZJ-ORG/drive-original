# Checkpoint — v1.20.0 released — 2026-09-17

Implementation `5faf6ba5320946592928225e3aeb585db1c14e18` is live through public tree `c907530694b98d0d1e28dab7d7935bb28d2ffa74`. GitHub Pages build `1219624967` is built and Actions `35132094392` succeeded. Eleven public assets match the source Git blobs; internal memory, test and QA routes return 404. Production mobile/desktop smoke and back restoration passed.

The comprehensive audit and Apple-like mobile edge-back refinement are recorded in `AUDIT-20260917.md`, D-043–D-046 and `RELEASE-1.20.0.md`. 120 Node tests passed three consecutive runs; final Chrome/WebKit 40-state checks, eight functional fixture groups and eight navigation groups passed. Physical iPhone OS behavior and real multi-device propagation remain explicit verification boundaries.

Source changes live on `main`; publish with `node scripts/publish-pages.cjs` after committing. The public-only `gh-pages` branch is the Pages source. The earlier whole-repository workflow remains unchanged and disabled because its proposed replacement required an unavailable OAuth scope. The original unpushed proposal is retained locally at `5b9fc92` and its audit branches.

The final tagged source archive is `Drive-Original-v1.20.0.zip` with `Drive-Original.zip` as stable alias in Downloads. The authoritative package hash and canonical maintenance readback are in the Notion page `cde9b849-3a7f-473f-9915-e948b1e6defe` and sibling `release-evidence.json`. Use local `ntn` only; do not use a Notion plugin.

For new reports, reproduce against this release and extend the focused regression case. Do not redo the broad audit or claim physical-device coverage from fixture evidence.
