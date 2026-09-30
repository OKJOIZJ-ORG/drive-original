# Environment preparation only — 2026-09-30

Run `node qa/night-environment-20260930/preflight.cjs` in the source root.
It prints only safe local readiness fields, checks the existing memory floor,
fixed rc21 public-source hashes, official portable tool ZIP/hash/version,
installed Chrome/Playwright and ADB status counts. It never prints device serials
or reads credentials. `adb devices` may start its ordinary local ADB server.
No media/browser/acceptance test, navigation, settings change or cloud write occurs.
Exit0 means the PC tooling checks pass; `deviceReady` is a separate field and
does not assert login, physical-device acceptance or entire-goal completion.

The human deferred Android connection and will explicitly start actual work
at night. `memory/NIGHT-ENVIRONMENT-20260930.md` owns the standalone resume guide.
`preflight-result.json` is the exact redacted stdout from fresh rehearsal round2.
`browser-readiness.json` and `power-readiness.json` describe separate observed
preparation checks. `portable-tooling.json` copies the setup record; actual ZIP
and binaries remain outside this Git root in the workspace maintenance directory.
Round1 found stale current records; they were corrected before fresh round2 passed.

The preparation savepoint also preserves already collected prior-scope child
evidence without rerunning or promoting it: controller continuity/fixed-body
prelaunch failures, read-only hosting analytics/synthetic security and Android
discovery. Root corpus transport artifacts are syntactically prepared but were
never executed; loopback delivery was blocked before source delivery. Old failure
records remain immutable. Raw private hosting responses remain excluded.

`curation.json` names exact safe QA files and their SHA256/bytes. Its own hash is
not recursively included. Root stages exact listed paths; no directory/glob adds.
