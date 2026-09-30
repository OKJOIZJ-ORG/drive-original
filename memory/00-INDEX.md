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
| `checkpoints/` | Historical checkpoint snapshots | Append-only |
| `architecture/` | Evidence-backed architecture adoption records | Append a new record; supersede rather than rewrite an adopted decision |
| `goal/drive-scale-stability.md` | Canonical structure and evidence for the completed large-library stability goal | Version cuts; never silently overwrite superseded structure |
| `goal/commercial-player-stability.md` | Canonical structure and evidence for the active commercial-grade player and library goal | Update evidence and gates in place; never weaken acceptance criteria silently |
| `specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md` | Active integrated v3.0 product specification and execution protocol | Preserve byte-for-byte; progress remains owned by the goal and checkpoint |

## Operating principles

1. Record decisions and important facts in-session.
2. Distinguish user-confirmed decisions from AI proposals and assumptions.
3. Claims carry `confirmed`, `observed`, `assumed`, `hearsay`, or `unknown` labels.
4. External product claims require current evidence in `PRODUCT-TRUTH.md`.
5. Register unresolved items instead of remembering them informally.

## Current audit and release records

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
- `Q1-Q2-INTEGRATION-20260930.md` — rc.15 local app/source/lifetime/capability integration, final557 Node and3 native routes, source rights/delivery preparation and explicit remaining gates.
- `Q2-SOURCE-PUBLICATION-20260929.md` — exact seven-part source/relink package and same-toolchain bridge/WASM reproduction; public delivery is recorded separately.
- `CANDIDATE-RC15-20260930.md` — fixed rc.15 source/Worker/52 public/40 cached/source-readiness/package evidence, retained materializer uncertainty and open account/device gates.
- `PLAYER-PRESENTATION-20260930.md` — rc.16 source-owned frame handoff, reproduced loading residue, retained QA ordering failures,558 Node and6 native UI cases; full goal continues.

- CANDIDATE-RC16-20260930.md — fixed rc.16 delivery/package, actual paused TS failure, observer-qualified native resources and remaining42-row acceptance map.
