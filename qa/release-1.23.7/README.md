# 1.23.7 operating verification — D095

User request: "UI 개선을 1.23.7로 버전 올리고 main 병합, push, 같은 운영 Worker에 배포한 뒤 확인해줘". Runtime 550c78903484b347bc42c9f542f75859420d76a5; Worker version 886ccdba-4558-42bd-99b9-cfce31e67082 (previous 0b6180cc) at https://drive-original.jyw-drive.workers.dev/.

| Evidence | Verified scope |
|---|---|
| Product tests | 938/938, app/SW syntax |
| UI review | 40 demo states before/after, no axe violations/overflow/page errors after ([review](../uiux-review-20261019/README.md)) |
| Deployment | Five changed public assets uploaded (60 unchanged), materialized from committed HEAD |
| Served bytes | Five changed files 200 and Git-equal; five private paths 404 ([served](served.json)) |
| Backend continuity | Same Worker/name/subdomain; 11 bindings, 4 secret names equal ([comparison](bindings-comparison.json)) |
| Auth | Anonymous credential with required headers 401/no-store |
| Actual normal Chrome | Own tab, closed after: auto-updated to v1.23.7, SW active, cache 1.23.7; same signed-in account; 20 likes; 23 root folders, chevron 16×16, no `.folder-meta`; refresh aria-label; disconnect danger-text; favorites 20 cards with no generic status label; smallest liked clip first frame 5181ms after click, 55 frames, error 0; player closed and filter restored to 전체 |

Retained failure: first deploy stopped at the materialization guard; before the re-run, Node reported nlink 2 for the five changed files and media/video-q3-codec.mjs right after build-pages. The re-run materialized byte-for-byte and passed; same pattern as 1.23.6. Nothing was uploaded by the failed attempt. Cause UNKNOWN (likely Windows file system behaviour after copy).

Not verified: physical Android/iOS, WebKit. No original media, auth/OAuth config, origin, Notion or automation change.
