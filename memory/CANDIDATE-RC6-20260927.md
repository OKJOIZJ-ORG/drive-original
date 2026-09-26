# Free candidate rc.6 delivery — 2026-09-27

Observed product commit22f7271 at https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/.
Deployed once using the existing npm deploy:candidate workflow after clean commit, public allowlist rebuild/materialization and no-binding dry-run. Worker version7b2396d6-8a04-432b-8bc2-a7eda12752a0 created2026-09-26T17:01:52.159Z; version readback confirms auth bindings and CANDIDATE_DRIVE_WRITES_ENABLED=false. No new service, billing/card, secret, scope or origin change. Production Pages v1.21.0 remains untouched; no merge/push.

qa/candidate-delivery-audit.cjs with full product SHA verifies19public GET bodies exactly against Git and4internal routes404. A fresh isolated Chrome context installs the SW, remains unauthenticated/read-only, verifies17public shell-cache bodies against Git and reloads rc.6 offline with0pageerrors. The SW script is browser-owned, not itself an app-shell cache entry. Report: qa/candidate-delivery/results.json. The initial public module request timed out; qa/candidate-delivery/asset-timeout.redacted.json preserves that attempt. Final full read passed; no service reliability claim.

The existing isolated DevTools tab initially remained uncontrolled after ignore-cache reload with an update waiting; normal reload then showed rc.6 controlled with only rc.6 shell cache. This is not an authenticated iPhone upgrade test and no profile/cookie purge was used.

## Remaining acceptance

Local actual-original app and native preservation evidence is in Q1-ROUTING-20260927.md and Q1-PRIORITY-20260927.md. Public delivery is NOT current authenticated Drive playback, token-expiry/sleep recovery, physical iPhone/PWA, audibility/color, total memory or full-format acceptance. Candidate Drive writes remain blocked pending V2-08A snapshot/read/compare. Next independent READY work: V2-06B fault/lifecycle then V2-08A migration. The earlier unexplained299s local source-read failure remains open.

## Device check when available

Open the candidate above and confirm1.22.0-rc.6; open the priority file and seek to the middle/near end without Google iframe; terminate/reopen the home-screen app and confirm connection/list persistence. These are requests for observations, not completed checks or device control authority.

## Recovery

Prior candidate Worker28d2a9fc-730e-48d4-b060-8e49554a8c7b serves product3597e63(rc.4); retain it for normal candidate-only rollback if a deployment defect is established. Do not repeat an uncertain deploy before remote readback. Source rollback uses a new commit, never hard reset. Auth/client/appData/originals and production stay untouched; no credential revoke or cookie purge.
