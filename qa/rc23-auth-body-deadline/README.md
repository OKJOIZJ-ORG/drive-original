# rc23 auth body deadline discriminant

Run: `node qa/rc23-auth-body-deadline/diagnose.mjs`.

Confirmed15/15 local synthetic cases using unchanged
`7591044adc1149391265b0e56a93a47252088a47:app.js`. The actual page schedule,
credential request, body parser, installation and clear functions execute in a
VM. Real `Response`/`ReadableStream` objects model completed or aborted bodies;
the controlled transport forwards the original request signal to its body
stream, as browser Fetch would. All values are synthetic. No product edits,
browser/device/account access, real clock changes or publication.

## Confirmed causal result

The old credential expires120s after fixture start. The actual scheduler starts
its request at30s, leaving90s including30s skew,55s total flight and5s margin.

| Response path | At original55s request deadline (fixture85s) |
| --- | --- |
| 200 headers then stalled body | Body aborts; request settlesfalse; retained account/revision1; retryablefalse; zero future timers |
| 503 headers then stalled cloned body | Body aborts; request settlesfalse; retained account/revision1; retryabletrue; one15s successor |
| Fetch stalled before headers | Request settlesfalse; retryabletrue; one15s successor |
| Completed valid200 body | Revision2 installed; normal next renewal timer |
| Valid200 body delayed40s | Revision2 installed before deadline; normal next renewal timer |
| Completed malformed200 JSON or terminal409/503 JSON | Retryablefalse; no successor, as intended |
| Explicit clearToken or generation cancellation during body wait | No successor; old owner cannot resume |

For200, `fetchSessionCredentialWithRetry` sets `outcome.retryable=false` as soon
as headers complete. `readAuthJson` later catches the body's deadline abort and
returnsnull. The request handles that as an invalid credential, leaving the
outcomefalse. The unchanged scheduler consequently goes inert after a genuine
transport timeout. A later foreground/request owner can still recover; this is
not proof of an irrevocably lost server session.

The completed-malformed JSON contrast shows the timeout is being conflated with
the intended terminal invalid-payload case. A200 body `TypeError` before the
deadline also settles with the samefalse classification; its provider cause is
not determined by this controlled test.

## Narrow proposal for root judgment

Mark the **per-flight** outcome retryable in the existing55s deadline callback
immediately before aborting its controller. The VM-only two-statement alteration
retains one15s successor for200 timeout while completed malformed JSON and manual
generation clearing remain stopped. It preserves the public boolean API,
single-flight owner, exact scheduler/account/generation/revision/expiry fences,
terminal payload handling and original total deadline. The root owns any actual
implementation, maintained tests, release decision and integration.

That proposal addresses the proved deadline edge. It does not classify early
body transport errors or prove uninterrupted frames during a55s auth outage.
The15s successor can occur after the remaining5s usable-token margin is consumed;
eventual scheduler recovery and seamless media continuity are separate claims.
No actual PC failure's missing HTTP reason is identified by these local cases.

`results.json` records exact baseline/driver hashes and all header/deadline
snapshots. Earlier rc22 diagnostics and all product files remain unchanged.

## Accepted narrow product correction

Root accepted the proved transport-recovery gap after the fixed23 publication.
The subsequent local auth-only correction keeps `readAuthJson`'s default null
behavior and adds an opt-in callback for body `AbortError`/`TypeError`. The
credential caller marks only successful-response transport failure retryable.
Completed `SyntaxError`, invalid credential schema and terminal response status
remain stopped. The existing55s deadline marks its own per-flight outcome before
aborting, provided terminal status headers have not already ruled out recovery.
No header-timeout budget, HTTP retry maximum, backend lease, scheduler fence,
public boolean API, version pin, SW or publication changes are included.

Five new maintained product tests in `tests/app.test.js` use real streaming
`Response` bodies and the actual schedule/request/parser/clear functions. They
check200 body deadline and early `TypeError` with exactly one15s successor and
no ambiguous in-flight replay; immediate/delayed valid JSON; malformed syntax
and schema; stalled401/403/409 terminal bodies; cancellation and a new generation
starting before the old body callback finishes; and the default parser contract.
Focused new5/5 and complete app136/136 pass; syntax and scoped whitespace pass.
`product-checks.json` records the local source/test hashes and performed checks.
Root owns review, integration, version24 and later candidate/device evidence.

The fixed23 baseline reports and producer remain preserved above. The correction
establishes eventual scheduler recovery, not seamless media through a55s outage,
and does not identify the actual PC failure's missing HTTP response.
