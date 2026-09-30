# Candidate rc.25 — safe long-GOP retention and bounded delivery

Published free candidate `1.22.0-rc.25` at 2026-09-30 19:08:33.784 UTC from
`7ba8e654fa38def8c8e00efcbf1600a4c8730c53`, Worker
`ef1d3975-4530-4721-acc1-a2be201afc1b`. Production v1.21.0/main/push and the
PAUSED automation are unchanged. The whole D066 acceptance queue remains active.

The source-owned fMP4 observer indexes qualified video random-access boundaries
only after complete associated mdat acknowledgement. Native buffer removal ends
before a completed boundary at least eight seconds behind playback, including
track/native floating precision. The unchanged 24MiB encoded credit bound and
current-range/progress guard remain fail-closed. Independent scoped review and
650/650 full local checks passed with unchanged source hashes during the run.

Actual Android105 played the qualified 420-second synthetic AVC/AC3 Q2 source
through 4832 native frames and 19 safe removals, max frame gap171ms; the earlier
current-range deletion did not recur. At404.166666s it failed
GENERAL_OUTPUT_FRAGMENT. Android107 reproduced that failure after a95% native
seek and discriminated a valid final known audio-only moof followed by mdat.
The observer's every-moof-needs-video assumption is responsible. The pending
follow-up corrects that assumption; this25 record does not claim native ended,
whole420 completion, original media or audible fidelity.

`qa/candidate-rc25-delivery/results.json` confirms52 public Git-byte comparisons,
40 shell-cache Git-byte comparisons, eight source archives absent from shell
cache, six private-path404s, anonymous candidate=true/writes=false and activated
controller. First navigation was27.922s within45s. The new-Chrome guard refused
launch at748084KiB virtual free versus the unchanged exclusive1572864KiB floor.
Root reused an existing MCP-owned anonymous profile; about:blank does not prove
fresh context. Pre-navigation filePath inspection was rejected before execution.

Original offline v1/v3 assertions are retained: navigator.onLine changed totrue
after reload despite network emulation. A separate actual discriminator normally
reloaded under Offline, retained exact25 shell/controller and rejected an uncached
same-path credentials-omitted no-store probe with TypeError in4ms. Restoring online
made that probe return200/zero bytes in243ms. The explicit network discriminator,
reused-context limitation and cleanup are bound by the merge producer; no global
cache/cookie purge, account, media or physical-device proof is implied.

Source-readiness binds the actual merge producer and same fixed Git/Worker to26
preferred-source hash checks and six readable adaptations. All52 worktree bytes
were checked against fixed Git before writing. An earlier coordinated pending
edit triggered that unchanged guard before write; exact owned restoration allowed
the final write/readback check. Private raw control-plane logs remain excluded.

The52-entry ZIP is `releases/candidates/Drive-Original-1.22.0-rc.25-7ba8e65.zip`,
54782271 bytes, SHA256
`0e7562058f536d4d5216ca6f20c2373fa85706055656931a3a1fe934b830f564`.
Every public entry equals Git, no private entry, local generation byte-identical.
Control readback confirms11 bindings and AUTH_ENABLED=true,
AUTH_DIAGNOSTICS=true, CANDIDATE_DRIVE_WRITES_ENABLED=false.

First deployment preflight stopped stale24 materialization before Worker command;
canonical committed materialization corrected it. Second transient nlink2 guard
also stopped before Worker; later exact nlink1 passed unchanged. Cause unknown.
Fixed24 PC/Android natural renewals, actual25 hosted12 denials, library selection,
reduced motion and native OS-edge recovery retain their separate scoped evidence.
Full corpus/deeper formats/offline-state/performance/update recovery/final gates
remain active. Candidate rollback uses a verified candidate through normal
publication; no account/data reset or production rollback occurred.
