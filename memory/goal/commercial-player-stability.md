# Goal — Commercial-grade player and library stability

## Goal

Bring Drive Original's mobile and desktop media-library experience to a commercially credible level across gesture navigation, playback controls, dialogs, authentication, streaming, thumbnails, bulk actions, performance, and latent-defect recovery.

## Definition of done

- Clear, axis-locked mobile gestures commit only after deliberate movement and recover cleanly from cancellation, multi-touch, rapid repetition, and reduced-motion mode.
- Desktop playback controls are compact, coherent, keyboard-accessible, frame-steppable, and unobtrusive during viewing.
- Media selects one evidence-backed original-byte route without duplicate transfer: direct progressive source delivery starts before a full download, while any bounded cache is a recovery/seek optimization rather than the default first-frame prerequisite; authentication recovery preserves the active route and stale work is cancelled.
- Vertical random playback has a complete-population spatial deck with two assigned neighbours above and below; horizontal playback preserves its session order; one decoder is reused across transitions.
- Google authentication has one request coordinator, stale-response protection, a user-action recovery path, and request-scoped service-worker token/error handling.
- Long press enters multi-select on touch; desktop has an explicit selection affordance; bulk delete and folder move are safe, count-aware, and reconcile partial failures.
- Thumbnail work is bounded, cancellable, deduplicated, viewport-aware, and measured against the existing 240-card virtual window; media startup must not spend bytes on speculative bodies that cannot be reused.
- Dialogs and default UI have consistent hierarchy, focus behavior, touch targets, loading/empty/error states, and reduced-motion behavior.
- Targeted automated tests, browser scenarios at mobile and desktop sizes, static checks, and a fresh-tree release comparison all pass before deployment.

## Mobilization

- **confirmed:** D-001 through D-034 define the standing product contracts; D-033 and D-034 add the original-quality recovery ladder and spatial shorts deck.
- **historical baseline:** v1.15.0 was the clean starting point; v1.16.0 is now released from `6a669fba4441e53b478dc272989c49155ac6803b`.
- **historical baseline:** `node --test tests/app.test.js tests/static.test.js` passed 15/15 before the stabilization work; the released suite now passes 40/40.
- **historical gap, resolved:** the service worker did not classify upstream media errors while the app listened for a message that was never sent.
- **historical gap, resolved:** media prefetch concurrency was released at response headers and did not bound active response bodies; the non-reusable body prefetch was removed.
- **historical gap, resolved:** OAuth refresh had three competing entry paths and no shared in-flight promise.
- **historical baseline:** video playback failure could trigger uncontrolled full-file Blob buffering. The current implementation replaces that with writable-OPFS detection and bounded-memory policy.
- **historical gap, resolved:** mobile swipe committed at 45px or 0.15px/ms without a dominance ratio or touch-cancel path.
- **unknown:** real-account Google playback behavior, mobile Safari behavior, and multi-thousand-item performance after the new changes require browser/device verification.
- **confirmed 2026-09-16:** D-035 tightens the original-quality ladder: only after all viable original-byte paths are exhausted may the app automatically enter the in-app Google compatibility player; authentication recovery remains in-app and external Drive navigation remains manual.
- **observed 2026-09-16:** v1.16.0 still routes a second 5xx, generic proxy errors, and some ambiguous media failures to compatibility preview before the complete original recovery ladder is exhausted. Range `200`/`206` integrity and `416` are not yet explicit app states.

## Terrain

- `app.js`: application state, Drive API/auth, virtualized cards, thumbnails, player, gestures, bulk mutations.
- `sw.js`: authenticated Range proxy, token exchange, upstream error mapping, cancellation.
- `index.html`: player, dialogs, bulk-action surfaces and accessible names.
- `styles.css`: responsive player controls, cards, selection state, dialogs, reduced motion.
- `tests/app.test.js`, `tests/static.test.js`: deterministic state/DOM contracts and regression coverage.

## Build order

1. Authentication, request generations, service-worker Range/error recovery, cancellation, and a policy-controlled OPFS/memory original fallback.
2. Gesture state machine, transition cancellation, playback readiness, frame stepping, PC control consolidation.
3. Multi-select state, long-press/pointer interactions, bulk delete/move with partial-failure reporting.
4. Thumbnail/prefetch scheduler, rendering priority, dialog/default-UI polish, accessibility.
5. Automated regression tests, desktop/mobile browser scenarios, performance/network inspection, independent review.
6. Version/docs/product truth, commit, merge to `main`, push, GitHub Pages byte verification, ZIP and Notion maintenance record.

## Current extension — v1.17.0 original-quality hardening

1. `named-unfilled`: centralize playback modes and failure causes so every automatic transition is deterministic. Lead: D-033/D-035 and `app.js`.
2. `named-unfilled`: validate upstream Range semantics and carry request/session evidence from `sw.js` to the active player.
3. `named-unfilled`: stream complete originals to writable OPFS, enforce bounded-memory limits, and clean every stale artifact.
4. `named-unfilled`: make quality labels evidence-based and give active playback priority over background media work.
5. `named-unfilled`: add deterministic fault coverage, authenticated browser evidence where available, independent diff review, and the standing release/Pages/Notion proof.

## Current extension — v1.18.0 authentication, thumbnails, and player polish

1. `satisfied`: ship the user-supplied OAuth client ID as the effective default while preserving a self-host override and never opening a login popup without a user gesture.
2. `satisfied`: render bounded-concurrency, non-animating GIF card frames with a static placeholder only on failure; restore the user-confirmed historical blue-dot icon asset across every icon surface.
3. `satisfied`: implement D-039's size- and capability-gated OPFS-first video route with a non-parallel Range fallback, exact cleanup, and evidence-backed quality labels.
4. `satisfied`: freeze swipe targets at axis lock, align commit thresholds, retain the outgoing/neighbor visual until the first new frame is presented, and hide both mobile overlay edges on idle.
5. `satisfied`: reduce desktop playback chrome to one status hierarchy and one compact control rail, move destructive/detail actions behind disclosure, and keep frame stepping visible only while paused.
6. `satisfied`: extend automated, desktop/mobile browser, authenticated-Drive-where-available, packaging, Pages byte, and maintenance-record verification before release.

## Historical done check — v1.16.0

Satisfied. Evidence: 40/40 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 mobile demo interaction; deliberate/sub-threshold and committed synthetic four-direction touch scenarios; prior local Lighthouse 100/100/100/100 and LCP 318ms/CLS 0.00 baseline; successful Pages run `35085992727`; five live core assets byte-equal to release commit `6a669fb`; matching 114,471-byte release ZIPs; and re-fetched Notion maintenance data with both packages attached. Real-account Google behavior and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Done check — v1.17.0

Satisfied. Evidence: 52/52 Node tests; `node --check` for app and worker; `git diff --check`; independent main-diff review with no P1/P2/P3 findings; two-round zero-context rehearsal with the first round's label findings fixed and the second round clean; desktop and 390×844 mobile demo readback with no console warnings/errors or horizontal overflow; mobile local LCP 414ms, CLS 0.00, and Lighthouse 100/100/100/100; successful Pages run `35095971626`; five live core assets byte-equal to release commit `f53cde6`; matching 119,318-byte release ZIPs with every file equal to its Git blob; and re-fetched Notion maintenance data with both packages attached. Authenticated Drive playback and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Done check — v1.18.0

Satisfied. Evidence: 64/64 Node tests; `node --check` for app and worker; `git diff --check`; independent full-diff review with no P1/P2/P3 findings; desktop and 390×844 browser readback with v1.18.0 assets, no console warnings, and no horizontal overflow; mobile synchronized idle chrome and expanded-tray timing; actual 1.78MiB GIF and local MP4 frame-handoff trials; successful Pages run `35107815036`; five live core assets byte-equal to release commit `cf31107`; matching 101,876-byte release ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Authenticated Drive playback, the deployment origin's Google OAuth registration, and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Current extension — v1.18.1 authenticated Range recovery

1. `satisfied`: distinguish a genuinely invalid 206 from a valid Drive 206 whose `Content-Range` is hidden by CORS.
2. `satisfied`: reconstruct only exact, known-size/`Content-Length`-proven intervals and keep every ambiguous response fail-closed.
3. `satisfied`: cover the app-to-worker size contract and bounded/open/suffix/EOF/HEAD/error edges deterministically.
4. `satisfied`: deploy and replay real large Drive files without whole-file confirmation or compatibility downgrade.

## Done check — v1.18.1

Satisfied. Evidence: 68/68 Node tests; `node --check` for app and worker; `git diff --check`; independent Sol review with no remaining P1/P2/P3; successful Pages run `35110287933`; five live core assets byte-equal to release commit `cac0d06`; authenticated 207MB and 1.01GB original Range playback with reconstructed, satisfied 206 evidence and no compatibility downgrade; no v1.18.1 console warnings/errors; matching 102,418-byte ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Physical iPhone Safari remains an explicit device-specific verification boundary.

## Current extension — v1.19.0 account media state and favorites

1. `satisfied`: persist viewed timestamps and favorite tombstones in one private Drive app-data document with an account-keyed local cache and deterministic merge semantics.
2. `satisfied`: prefer unseen media before watched media in the complete-population vertical random deck.
3. `satisfied`: add coherent card, desktop-player, mobile-player, and double-tap favorite controls plus an all-folder favorites projection.
4. `satisfied`: add mobile left-edge library back navigation, repair first-level folder back, and remove stale video play controls from image/GIF presentation.
5. `satisfied`: complete tests, responsive browser QA, Pages byte proof, Git-blob-identical packages, and Notion readback.

## Done check — v1.19.0

Satisfied. Evidence: 78/78 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 demo interaction with cross-folder favorite/unfavorite and zero console warnings/errors; deterministic double-tap, edge-swipe, account merge/upload, unseen-deck, GIF-control, and favorites tests; successful Pages run `35116311314`; five live core assets byte-equal to release commit `51e5a28`; matching 110,591-byte ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Actual two-device propagation and physical iPhone Safari touch gestures remain explicit verification boundaries, not locally proven facts.

## Current extension — v1.19.1 favorites and UI hardening

1. `satisfied`: request the explicit Drive app-data OAuth scope, migrate away from legacy scope tokens once, and retry only transient state-write failures within a bounded budget.
2. `satisfied`: remove the whole-Drive scan dependency from favorites by resolving cached media first and querying only missing liked file IDs, with partial-failure preservation and stale-request cancellation.
3. `satisfied`: centralize library status ownership so old errors cannot survive or reappear after changing a filter, folder, or request generation.
4. `satisfied`: rebalance the mobile four-filter row, stack overflow actions vertically above `⋯`, reduce double-tap feedback to an icon-only heart, and remove the duplicate root breadcrumb discovered during full UI QA.
5. `satisfied locally`: pass the complete 84-test suite three consecutive times, JavaScript syntax checks, diff check, 390×844 mobile interaction/geometry, 1280×800 desktop readback, and zero browser warnings/errors.
6. `satisfied`: commit, publish to `main`, prove Pages bytes, rebuild Git-blob-identical ZIPs, and update/re-fetch the maintenance record.

## Done check — v1.19.1

Satisfied. Evidence: 84/84 Node tests passing three consecutive full runs; `node --check` for app and worker; `git diff --check`; 390×844 mobile and 1280×800 desktop demo geometry/interaction with zero console warnings/errors; deterministic OAuth scope migration, direct favorite lookup, partial-result preservation, stale-status ownership, breadcrumb, GIF, double-tap, and edge-swipe coverage; successful Pages run `35121272050`; five live core assets byte-equal to release commit `c43b218`; matching 112,769-byte release ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Actual two-device propagation, production-account OAuth reconsent/direct lookup, and physical iPhone Safari remain explicit verification boundaries.

## v1.20.0 audit cut — 2026-09-17

D-043/D-044/D-045 extend the original acceptance criteria rather than relaxing them. Source, unit, browser fixture, cross-browser visual and new edge navigation evidence are recorded in ../AUDIT-20260917.md. Runtime design remains static and original-byte-first; tests and operational source are excluded from the public Pages artifact. Final production and package verification is recorded in ../RELEASE-1.20.0.md. Physical iPhone OS gestures and live multi-device propagation remain distinct evidence boundaries.

## Current extension — v3.0 integrated implementation map (2026-09-19)

### Authority and current finding

D-050 extends this existing goal instead of creating a parallel plan. The single active requirements and execution source is `memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md` version 3.0 (SHA-256 `A57C7109A540BE09F351ACF582E0F9BA6A6A556F92E943A6CB6804CA2576B564`). The earlier v2.0 worker spec and v1.0 protocol remain historical sources only.

The 2026-09-19 local baseline passes 144/144 Node tests and JavaScript syntax checks at `ed1f90a`. A focused three-case run confirms that the current worker distinguishes HTTP authentication, status and Range-integrity failures, but the browser path labels `MediaError` code 4 only as combined `codec or container`. The supplied Google iframe screenshot occurs after that unresolved transition and does not identify the first failure. No architecture is adopted from this evidence.

### Atomic execution backlog

Only one task may be edited at a time. `READY` identifies the next bounded loop; later rows remain blocked by the named predecessor or approval rather than being treated as independent mini-products.

| Task / WP / status | User-visible result or deciding question | Spec and acceptance | Prerequisite | Edit boundary | Verification | Recovery |
|---|---|---|---|---|---|---|
| `V2-00A` / WP-00 / `IMPLEMENTED_LOCAL` | Which source, version, branch and authority actually govern this run? | §§01,03,19; G0 | Current user instruction | Branch and project records only | attachment hashes; Git root/HEAD/dirty readback; current 144-test baseline | Restore outgoing checkpoint from its archive; product source is untouched |
| `V2-01A` / WP-01 / `IMPLEMENTED_LOCAL` | Which failure layers can v1.21.0 already distinguish? | §§04,10.6,17,18; QA-TR-05/08, QA-AU-05 | V2-00A | Read-only source inspection and existing fixtures | focused auth/HTTP/Range/media-error tests 3/3 plus full 144/144 | No runtime change; remove only task records if invalidated |
| `V2-01B` / WP-01 / `IMPLEMENTED_LOCAL` | A single correlated trace says the first terminal stage: credential, headers, first byte/body progress, media parse/decode boundary, first frame or seek. | OBS-01/02, EXP-03/04; QA-TR-08/09, QA-AU-01/05, QA-ST-03 | V2-01A | Local-only `qa/`/tests and the smallest inert diagnostic hook if unavoidable; no recovery-policy or UI change | 12/12 stage fixtures, full 153/153 suite, syntax/diff/build allowlist and independent clean review at `fe9c359` | Revert `fe9c359`; diagnostics stay out of the public allowlist |
| `V2-01C` / WP-01 / `IMPLEMENTED_LOCAL` | On the exact failing file, where is the first failed stage and what is the stable file version? | BUG-01/02/04/07, EXP-01/02; QA-TR-01/02/08/12, QA-AU-01/06 | V2-01B and supplied exact sample/device observations | Read-only trace; no Drive mutation or cookie clearing | two current-app reproductions completed; content revision/SHA-256/size stable; both reached full body then `MediaError` 4 → `container-or-decoder` | Delete private trace after the committed redacted record; no source-media mutation |
| `V2-02A` / WP-02 / `BLOCKED(active V2-07A priority)` | Compatibility/Drive-open actions live inside the one dismissible bottom control owner, not a permanent island. | BUG-03; UI-02/04; QA-UI-01~06 | V2-01B | `index.html`, `styles.css`, player UI owner in `app.js`; no transport change | before/after mobile+desktop states, keyboard/VoiceOver entry, dismiss/retry/external-open regressions | Revert isolated UI commit; retain existing manual Drive escape path |
| `V2-02B` / WP-02 / `BLOCKED(active V2-07A priority)` | Normal sync/original preparation stays silent; actionable errors remain short and owned by the current request. | BUG-05, UI-01/03/10, STATE-07; QA-UI-10, QA-ST-03 | V2-01B | status ownership and viewed-event timing only; no account schema migration | stale-status, failed-open-not-viewed, actual display/start, screen-size regression | Feature-level revert; do not rewrite existing viewed history |
| `V2-03A` / WP-03 / `IMPLEMENTED_LOCAL` | Does an independent read-only API reader succeed on the same ranges where the current SW path fails? | ARCH-01~04, E01/E05 | Exact sample trace | Local read-only comparator; no new origin/daemon | same content revision/fingerprint, sampled front/mid/tail all 206, exact lengths and digest equality | Remove comparator and bounded cache; no source mutation |
| `V2-03B` / WP-03 / `IMPLEMENTED_LOCAL` | If transfer is good, does native playback or container-only remux solve the same sample without video re-encode? | E02/E03/E04, Q-01~06, MEDIA-01/02/05/08; QA-FM-02~04 | V2-03A proves post-transport failure | Local spike/output outside Drive; no deployed native app or original overwrite | exact Q1 copy mappings and stream probes; decoded early/mid/end equality; secured Chrome v2-03b.2 frame/seek/audio/206 evidence | Derived media and servers removed; source fingerprint preserved |
| `V2-03C` / WP-03 / `IMPLEMENTED_LOCAL` | Adopt the minimum direct-data plus B-auth responsibility split with explicit benefit, cost, host, data migration and exit path; add media relay only if same-file evidence requires it. | ARCH-01~05; G2 | Same-sample V2-03A/B evidence under D-050 | Decision record only | D-051 and `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`; all adoption fields, losing options and rollback recorded | Supersede, never rewrite, if later evidence changes the decision |
| `V2-04A` / WP-04 / `IMPLEMENTED_LOCAL` | Token expiry/reconnect preserves the correct account/view and has one retry owner. | AUTH-01~08; QA-AU-01~09 | Approved architecture | Chosen auth owner and public interface; do not run two auth models | `ed8b619`, `memory/architecture/V2-04A-AUTH-CONTRACT.md`; deterministic expiry/late 401/concurrency/account switch/offline/restart/retention fixtures; full 187/187 | Revert `ed8b619`; production Pages v1.21.0 and external configuration remain untouched |
| `V2-04B` / WP-04 / `IN_PROGRESS(auth/PWA accepted; A-004 duration open)` | Bind the local contract to one no-cost same-origin candidate and determine whether real login, expiry, sleep/wake and PWA cookie behavior match it. | E06, EXP-04; QA-AU-01/02/06/07/09, QA-TR-12 | V2-04A; actual account/device window; A-008/A-009 action-time checks | Cloudflare host adapters/bindings and reversible candidate-only Google origin/redirect/scope settings; no media proxy, production replacement, global logout or cookie purge | `1.22.0-rc.4` deployed identity/config and PC credential/listing verified; user-confirmed physical iPhone PWA auth return, real list and full-relaunch persistence; actual expiry/sleep-wake remains A-004 | Revert candidate code/config additions and remove candidate origin/redirect if abandoned; existing Pages v1.21.0 remains rollback |
| `V2-05A` / WP-05 / `BLOCKED(active V2-07A priority)` | A local operation ledger never turns response loss or partial failure into guessed success. | MUT-01~10, EXP-05; QA-MU-03~08 | Failure-stage contract | Repository/operation interface and synthetic store only | applied-before-loss, failed-before-apply, 403/429, account switch, duplicate operation ID | Revert ledger commit and restore fixture snapshot |
| `V2-05B` / WP-05 / `BLOCKED(V2-05A,V2-04A)` | Approved trash/move operations match independent remote GET and can be restored. | MUT-01~10; QA-MU-01~10 | V2-05A, V2-04A and a newly created allowlisted disposable target | Named test IDs only; never permanent delete | pre-state, request, response, independent readback, G:/web distinction and recovery readback | Restore recorded parents/trashed state only after checking current remote state |
| `V2-06A` / WP-06 / `IMPLEMENTED_LOCAL` (runtime through `14c501a`; browser evidence through seek transport `b2e6afe`) | Q0 starts before full download and separates credential/header/byte/body/frame/seek stalls. | TR-01~10; QA-TR-01~11 | Approved reader/auth owners | Reader, bounded cache and single watchdog owner | range edges, tail index, 2/4 GiB sparse offsets, stalls, rapid seek/close and quota/resource classification; full 259/259 plus browser 20/20 | Feature flag or commit revert; bounded cache cleanup by file/version lease |
| `V2-06B` / WP-06 / `BLOCKED(active V2-07A priority; prerequisite satisfied)` | Long playback survives token boundaries, source changes and foreground return without mixing bytes. | TR-07~10; QA-TR-09/10/12 | V2-06A and long-run environment | Lifecycle/retry integration only | long synthetic then actual playback, expiry-edge seek and background/foreground | Cancel active work and invalidate only affected file/version cache |
| `V2-07A` / WP-07 / `READY(metadata-only identity reconciliation; live front sniff VERIFIED)` | What container/track/device combinations actually exist and which samples are high risk? | CORPUS-01~07, MEDIA-01; QA-FM-01/05~09 | Stable file identity and read access | Metadata inventory, bounded probes, private manifest; no bulk conversion | priority `4195245`/`4a02391`; inventory `e928f7b`/`78b1b14`; 38-object representative cover `dd30d2b`/`56248e5`; bounded core `31bb099`/`f31c870`; browser adapter `e0f8228`; live front sniff 37 success plus one pre-body identity mismatch; reconcile only metadata next without replaying successful body reads | Delete probes/derived private manifest; originals remain read-only |
| `V2-07B` / WP-07 / `BLOCKED(V2-06A,V2-07A)` | Each failing combination takes the lowest necessary Q0/Q1/Q2/Q3 path with truthful labels. | Q-01~06, MEDIA-01~08; QA-FM-01~10 | Reader and corpus matrix | Selected remux/audio transform/last-resort video transform only | first/mid/end seek, tracks/rotation/VFR/HDR evidence, no silent quality downgrade | Remove derived representations and fall back to the last verified higher-quality path |
| `V2-08A` / WP-08 / `BLOCKED(active V2-07A priority)` | Likes/unlikes/viewed survive architecture/origin change without empty overwrite. | STATE-01~07; QA-AU-10, QA-ST-01~03 | Chosen origin/auth and state semantics | Snapshot, migration adapter and reversible schema read path | counts/tombstones/writer IDs before/after; two-context offline merge, then approved devices | Restore snapshot/read-old path; never delete legacy appData during rollout |
| `V2-09A` / WP-09 / `BLOCKED(V2-02,05A,06,07,08)` | Integrated desktop/mobile flows pass without resource growth, cache mixing or private-data exposure. | §§15~18,20; QA-UI-01~10, QA-LF-01, QA-SE-01~03, QA-SW-01 | Locally complete units | Integration/QA only; no release metadata yet | browser engines/viewports, 50-cycle lifecycle, malformed media/storage full, old/new SW | Revert the first failing unit; keep fixed-SHA evidence immutable |
| `V2-09B` / WP-09 / `BLOCKED(actual devices/account)` | Actual PC, iPhone Safari/PWA and two authenticated devices meet the live gates. | §20.7; A-001/A-002/A-004; G5 | V2-09A and user device window | Approved live read paths; writes only through V2-05B | device/OS/browser/file version and evidence per acceptance row | Remove test session/derived cache; preserve account and original files |
| `V2-10A` / WP-10 / `BLOCKED(V2-09)` | A fixed candidate has independent review, full acceptance states and a tested rollback. | REL-01~05, §22; all QA IDs | All required local/live gates or explicit blocked states | Version/docs/package candidate; no push/deploy | clean fixed SHA, full tests, public allowlist, package/blob equality, review findings closed | Discard candidate package/branch; no production impact |
| `V2-10B` / WP-10 / `BLOCKED(separate release approval)` | Approved production serves the exact candidate and passes real smoke; otherwise code and deployment remain separate. | REL-03~05; G6/G7 | V2-10A and explicit merge/push/deploy authority | Approved source/Pages/broker/native target only | serving SHA/assets/protocol, cold/update/offline, actual account/media smoke, rollback readback | Publish prior verified build through normal non-force path; preserve data schemas |

Acceptance coverage is preserved as follows: WP-06 owns QA-TR-01~12, WP-07 owns QA-FM-01~10, WP-04/WP-08 own QA-AU-01~10 and QA-ST-01~03, WP-05 owns QA-MU-01~10, and WP-02/WP-09 own QA-UI-01~10, QA-LF-01, QA-SE-01~03 and QA-SW-01. WP-10 reports every row without converting `blocked` into `passed`.

### Dependency spine and architecture gates

```text
V2-00A → V2-01A → V2-01B ─┬→ V2-01C → V2-03A → [V2-03B if transport is sound] → V2-03C
                            ├→ V2-02A/B
                            └→ V2-05A
V2-03C → V2-04A → V2-06A → V2-06B
       └→ V2-08A        V2-07A → V2-07B
V2-05A + V2-02 + V2-04 + V2-06 + V2-07 + V2-08 → V2-09A
live approvals: V2-04B + V2-05B + V2-09B → V2-10A → V2-10B
```

- **A stays viable** if the exact sample fails inside the current token/SW/range/lifecycle implementation and a corrected static path satisfies the required Q0 and session gates without hidden iframe dependence.
- **B is adopted only if** the same-file independent reader/broker path materially fixes the failure and the user accepts an available HTTPS host, its uptime/traffic/storage burden, OAuth/origin migration and rollback plan.
- **C is adopted or added only if** transport is verified, the native engine succeeds on required files that browser Q0/Q1/Q2 cannot cover economically, and the user accepts platform signing/install/update maintenance.
- **Q1/Q2 are media plans, not architecture votes.** Container-only remux or audio-only conversion is selected per probed file combination. Q3 remains the evidence-based last path.

### First READY task exit — V2-01B

V2-01B ends only when a deterministic local run emits one redacted, session-correlated timeline for each injected boundary: missing/expired credential, headers failure/delay, first-byte delay, body no-progress, valid transport followed by media parse/decode failure, playable first frame and cancellation by a newer session. The classifier must report the unresolved browser event honestly as `container-or-decoder` until a probe or E02/E03 separates it. No fixture credential/media is public, no fallback policy changes, stale events cannot mutate the new session, JavaScript syntax and the full Node suite pass, and removal of the diagnostic task restores the prior product behavior exactly.

Closed locally at `fe9c359`: 12/12 deterministic scenarios and 153/153 full tests passed; syntax, diff and public allowlist checks passed; independent review found no material issue. The opt-in trace preserves late cancellation without mutating a newer session and distinguishes metadata, first decoded frame and terminal `container-or-decoder`. Real Drive/browser/device proof moves to V2-01C and is not claimed here.

### Exact-sample exit — V2-01C

Closed locally with `qa/player-stage-v2-01c/results.redacted.json`: two ordinary Chrome runs on the supplied read-only Drive sample each selected `original-opfs`, received HTTP 200 and exactly 208,001,508/208,001,508 bytes, then produced media-element code 4 and terminal `container-or-decoder` before the app selected compatibility. The first terminal failure is therefore after complete original transfer, at the browser media parse/decode boundary; Google iframe entry is not counted as success. The original was not changed, shared or uploaded.

Drive `files.version` advanced from 15 to 19 while `headRevisionId`, SHA-256, size and `modifiedTime` remained unchanged and `viewedByMeTime` advanced after compatibility preview. Google documents `files.version` as covering every server-side change, including changes not visible to the user, so it is recorded but not treated as a content-only revision. The private comparison identity for this binary sample is file ID plus stable `headRevisionId`, SHA-256 and size; the committed evidence omits all private values. V2-03A is now the sole READY unit.

### Reader-comparator exit — V2-03A

Closed locally with `qa/v2-03a-range-comparator/`: a bounded, cancellable comparator validates one private identity before and after the run, reads the front/middle/tail 65,536-byte intervals through the current service worker and an independent official Drive API request, and records status, exact/opaque range semantics, length, stage timing and in-memory SHA-256 equality without emitting private identity values, tokens, URLs or bytes. Its 16 deterministic tests cover equality, mismatch, status/range failures, CORS-hidden `Content-Range`, identity changes, cancellation during raw readers and reader/overall identity verification, response-body cleanup and redaction; all 16 passed. The exact v2-03a.4 module was imported from a temporary local source server into the authenticated app for the recorded result, then that server was stopped. The unchanged product suite passed 153/153, syntax/diff checks passed, and the public `_site` remained the same 12 allowlisted files.

The authenticated live run kept one stable private identity before and after comparison. All three SW reads returned exact 206 responses and all three independent API reads returned 206 with exact lengths but CORS-opaque `Content-Range`; every paired in-memory digest matched. This found no current-SW/upstream discrepancy in the sampled front, middle or tail intervals. It does not prove unsampled whole-body fidelity by itself; separately, V2-01C observed the app receive the declared full byte count before the media-element failure. Together those results move the next discriminating test to the container/decoder boundary, but a media relay is still not justified by this evidence. V2-03B is now the sole READY unit to test Q1 stream-copy remux without touching the original.

The first exact-module attempt passed a `Headers` instance to the app's object-spreading `driveFetch` merge, which discarded the `Range` entry and yielded three correctly inconclusive 200 responses. The recorded rerun uses the documented plain header record, so both readers issued bounded Range requests and returned 206. This binding defect is retained as an implementation finding rather than misattributed to Drive; current product callers do not pass `Headers` instances.

### Container-remux exit — V2-03B

Closed locally with `qa/v2-03b-container-remux/`. FFmpeg 9.0.1 probed one H.264 High L3.0 BT.709 video stream and one AAC-LC 48 kHz stereo audio stream inside MPEG-TS despite the `.mp4` name. The Q1 derivative explicitly mapped both streams with `(copy)` and placed MP4 `moov` before media data. Output codec/profile, dimensions, pixel/color fields, frame rate, audio sample rate/channels and the 48,277 video plus 75,441 audio packet counts matched the input. MP4 made the sole video/audio streams default and changed container timestamps/packaging, so whole-file and raw packet hashes are intentionally not claimed equal.

Decoded early, middle and near-end video-frame sequences matched for 89/599/149 frames respectively, and the paired decoded PCM windows matched. The exact maintained Chrome probe `browser-probe-server.mjs` v2-03b.2 then served only the ignored derivative through a random per-run capability path with exact loopback Host/port, foreign-Origin and same-origin probe-page referrer enforcement. Its 9/9 deterministic tests passed. Chrome 152 issued six valid 206 Range requests; first, middle and near-end seeks each produced a `requestVideoFrameCallback`, non-zero 360×640 dimensions and `readyState` 4. `captureStream` exposed one audio track and Chromium's decoded-audio byte counter increased. The original current-app path remains the V2-01C code-4 failure, so the exact sample is a Q1 container/packaging success without video or audio re-encoding. The source fingerprint remained unchanged, and the derivative plus temporary servers were removed. This does not generalize to other containers/tracks or verify physical iPhone/PWA behavior. At this exit V2-03C became the sole READY unit and was paused at the user's request; the later architecture exit below records its closure.

### Architecture decision exit — V2-03C

Closed locally by D-051 and `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`. The adopted candidate serves the PWA shell and a minimal authorization-code/session API from one Cloudflare Worker origin. A short-lived transaction object atomically consumes pre-auth state/PKCE/OIDC nonce before verified Google subject selection; a SQLite-backed account Durable Object then owns encrypted refresh credentials, sessions, monotonic credential revision and persisted refresh lease. Worker Secrets hold the Google client secret and encryption/account-key material. The page receives only a short access credential plus expiry/account/revision in memory, and the client-scoped service worker continues to fetch original Drive bytes directly. Refresh-token omission never destroys a prior credential; logout, disconnect and bounded post-session retention have separate contracts. There is no Worker media/Drive API relay, byte cache, FFmpeg, remux/transcode, or Drive mutation owner.

The selection records published Free limits and an explicit no-payment guard, exact endpoint/cookie/security/retention contracts, current OAuth Console observations, same-client/appData-preserving migration, rejected alternatives and rollback to untouched Pages v1.21.0. Independent staged-diff review drove fixes for pre-account transaction ownership/OIDC subject binding, optional refresh-token preservation and credential lifecycle, platform-generated quota failures, and abandoned transaction cleanup; final rereview was clean. It does not claim Cloudflare account activation, a real candidate hostname/DO binding, Google client-secret reuse, OAuth scope/publishing correction, iPhone cookie behavior or deployment; A-008/A-009 retain those live evidence gates. V2-04A is now the sole READY unit to implement the contract and deterministic fixtures locally before any external configuration change.

### Local authentication contract exit — V2-04A

Closed locally at `ed8b619` with `memory/architecture/V2-04A-AUTH-CONTRACT.md`. The browser GIS/client-ID/token-storage owner was removed from candidate source. The page now obtains one strict `{accessToken, expiresAt, account, revision}` credential from the same-origin session endpoint and holds it only in memory. Its client-scoped service worker fences account generation and monotonic revision, asks only the requesting page after restart, and retries a rejected Drive media credential once only when a newer revision exists. Drive REST and original media bytes continue to travel directly between the browser/service worker and the official Drive API; the auth modules contain no media, cache, transform or Drive-mutation route.

The dependency-free server contract adds a one-use ten-minute pre-auth transaction owner, a durable per-account session/credential owner and strict same-origin POST routes. Deterministic fixtures cover two-owner refresh single-flight, expiry/dead lease, late 401, same-token/new-revision replay, account/generation switching, offline/non-JSON failure, logout/disconnect/revoke uncertainty, service-worker restart, transaction replay, retention and alarm races. Independent review reproduced and closed stale credential installation, failed-request stampede, disconnect result loss, invalid refresh reuse, concurrent failed-establishment leakage and final-logout retention extension. The final full suite passed 187/187; syntax, diff and 12-file public-shell build checks passed; final independent auth/SW rereview passed 55/55 with no remaining confirmed material defect.

This is not a live OAuth or Cloudflare success. `GET /auth/google/start`, the cross-site callback, signed OIDC/scope verification, encryption and Durable Object/Worker bindings remain host-adapter work. No external setting, candidate deployment, production runtime, Drive/appData data, `main`, remote or paused automation changed. V2-04B is the sole READY unit for the no-cost account gates, reversible candidate configuration/deployment and actual PC/iPhone/PWA behavior; A-008/A-009 remain open until action-time readback.

### V2-06A progress — seek-completion clock

Implemented locally at `5e7f47a5f253a7f4ca4ab5fc8cf5dcc3cd57b89a`. Each app-owned seek has one generation-scoped 15-second active-time owner. Success requires the current `seeked` event and a decoded target frame, in either order; playback-clock fallback evidence is diagnostic only. Pause, hidden, offline and pointer drag suspend the budget, and a newer seek, close, source/session change or terminal failure fences stale callbacks. One direct-source timeout reuses the existing retry/buffer budget; a buffered-original timeout stops locally without automatic compatibility downgrade.

The final app/service-worker run passed 125/125, the full nine-file Node suite passed 245/245, syntax and diff checks passed, the functional browser audit passed 14/14, and independent review found no remaining P1/P2/P3 defect. This is local deterministic/browser-fixture evidence, not a candidate deployment, physical iPhone/PWA result, real Drive/TCP/CORS seek proof, or success on the priority MPEG-TS sample. V2-06A remains `READY` for its range-edge, tail-index and 2/4 GiB offset matrix.

### V2-06A progress — tail-index Range proof

Closed as QA-only local evidence at `724e91826bd27aeb4d54642fd7d84aa5859c1ec5`. A pinned 57,944-byte H.264/AAC non-faststart MP4 seed keeps `moov` after `mdat`; the audit inserts a valid 4 MiB `free` box before that index without moving media data or its sample offsets. Headless Chrome on the production app/service-worker path requested `bytes=4227072-`, received a coherent 206 containing the tail index, and reached a decoded frame at `readyState=3` after 156,248 / 4,252,248 unique bytes. The worker correlated first-byte and body-complete for that request, while full transfer, OPFS, memory, preview, retry and relay stayed unused. Close/dispose fenced incomplete work.

The functional browser audit passed 15/15, the full nine-file Node suite passed 246/246, syntax/diff/static checks passed, and independent review was clean after current Pages source and workflow state disproved a proposed publication finding. The QA seed is excluded from the local 13-file public build, no deployment occurred, and actual Drive/TCP/CORS, physical devices, other browser choreography and the priority MPEG-TS sample remain open. That checkpoint left the separate `QA-TR-07` 2/4 GiB sparse-offset boundary open.

### V2-06A progress — large-offset Range boundary

Closed locally at `80e71c829c3ed3795b956457d76f41c9d45cdf7e`. The service worker now validates a present Range and supplied size before credential acquisition or Drive fetch. Malformed or empty syntax, zero suffix, unsafe endpoint, unsafe bounded inclusive span and unsafe size return one local 400 `range-invalid`; a truly absent Range remains a valid sequential GET/HEAD. Synthetic 1–3 byte bodies and bodyless HEAD responses cover exact sizes immediately below, at and above 2 GiB and 4 GiB, bounded/open/suffix/final-byte behavior, maximum-safe final-byte behavior, CORS-hidden reconstruction, streamed truncated EOF and large 416 ownership without multi-gigabyte allocation.

The initial unsafe-range fixture failed by reaching upstream and returning 416. After the implementation, focused boundary tests pass 6/6, the service-worker suite passes 54/54, the full nine-file suite passes 252/252, syntax/diff checks pass, and final independent review has no P1/P2/P3 finding. This is local parser/proxy correctness evidence, not real Drive/CORS or multi-gigabyte performance evidence, a candidate deployment, physical iPhone/PWA proof, or success on the priority MPEG-TS sample. V2-06A remains `READY` for the remaining transport acceptance matrix.

### V2-06A progress — large-offset Chrome/service-worker bridge

Closed as QA-only local evidence at `a9a2ac396491cf87f1be32acb45b590dea6abf66`. A one-byte fixture exposes a separately validated logical total of 4,294,967,297 bytes. Real Chrome fetches built by the app requested exact bytes at 2 GiB and 4 GiB through the production service worker and received exact one-byte 206 responses, correlated `rangeSatisfied:true` status and first-byte/body-complete traces. A reversed large interval produced local 400 and one range-error without creating a fixture stream or reaching the Playwright Google-media route. No full request, OPFS/memory recovery, preview or compatibility route was used; dispose left the fixture inactive.

The first browser run failed with 416 before sparse fixture support. The final functional browser audit passed 16/16, the full nine-file suite remained 252/252, syntax/diff/static checks passed, and independent review found no P1/P2/P3 defect. This closes synthetic Chrome→production-SW arithmetic and ownership only; real Drive/CORS, multi-gigabyte transfer performance, physical iPhone/PWA and the priority MPEG-TS sample remain open. V2-06A next owns the `QA-TR-01` faststart H.264/AAC cold-Range progress discriminator.

### V2-06A progress — faststart MP4 progress and seek lifecycle

Closed as QA-only local evidence at `d5f140e7fec4b3c7619dbda7858bf75e5f4ceef2` and `7f507aa45c5e1ba9d70b31d287c5cdfd1e08a224`. A pinned 10-second faststart H.264/AAC source starts and advances past two seconds through the production app/service-worker path while an appended 4 MiB top-level tail remains incomplete; its paired non-faststart control cannot reach metadata while the moved tail index lacks its final byte. The same source then settles app-owned 10/50/90-percent targets only after matching `seeked` plus decoded-frame evidence, and a 25-to-90-percent supersession leaves the stale generation unable to emit a terminal seek result.

The browser audit explicitly proves every immutable MP4 seed byte was cached before those lifecycle seeks, so `7f507aa` does not claim seek-specific network work. Functional audit 19/19, full Node 253/253, static/syntax/diff checks and independent review passed. No full-original, OPFS, memory, preview, retry or browser-fixture media bypass appeared. Real Drive/CORS, physical audio output, native Range cancellation, physical devices and the priority MPEG-TS sample remain open.

### V2-06A progress — uncached seek transport fencing

Closed as QA-only local evidence at `b2e6afe2bb87c6cfecb04d1ed090dd2202ec3861`. A pinned 60-second, 5,223,316-byte faststart H.264/AAC source reaches a quiet paused preload boundary through byte 327,679. Arming phase A for 500 ms without a native time change creates no request or seek generation. The real 30-second seek opens non-contiguous `bytes=2621440-` over its uncached GOP and is held after 64 bytes; the real 54-second superseding seek opens `bytes=4685824-` over its later GOP and alone reaches a decoded target frame.

Chrome did not cancel A during the observed 250 ms grace period. The audit releases it only after B owns the app generation and proves its late completion cannot emit stale `seeked`, decoded-frame, timeout or fallback state or alter the final 54-second position. Removing the real A seek while retaining fixture phase/play now fails at the non-contiguous target-Range assertion, closing the prior phase-only false positive. Functional audit 20/20, full Node 254/254, static/syntax/diff checks and final independent review passed. This proves synthetic Chrome uncached Range generation and stale-transport fencing, not app-owned native Range cancellation, real Drive/CORS, physical audio output or physical-device behavior. `QA-TR-11` limited-cache/quota classification is the next bounded V2-06A discriminator.

### V2-06A exit — limited-cache/quota classification

Closed locally at `14c501ad80a3950f4b6886dd3a5ae31b031c5af6`. The red recovery path automatically selected Google compatibility when OPFS was unavailable and the file exceeded the safe memory policy. A real mid-write OPFS quota fixture already proved reader cancellation, writable abort, partial-file removal and lease release, but memory denial still fell through to preview. The buffer path also lacked an exact source-generation owner, so a late same-session failure or delayed storage-policy result could overwrite a newer Range source. Independent review added the remaining engine-native case: generic `RangeError` from memory-mode `Blob` construction.

The final path owns policy lookup, full transfer, OPFS/memory assembly, terminal UI and cleanup with exact file/session/source generation. OPFS quota and memory allocation failures terminate as `buffer-storage-limited`, explicitly remain resource failures rather than codec verdicts, and expose Google compatibility only as a manual choice. Five discriminating fixtures cover unavailable OPFS, native Blob allocation failure, mid-write quota, superseded buffer failure and superseded policy result; an audit fixture proves same-session different-generation cleanup cannot delete the newer temporary file. Full Node passes 259/259, Chromium functional audit passes 20/20, syntax/diff checks pass, and independent rereview found no P1/P2/P3 defect.

This closes the deterministic local `QA-TR-01~11` V2-06A slice without claiming real Drive/CORS resource exhaustion, physical-device quota behavior, `QA-TR-12`, deployment, or priority-sample playback. `V2-07A` remains the sole READY workstream; `V2-06B` stays queued behind this active priority even though its V2-06A prerequisite is satisfied.

### V2-07A first slice — priority identity and container risk

The read-only probe tool is fixed at `41952452cb5f837915b161d3bcfc723692c3b939` and its redacted evidence at `4a02391`. Authenticated Drive reads before and after the probe kept the private file/version/content identity, canonical single parent and read capabilities stable. Serial pre/post SHA-256 and stronger local stat identity matched the private expectation. The displayed MP4 metadata actually contains MPEG-TS with exactly one H.264 High L3.0 BT.709 video stream and one AAC-LC stereo stream; no extra track or HDR signal is hidden by the Q1 classifier.

This is a current Q1 container-only candidate, not current product, decode or physical-device success. The historical same-fingerprint Windows Chrome stream-copy pass stays a separate evidence level. Combined priority/range/remux tests pass 36/36 and independent review is clean. The next READY slice is complete paginated metadata-only inventory of the privately captured canonical target root, then risk-based representative selection; product Q1 integration remains blocked on that matrix.

### V2-07A second slice — canonical-root metadata inventory

The reviewed inventory tool is fixed at `e928f7b9b6c64ce91fe6aa5278b18b0c82c97c8b` and exact redacted evidence at `78b1b14`. The candidate revalidated the private account, priority file and canonical direct parent, then independently exhausted 26 pages across nine folders twice. Both normalized private passes matched with 8,471 containment items, no duplicate, pagination, incomplete-search, shortcut or capability error, and the known priority anchor present once per pass. No file body or Drive mutation occurred.

The 8,463 classified objects include 2,052 videos, 6,410 images and one other object. Metadata identifies two >=4 GiB objects, 35 large MP4/MOV objects, 20 one-hour-or-longer videos, 14 rare MKV/AVI/BMP objects, 995 GIF/WebP candidates, 68 rotated images and 59 extension/MIME mismatches. These counts select probes; they do not prove corruption, container topology, decode or playback. The live report and tracked aggregate matched exactly, the full suite passed 287/287, and independent review was clean. The next READY slice is the smallest deterministic private representative cover followed by bounded read-only container probes.

### V2-07A third slice — deterministic representative cover

The selector is fixed at `dd30d2b9394560d7d0f35e85f6a48cc04a2b624c`; its authenticated redacted aggregate and locked QA transport are committed at `56248e5`. It selected 38 of 8,463 physical objects: all 20 mandatory objects plus 18 optional objects, covering all 64 observed metadata-risk categories, all 11 requested extensions, nine known MIME buckets, the large/long/rotation/GIF/WebP bands and all nine observed extension/MIME mismatch pairs. Reverse provider order produced byte-identical private and redacted results. No body read or Drive mutation occurred, and private identifiers remain only in the authenticated page.

### V2-07A fourth slice — identity-fenced bounded probe core

The dependency-free core is fixed at `31bb099`. It accepts only exact closed BigInt Range plans under the recorded request/file/batch/time ceilings, requires coherent no-store 206 evidence and exact body length, serializes one owner, and fences account plus pre/post `id/version/size/modifiedTime/MIME/canDownload` identity. Focused tests pass 29/29 and app/static/core integration passes 130/130 after independent review closed stream-lock, stale-timer, response-policy and malformed-body ledger overruns. The core intentionally has no live private-data binding; the next READY unit is a separately reviewed browser adapter followed by only a serial 64-KiB front sniff of the 38-object manifest.

Follow-up commit `f31c870` closes the failed-read/postflight gap before live use. A started reader or response must settle cancellation before postflight; rejection becomes `CLEANUP_FAILED`, non-settlement inside the hard file lifetime becomes `CLEANUP_TIMEOUT`, and both terminate the batch before another request. The default 60-second file lifetime reserves the final 10 seconds for cleanup/postflight, detached reads are settled, `getReader()` acquisition failure returns ownership to response cancellation, and any body read without postflight is terminal. Focused tests pass 37/37 and app/static/core integration passes 147/147; syntax/diff checks and final independent adversarial review are clean. No private representative body, Drive mutation, decode, playback or deployment was used. The sole READY action remains the closed browser adapter, then the serial 64-KiB front sniff.

### V2-07A fifth slice — closed browser adapter and live front sniff

The zero-argument one-shot adapter is fixed at `e0f8228`; the isolated HTTPS QA transport and visible integrity-header correction are fixed at `e0f8228`/`465cf41`. Its 107,952-byte public bundle matched SHA-256 `5EA41F6C7C369ACCC2D9ABFB5F5F8ACEC7ECAAD33E2D1CA4039844BB0B491865` locally, at the QA Worker, and inside the authenticated candidate page. Fresh repeated inventory and representative selection were recomputed inside the private closure, with exact account/app/controller/lifecycle/media-idle fences and no caller-supplied identity.

The authenticated run processed all 38 selected objects. Thirty-seven passed preflight and postflight and used one serial closed front Range each, totaling 2,124,313 received/unique bytes; one produced `IDENTITY_MISMATCH` before any body request. The 37 successful front signatures were MPEG-TS 15, ISO-BMFF 8, JPEG 7, GIF 2, PNG 2, WebM 1, WebP 1 and unknown 1. No Drive mutation, decode, playback, persistence or private identifier publication occurred. Front signatures are routing evidence, not full container/track, corruption, decode or playback verdicts. The sole READY action is a metadata-only aggregate reconciliation of the one mismatch without repeating any successful body read, followed by bounded container/index/track probes.

### V2-04B physical standalone auth boundary

Candidate commit `3597e6399056908542680f2a7a5266effd40e96a` (`1.22.0-rc.4`) and Worker version `28d2a9fc-730e-48d4-b060-8e49554a8c7b` keep iOS standalone OAuth inside the web-app context and accept recovery only after a memory-only server-derived session marker changes. The controlled PC candidate recovered credential 200 and real Drive data under an active service worker. The user then reported all three exact physical iPhone checks successful: candidate update/open, Google Drive return to `Drive 연결됨` plus the real folder list, and a full app termination/relaunch without renewed consent. This closes the reported standalone infinite loop; actual token-expiry/sleep-wake renewal, iPhone media playback and A-004 remain open.
