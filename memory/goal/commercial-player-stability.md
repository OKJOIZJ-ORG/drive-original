# Goal — Commercial-grade player and library stability

## Goal

Bring Drive Original's mobile and desktop media-library experience to a commercially credible level across gesture navigation, playback controls, dialogs, authentication, streaming, thumbnails, bulk actions, performance, and latent-defect recovery.

**Execution state — 2026-10-01 07:15:** WAIT under D067 for user move/explicit resume. Whole D066 objective retained. Fixed28 source944f006/Worker99252c7f passes public52/cache40/eightarchivesexcluded/sixprivate404/freshanonymousonlineoffline/control11/source26+6/52entry ZIP54784062B/cb115db7. Shell correction independently passes14focused/7native; full27 local665 and unchanged-runtime version-only28 static20 pass. Actual PC normal27→28 has one trusted banner click/current activated controller/all40 exact cached hashes/sameaccount/writer/fullprojection;16safejournal rows reconstructed with live canonical SHA1399bf39/lategaps explicit. Actual force27 reload/account pass only; post27cache check lost to28activation, actualforce28+reopen pending. Android124 actual synthetic420s native endpoint/EOS/ACK/cleanup passes; actual28 source/core41hashes and142 OSforced library/settings landscape+exactrestore pass, no handsensor/playerlandscape/audibility claim. PC QA baseline/globals/keys/listeners released; Android transports/orientation restored; no state/offline/renewal timers. Exact28 corpus19/performance11 prepared+binding5/9/hashreuse, actualunrun. Six finite saved contracts13implementationcomparisons/16bindings/currentadapter3pass, no whole-row promotions. Original69/42 mapping remains; wholecorpus/deeperformats/stateofflineconflict/disposableUI/reopen/actualforce28/performance/resources/finalgates pending. Next naturalrevision/expiry must be freshly recaptured. Production1.21.0/e08989a/main/push/generalwritesfalse/automationPAUSED unchanged; no automatic resume.

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

**2026-09-28 continuation:** D-059 resumes the existing plan after f2579c9.
Finish WP-08 normal sync/fresh reconstruction and other remaining core units first.
Queue the newly reported desktop cursor/overlay defect, loading poster/player
presentation and general UI polish as V2-02D/V2-02E/V2-09C below. D-056 is unchanged.

Only one core task may be edited at a time. READY/queued means prerequisites are satisfied; scheduling priority is not a blocker. As directed on 2026-09-26, independent UI work proceeds while live media authentication is unavailable, and the already identified priority TS combination may enter a bounded product Q1 slice without waiting for the entire corpus matrix. Full format/device acceptance remains mandatory.

| Task / WP / status | User-visible result or deciding question | Spec and acceptance | Prerequisite | Edit boundary | Verification | Recovery |
|---|---|---|---|---|---|---|
| `V2-00A` / WP-00 / `IMPLEMENTED_LOCAL` | Which source, version, branch and authority actually govern this run? | §§01,03,19; G0 | Current user instruction | Branch and project records only | attachment hashes; Git root/HEAD/dirty readback; current 144-test baseline | Restore outgoing checkpoint from its archive; product source is untouched |
| `V2-01A` / WP-01 / `IMPLEMENTED_LOCAL` | Which failure layers can v1.21.0 already distinguish? | §§04,10.6,17,18; QA-TR-05/08, QA-AU-05 | V2-00A | Read-only source inspection and existing fixtures | focused auth/HTTP/Range/media-error tests 3/3 plus full 144/144 | No runtime change; remove only task records if invalidated |
| `V2-01B` / WP-01 / `IMPLEMENTED_LOCAL` | A single correlated trace says the first terminal stage: credential, headers, first byte/body progress, media parse/decode boundary, first frame or seek. | OBS-01/02, EXP-03/04; QA-TR-08/09, QA-AU-01/05, QA-ST-03 | V2-01A | Local-only `qa/`/tests and the smallest inert diagnostic hook if unavoidable; no recovery-policy or UI change | 12/12 stage fixtures, full 153/153 suite, syntax/diff/build allowlist and independent clean review at `fe9c359` | Revert `fe9c359`; diagnostics stay out of the public allowlist |
| `V2-01C` / WP-01 / `IMPLEMENTED_LOCAL` | On the exact failing file, where is the first failed stage and what is the stable file version? | BUG-01/02/04/07, EXP-01/02; QA-TR-01/02/08/12, QA-AU-01/06 | V2-01B and supplied exact sample/device observations | Read-only trace; no Drive mutation or cookie clearing | two current-app reproductions completed; content revision/SHA-256/size stable; both reached full body then `MediaError` 4 → `container-or-decoder` | Delete private trace after the committed redacted record; no source-media mutation |
| `V2-02A` / WP-02 / `IMPLEMENTED_LOCAL` | Compatibility/Drive-open actions live inside the one dismissible bottom control owner, not a permanent island. | BUG-03; UI-02/04; QA-UI-01~06 | V2-01B | `index.html`, `styles.css`, player UI owner in `app.js`; no transport change | qa/v2-ui-audit.cjs before/after PC and touch-viewport 2/2; 269 Node checks; functional browser 20/20; review counterexamples fixed. Actual iPhone/VoiceOver pending | Revert isolated UI commit; retain existing manual Drive escape path |
| `V2-02B` / WP-02 / `IMPLEMENTED_LOCAL(live device pending)` | Normal sync/original preparation stays silent; actionable errors remain short and owned by the current request. | BUG-05, UI-01/03/10, STATE-07; QA-UI-10, QA-ST-03 | V2-01B | status ownership and viewed-event timing only; no account schema migration | stale-status, failed-open-not-viewed, actual display/start, screen-size regression | Feature-level revert; do not rewrite existing viewed history |
| `V2-02C` / WP-02 / `IMPLEMENTED_LOCAL(physical-device pending)` | The designated overlay-only touch area reveals controls without changing playback state. | D-048/D-055/D-056; A-010; QA-UI-01~06 | Current core unit was saved before the queued player slice | Shared pointer/touch reveal ownership and stable44px entry; pause never forces overlay | PLAYER-QUALITY-20260929.md: trusted DOM/touch-emulated input across4viewports, independent review. Physical iPhone report is not reclassified as post-fix proof;30s native return remains unknown | Isolated feature revert; keep source/originals/account state |
| `V2-03A` / WP-03 / `IMPLEMENTED_LOCAL` | Does an independent read-only API reader succeed on the same ranges where the current SW path fails? | ARCH-01~04, E01/E05 | Exact sample trace | Local read-only comparator; no new origin/daemon | same content revision/fingerprint, sampled front/mid/tail all 206, exact lengths and digest equality | Remove comparator and bounded cache; no source mutation |
| `V2-03B` / WP-03 / `IMPLEMENTED_LOCAL` | If transfer is good, does native playback or container-only remux solve the same sample without video re-encode? | E02/E03/E04, Q-01~06, MEDIA-01/02/05/08; QA-FM-02~04 | V2-03A proves post-transport failure | Local spike/output outside Drive; no deployed native app or original overwrite | exact Q1 copy mappings and stream probes; decoded early/mid/end equality; secured Chrome v2-03b.2 frame/seek/audio/206 evidence | Derived media and servers removed; source fingerprint preserved |
| `V2-03C` / WP-03 / `IMPLEMENTED_LOCAL` | Adopt the minimum direct-data plus B-auth responsibility split with explicit benefit, cost, host, data migration and exit path; add media relay only if same-file evidence requires it. | ARCH-01~05; G2 | Same-sample V2-03A/B evidence under D-050 | Decision record only | D-051 and `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`; all adoption fields, losing options and rollback recorded | Supersede, never rewrite, if later evidence changes the decision |
| `V2-04A` / WP-04 / `IMPLEMENTED_LOCAL` | Token expiry/reconnect preserves the correct account/view and has one retry owner. | AUTH-01~08; QA-AU-01~09 | Approved architecture | Chosen auth owner and public interface; do not run two auth models | `ed8b619`, `memory/architecture/V2-04A-AUTH-CONTRACT.md`; deterministic expiry/late 401/concurrency/account switch/offline/restart/retention fixtures; full 187/187 | Revert `ed8b619`; production Pages v1.21.0 and external configuration remain untouched |
| `V2-04B` / WP-04 / `IN_PROGRESS(auth/PWA accepted; A-004 duration open)` | Bind the local contract to one no-cost same-origin candidate and determine whether real login, expiry, sleep/wake and PWA cookie behavior match it. | E06, EXP-04; QA-AU-01/02/06/07/09, QA-TR-12 | V2-04A; actual account/device window; A-008/A-009 action-time checks | Cloudflare host adapters/bindings and reversible candidate-only Google origin/redirect/scope settings; no media proxy, production replacement, global logout or cookie purge | `1.22.0-rc.4` deployed identity/config and PC credential/listing verified; user-confirmed physical iPhone PWA auth return, real list and full-relaunch persistence; actual expiry/sleep-wake remains A-004 | Revert candidate code/config additions and remove candidate origin/redirect if abandoned; existing Pages v1.21.0 remains rollback |
| `V2-05A` / WP-05 / `IMPLEMENTED_LOCAL(live pending)` | A local operation ledger never turns response loss or partial failure into guessed success. | MUT-01~10, EXP-05; QA-MU-03~08 | Failure-stage contract | Repository/operation interface and synthetic store only | applied-before-loss, failed-before-apply, 403/429, account switch, duplicate operation ID | Revert ledger commit and restore fixture snapshot |
| `V2-05B` / WP-05 / `PARTIAL(actual restricted disposable round trip passes; normal UI/live matrix pending)` | Approved trash/move operations match independent remote GET and can be restored. | MUT-01~10; QA-MU-01~10 | Implemented V2-05A/V2-04A; same-account live session and newly created allowlisted disposable target under D-050. V2-08A gates appData/global sync, not isolated new-test-file transport | Named newly generated test IDs only; actual canonical controller in QA closure, global writes=false; never permanent delete | DISPOSABLE-20260928.md:3new items,35run requests/8writes,4GET recovery,6GET stable final states; deliberate response suppression confirmed without replay. Normal candidate UI/G:/web/broad matrix acceptance separate; later cache drift unknown | Restore recorded parents/trashed state only after checking current remote state |
| `V2-06A` / WP-06 / `IMPLEMENTED_LOCAL` (runtime through `14c501a`; browser evidence through seek transport `b2e6afe`) | Q0 starts before full download and separates credential/header/byte/body/frame/seek stalls. | TR-01~10; QA-TR-01~11 | Approved reader/auth owners | Reader, bounded cache and single watchdog owner | range edges, tail index, 2/4 GiB sparse offsets, stalls, rapid seek/close and quota/resource classification; full 259/259 plus browser 20/20 | Feature flag or commit revert; bounded cache cleanup by file/version lease |
| `V2-06B` / WP-06 / `IN_PROGRESS(local faults/cycles + one actual PC natural-renewal Q1 boundary verified; broad duration/sleep-wake pending)` | Long playback survives token boundaries, source changes and foreground return without mixing bytes. | TR-07~10; QA-TR-09/10/12 | V2-06A and long-run environment | Lifecycle/retry integration only | long synthetic then actual playback, expiry-edge seek and background/foreground | Cancel active work and invalidate only affected file/version cache |
| `V2-07A` / WP-07 / `PARTIAL(36 per-file byte/TS evidence and current metadata comparator pass; full formats/device pending)` | What container/track/device combinations actually exist and which samples are high risk? | CORPUS-01~07, MEDIA-01; QA-FM-01/05~09 | Stable file identity and read access | Metadata inventory, bounded probes, private manifest; no bulk conversion |CORPUS-RC10-20260928.md retains36per-file/51media15completeTS evidence and historicalA-012causeunknown. CATALOG-DIAGNOSTICS-20260928.md/currentrc11record:2complete repeatedinventories+finalcomparison stable/completetrue,124GET22774540metadata bytes, ownedmedia0writes0. No full track/index/format/device inference ISO-HEADERS-RC11-20260929.md: currentselection36/firstISO chain,3media956bytes/126metadata22775004bytes/finalstable; tracks/codecs/playback unaccepted. | Delete probes/derived private manifest; originals remain read-only |
| `V2-07B` / WP-07 / `PARTIAL(product Q1 + actual priority frames/seeks/close; duration/device/full formats pending)` | Each failing combination takes the lowest necessary Q0/Q1/Q2/Q3 path with truthful labels. | Q-01~06, MEDIA-01~08; QA-FM-01~10 | Reader plus identified container/codec evidence for each slice; full corpus remains acceptance | Selected remux/audio transform/last-resort video transform only | first/mid/end seek, tracks/rotation/VFR/HDR evidence, no silent quality downgrade | Remove derived representations and fall back to the last verified higher-quality path |
| `V2-08A` / WP-08 / `PARTIAL(actual normal sync/reload/readback + isolated empty-cache/old-code compatibility pass; live devices/offline pending)` | Likes/unlikes/viewed survive architecture/origin change without empty overwrite. | STATE-01~07; QA-AU-10, QA-ST-01~03 | Chosen origin/auth and state semantics | Snapshot, migration adapter and reversible schema read path | STATE-NORMAL-20260928.md:368full tests, actual7docs/6writers9-48-140/own-body expected/all6others unchanged, actual reload, read-only exact-app empty-cache9GET and old-code/local-snapshot equality pass;5private recovery envelopes retained. New origin/two physical devices/offline live propagation separate | Restore snapshot/read-old path; never delete legacy appData during rollout |
| `V2-09A` / WP-09 / `BLOCKED(V2-02,05A,06,07,08)` | Integrated desktop/mobile flows pass without resource growth, cache mixing or private-data exposure. | §§15~18,20; QA-UI-01~10, QA-LF-01, QA-SE-01~03, QA-SW-01 | Locally complete units | Integration/QA only; no release metadata yet | browser engines/viewports, 50-cycle lifecycle, malformed media/storage full, old/new SW | Revert the first failing unit; keep fixed-SHA evidence immutable |
| `V2-09B` / WP-09 / `BLOCKED(actual devices/account)` | Actual PC, iPhone Safari/PWA and two authenticated devices meet the live gates. | §20.7; A-001/A-002/A-004; G5 | V2-09A and user device window | Approved live read paths; writes only through V2-05B | device/OS/browser/file version and evidence per acceptance row | Remove test session/derived cache; preserve account and original files |
| `V2-10A` / WP-10 / `BLOCKED(V2-09)` | A fixed candidate has independent review, full acceptance states and a tested rollback. | REL-01~05, §22; all QA IDs | All required local/live gates or explicit blocked states | Version/docs/package candidate; no push/deploy | clean fixed SHA, full tests, public allowlist, package/blob equality, review findings closed | Discard candidate package/branch; no production impact |
| `V2-10B` / WP-10 / `BLOCKED(separate release approval)` | Approved production serves the exact candidate and passes real smoke; otherwise code and deployment remain separate. | REL-03~05; G6/G7 | V2-10A and explicit merge/push/deploy authority | Approved source/Pages/broker/native target only | serving SHA/assets/protocol, cold/update/offline, actual account/media smoke, rollback readback | Publish prior verified build through normal non-force path; preserve data schemas |
| `V2-02D` / WP-02 / `IMPLEMENTED_LOCAL(actual desktop reveal verified; device pending)` | Desktop playback keeps the cursor and designated controls access usable. | D-059; UI-02/05; QA-UI-01~06 | Core continuation saved; supplied report reproduced locally | Player pointer/chrome ownership only; pause-without-overlay preserved | PLAYER-QUALITY-20260929.md and actual rc.12 large ISO bottom reveal/cursorauto/pausedfalse; rc.13 MKV/AVI reveal enables trusted slider seeks | Isolated player feature revert |
| `V2-02E` / WP-02 / `IMPLEMENTED_LOCAL(device pending)` | Loading poster fits the media stage and hands off cleanly to the first frame; coherent player states and controls. | D-059; UI-01~08; QA-UI-01~10 | Core continuation saved; screenshot defect discriminated against local DOM | Contained rotation-aware poster, quiet spinner, coherent player presentation; original route/resource bounds preserved | PLAYER-QUALITY-20260929.md:4viewport20scene trusted input/visual checks, waiting/first-frame/error/resize/source-switch; independent review | Isolated presentation revert |
| `V2-09C` / WP-09 / `PARTIAL(bounded UI audit repaired; remaining integration open)` | App-wide UI polish has consistent hierarchy, focus, spacing, touch targets and honest states. | D-059; existing UI/accessibility contracts | Core continuation and bounded UI audit completed | Existing design/components: native group states, contrast, conditional focus return, small-screen dialog scroll, current update owner/deadline | SAR-AND-LIBRARY-20260929.md:44after scenes/4viewports,0axe-AA/overflow/pageerrors, trusted keyboard/search/longname/reduced-motion and independent review; full app/device acceptance remains open | Revert scoped presentation changes |

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

### V2-07A sixth slice — metadata-only identity reconciliation

The zero-media reconciler is fixed at `60f743b4ddd97ca96f7308af3fa8c362718514fc`. Independent review closed an incomplete transport role allowlist, an overbroad request budget, JSON-body overlap, and false `complete:true` on unpaired reads. The final unit caps the known roughly 138-request path at 512, owns one serial metadata response through JSON settlement, and reports unresolved rows explicitly. Its checked-in 78,855-byte bundle matches SHA-256 `DFB28450F396A649D8D713B168FFDC3234A56609C1B3EC1DEC0CBFDCC2C1AF1C` and is deployed beside, not instead of, the prior bounded adapter on QA Worker version `68cf79bb-3c04-4cbf-8472-ffa3880d9836` with no bindings.

The authenticated run recomputed the two-pass inventory and exact 38-object selection, then completed all 76 paired reconciliation reads. All 38 rows were stable; every expected-mismatch and pre/post-drift dimension was zero; media-request delta, media bodies, decode, playback, persistence and mutation were zero. The earlier single pre-body mismatch did not reproduce, but its historic dimension is unrecoverable from the deliberately aggregate-only record, so the cause remains unknown. No successful front-body read was repeated. The sole READY action is now bounded container/index/track parsing, beginning with the dominant MPEG-TS and ISO-BMFF routes and the priority MPEG-TS sample.

### V2-07A seventh slice — bounded local MPEG-TS evidence

Observed 2026-09-26: resumed the existing parser drafts in the relocated `C:\extensions\Drive-Original\source` repository without resetting HEAD or ignored QA work. `qa/v2-07a-container-probe/` now includes a dependency-free bounded PAT/PMT and H.264/AAC header probe, 44 passing synthetic tests and a redacted local priority-prefix observation pinned to parser SHA-256. A 65,536-byte read-only prefix produced 348 complete TS packets, one PAT/PMT, H.264 High L3.0 360x640 BT.709 limited and AAC-LC 48 kHz stereo, with private pre/post local stat identity stable.

Independent review reproduced and closed incomplete ADTS/SPS acceptance, unexpected continuity loss erased by PUSI, conflicting duplicate promotion, declared-discontinuity fragment joining, finite PES length overread and TEI/reserved-adaptation invalidation bypass. The follow-up review passed 16 additional assertions; the unchanged nine-file product suite passed 269/269. Structure-complete is not codec/decode/playback-complete. No current Drive identity, full-file hash, CORS, browser or physical-device result is claimed.

The browser adapter draft is a separate next slice: use the previously proven same-origin SW direct-Drive path, constrain inventory/metadata as well as media bodies, suppress detail confirmation for non-complete structure outcomes, review/deploy only the isolated no-binding QA transport, then run an authenticated aggregate-only probe when browser control is available. Product, origins, Drive originals, main/remotes and paused automation remain unchanged.

### V2-07A eighth slice — private browser probe and public transport

The local MPEG-TS probe is committed at `3f49d1c`. The separate one-shot browser adapter uses the previously validated same-origin `/__drive_media` route with exact known size and private identity/generation fences; original bytes still travel directly from Drive to the browser service worker, not through a server relay. The inventory/metadata/media adapter dispatch ceiling is 512 and ten minutes, JSON owns the serial metadata slot until settlement, and each representative has one at-most-64-KiB body read. Non-complete TS outcomes cannot confirm detail fields; `aggregateAvailable:false` distinguishes discarded results from zero network activity. Bounded read success is not format/playback success.

Focused adapter tests pass 53/53 and related integration passes 370/370. Independent review found no remaining material scoped defect and separately exercised whole-run timeout during preflight JSON, media headers and postflight JSON. The three-artifact public QA registry retains both old artifacts exactly and adds a 168,559-byte MPEG-TS bundle at SHA-256 `46756f98ed91e9d416c2d64493e06b8282f7b427f7cedd3d7c20b59de7b6beb2`; local no-binding Wrangler dry-run passes. Remote pre-deploy readback confirmed the old QA version `68cf79bb-3c04-4cbf-8472-ffa3880d9836` and both old artifact bodies. Deployment and authenticated probe results remain separate gates.

### V2-07A ninth slice — local ISO-BMFF top-level index planning

Observed 2026-09-26: `qa/v2-07a-isobmff-index/` implements a small header-only walker over the existing caller-owned exact reader. It uses BigInt offsets/sizes and reads only 8/16-byte header pieces; normal, extended, UUID and to-EOF sizes are fenced against unsigned-64 overflow and the exact known file size. Hard ceilings are 128 boxes, 4,096 header bytes and 64 requests, with fixed limit/reader/cancellation outcomes. Unknown payloads and all media data are skipped, not validated.

The 47/47 local tests include sparse >4-GiB and >2^53 arithmetic, header/size errors, limits, pending-read cancellation, existing-core exact-206 integration and postflight identity drift. Existing immutable front-index and tail-index MP4 QA seeds each used only 32 header bytes and no `mdat` payload; known `moov` offsets matched. Scanner/core/static integration passes 103/103 and independent review is clean. Header EOF completion is not container validity, parsed index, codec support or playback. The unchanged core rejects >MAX_SAFE_INTEGER endpoints, so larger virtual cases prove only parser arithmetic. Early core plan errors may leave outer read success with an explicit incomplete scanner report; consumers must require both gates.

The isolated MPEG-TS transport delivery is separately closed by `4226bbf` and `transport-results.redacted.json`, but authenticated in-page execution remains pending because current browser tooling is unavailable. No live corpus identity, ISO-BMFF track/index content, decode, seek or physical-device proof was added. Recover the authenticated browser before promoting the corpus support matrix or selecting product Q1 paths; do not substitute public bundle delivery or synthetic header success for that evidence.

### V2-04B physical standalone auth boundary

Candidate commit `3597e6399056908542680f2a7a5266effd40e96a` (`1.22.0-rc.4`) and Worker version `28d2a9fc-730e-48d4-b060-8e49554a8c7b` keep iOS standalone OAuth inside the web-app context and accept recovery only after a memory-only server-derived session marker changes. The controlled PC candidate recovered credential 200 and real Drive data under an active service worker. The user then reported all three exact physical iPhone checks successful: candidate update/open, Google Drive return to `Drive 연결됨` plus the real folder list, and a full app termination/relaunch without renewed consent. This closes the reported standalone infinite loop; actual token-expiry/sleep-wake renewal, iPhone media playback and A-004 remain open.


### 2026-09-26 — V2-02A manual external choice and single control owner

User-directed sequential implementation resumes from 379ffdc. The previous sole-corpus priority was an execution choice, not a dependency required by §§00.5,19.6,26.5. It no longer blocks independent product changes. No acceptance criterion is removed. Next: V2-02B, then the identified TS product Q1 preservation/seek path, with mutation/state/lifecycle units following; keep only one core edit active.

Observed before: synthetic PC and mobile viewport failures automatically loaded a Google document and left action islands outside playerChrome. After: automatic failure makes zero preview requests, manual preview remains explicitly selectable, its controls share hidden/inert ownership, bottom entry and accessible entry work, retry returns to original, and errors can close. Independent review reproduced two additional regressions (Tab trap excluded recovery actions; dead native controls after failure); both fixed and covered. No live media/device acceptance or deployment is claimed. Sub-foundations exposed: recovery-focus ownership — atomic; manual iframe document versus playback — atomic.

### 2026-09-26 — V2-02B quiet status and presentation-owned viewed

Existing writer/schema/history retained. Normal synced/syncing text is silent; actionable sync/local-storage failures remain visible and do not falsely claim local save. Loading detail remains internal, with only the small spinner/status exposed. New viewed entries mean displayed/started, not completed: two increasing video presentation times in the same source/seek context, or successful image decode plus foreground paint. Failed open, paused/seek-only video, stale account/session/source and hidden images do not count. Retry preserves already-recorded status while rebinding session; foreground resumes pending images.

Before browser fixture at 8b16fae marked failed opens viewed in both viewports. After PC/mobile 2/2 passes actual retry lifecycle and hidden-image return (synthetic bytes, not real Drive/device). Node 277/277 passes serially. Expanded browser passed 17 before host resource exhaustion (ERR_INSUFFICIENT_RESOURCES and shell0x800705AF); remaining browser rows are unavailable, not passed. Independent review's two lifecycle findings are fixed. Sub-foundations exposed: retry observation rebinding — atomic; image foreground paint resumption — atomic.

Scheduling update: V2-05A is next while browser-heavy Q1 validation is host-resource limited. Q1 investigation found mpegts.js static TS seeking is not supported; mux.js7.1.0 is only a candidate until bitstream/audio/color preservation and bounded TS seek are proven. No Q1 library has been adopted or installed.

### 2026-09-26 — V2-05A independent mutation readback

Implemented local persistent browser-owned file operations without moving Drive writes into B-auth. Exact account/file intent, preflight version/parents/capabilities, serialized writes, no hidden PATCH retry, independent postcondition GET, ambiguous response recovery and per-file outcome counts now own trash/move. Initial confirmed metadata is immutable history; later external changes become conflict without being undone. Only a new explicit UI action may retry an uncertain operation after two fresh unchanged-version/state reads, and only one PATCH per invocation. Reload/refresh and duplicate operation IDs remain read-only. Storage failure and missing Web Locks stop writes; no automatic record pruning or arbitrary 2000-row cap remains. This is not cross-device/external-app atomicity.

Baseline two failure discriminators reproduced on e68d579. Focused22/22, full299/299 Node tests; complete synthetic browser22/22, final scoped3/3. Independent review closed history overwrite, root-parent metadata, fixed count ceiling and null/stale readback; main review closed mutable-intent drift. Evidence: tests/mutations.test.js; qa/v2-mutations-integration/results.json; qa/v2-mutations-final/results.json. No real Drive writes, candidate mutation enablement, deployment or physical-device success. V2-05B remains pending the actual disposable-data/session gates. Browser resource pressure did not recur in the full run; next priority is the identified TS Q1 preservation/seek discriminator, not full-corpus waiting.

### 2026-09-26 — V2-07B bounded Q1 preservation discriminator

QA-only mux.js7.1.0 is pinned and executed from the exact hashed MP4 bundle. The audio-leading synthetic control loses10 AAC frames in the default mode; keepOriginalTimestamps preserves360 VCL/564 AAC payloads, timing and complete decoded buffers. The priority local4MiB prefix preserves1022 VCL/1586 AAC, but strict metadata comparison found invented1:1 SAR. A separately guarded init-box adapter preserves unspecified SAR by changing only the introduced pasp type to free; final metadata, compressed data, all normalized timestamps/durations and complete decoded frames/PCM match. Nine helper tests and independent review pass. Evidence: qa/v2-07b-ts-q1/README.md plus its two producer-pinned redacted reports. Source stayed read-only; all generated private derivatives were removed.

This closes only the candidate preservation discriminator. No product library adoption, current Drive identity/full-file hash, arbitrary flush, incremental playback, bounded indexed seek, MSE/MMS, browser color or physical-device claim. Next executable unit is synthetic GOP/PES boundary ownership, followed by bounded timestamp/keyframe seeks; do not confuse chunked input pushes plus one EOF flush with incremental playback.

### 2026-09-26 — synthetic GOP boundary discriminator and evidence correction

The preceding priority-prefix result is superseded in its strict preservation conclusion: a read-only recheck found error-level FFmpeg video-decode diagnostics in source and all three outputs despite exit 0. The arbitrary 4 MiB boundary can end inside a picture; matching concealed frames does not prove losslessness or full-file corruption. The updated producer-pinned priority report has preserved=false in every mode. Compressed payload/timing/metadata equality remains observed; strict priority Q1 is still unverified. Original local stat stayed stable and every private derivative was removed.

Nine persisted synthetic contrasts now prove why arbitrary TS/PES flushes fail and why six before-IDR fragments preserve this CFR control. The eligibility gate refuses partial ADTS/PES, changing topology/parameter sets, VFR/discontinuity, accumulating AAC drift and audio-empty intervals; output validates unique tracks. Independent review exposed cumulative timing tolerance and decoder concealment, both reproduced and corrected in maintained tests. Helper17/17 and parser/static integration80/80 pass. This remains QA-only, not full-input runtime memory, device, seek or product playback proof. Next: bounded runtime GOP/PES window ownership with strict complete-picture test input and lookahead; preserve rejected combinations as outstanding support, not exclusions from MEDIA acceptance.

### 2026-09-26 — bounded incremental TS owner

Added source-byte-preserving incremental PSI/PES/GOP ownership with bounded arena, scratch and per-GOP PTS records. Six chunk sizes emit five intervals before EOF; first callback receives only164,500–196,608 of958,800 synthetic bytes. Raw retained peak177,472 and accounted encoded storage387,328 are owner-only figures, not total JS heap/mux/decoder memory. Persistent mux output matches the exact previously strict-decoded synthetic output, with fixture/library/transitive producer/output hashes bound in qa/v2-07b-ts-q1/stream-results.redacted.json.

Independent review found abort-in-predicate, final-generation replacement, rejected-Promise and missing SPS-syntax regressions; maintained tests close them. Main review added callback-error redaction and split-PES-header coverage. Integration101/101 passes. No browser product dependency, authenticated Drive read, private media access, deployment or device result in this unit. VFR/cross-PES ADTS remain unimplemented paths, not waived formats. Next atomic prerequisite is browser-safe explicit-versus-absent SPS/SAR metadata; then worker/MSE/backpressure and bounded indexed seek with their own evidence.

### 2026-09-26 — browser-safe SPS aspect metadata

Seven new tests discriminate absent VUI/flag, IDC0, all16 defined ratios, Extended SAR including zero/16-bit extremes, reserved codes, truncation and input bounds. Metadata publishes only after complete validated SPS. Upstream browser-adapter execution exposed a prior PSI alias-export bundling regression; equivalent const export fixes it. Final parser/Q1/static/adapter integration161/161, nine incremental contrasts and six stream chunkings pass; current reports re-pin the final producer. Independent SPS review51/51 clean. This is metadata-only QA, not yet source-to-init binding, product mux adoption or real playback. Next: bounded init adapter that checks exact source SPS/PPS and coded geometry before preserving unspecified SAR; then worker/MSE/backpressure and seek.

### 2026-09-26 — source-bound Q1 init adaptation

First interval carries copied SPS/PPS and PSI video ID. Browser-safe adapter internally parses SPS, binds exact init parameter sets/profile/track, validates coded sizes and identity matrices, then removes only an introduced square pasp for absent/IDC0. Explicit square is unchanged; other SAR remains unfinished display-geometry work, not waived support. Nine adapter tests plus copy-isolation regression and prior integration171/171 pass. Four public end-to-end observations prove the raw unspecified-SAR metadata negative becomes a strict coded/timing/metadata/decoded positive after only4 init bytes change. Producer-pinned init-binding-results.redacted.json retains no private material. Independent component implementation reviewed by main; independent root-wiring/driver review clean. Next: backpressured browser MSE first-frame-before-input-complete, then worker and bounded time/indexed seek. Not deployed or actual priority/device playback.

### 2026-09-26 — real Chrome MSE first frame before input completion

The isolated public-fixture test held the server tail after206,800/958,800 bytes. Incremental source-bound output produced an actual360x640 rVFC frame before complete input; EOF-only control produced none until tail release. Incremental completion has six acknowledged appends and progressing frames. Invalid init, tail cancellation and injected play rejection terminate. Five browser trials pass; syntax/static19/19 pass. Review found mux.dispose retained cached media; reset-before-dispose, dropped references/locks/SourceBuffer and awaited shared cleanup now verify populated cache->zero for every trial. Evidence: qa/v2-07b-ts-q1/mse-results.redacted.json. Main-thread/local public media only: product, worker, source-version/account binding, long-run memory/eviction, indexed seek, actual priority and iPhone remain gates. Next: bounded worker ACK and cancellation owner.

### 2026-09-26 — dedicated-worker credits and cancellation

Real module Worker now admits one64KiB transferred input, emits one bounded source-bound fragment and waits for exact ACK, including within an input. Six Chrome trials pass, with a real pre-EOF frame and direct worker-state inspection proving no consumption while the first ACK is held even after the server releases its tail. Completion has six ACKs; abort/error cases clear actual mux backing buffers and all encoded ownership. Pure session output at4093/65536 chunks is identical to the existing strict synthetic positive. Nineteen new tests plus related integration190/190; main-thread baseline5/5 refreshed. Independent review closed ACK-post rejection and cancelled-EOF terminal-in-transit races. Evidence: qa/v2-07b-ts-q1/worker-results.redacted.json. Encoded/cache accounting is not total heap or MSE/decoder memory. Next atomic unit: sustained buffered-window admission/eviction; then indexed time/byte seeks and product integration. No priority/current Drive/device or all-format acceptance, private read, product deployment or remote mutation.

### 2026-09-26 — sustained window and bounded sequential request owner

After21d9df8, a72-second public fixture discriminates unbounded buffering (72.021 seconds retained) from6/4-second forward hysteresis and backward eviction (14.080 total peak,29 removals). Real Chrome reaches ended at verified4x; a16.1-second pause freezes worker/session and server range counters, then resumes all36 fragments/135 requests. Six cases include cancel, injected removal/media-error routing and local strong-ETag response drift. Full native source/output comparisons preserve2160 video frames, PCM, encoded content and metadata. Tests42/42; baseline5/5 and worker6/6 refreshed. Reproduced and fixed normal pause misclassified as play rejection and worker processing deadline counting consumer backpressure; independent review closed lost error-layer reporting and terminal events ignored during a wait. No product/Drive/private access or deployment. Temporal window is not full pipeline memory or arbitrary-GOP/device acceptance. Next: bounded TS duration/time-to-byte indexing and isolated seek, then a source-bound product vertical slice; do not wait for a complete format platform before integration.

### 2026-09-26 — bounded TS timestamp anchors

The next seek prerequisite now scans arbitrary aligned windows without assuming they start at PES/IDR. Complete records only, raw33-bit clocks, safe source offsets and fixed caps are tested14/14,41/41 with related integration. Native independent packet oracle passes five windows. Report: qa/v2-07b-ts-q1/ts-window-results.redacted.json. No exact duration/global clock or decode-start claim; next is bounded target bracketing plus local RAP validation, actual target-frame MSE and product vertical slice. V2-07B stays PARTIAL.

### 2026-09-26 — sparse source-clock RAP candidates

After01cc876, bounded head/tail/interpolation and capped local expansion now find complete local GOP/target brackets. Common AAC/video clock origin stays intact; sampled duration is never exact-global proof. Native180s/localHTTP9/9 matches10/50/90% RAP and packet brackets with7.15% source bytes each.12 helper tests and integration82/82 pass. Root reproduced90% unbracketed failure and fixed complete-GOP/target bracket handling with helper; reader fixed errors are preserved. Report ts-seek-results.redacted.json. Next self-contained local decode-start preparation and actual browser presented target/generation cancellation, then product vertical slice. Full MEDIA acceptance and V2-07B remain PARTIAL.

### 2026-09-27 — source-bound local interval and actual seek frame

After3e07fad, a bounded one-GOP packager copies exact PAT/PMT and selected PES payload/timestamps, normalizes only TS packetization/counters and retains complete AAC preroll/coverage. Independent native3/3 and real Chrome5/5 prove10/50/90% source-clock target frames plus generation replacement/postflight refusal. Native frames match full source, PCM length is exact and matches after explicit one-frame decoder warmup. Review caught a potentially empty PCM comparison and unpinned oracle dependencies; both fixed before final report.10 helper tests plus112/112 integration. Report seek-playback-results.redacted.json. Next continuous post-seek bootstrap into the existing worker/GOP stream, then product vertical slice. One-GOP success is not continuous playback or full MEDIA/device acceptance.

### 2026-09-27 — continuous source-bound seek suffix

Afterf198ca9, bounded bootstrap preserves each admitted original packet/PES once through EOF.13 new tests; related128/128 pass. Native72s3/3 and Chrome9/9 pass10/50/90% seek-to-ended, bounded window, replacement, cancellation, identity drift, injected media error and11.1s EOF pause/resume. Independent review fixed tail pause timeout, error overwritten by cancellation and missing absolute-clock proof. Original180s baseline3-native/5-browser refreshed. Reports continuous-seek-results.redacted.json and seek-playback-results.redacted.json pin final producers.

Independent original AAC suffix coded hashes/counts and all fresh-decoder PCM match without tolerance. Uninterrupted full-source10% PCM differs in16 int16 values by1; retained counterevidence, not a pass. Same-start equality proves no packaging-induced difference, not bit-identical uninterrupted decoder history/browser audible output. Local generated QA only, no private read/Drive write/product/deployment. Next actual source-owner/product slice, not all-format platform prerequisites. Full MEDIA/device and V2-07B remain PARTIAL.

### 2026-09-27 — bounded Q1 product slice (local rc.5)

Afterfad6593, native original code4+one retry now enters actual-byte TS sniff and bounded worker/MSE Q1 without media relay. Source owner uses account/session plus observed content head revision/size/mtime/permission/checksum pre/post fences, not view-sensitive version equality or immutable snapshot fiction. Async source cleanup gates replacement across both seeks and app owners. Product seek supports true start/end picture anchors and real shorter-audio EOF. Build reuses canonical tested primitives without public QA imports; shared allowlist18 assets plus.nojekyll, six media assets precached. See media/README.md for contract, limitations and rollback.

Observed full324 Node, Q1 core120, source21, actual app+SW5 modes, lifecycle6, native5 and existing browser22 pass. Reproduced/fixed near-GOP seek ACK deadlock, fetch abort-before-cancel false failure, MMS setting leak, Q1 seek-watchdog wrong fallback and stale native restore ownership. Native strict start/mid/end output preserves encoded/metadata/absolute clocks/full original-video suffix and all same-start AAC PCM; not uninterrupted decoder-history equivalence. Source drift is diagnosed before any MSE creation. Reports qa/q1-product,qa/q1-lifecycle,qa/q1-preservation pin producers. Independent scoped review clean; no deploy/original mutation/push. Next actual priority read-only full-source discriminator, earlier reusable routing if native whole-body cost is confirmed, then remaining READY lifecycle/state work. Live Drive/device/full-format gates remain open. Corrected V2-05B stale dependency label; local prerequisites are implemented, live session/state/disposable-target gates remain.

### 2026-09-27 — actual local priority full-input discriminator

The208001508-byte original passes current bundled admission at0/10/50/90/near-end, actual Chrome component frames/seeks/full16x EOF+16.1s pause and native complete coded/video/PCM/metadata/absolute-clock equality. Final browser3223presentedframes/1610fragments/120712ms; original fullfingerprint/stat unchanged, temporary derivative removed. Reports qa/q1-priority/*redacted.json and Q1-PRIORITY-20260927.md pin producers and preserve scope. One intervening full browser run failed Q1_SOURCE_READ_FAILED near299s; exact root cause was not captured, next instrumented full run passed. Preserved failure report; no stability claim or acceptance waiver. Full app early TS routing and V2-06B fault/lifecycle recovery remain next, not another all-format prerequisite before this slice. Current live Drive identity, actual-device playback and full-format gates remain open.

### 2026-09-27 — bounded early TS route (local rc.6)

After d4589c8, generic940-byte identity-fenced admission avoids two native wholebody attempts for eligible strict TS. Native capability/nonaligned or unknown size retain Q0; settled non-TS or clean opening revision absence returns Q0. Permission/malformed/drift/unknown cleanup never becomes a format fallback. Prior-owner cleanup gates both routes; late acquired checksum binds seeks. Actual local priority app+SW firstframe/10-50-90%/EOF passes with2,687,372 firstframe bytes,46 finite ranges overall and no native code4; full original fingerprint/stat unchanged. Full334 Node, app16, lifecycle7, legacy browser22 pass. An immediate-native play AbortError regression was reproduced and fixed without weakening its test. Evidence Q1-ROUTING-20260927.md. Current candidate remains rc.4 until independently recorded deployment; V2-06B lifecycle and V2-08A state are next READY, not full completion or live/device proof.

### 2026-09-27 — candidate delivery and bounded503 recovery

rc.6/22f7271 deployed to the approved free candidate;19Git-identical public files,17Git-identical cached shell files, cold/offline Chrome pass. See CANDIDATE-RC6-20260927.md; current candidate remains read-only, production unchanged. Local rc.7 now fixes independently reproduced single503 Q1 termination with one cleanup-fenced same-range retry per player lifetime.12app/SW resilience modes,9source/player lifecycle,16normal product modes and339Node pass. Complete24worker inputs/6output fragments match fault-free control exactly by sequence/offset/size/hash. Malformed/drift/permission/unknown cleanup remain terminal. This does not explain the prior299s READ_FAILED or close real expiry/device/full-format gates. Next actual-app credential/foreground controls, then state migration. Evidence Q1-RESILIENCE-20260927.md.

### 2026-09-28 — resumed rc.8 credential and foreground ownership

D-054 resumes authorized work and permits evidence-based plan changes. Product c49c971 reuses shared auth and fixes missing pageshow/focus expiry rechecks, uncancellable metadata credential waiters, and an actually reproduced SW401 replay after close. Request-specific Q1 lease approval follows rejected-body cleanup and fences cached-newer credentials. Full344Node,17actual-app auth cases with complete24-input/6-output byte equivalence,16normal product and22functional browser cases pass. Evidence: Q1-AUTH-20260928.md. Real expiry/device, indefinite401cancel, historic299s READ_FAILED and full-format/memory acceptance remain open. V2-08A proceeds by reusing the existing writer union with read-only complete snapshots rather than inventing another migration format. The approved free candidate now serves rc.8: exact Worker500506d1 readback,19 public and17 cached Git-equal bodies, cold/offline shell pass; see CANDIDATE-RC8-20260928.md. Drive writes remain disabled and actual-account login is pending.

### 2026-09-28 — local rc.10 whole Q1 retirement

Q1-RETIREMENT-20260928.md records pre-header/credential ownership, scoped SW cancellation and cutoff, matching page readiness and capability/update classification. Independent review closed late native fallback and pending downstream reads. Frozen rc.10 passes358Node/17auth/4retirement/16product/22functional/50cycles150seeks, SWowners0/fences0/cutoff1 each close, Worker/URL200/200 and stable post-GC retained DOM/listeners. Read-only snapshot13+adapter12 pass and refuse pending retirement before Drive reads. Root verified all producers and every50-cycle assertion. V2-06B real duration and historic299s failure, V2-07 full corpus/formats/devices, V2-08 actual origin/local replica and V2-09 physical/two-device gates remain open. No writes, production transition, merge, push or automation restart.

### 2026-09-28 — candidate rc.10 delivery exit

CANDIDATE-RC10-20260928.md records product8187121, publish checkpoint7aa4bc2 and exactWorker85904e0a/readOnly binding readback.19public/17cachedGit-equal files,4private404,cold/offline and managed runtime/protocol/control smoke pass. Actual state capture is blocked by account_not_ready; login remains pending. Local50cycle integration evidence is recorded without relabeling V2-09 real/device/format gates as done. Existing read-only state/corpus adapters are next after authenticated readiness; candidate writes remain disabled and production unchanged.

### 2026-09-28 — connected user profile and controlled state readback

The user reported candidate login/playback. The connected user Chrome profile restores rc.10/ready account without additional login; the isolated managed profile remains anonymous. Actual QA runs exposed ordinary read polling being misclassified as an owner change, then the read-only candidate's pending local-state flush. QA-only adapter correction passes16focused tests, retaining write-sync and applied identity/projection/cache/lifecycle fences. A reviewed total30s developer window holds/restores only this page's state timers and passes20GETs/102048bytes, complete six-document/raw/catalog/union equality and actual runtime reconstruction in29995ms. Candidate-local pending state remains; legacy-origin/fresh-origin/two-device acceptance and writes stay false. STATE-SNAPSHOT-20260928.md and qa/v2-state-snapshot/live-rc10-results.json preserve failed runs, exact producers, actual scope and limits. Product/Worker unchanged; no release, original/appData mutation or automation change. User-requested Windows default playback volume7%to0% readback passes; further media validation uses device-wide silence.

### 2026-09-28 — actual authenticated supplied-file Q1 observation

Actual user Chrome candidate rc.10 presents the supplied208001508-byte original,
then passes10/50/90% normal UI seeks and protocol-confirmed close retirement.
Private pre/post same-owner metadata fields all agree. Q1-LIVE-20260928.md and
qa/q1-live-rc10/results.json pin the fixed product and exact values. The truncated
14-response206 tail is bounded evidence; no complete traffic/startup/body-cost
claim. Pre-first-seek248.891003s does not cross the historic299s discriminator.
V2-07B is now partial with actual priority-frame/seek/close proof; full formats,
real devices, EOF/natural expiry/sleep-wake and broad duration stay open. Source,
Worker, production and data unchanged. Continue independent legacy-origin read
provenance before any state/mutation write gate; volume is no longer controlled.

### 2026-09-28 — one actual PC natural-renewal boundary

The unchanged rc.10 real-account candidate's own renewal installs newer revision/
expiry at257013ms against initial285869ms remaining, with3569728ms extension.
Passive392samples retain owner/readOnly; about6min1x uninterrupted sampled Q1
progress includes106active samples beyond old expiry. Presented310.888s, later
50% seek within2s and close retirement pass. Q1-LIVE-20260928.md and the exact
hashed passive observer/renewal-results.json own evidence. No forced refresh,
clock/product timer/data change. This closes one PC candidate natural-renewal
media boundary, not sleep/wake/Safari/PWA/full-hour acceptance or historic299s cause.
V2-06B/A-004 stay partial. Legacy migration/write/device/full-format gates remain.

### 2026-09-28 — exact old-origin local replica inclusion

Actual matching-account old cache from inert1.21.0 origin is10303bytes and stable
across private captures. Actual current candidate merge includes all legacy7likes/
48unlikes/119viewed within8/48/131 with0semantic/updatedAt changes. Writer IDs are
present/distinct and never copied. QA11tests, exact public execution hashes and
owner/retirement/readOnly checks pass. STATE-SNAPSHOT-20260928.md and
legacy-live-rc10-results.json own limits and cleanup. No storage/remote/product
write. Current-profile legacy-local inclusion is now verified, while remote
persistence/fresh-state/physical-device acceptance stay distinct. User cannot
perform iPhone trial now; continue source-authorized independent desktop work.

### 2026-09-28 — later physical-iPhone report and isolated disposable unit

The user's later report confirms the requested rc.10 version and supplied-video
playback on iPhone. D-056 clarifies that pause without controls is intended; the
designated overlay-only touch area does not work. Never force overlay on pause.
This reportedly dates from an unspecified GitHub version. Exact hit area/mode and
the regression boundary are unknown; mid/end seek and30s return remain unverified.
D-055 queues V2-02C/A-010 after the active unit. Existing D-048 lower-control
ownership is a contract to discriminate, not a reason to dismiss the report.

Source audit separates D-051 recoverable appData migration requirements from
D-050's already approved disposable file writes. A strict QA transport may run
new-test-file move/trash/restore without enabling automatic account sync or
waiting for all physical-device release rows. Same-account root/private-MyDrive
read-only preflight passes; createdItems0 at this checkpoint. Initial QA10tests
pass; final guard review and live side effects have not yet been performed.

### 2026-09-28 — actual restricted disposable mutation result

DISPOSABLE-20260928.md and live-rc10-results.json record the unchanged actual
candidate's35request/8write round trip on3new tagged items, deliberate move
response suppression confirmed without replay,4GET identity recovery and6GET
two-pass stable final metadata. Guard13/13 and final-verifier12/12 pass. The new
file is recoverably trashed and2new folders retained; no existing file/appData/
sharing/permanent deletion. Global flag remains false. The canonical controller
runs in a restricted lexical QA closure, so normal product UI/broad live matrix
are still separate and V2-05B remains PARTIAL.

Failed folder creation-version equality and exact diagnostic producers are
retained; corrected verifier keeps file final-version equality and fresh stable
folder versions. Cause of the advance is unknown. Immediate post-run cache equals
baseline; later2viewed added/1changed, favorites unchanged/baseline retained and
no QA IDs. Entire delta is not in current remote read cache; originating writer/
device/action unknown (A-011), not asserted as a QA product defect. Private handles
released, private recovery ledger retained. Next bounded independent evidence is
current rc.10 corpus probing; completed audit finds rc.4-only stale QA adapters,
unnecessary64KiB non-TS reads and small full-object risk. Preserve historical
reports; no synthetic Q1 owner or maximal-generation retirement.

### 2026-09-28 — current authenticated bounded corpus evidence

CORPUS-RC10-20260928.md pins the actual rc.10 runner and complete risk cover at36
rather than historical38. The QA-only count correction keeps38files/76requests/
2490368bytes, mandatory coverage and every identity/owner/Range gate.23focused
tests pass. Actual36/36 per-file checks use51media/1002780bytes;15TS complete
bounded structures contain H264/AAC with priority target details confirmed.
Final cross-inventory comparator rejects with completefalse; its collapsed code
does not identify the original failure or actual changed dimension (A-012).
No repeated body, product code/data/deployment change or full format/device claim.
Independent state recovery-backup preparation continues under D-050/D-051.

### 2026-09-28 — actual recovery backup and Android testing preference

STATE-RECOVERY-20260928.md closes raw-state recovery backup:10GET/51024bytes/
0retries, six documents, fresh exact old-origin cache/writer, pending preserved.
Controlled15925ms timer reservation restores and post-restoration ownership/cache/
projection checks pass. New private102758-byte envelope is flushed and fully
reread with actual merge/whole-original equality; restricted ACL/ignored/tracked0.
11helper+8facade tests pass. No appData write/global flag change/device acceptance.
Candidate own writer absent; legacy writer visible in current appData catalog.
Fresh pre-submit checks and isolated canonical own-writer save/readback are next;
capture is not a remote lock or live-submit freshness proof.

D-057 directs mobile work to use available Android mobile before user handoff.
Record Android device/emulator versus desktop simulation separately; retain
iOS-specific unknowns. D-056 forbids overlay on pause and keeps the separate
overlay-only region defect queued while current state work continues.

### 2026-09-28 — restricted own-writer unit closed; WAIT

OWN-WRITER-20260928.md records one canonical own-name POST and21 focused checks.
Initial same-lock readback catalog403 remains submission_uncertain; a later
complete read-only capture confirms the exact own body, all six older raw
documents/metadata unchanged and remote9liked/48unliked/133viewed, pending=false.
No CREATE replay. Three private recovery files and confirmed journal are retained,
full disk reread/actual-product reconstruction pass. A-013 keeps the intermittent
read causes unknown. Global writes=false, normal sync/UI/fresh-origin/devices and
production release remain separate. D-058 closes this unit with records/commit/
report, then WAIT; Android/mobile and next units require an explicit resume.

### 2026-09-30 — whole-goal continuation and rc.16 presentation repair

D-061/D-062 resume the whole approved goal; verified units are savepoints and do
not terminate that continuation. PLAYER-PRESENTATION-20260930.md records a real
same-session source-rebuild loading deadlock and its minimal source-owned key
repair. Complete current Node558/558 and native synthetic6/6 desktop/touch cases
pass, with twelve target-frame seeks and exact before/after producers. Actual
rc.15 priority TS also reproduced loading residue after a settled50% paused seek.
Current rc.16 candidate replay remains separate until delivered and observed.

New fixed-rc.15 lifecycle proof covers3cold Q2 starts,50mixed cycles/150 native
target seeks,12Q0 frame-order checks,16Q1 and16Q2 resource checks and72s native
Q0/Q2 ends. Q1's finite endpoint is separately adjudicated from its retained strict
float failure, without inventing post-long app/SW retirement. These are bounded
synthetic observations. Renderer private-memory growth remains unqualified despite
zero owned workers/URLs/SW transports and stable post-GC JS/DOM/listeners. Native
resource investigation, corpus/format coverage, actual return/device/two-device
and production-authority gates remain open. Continue executable work autonomously.

### 2026-09-30 — rc.16 delivery, new actual paused-seek counterexample and continued acceptance

Confirmed fixed publice57d7b5/Workercbbafb96 delivery:52 delivered (51allowlisted plus.nojekyll)/40cached, ZIP/source-readiness and558Node tests. Actual same-account normalupdate10/50/90 frameproof found50% loading residue twice; same source/seek additionalplayingframe clearsit. Composite-key repair does not close late paused presentation ordering. NEW isolated native resource50/150 and170/170 MS/SB/Worker finalizations pass under explicit Network observerreset/closed dwell; no normal-runtime/device ceiling. NEW synthetic image evidence exposes static-list WebP animation; card-only reuse prepared, not integrated.42/42 outstanding baseline rows mapped. Corpus wrapper15localchecks/oracle passes, actualfile-selection blocked by extensionlocalfileURLpermission beforemedia reads; precise questionpending while pausedseek and>360s Q2 workcontinue. All whole-goal/device/format/Q3/production boundaries remain. See CANDIDATE-RC16-20260930.md and exact NEW QA leaves.

### 2026-09-30 — rc.17 actual paused-seek closure and remaining quality work

Confirmed code54654ce, final562Node, independentbothcallbackorders andnativeQ0/Q2 sixpausedseeks. Candidate17Worker00020d64 delivery52public/40cached/26preferred/package passes. Actualsame-accountTS10/50/90/repeated50 frames+seeked complete withpaused loaderfalse/keynull/currentdecodedproof; no resumerequired,250msstable4frames, Escapeclearsseek/proof/selectedowners ready0/buffers0/retirementtrue. CurrentSrcstickyboolean retained, notemptinessproof. Native16 synthetic420sQ2 nowpasses true299/360 framecheckpoints+nativeended/sourceEOF/completeworker/SWclose; actualaudibility/expiry/device remainseparate. Hosted16anonymous12negativecases pass butactualobservability/historyunknown. G5actualseekframes12.8-16.7s warrantscausal investigation, notthresholdweakening. WebPcard18local/native4cases andfocused3 pass, rootfinal563Nodepasses; code/deliverysavepointpending. CorpusfileURLmanualpermissionpending; independentworkcontinues. SeeCANDIDATE-RC17-20260930.md and exactNEWleaves.

### 2026-09-30 — rc18 local static WebP card unit

WebP cards now reuse bounded static canvas thumbnails; original animation/bytes remain intact. Baseline regression fails, focused3/3, native4/4 and stable full563/563 pass. WEBP-CARD-20260930.md owns exact evidence. Candidate delivery is next; whole-goal gates remain open.

### 2026-09-30 — rc19 TS probe reuse and actual causal observation

Confirmed df1f94a/Worker66183425 delivery52/cache40/source26/six/package;569Node/focused43/syntheticfive seeks/end/independent review pass. Actual same-original paused50% currenttargetframe11.0043s/sample settled12.9788s plus300ms stable ready4/loaderfalse; predicted2Range/4metadata removal observed vs18, no p95 claim. Escape cleans all owners/observers. One pointer-only bottom→center clause hides331.7ms without playback/click events. CANDIDATE-RC19-20260930.md owns exact scope.69baseline IDs/statuses and42remaining mappings preserved in rc18-acceptance-state; zero whole-row promotions. Supported PNG declaredvideo/mp4 owner counterexample is nextnecessaryunit20; actual corpus permission/device/expiry/OSreturn/two-device/explicit hosted observability/production gates stayopen. Continue authorized executable work.

### 2026-09-30 — rc20 image-owner delivery and actual controller-transition counterexample

Confirmed892722c/Worker553d8644 delivery52/cache40/source26/six/package,605stableNode/80focused/8native/two20integration/independentreviewpass. Actualnormal20update restoresaccount/root13/knownfolder458/cachedGit andpostoldcredentialdeadline TSframe/settledclose.19credentialadvancesnaturally withoutQAforcedrefresh/newgrant, butfirst19startupcrossingnewSWsilentlycancelsQ1 withnoerror andclosedretirementfalse; expirypositionrow remainsunqualified. Necessary21safeupdate-recovery unitactive, notbarrierwaiver. AndroidPATH/defaultSDKavailabilityreadonly isnotphysicalproof. Corpus/device/two-device/OSreturn/wholeexpiry/security/explicitobservability/productionremainopen; continueauthorized executablework. CANDIDATE-RC20-20260930.md owns exactscope.

### 2026-09-30 — rc.21 bounded worker recovery and honest delivery boundary

D-061/D-062 continuation produced source3ebd97d/runtime21/Workerb1021a42. A real old-controller Q1 silent cancellation is replaced by visible explicit document-reload guidance while retaining the unconfirmed retirement barrier and file/account/lifetime fences.19focused+5existing/624stableNode/read-only independent review and separate exact21 stable native TS/current-owner/frame/settledclose pass. Six complete real replacement/reload/reopen chains remain failed with additional controller replacement after reload; cause unknown, no fullSW01/REL02 promotion.52public/40cache/source26/six/exactZIP and actual same-account normal21update/knownfolder458/nativeframe/settledclose pass. Remaining corpus permission, full replacement chain, uninterrupted expiry/position, physical/two-device/OSreturn, authenticatedsecurity/explicitobservability and production-authority gates remain open. Goal incomplete; no production/main/push/original/automation changes. CANDIDATE-RC21-20260930.md owns final scope.

### 2026-09-30 — environment-only preparation, explicit nighttime resume pending

D-064 replaces current execution with environment preparation and WAIT; earlier
continuation entries are historical. Codexon shutdown was explicitly authorized
and verified, allowing the existing native-launch memory floor to pass. Official
portable scrcpy4.1/ADB1.0.41 archive/hash/version checks pass. Android connection
is deferred by the human; no device or mobile acceptance is claimed. Actual
managed Chrome MCP list/evaluate and native Windows inventory were observed
callable; normal Chrome's existing Cloudflare account-home login is ready.
Prepared local preflight and zero-context resume guide are environment outputs,
not product tests or whole-goal closure. No product code/deployment/media/state
write/permission expansion/automation resume took place during preparation.

Prior-scope new controller/hosting/Android discovery evidence is curated as a
savepoint without changing old results. Preserve six failed full recovery chains
and two memory-gated fixed-body attempts; only a new named attempt may run after
explicit resume. Read-only official analytics now inform the security/hosting
gates, but exact Free/plan/billing safety and effective null/omitted observability
remain unknown. Corpus transport failed before factory execution; extension
file-URL approval/manual setup remains pending. NIGHT-ENVIRONMENT-20260930.md
and qa/night-environment-20260930 own the preparation evidence and boundaries.

## 2026-09-30 22:35 — device and local-file setup readiness only

D-065 resolves the earlier Android deferral and pending PC file-access setup.
One authorized SM-X800/Android16 has a real MCP-observed signed-in rc.21 library;
personal PC Chrome reads the local QA factory with exact byte/hash equality.
`qa/android-environment-20260930` preserves all readiness attempts and cleanup.
No factory/playback/gesture/OS-return acceptance ran, and PC/Android same-account
identity was not independently compared. D-064 environment-only WAIT remains.

## 2026-09-30 — D-066 current acceptance override

G5 uses actual PC/Android account, playback, input, OS-return and state evidence.
Physical iPhone Chrome/Safari/standalone/VoiceOver clauses in the original spec
are post-deployment followups and no longer block this candidate's acceptance.
Historical evidence/spec rows remain unchanged; Android is never labelled iOS
proof. Shared codec/auth/state/cleanup criteria remain required. Continue every
executable implementation and acceptance unit without stopping at savepoints.


### 2026-10-01 — final24 delivery and two-foreground state savepoint

Candidate24 source8a/Workerc57 fixed delivery/package/private-codec readiness passed; CANDIDATE-RC24-20261001.md owns exact identity/failure preservation. Same-account operational normal UI challenge on source23: PC→Android like14.927s/viewed16.415s, Android→PC viewed14.132s, reverse unlike<=57.795s. Canonical remote10-doc comparison retains all documents/eight raw unchanged and every non-target favorite/viewed, target favorite initialfalse restored by monotonic false tombstone; freshviewed preserved. Raw prestate was page-local and cleaned, no identity fingerprint/token/data exported. Root qa/rc21-two-foreground-state/root-state-result.json and Android68-attempt curation own scoped proof; offline/conflict/reconnect and whole row remain open. Passive24 expiry observer independently reviewed and Drivegen/abort/strict15s-gap fixes prepared, actual ongoing-player run pending. Whole corpus first8 limited signatures are seven admitted/one timed out; no all-corpus/codec/decoder claim. Continue executable work.
