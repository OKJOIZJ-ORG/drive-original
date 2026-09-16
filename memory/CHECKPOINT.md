# Checkpoint — v1.20.0 awaiting branch publication

The implementation and final fixture validation are complete. Baseline remote main: 6459149. Local audit proposal: 5b9fc92. The proposed workflow edit was rejected for missing workflow scope; D-046 records the authorized public-only Pages branch solution. Source release has been reapplied on codex/permission-compatible-release with the original workflow unchanged, and scripts/publish-pages.cjs supplies syntax/regression gates before a public-only gh-pages push.

Next: commit source, retain proposal branch, fast-forward remote main, disable old whole-repository workflow, publish gh-pages and configure official branch Pages source, verify production byte hashes and excluded routes, package ZIPs, update canonical Notion through ntn, then finalize release record. No new live release is claimed yet.
