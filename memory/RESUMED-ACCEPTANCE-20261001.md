# Resumed acceptance — D068 ACTIVE — 2026-10-01

Observed actual fixed944f006/rc28 results are saved separately from the local29
implementation. Production1.21.0/e08989a/main/push and PAUSED automation remain
unchanged. This is a savepoint; continue the executable queue.

- PC and Android overlapping original Q1 playback naturally renewed66→67 once
  and retained native frames beyond old expiry+120s. Both subsequently sought
  actual paused frames and closed with all owners retired. Short buffering
  intervals remain recorded; no seamless-playback claim.
- PC post-renewal native360×640 target1059.088s settled in10.981s. Earlier15s and
  45s observer/harness failures remain; the second did not issue a new seek.
  Single-case latency does not qualify p95 or the original seek target.
- Bounded corpus: repeated complete8596-file/8604-item inventory stable,
  video-MIME-or-extension union2186. Thirty-six representative prefixes and63
  fresh video prefixes succeeded; one HEADER_TIMEOUT stopped the runner. Current
  classified video coverage86, failed1, unattempted2099. The timed-out private
  identity was destroyed, so no same-object retry or recovery is claimed.
- Current appData capture:10 complete documents,9 writer documents,9 liked/
  49 unlike tombstones/159 viewed. Candidate includes preserved legacy7/48/119,
  no pending difference, distinct writer. Exact current28 app reconstructed
  the same union from empty isolated storage through12 canonical GETs with no
  writes, while actual cache/writer stayed unchanged. Protected148875-byte
  backup reread is exact. Second full14-GET capture matches every raw document,
  metadata/writer, normalized union, candidate/cache and legacy payload. These
  are completed point-in-time snapshots: the human opened new playback after
  the passing recapture; this later owner/projection change is preserved.
- Initial capture and fresh reconstruction failed with transient stale_owner;
  cause remains unknown. Separate diagnostic attempts keep identical fail-closed
  guards and passed with no failed guard fields. Prior failures are not erased.

Exact safe results live in qa/rc28-resume-20261001; Android155–162 have their own
explicit manifest. Private backup stays ignored in the existing protected
qa/v2-state-recovery-backup/private directory; no raw identities/state/tokens
are committed. Source/client binding is reconciled in root-state-binding.json.

## New PC issue added by the human

The2026-10-01 screenshot shows a large blank lower region and two visible favorite
controls. Previous/next video and frame-step buttons are distinct actions and must
remain distinguishable. Root actual geometry: stage fills1536×639.2 CSS pixels,
but video and bottom chrome are both shifted upward137.6px. A scroll/focus owner
is a hypothesis requiring reproduction; no phantom-footer cause is assumed.
Upper-left1.0x is not yet attributed to product or browser injection. Investigate,
fix the responsible layer, verify PC and mobile fit/controls/paused behavior, then
include the fix in candidate29. Human explicitly permits closing PC playback
and continuing; normal Escape closed it with settled retirement.

## Remaining work

Actual deeper-format probes and representative device audio/frame/seek/sustained
playback, finite performance distribution, remaining Android input clauses,
scoped cookie condition, candidate29 delivery/normal disposable bulk UI and
API/web/G comparison/cleanup, final69 reconciliation and separate production
authority remain. Frozen deeper preparation has a mode:probe rejection; a new
bounded derivative is being qualified without rewriting its historical evidence.
