# Free candidate rc.8 delivery — 2026-09-28

Observed product `c49c97161fed72ad2a3b4494e156fdb8e1cbcaf9`, version `1.22.0-rc.8`, at https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/.

The existing `npm run deploy:candidate` workflow materialized committed public assets from `0846242` (the same product bytes as `c49c971`) and completed one deployment after the dry-run passed. Worker version `500506d1-d0f1-48e4-b213-ecb1b96d9bcf`, created `2026-09-28T01:08:48.673424Z`, was read back by exact ID. Auth bindings remain present and `CANDIDATE_DRIVE_WRITES_ENABLED=false`. No new service, billing, secret, scope, origin or production setting changed; no merge or push.

`qa/candidate-delivery-audit.cjs` compares the full product SHA against 19 public response bodies and 17 fresh service-worker shell-cache bodies. All match Git. Four private/internal routes return 404. Fresh anonymous Chrome remains read-only and unauthenticated, loads rc.8 offline, and reports zero page errors. Evidence is preserved separately at `qa/candidate-delivery-rc8/results.json`; the rc.6 report remains intact. An existing DevTools candidate tab was normally reloaded and independently showed rc.8, active SW control, no account and read-only mode.

## Acceptance and next work

This establishes public delivery, cold-cache and offline shell behavior only. The local auth/foreground/lifecycle results and reproduced failures are in `Q1-AUTH-20260928.md`. Current authenticated Drive playback, actual expiry/sleep recovery, physical iPhone/PWA media, complete state reconstruction and full-format acceptance remain open. A Google login request for the managed Chrome candidate is pending; local snapshot/comparator work continues without it. Candidate Drive writes stay disabled until V2-08A is proven.

## Recovery

Prior candidate Worker `7b2396d6-8a04-432b-8bc2-a7eda12752a0` serves rc.6/product `22f7271`; keep it for a normal candidate-only rollback if a regression is established. Use the exact version readback before retrying an uncertain deployment. Source recovery uses a new commit, without discarding existing work. Production Pages v1.21.0, OAuth client/appData, original media and paused automation remain unchanged.
