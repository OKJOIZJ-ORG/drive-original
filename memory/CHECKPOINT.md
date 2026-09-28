# Checkpoint — rc.8 delivered; state snapshot next — 2026-09-28 10:15

## The story so far

Repo `C:/extensions/Drive-Original/source`, branch `codex/v2-kickoff-diagnostics`.
Product `c49c971`, docs `0846242`, rc.8 now served by candidate Worker
`500506d1-d0f1-48e4-b213-ecb1b96d9bcf`. 19 public/17 cached Git-equal bodies,
cold/offline Chrome pass. Full344Node,17auth,16product,22functional local checks
pass. Q1-AUTH-20260928.md and CANDIDATE-RC8-20260928.md own evidence/limits.

V2-08A uses the existing writer union; a bounded read-only snapshot/comparator is
being implemented in qa/v2-state-snapshot. No new storage schema is needed.
V2-06B real expiry/device, indefinite401cancel and historic299s READ_FAILED remain
open. Production Pages v1.21.0 is unchanged.

## Decided

D-054 resumes work and ends D-053 wait. Judge plan means/order by evidence while
preserving goals and D-050 boundaries. Candidate Drive writes stay disabled;
automation paused; original media read-only; no main merge/push/production change.

## Waiting on the user

Actual Google login in the visible DevTools candidate tab was requested to enable
read-only live checks. Physical iPhone/PWA media checks still remain.

## Next first action

Inspect git status, finish/review the QA-only state snapshot and comparator,
then use the same managed candidate session after actual login. Do not infer state
migration success from matching counts or runtime schema normalization.

## Tried

- Page fetch abort alone could not prevent stale SW401 replay; exact owner
  approval after body cleanup also fences cached-newer token paths.
- Existing appData writer union is adequate; adding another schema would add risk.
- Prior299s READ_FAILED is unexplained; the later success does not explain it.
