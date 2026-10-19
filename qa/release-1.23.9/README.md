# 1.23.9 operating verification — D097/D098

User request after the D097 report: "1.23.9로 올리고 main 병합·push·운영 배포까지 진행해줘." Runtime b5a5c1ffef8c1dcc9c15cf1ff228fde427ffb619 (main bbd45fb→b5a5c1f, fast-forward, pushed); final Worker version 009e4b6c-6396-467e-ae75-87eba3504771 (previous b5aaf144) at https://drive-original.jyw-drive.workers.dev/. Ships the D097 simple-is-best UI pass (`qa/simple-ui-20261019`).

| Evidence | Verified scope |
|---|---|
| Product tests | 943/943, app/SW syntax |
| Deployment | build-pages → materialize from committed HEAD → wrangler deploy (see retained failure) |
| Served bytes | 65/65 public files 200 and equal to the materialized committed bytes; five private paths 404 ([served](served.json)) |
| Backend continuity | Same Worker/name/subdomain; 11 bindings (values/classes) and 4 secret names equal ([comparison](bindings-comparison.json)) |
| Auth endpoints | Anonymous credential POST with app headers 401/no-store; `/auth/google/start` 303 to Google with `__Host-` pre-auth cookie (Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=600); callback without cookie 303 → `/?authError=transaction_invalid`, cookie expired |
| Actual normal Chrome | Own tab in the user's profile, closed after: v1.23.9, SW active, only cache `drive-original-shell-1.23.9`; same signed-in account with usable credential; connection badge hidden (state online); 23 root folders; favorites 20 cards, no ⋯ glyph; smallest liked clip via card click: original range, first frame 5989ms after click, 68 frames, error 0; two relative seeks showed one side hint "20초" that faded; control-bar next switched file (~1.25s); player closed, rate 1, filter 전체 |

Retained failure: the first chained run's materialize step crashed (same Windows transient as 1.23.8) and the pipeline still deployed the build-pages copy (version d5086bfd). Served comparison then found `media/video-q3-codec.mjs` as the CRLF working-tree bytes (sha256 32561bde…, 13112 B) instead of the committed blob (9f6f66f2…, 13110 B). Materialize was re-run successfully and redeployed; no asset needed uploading (the committed-blob asset already existed, consistent with 1.23.8 serving it), and the file is now 9f6f66f2…. Note: `licenses/video-q3-source-manifest.json` pins 32561bde… (the CRLF bytes), i.e. the manifest and the Git blob disagree; this predates the release and is recorded in OPEN-QUESTIONS.

Not verified: physical Android/iOS, WebKit, fresh OAuth consent. No original media, auth/OAuth config, origin, Notion or automation change.
