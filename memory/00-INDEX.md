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
| `goal/drive-scale-stability.md` | Canonical structure and evidence for the active maintenance goal | Version cuts; never silently overwrite superseded structure |

## Operating principles

1. Record decisions and important facts in-session.
2. Distinguish user-confirmed decisions from AI proposals and assumptions.
3. Claims carry `confirmed`, `observed`, `assumed`, `hearsay`, or `unknown` labels.
4. External product claims require current evidence in `PRODUCT-TRUTH.md`.
5. Register unresolved items instead of remembering them informally.
