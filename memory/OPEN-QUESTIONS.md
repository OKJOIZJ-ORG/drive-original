# OPEN QUESTIONS — registered, not remembered

| ID | Question | Opened | Status |
|---|---|---|---|
| A-001 | Does the exact candidate pass actual iPhone Safari and standalone edge-back acceptance? | 2026-09-17 | OPEN; no physical iPhone session. Procedure and evidence owner: ACCEPTANCE-20260917.md. |
| A-002 | Do two independently authenticated physical devices converge through the real Google account? | 2026-09-17 | OPEN; synthetic contexts do not close this gate. Procedure: ACCEPTANCE-20260917.md. |
| A-003 | Does the hardened offline replay fixture pass with upstream requests explicitly blocked? | 2026-09-17 | CLOSED 2026-09-19: explicit upstream block, unchanged remote store/peer while offline, reconnection convergence and reload identity all passed. qa/release-1.21.0-acceptance/results.json; IMMERSIVE-20260919.md. This does not close real-device A-002. |
| A-004 | Does v1.21.0 maintain the intended session through actual Google expiry, sleep/wake and Safari/PWA renewal? | 2026-09-19 | OPEN; synthetic same-account renewal and stale-error isolation passed, but actual long-duration Google sessions were not exercised. IMMERSIVE-20260919.md. |
| A-005 | Which exact currently failing file version, browser/device and network condition will be the v2.0 discriminating sample? | 2026-09-19 | OPEN; the supplied screenshots prove compatibility mode was reached, not the first failed stage. Need a stable file ID/version or user-identifiable path plus PC/iPhone/PWA reproduction condition. |
| A-006 | If evidence requires architecture B or C, which operating condition is acceptable: always-on Windows/NAS/cloud host and new HTTPS origin/OAuth client, or signed native installation? | 2026-09-19 | OPEN; do not select or deploy B/C until same-file experiments show its marginal benefit and the user chooses the operating burden. |
| A-007 | May a disposable Drive folder/file be used later for live trash/move/readback/recovery acceptance? | 2026-09-19 | OPEN; current authorization is read-only/local-fixture. QA-MU-01~10 remains blocked for live proof without explicit write scope and a recoverable test target. |

## Readings in force — assumed, not decided

| ID | User's words (verbatim) | Our reading (`assumed`) | Breaks if wrong | Ends when | Relied on in |
|---|---|---|---|---|---|
