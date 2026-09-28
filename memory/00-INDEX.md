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

- `architecture/V2-04A-AUTH-CONTRACT.md`: local same-origin session/auth implementation at `ed8b619`, deterministic security/concurrency evidence and explicit V2-04B live boundary.
- `IMMERSIVE-20260919.md`: v1.21.0 implementation, nine requested fixes, observed tests and physical-device boundaries. Production publication is recorded separately in the current checkpoint/release record.
- `RELEASE-1.21.0.md`: verified current production identity, public-byte checks, cold browser smoke and explicit hardware/Google boundaries.

- `AUDIT-20260917.md`: comprehensive defect inventory, scope, proof and explicit limitations.
- `RELEASE-1.20.0.md`: production deployment verification once complete.
- `../qa/`: reproducible local-only browser fixture drivers.

- [ACCEPTANCE-20260917.md](ACCEPTANCE-20260917.md): v1.20.0 follow-up, reproduced foreground/edge defects, v1.20.1 candidate evidence and open physical-device gates.
