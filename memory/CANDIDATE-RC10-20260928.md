# Free candidate rc.10 delivery — 2026-09-28

Observed product 818712102d739eb68047913ad61e7afdae2cc0eb, version1.22.0-rc.10, at
https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/.

The existing free candidate workflow materialized committed public assets from
7aa4bc2e17182b94e68ceb16ae6fbd48f3563f1b, identical to product8187121, and completed one deployment.
Exact Worker85904e0a-ba28-4939-95d1-1375a626339b, created2026-09-28T02:22:45.648834Z, was independently read
back. Auth/asset bindings remain present and CANDIDATE_DRIVE_WRITES_ENABLED=false.
No new service, billing, secret, scope, origin or production setting changed.
No main merge, push or automation restart occurred.

## Observed delivery

qa/candidate-delivery-rc10/results.json compares the full product SHA against
19public response bodies and17fresh SW shell-cache bodies; all are Git-equal.
Four private/internal routes return404, cold/offline anonymous Chrome serves
rc.10 under SW control, candidate writes=false and page errors0. The maintained
audit command used full818712102d739eb68047913ad61e7afdae2cc0eb and the distinct
candidate-delivery-rc10 output, preserving rc.6/rc.8 reports.

A separate managed Chrome candidate tab independently shows rc.10, the fixed
retirement protocol, active SW control and read-only mode. Its generated state
capture stops at account_not_ready with writeAuthorization=false; no live
snapshot was obtained. The Google sign-in tab remains open separately. Safe
aggregate evidence is in managed-smoke.json; exact Worker binding names/types
and writes flag are in worker-version.json. No credential values are retained.

## Acceptance and next work

Q1-RETIREMENT-20260928.md and verification-rc10.json own local358Node/25state/
17auth/4retirement/16product/22functional/50cycles150seeks, source pinning and
limits. Delivery proves public/cache bytes and the anonymous shell, not current
Drive playback or provider expiry. Real account duration, legacy local replica,
state/origin comparison, priority/corpus/full formats, physical iPhone/PWA and
two authenticated devices remain open. Candidate Drive writes stay disabled
until V2-08A is proven. Continue existing read-only adapters after login.

## Recovery

Last verified candidate Worker500506d1-d0f1-48e4-b213-ecb1b96d9bcf serves
rc.8/productc49c97161fed72ad2a3b4494e156fdb8e1cbcaf9. Retain it for a normal
candidate-only rollback if a regression is established. Read back the exact
version before retrying an uncertain deployment. Source recovery uses a new
revert commit, preserving work; never hard reset, purge cookies or alter originals.
Production Pagesv1.21.0, OAuth client/appData and paused automation are unchanged.
