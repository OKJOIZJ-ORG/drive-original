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
| `V2-02A` / WP-02 / `BLOCKED(active V2-06A priority)` | Compatibility/Drive-open actions live inside the one dismissible bottom control owner, not a permanent island. | BUG-03; UI-02/04; QA-UI-01~06 | V2-01B | `index.html`, `styles.css`, player UI owner in `app.js`; no transport change | before/after mobile+desktop states, keyboard/VoiceOver entry, dismiss/retry/external-open regressions | Revert isolated UI commit; retain existing manual Drive escape path |
| `V2-02B` / WP-02 / `BLOCKED(active V2-06A priority)` | Normal sync/original preparation stays silent; actionable errors remain short and owned by the current request. | BUG-05, UI-01/03/10, STATE-07; QA-UI-10, QA-ST-03 | V2-01B | status ownership and viewed-event timing only; no account schema migration | stale-status, failed-open-not-viewed, actual display/start, screen-size regression | Feature-level revert; do not rewrite existing viewed history |
| `V2-03A` / WP-03 / `IMPLEMENTED_LOCAL` | Does an independent read-only API reader succeed on the same ranges where the current SW path fails? | ARCH-01~04, E01/E05 | Exact sample trace | Local read-only comparator; no new origin/daemon | same content revision/fingerprint, sampled front/mid/tail all 206, exact lengths and digest equality | Remove comparator and bounded cache; no source mutation |
| `V2-03B` / WP-03 / `IMPLEMENTED_LOCAL` | If transfer is good, does native playback or container-only remux solve the same sample without video re-encode? | E02/E03/E04, Q-01~06, MEDIA-01/02/05/08; QA-FM-02~04 | V2-03A proves post-transport failure | Local spike/output outside Drive; no deployed native app or original overwrite | exact Q1 copy mappings and stream probes; decoded early/mid/end equality; secured Chrome v2-03b.2 frame/seek/audio/206 evidence | Derived media and servers removed; source fingerprint preserved |
| `V2-03C` / WP-03 / `IMPLEMENTED_LOCAL` | Adopt the minimum direct-data plus B-auth responsibility split with explicit benefit, cost, host, data migration and exit path; add media relay only if same-file evidence requires it. | ARCH-01~05; G2 | Same-sample V2-03A/B evidence under D-050 | Decision record only | D-051 and `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`; all adoption fields, losing options and rollback recorded | Supersede, never rewrite, if later evidence changes the decision |
| `V2-04A` / WP-04 / `IMPLEMENTED_LOCAL` | Token expiry/reconnect preserves the correct account/view and has one retry owner. | AUTH-01~08; QA-AU-01~09 | Approved architecture | Chosen auth owner and public interface; do not run two auth models | `ed8b619`, `memory/architecture/V2-04A-AUTH-CONTRACT.md`; deterministic expiry/late 401/concurrency/account switch/offline/restart/retention fixtures; full 187/187 | Revert `ed8b619`; production Pages v1.21.0 and external configuration remain untouched |
| `V2-04B` / WP-04 / `BLOCKED(physical iPhone/PWA)` | Bind the local contract to one no-cost same-origin candidate and determine whether real login, expiry, sleep/wake and PWA cookie behavior match it. | E06, EXP-04; QA-AU-01/02/06/07/09, QA-TR-12 | V2-04A; actual account/device window; A-008/A-009 action-time checks | Cloudflare host adapters/bindings and reversible candidate-only Google origin/redirect/scope settings; no media proxy, production replacement, global logout or cookie purge | deployed candidate identity/config readback; normal expiry and controlled clock evidence separately; PC Chrome, iPhone browser and home-screen PWA | Revert candidate code/config additions and remove candidate origin/redirect if abandoned; existing Pages v1.21.0 remains rollback |
| `V2-05A` / WP-05 / `BLOCKED(active V2-06A priority)` | A local operation ledger never turns response loss or partial failure into guessed success. | MUT-01~10, EXP-05; QA-MU-03~08 | Failure-stage contract | Repository/operation interface and synthetic store only | applied-before-loss, failed-before-apply, 403/429, account switch, duplicate operation ID | Revert ledger commit and restore fixture snapshot |
| `V2-05B` / WP-05 / `BLOCKED(V2-05A,V2-04A)` | Approved trash/move operations match independent remote GET and can be restored. | MUT-01~10; QA-MU-01~10 | V2-05A, V2-04A and a newly created allowlisted disposable target | Named test IDs only; never permanent delete | pre-state, request, response, independent readback, G:/web distinction and recovery readback | Restore recorded parents/trashed state only after checking current remote state |
| `V2-06A` / WP-06 / `READY` (headers watchdog `IMPLEMENTED_LOCAL` at `7e06c9a`; Range-first router at `38b4404`) | Q0 starts before full download and separates credential/header/byte/body/frame/seek stalls. | TR-01~10; QA-TR-01~11 | Approved reader/auth owners | Reader, bounded cache and single watchdog owner | range edge matrix, tail index, 2/4 GiB sparse offsets, stalls, rapid seek/close | Feature flag or commit revert; bounded cache cleanup by file/version lease |
| `V2-06B` / WP-06 / `BLOCKED(V2-06A)` | Long playback survives token boundaries, source changes and foreground return without mixing bytes. | TR-07~10; QA-TR-09/10/12 | V2-06A and long-run environment | Lifecycle/retry integration only | long synthetic then actual playback, expiry-edge seek and background/foreground | Cancel active work and invalidate only affected file/version cache |
| `V2-07A` / WP-07 / `BLOCKED(active V2-06A priority)` | What container/track/device combinations actually exist and which samples are high risk? | CORPUS-01~07, MEDIA-01; QA-FM-01/05~09 | Stable file identity and read access | Metadata inventory, bounded probes, private manifest; no bulk conversion | counts separate metadata/probed/decoded; corrupt versus unsupported retained | Delete probes/derived private manifest; originals remain read-only |
| `V2-07B` / WP-07 / `BLOCKED(V2-06A,V2-07A)` | Each failing combination takes the lowest necessary Q0/Q1/Q2/Q3 path with truthful labels. | Q-01~06, MEDIA-01~08; QA-FM-01~10 | Reader and corpus matrix | Selected remux/audio transform/last-resort video transform only | first/mid/end seek, tracks/rotation/VFR/HDR evidence, no silent quality downgrade | Remove derived representations and fall back to the last verified higher-quality path |
| `V2-08A` / WP-08 / `BLOCKED(active V2-06A priority)` | Likes/unlikes/viewed survive architecture/origin change without empty overwrite. | STATE-01~07; QA-AU-10, QA-ST-01~03 | Chosen origin/auth and state semantics | Snapshot, migration adapter and reversible schema read path | counts/tombstones/writer IDs before/after; two-context offline merge, then approved devices | Restore snapshot/read-old path; never delete legacy appData during rollout |
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
