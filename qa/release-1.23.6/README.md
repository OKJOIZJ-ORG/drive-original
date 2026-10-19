# 1.23.6 operating verification — D094

D094 full review produced ten confirmed fixes (see `memory/SESSION-LOG.md` 2026-10-19); the user then explicitly asked to bump to 1.23.6, check in a browser, merge to main, push and deploy to the same production Worker. Runtime ab025b7f2ca6d91991dceadd3c2826a3f0316c6d, origin https://drive-original.jyw-drive.workers.dev/, Worker version 0b6180cc-e969-4b00-be54-d21e33f6ef40 (previous 7c761d33).

| Evidence | Verified scope |
|---|---|
| Product tests | 938/938 Node tests, app/SW syntax, diff whitespace, wrangler dry-run bundle |
| Local browser | Built `_site` served on localhost: v1.23.6, SW activated, cache `drive-original-shell-1.23.6`, license page renders. Only console error: 501 for auth POST on the static server (no Worker locally) |
| Deployment | Seven changed public assets uploaded (58 unchanged); materialized from committed HEAD |
| Served bytes | Seven changed public files 200 and Git-equal; five private paths 404 ([served](served.json)) |
| Backend continuity | Same Worker/name/jyw-drive subdomain; 11 bindings and 4 secret names equal before/after ([comparison](bindings-comparison.json)) |
| Auth | Anonymous credential POST with required headers 401/no-store; callback without pre-auth cookie 303 → `/?authError=transaction_invalid` |
| Redirect fix | Observed in built-in browser: SW-controlled page holds a `redirected` cached `licenses/index.html`; navigating to it now opens the license page at `/licenses/`, and `/index.html` resolves to the app at v1.23.6 |

Retained failures: the first deploy attempt stopped in materialization with `Extra or linked _site file` (Node reported nlink 2 for `media/video-q3-codec.mjs`; `fsutil hardlink list` then showed one link). Nothing was uploaded; the identical re-run passed the same guard. Wrangler was initially unauthenticated; the user logged in with reduced scopes (account:read user:read workers:write workers_scripts:write).

Not verified: signed-in account update/playback, likes preservation, speed restore on real retry, physical Android/iOS. No original media, auth/OAuth config, origin, Notion or automation change. Legacy Pages not republished.
