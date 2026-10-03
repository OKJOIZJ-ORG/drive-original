# memory/ — Drive Original brain

Purpose: this folder is the durable memory for Drive Original. Conversations forget; this folder does not. What is recorded here survives topic changes, session resets, and context compaction.

## File map

| File | What | Write rule |
|---|---|---|
| `DECISIONS.md` | Confirmed decisions | Append-only. Supersede protocol — never edit past entries |
| `OPEN-QUESTIONS.md` | Unresolved items and provisional readings | Close each row with the resolving decision/finding, or explicitly drop it |
| `SESSION-LOG.md` | What happened, per working session | Append, dated |
| `PRODUCT-TRUTH.md` | Evidence-backed product capabilities | Evidence + date only; implemented / not implemented / excluded |
| `CHECKPOINT.md` | Current thirty-second return point | Replace with the latest state; archive the outgoing copy first |
| `HANDOFF.md` | Single-use instructions after an explicit pause; currently absent | Consume/delete on resume |
| `REBOOT-RESUME-20261001.md` | Fresh browser/helper binding and continuous PC replay after the clean reboot | Local preparation only; resume on direct user instruction |
| `NIGHT-ENVIRONMENT-20260930.md` | Historical PC/Android preparation and dated D076 actual iPhone Safari tooling readiness/commands | Update verified preparation state; no implied product execution or wakeup |
| `checkpoints/` | Historical checkpoint snapshots | Append-only |
| `architecture/` | Evidence-backed architecture adoption records | Append a new record; supersede rather than rewrite an adopted decision |
| `goal/drive-scale-stability.md` | Canonical structure and evidence for the completed large-library stability goal | Version cuts; never silently overwrite superseded structure |
| `goal/commercial-player-stability.md` | Canonical structure and current remaining original acceptance for the commercial-grade player and library goal | Update evidence and gates in place; never weaken acceptance criteria silently |
| `specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md` | Active integrated v3.0 product specification and execution protocol | Preserve byte-for-byte; progress remains owned by the goal and checkpoint |

## Operating principles

1. Record decisions and important facts in-session.
2. Distinguish user-confirmed decisions from AI proposals and assumptions.
3. Claims carry `confirmed`, `observed`, `assumed`, `hearsay`, or `unknown` labels.
4. External product claims require current evidence in `PRODUCT-TRUTH.md`.
5. Register unresolved items instead of remembering them informally.

## Current audit and release records

- `../qa/playback-repair/README.md` and `results.json`: D077 local repair plus D0781.22.1 served/cache/actual operating Safari evidence, retained failures/cleanup and exact ZIP. D079 removes Notion releases; its page deletion is refetched. Original acceptance remains separate.

- `RELEASE-1.22.1.md`: D078 main/push/Worker1.22.1 complete, public runtime d0bdde5/Workerbf47cfd4, actual Safari two witnesses/seeks/portrait geometry and original acceptance limits; D079 local/Git release ownership.

- `RELEASE-1.22.0.md`: D075 main/push/production complete; source54e786f/Workere70754c7, legacy Pages handoff20d864c,843checks, served65/cache51 and verified ZIP. Original-spec audit keeps actualBMP, sustained device resources and historical active-update failures open, with conditional formats and deferred iOS separated.

- `CANDIDATE-RC38-20261003.md`: completed finite candidate, original22.3 ten-item report, bounded nativeQ2/Q3 and exact current PC/physicalAndroid AAC3 proof. Historical candidate identities remain immutable; current production owner RELEASE-1.22.0.md.

- `CANDIDATE-RC37-20261003.md`: exact37 delivery/current PC-Android preservation, actual CORS reader qualification, finite controlled matched pair and pending file-URL runtime boundary.

- `CANDIDATE-RC36-20261002.md`: exact rc36 delivery, current normal PC/physical Android source-account qualifications, retained QA failures and remaining color/regression scope.

- `COLOR-INTERPRETATION-20261002.md`: local identity-bound observed SDR output config, final PC/Android tuple and seek proof, retained strict RGBA failure and pixel/HDR limits.

- `CANDIDATE-RC35-20261002.md`: exact rc35 delivery, finite PC/Android qualifications and original69 bounded-status adoption; retained failures and remaining color/performance scope.

- `CANDIDATE-RC34-20261002.md`: Q3 reader delivery/package and normal PC/Android
  updates; actual sustained endpoint and retained strict event-oracle failure.

- `CANDIDATE-RC33-20261002.md`: exact33 Q3 candidate delivery/package and normal
  PC/Android update; retained readiness-tool failures, actual Q3 pending.

- `CANDIDATE-RC32-20261001.md`: exact32 delivery/normal updates and actual Android
  TS reuse/EOF/cleanup; retained PC timeout/deeper failures and D069 WAIT.

- `TS-PROBE-RETENTION-20261001.md`: reviewed bounded raw same-player TS probe
  retention, focused49/independent5 and final742 local checks; actual Android32
  evidence is scoped in CANDIDATE-RC32, PC replay remains pending.

- `DISPOSABLE-UI-RC31-20261001.md`: actual exact2 normal move/trash, independent
  API/web/G observations, restoration and exact4 recoverable cleanup; G direct-ID
  limit and prior validation-tool failures retained.

- `CANDIDATE-RC31-20261001.md`: completed immutable31 delivery, actual normal
  updates/full30 performance/deeper/passive latency and retained cookie failures.
- `VIRTUAL-WINDOW-COVERAGE-20261001.md`: observed top-card omission, local scheduler
  repair with the240cap and731product checks; delivered32, actual viewport
  return verification remains pending.

- `ACCOUNT-JSON-DEADLINE-20261001.md`: source31 total30s account GET deadline,
  preserved projection/cache and missing-writer recovery;730 local product checks
  and independent review. Actual candidate31 delivery remains separate.

- `TS-SHORT-EOF-20261001.md`: exact-EOF terminal GOP repair, synthetic native
  equivalence and actual30 PC same-file startup/seek/EOF/reopen; retained broader
  performance and Android automation failures.

- `CANDIDATE-RC29-20261001.md`: actual candidate29 delivery/package, normal PC/Android update/layout/quiet sync, bounded structural result and retained actual TS failure; D-068 ACTIVE.

- `LOCAL-RC29-20261001.md`: exact-two normal disposable capability and native five-viewport PC layout correction, current local integration; actual candidate replay pending.

- `RESUMED-ACCEPTANCE-20261001.md`: actual two-device natural renewal, PC post-renewal seek, current full raw-state backup/reconstruction/recomparison, bounded corpus failure and queued PC layout fix; D068 ACTIVE.

- `CANDIDATE-RC28-20261001.md`: fixed27/28 shell delivery, actual PC normal update and Android source/cache/landscape evidence; historical D-067 savepoint, D-068 continuation and remaining gates.

- `CANDIDATE-RC26-20261001.md`: fixed3ee free candidate26/655/delivery/audio-tail correction; actual PC normal update failure and partial reload recovery retained.

- `CANDIDATE-RC25-20261001.md`: fixed7ba free candidate25 delivery/650 checks; safe native retention and remaining audio-only-tail endpoint failure, reused-context network discriminator and exact ZIP.

- `CANDIDATE-RC24-20261001.md`: fixed8a free candidate24 delivery/package643 tests; actual natural continuity and broader acceptance remain separate.

- `CLEANUP-20260927.md`: recoverable generated-output cleanup, preserved data, regeneration and exact archive recovery; product work remains paused.
- `Q1-PRIORITY-20260927.md`: full read-only priority local Q1/browser/native evidence, exact scope and next routing defect; not live Drive/device acceptance.
- `Q1-ROUTING-20260927.md`: rc.6 bounded early TS routing, exact local app/priority evidence, regression and recovery scope.
- `CANDIDATE-RC6-20260927.md`: isolated free rc.6 delivery identity, public/cache bytes, cold/offline smoke, live limits and rollback.
- `Q1-RESILIENCE-20260927.md`: local rc.7 single503 recovery, cleanup/content guards and byte-equivalent fault control; not real expiry/device proof.
- `Q1-AUTH-20260928.md`: local rc.8 foreground/credential waiter fixes, stale SW replay counterexample and request lease; synthetic/live evidence boundary.
- `CANDIDATE-RC8-20260928.md`: rc.8 candidate identity, committed public/cache byte comparison, cold/offline smoke and candidate-only recovery.
- `STATE-SNAPSHOT-20260928.md`: complete read-only state collector/comparator and private candidate adapter, synthetic checks and live migration boundaries.
- `Q1-CLEANUP-20260928.md`: bounded SW401 cancellation, client Q1 fence, sticky source uncertainty and retained cross-route/live limitations.
- `Q1-CYCLES-20260928.md`: actual-app50cycle/150seek cleanup, balanced worker/URL owners and post-GC DOM/listener evidence with retained failed raw sample.
- `Q1-RETIREMENT-20260928.md`: whole Q1 SW ownership, scoped cross-route readiness, update capability, late fallback and downstream-read counterexamples.
- `CANDIDATE-RC10-20260928.md`: fixed rc.10 candidate/Worker identity, public/cache Git equality, anonymous state gate and unchanged live boundaries.
- `Q1-LIVE-20260928.md`: actual authenticated priority frames,10/50/90% UI seeks, private metadata readback and protocol-confirmed close; explicit duration/device/trace limits.
- `DISPOSABLE-20260928.md`: restricted actual canonical-controller disposable move/trash/restore, independent final reads, private recovery, folder-version correction and later unexplained cache drift; normal UI/appData/device gates remain open.
- `CORPUS-RC10-20260928.md`: current36representative byte/TS checks, historical-count discriminator, bounded read evidence and unresolved final comparator rejection; all-format/device/catalog acceptance remains partial.
- `STATE-RECOVERY-20260928.md`: actual raw-state private disk backup, flush/reread reconstruction, preserved legacy/pending state, restricted ACL and exact producers; persistence/device/release remain separate.
- `OWN-WRITER-20260928.md`: one restricted canonical own-writer POST, preserved failed403/readback, later full raw confirmation and private recovery; historical D-058 closeout superseded by D-059 continuation.
- `STATE-NORMAL-20260928.md`: rc.11 scoped normal state-write transport, stable-ID CREATE, actual normal sync/full raw readback/reload and isolated empty-cache/old-code compatibility; live-device limits preserved.
- `PC-OUTPUT-20260929.md`: actual Q1 native output error, independent fresh-document PCM discriminator and read-only Windows endpoint evidence; actual30s-return unperformed, no volume/settings changes or product-cause claim.
- `PC-POSTREBOOT-20260929.md`: fresh actual PCM and priority Q1 startup/presentation/keyseek/resume/close after user reboot; native hidden-return unavailable, exact producers and prior causes retained.
- `ISO-HEADERS-RC11-20260929.md`: current actual first ISO top-level chain, strict3GET/956bytes and repeated catalog stability; active SW runtime cache-write proof; tracks/codecs/playback/full formats remain separate.
- `CANDIDATE-RC11-20260929.md`: fixed candidate source/Worker/public/cache identity, actual same-account state acceptance, protected recovery and candidate-only rollback scope.
- `CATALOG-DIAGNOSTICS-20260928.md`: redacted comparator causes and a separate metadata-only diagnostic driver; local preparation, historical failure not retrospectively resolved.

- `architecture/V2-04A-AUTH-CONTRACT.md`: local same-origin session/auth implementation at `ed8b619`, deterministic security/concurrency evidence and explicit V2-04B live boundary.
- `IMMERSIVE-20260919.md`: v1.21.0 implementation, nine requested fixes, observed tests and physical-device boundaries. Production publication is recorded separately in the current checkpoint/release record.
- `RELEASE-1.21.0.md`: verified current production identity, public-byte checks, cold browser smoke and explicit hardware/Google boundaries.

- `AUDIT-20260917.md`: comprehensive defect inventory, scope, proof and explicit limitations.
- `RELEASE-1.20.0.md`: production deployment verification once complete.
- `../qa/`: reproducible local-only browser fixture drivers.

- [ACCEPTANCE-20260917.md](ACCEPTANCE-20260917.md): v1.20.0 follow-up, reproduced foreground/edge defects, v1.20.1 candidate evidence and open physical-device gates.

- `CORE-REPAIRS-20260929.md`: local AUTH05 capability/regrant and delayed-frame seek fixes; actual rc11 WebM/largeISO and MKV clock failures, baseline contract/package scope.

- `FORMAT-PLAYBACK-20260929.md` — actual WebM/large-ISO/TS clock discriminants and local original-clock repair, with live boundaries.

- `QUALIFICATION-BASELINE-20260929.md` — fixed rc.11 acceptance review, focused contracts and public ZIP.

- `ISO-TRACKS-20260929.md` — actual4.6GB sparse track metadata without whole-moov reads.

- `PLAYER-QUALITY-20260929.md` — reproduced player entry/cursor/poster/status repair and rc.12 integration evidence.

- `SAR-AND-LIBRARY-20260929.md` — actual valid non-square SAR discriminator, preserved-original repair, successful large-ISO50/90% replay and proactive library/update quality.
- `CANDIDATE-RC13-20260929.md` — fixed rc.13 delivery/package, actual MKV/AVI replay and separate local privacy repair.
- `Q0-AND-PRIVACY-20260929.md` — actual rejected content-validator discriminator, current short WebM replay, reproduced console canary repair and source-fence continuation.
- `Q0-REVISION-SNAPSHOT-20260929.md` — actual disposable A/B revision pin proof, preserved failed baseline and bounded consumer-drain repair; product integration remains separate.
- `Q0-PRODUCT-20260929.md` — actual app/SW immutable revision, cold-control and full-original ownership, independent protocol/native proof and candidate delivery boundary.
- `CANDIDATE-RC14-20260930.md` — fixed rc.14 public/cache/Worker and package identity, signed-in desktop WebM/large-ISO playback, and explicit transfer/device limits.
- `Q3-FEASIBILITY-20260930.md` — synthetic MPEG4 Part 2 to lossy VP9 build/browser/oracle proof; corpus necessity, product integration and physical devices remain open.
- `Q3-PRODUCT-20261002.md` — explicit product Q3 choice, bounded same-clock MPEG4/VP9 worker integration, independent edit repair, synthetic/source proof and remaining actual-device gates.
- `Q1-Q2-INTEGRATION-20260930.md` — rc.15 local app/source/lifetime/capability integration, final557 Node and3 native routes, source rights/delivery preparation and explicit remaining gates.
- `Q2-SOURCE-PUBLICATION-20260929.md` — exact seven-part source/relink package and same-toolchain bridge/WASM reproduction; public delivery is recorded separately.
- `CANDIDATE-RC15-20260930.md` — fixed rc.15 source/Worker/52 public/40 cached/source-readiness/package evidence, retained materializer uncertainty and open account/device gates.
- `PLAYER-PRESENTATION-20260930.md` — rc.16 source-owned frame handoff, reproduced loading residue, retained QA ordering failures,558 Node and6 native UI cases; full goal continues.

- CANDIDATE-RC16-20260930.md — fixed rc.16 delivery/package, actual paused TS failure, observer-qualified native resources and remaining42-row acceptance map.

- PAUSED-SEEK-PRESENTATION-20260930.md — rc.17 owned decoded target/seeked handoff, independent early-reveal counterexample and562 local tests; actual replay pending.

- CANDIDATE-RC17-20260930.md — fixed rc.17 delivery/package and actual four paused TS seeks, native Q0/Q2, retained long-Q2/security scopes; G5 remains open.

- [WEBP-CARD-20260930](WEBP-CARD-20260930.md) — rc18 static WebP cards, native4/4 and complete563/563 local proof; candidate/whole-goal limits.

- [CANDIDATE-RC18-20260930](CANDIDATE-RC18-20260930.md) — fixed WebP candidate52/40 delivery and actual one-seek causal13.37s record; whole goal ACTIVE.

- [rc18 hosted settings](../qa/rc18-hosted-settings/README.md) — stable actual control-plane reads; Logpushfalse/no Tail Worker, observability null/omitted remains UNKNOWN.

- [TS-PROBE-REUSE-20260930](TS-PROBE-REUSE-20260930.md) — bounded admitted within-generation input reuse,43focused/nativeQ1/569full local proof; candidate/actual comparison next.

- CANDIDATE-RC19-20260930.md — fixed rc19 delivery/package, actual one-case request-count/targetframe/settlement and pointer-only clause; remaining whole-goal gates.

- IMAGE-OWNER-20260930.md — positive pinned raster owner correction, retained failures,80focused/8native/independent review and605full/two rc20 integration cases; whole goal remains open.

- CANDIDATE-RC20-20260930.md — fixed image-owner20 delivery/actual normal update/postdeadline frame; real controller-transition silent cancellation preserved for21 and whole-goal gates remain open.

- WORKER-UPDATE-RECOVERY-20260930.md — bounded visible Q1 recovery with strict false barrier,19+5 checks/624integrated/normal21native; six fullreload aggregates remain failed and preserved.

- [CANDIDATE-RC21-20260930](CANDIDATE-RC21-20260930.md) — fixed21 delivery/624checks/actual normal account startup and settled original close; six full worker-reload chains remain failed.

- [Night execution prerequisites](NIGHT-ENVIRONMENT-20260930.md) — D-066 ACTIVE whole queue, actual Android candidate login, PC local-file delivery and portable tools; [readiness evidence](../qa/android-environment-20260930/README.md). iPhone-only checks are post-deployment followup.
- [Current69-row queue](../qa/rc21-night-acceptance/README.md) — exact original ID/status mapping and current scope; no whole-row promotion.
- [Native SW continuity](../qa/rc21-controller-continuity-night/README.md) — exact-product local native replacement/reload/reopen/close passes under direct CDP synthetic provider; prior failures retained.
- [Actual hosting settings](../qa/rc21-hosting-night/README.md) — current dashboard Free/no payment method/effective logs and traces off; absent billing/retention controls remain unknown.
- [Corpus diagnostics](../qa/rc21-corpus-night/README.md) — bounded metadata coalescing, actual v1 timeout/v2 final-cleanup failure and separate metadata-only discriminator; full corpus remains open.
- [Gesture reservation](GESTURE-RESERVATION-20260930.md) — reproduced native subthreshold contact loss, summary guard correction, trusted local Android renderer and629 Node checks; fixed hosted/device qualification next.
- [Natural renewal observer](../qa/rc21-renewal-night/observer.expression.js) — private-owner bounded actual PC ongoing-frame journal; results pending at source preparation.

- `CANDIDATE-RC22-20261001.md`: fixed22 free delivery/public/cache/package and actual Android scope.
- `AUTH-RENEWAL-20261001.md`: local failure mechanism, bounded recurring client recovery, independent review and unperformed actual23 boundary.

- `AUTH-BODY-DEADLINE-20261001.md`: successful auth body timeout/transport recovery and terminal/cancel distinctions, local24 qualification.
- `TS-SHORT-EOF-20261001.md`: actual29 singleton EOF cause, local30 original-frame correction and pendingPlay lifecycle fix; actual30 replay remains pending.
