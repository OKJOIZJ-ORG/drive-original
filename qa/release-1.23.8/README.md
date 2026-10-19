# 1.23.8 operating verification — D096

User request after the merged refactor: "배포까지해봐." Runtime f85f1c95974191f4d23684bbd281b6bf80e29060; Worker version b5aaf144-6bd3-463f-a952-0b916e2eca43 (previous 886ccdba) at https://drive-original.jyw-drive.workers.dev/. This release ships the D096 behavior-preserving refactor, including Worker/auth code (shared cookie helpers, shared alarm reconciliation).

| Evidence | Verified scope |
|---|---|
| Product tests | 940/940 (all 938 pre-refactor tests by name + 2 new), app/SW syntax |
| Deployment | Eleven changed public assets uploaded (54 unchanged) plus Worker script; materialized byte-for-byte from committed HEAD |
| Served bytes | Eleven changed files 200 and Git-equal; five private paths 404 ([served](served.json)) |
| Backend continuity | Same Worker/name/subdomain; 11 bindings and 4 secret names equal ([comparison](bindings-comparison.json)) |
| Auth endpoints | Anonymous credential 401/no-store; `/auth/google/start` 303 to Google with S256 PKCE and `__Host-` pre-auth cookie (Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=600); callback without cookie 303 → `/?authError=transaction_invalid` and expires the pre-auth cookie |
| Actual normal Chrome | Own tab, closed after: v1.23.8, SW active, old 1.23.7 cache removed after activation; same signed-in account; forced session-credential refresh through the new Worker succeeded; 20 likes; 23 root folders; folder open and up-button return; favorites 20 cards; smallest liked clip first frame 5383ms after click, 56 frames, error 0; control-bar next changed file; player closed, rate 1, filter 전체 |

Retained failures: the scripted deploy (build → materialize → deploy) stopped twice at the materialization guard (`Extra or linked _site file`; Node reported nlink 2 on media/general-player.mjs, general-timeline.mjs and subtitle-track.mjs right after build-pages copied them; `fsutil hardlink list` showed one link and nlink read 1 seconds later). Nothing uploaded. The same three steps were then run separately with an 8 s pause after build-pages; the unchanged guard passed and materialized byte-for-byte. Cause UNKNOWN (Windows file system transient after copy); scripts unchanged.

Not verified: physical Android/iOS, WebKit, a full fresh OAuth login (consent flow not exercised). No original media, auth/OAuth config, origin, Notion or automation change.
