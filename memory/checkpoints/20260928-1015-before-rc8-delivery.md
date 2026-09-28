# Checkpoint — resumed rc.8 auth unit; state next — 2026-09-28 10:08

## The story so far

Repo `C:/extensions/Drive-Original/source`, branch `codex/v2-kickoff-diagnostics`.
Verified product `c49c971`, local rc.8: foreground expiry recheck, cancellable
shared-auth waiters and exact Q1 media leases before SW401 replay.344Node,
17auth/foreground,16product and22functional checks pass. Q1-AUTH-20260928.md
owns reproduced failures and limits; prior failed reports are preserved.

Candidate remains rc.6 until delivery readback; production v1.21.0 unchanged.
V2-06B real expiry/device/indefinite401cancel and historic299s READ_FAILED remain
open. Existing writer union is adequate for origin reconstruction; V2-08A needs
strict complete read-only before/after state comparison, not a new storage schema.

## Decided

D-054 explicitly resumes work and ends D-053 wait. Judge plan means/order by
observations while preserving goals and D-050 boundaries. Candidate Drive writes
disabled; automation paused; media read-only; no main merge/push/production change.

## Waiting on the user

Actual Google login in the DevTools candidate and physical iPhone/PWA checks are
still needed after candidate delivery. Continue independent local work meanwhile.

## Next first action

Run `git -C C:/extensions/Drive-Original/source status --short`, then finish strict
V2-08A snapshot/comparator QA and publish the verified free rc.8 candidate only.

## Tried

- Page fetch abort alone did not prevent SW401 replay after close; require the
  requesting media lease even when SET_TOKEN has already advanced the cache.
- Counts/schema normalization alone cannot prove state migration completeness.
- Prior299s READ_FAILED remains unexplained; single503 recovery is not its proof.
