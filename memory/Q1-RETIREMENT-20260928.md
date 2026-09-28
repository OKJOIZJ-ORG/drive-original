# Whole Q1 transport retirement — 2026-09-28

Observed local rc.10 follow-up to Q1-CLEANUP-20260928.md. The rc.9 source could
finish its outer fetch abort while the independent SW request was still waiting
for credentials or headers. Its401-body fence had no entry yet; a new generic
Q0 request could start. The synthetic discriminator is preserved in
qa/q1-auth-cleanup/cross-route-before.json and cross-route-reproduce.cjs. This
models an outer abort that does not reach the SW, rather than claiming a new
physical-device or live Google observation.

## Resulting ownership

The SW registers each Q1 request before credential/header awaits and retains it
until actual body EOF/error or confirmed cancellation. A scoped MessageChannel
query retires only its sending client's generations through the captured cutoff.
That cutoff also denies an old fetch event delivered after the query. Newer
generations and other clients remain independent. Abort, listener removal and
headers alone cannot acknowledge success.

The page combines local player/source cleanup with a matching reply from the
same controlling SW. Missing/replaced controllers, malformed replies, failures
and the two-second deadline remain false; late replies cannot upgrade them.
This result gates new Q1, Q0 and direct-buffer transfers, including non-TS sniff
fallback. Native-only startup keeps its existing synchronous source assignment.
Unknown SW cleanup stays fenced for the client/worker lifetime and is not reset
by credentials. Only a confirmed-gone client permits pruning.

A current-owner credential reply must carry the fixed retirement capability.
An otherwise valid old-page reply without it gets409/client-upgrade-required
before any upstream request, retaining its valid auth cache and making no
credential refresh. This separates an update mismatch from Google401.

Independent review found and closed two additional counterexamples: a late
native-fallback reply changing a later player's state, and SW cancellation
acknowledging success while a downstream read remained pending. Post-await
file/session/account/source/route/owner checks fence the former. Both SW body
wrappers now error outstanding downstream reads before confirming real upstream
cancellation. Q1 body-length failure also keeps its reader until cancel settles.

## Verification state

Full Node358/358 and the focused app/SW171/171 pass. The focused coverage includes
late headers, credential waits, EOF/cancel, old generation rejection, another
client/newer generation isolation, missing capability, downstream pending reads,
channel/controller failure and stale native fallback. Read-only snapshot/adapter
tests25/25 pass; generated capture also rejects an idle-looking page while its
whole-owner retirement is pending or false, before any Drive read.

Actual synthetic Chrome/app/SW retirement4/4 and auth17/17 pass. Close during
pre-header fetch and credential renewal leaves zero SW owners/uncertainty/token
waiters; the held late token cannot replay. Non-TS sniff passes its cleanup gate
and issues a real Q0 open Range. That case proves source assignment/transfer,
not a newly verified native decoded frame. All current report producer hashes
were recomputed without mismatch. A QA-only closed-Range assumption failed for
the native request; its report is preserved before the driver correction and
valid aligned MP4 control. Regular Q1 requests keep exact closed-Range checks.

Functional browser22/22, normal product16/16, syntax, whitespace,
19-public-file build and Worker dry-run pass. Final same-context50cycles and
150seeks pass on rc.10. Each closed sample has SW owners0/fences0/cutoff1/live
client1; Worker and objectURL counts200created/200released, active0. After
explicit GC, DOM5documents/1630nodes/220listeners and connected218listeners
across108targets remain stable. Normal/cycle producer maps agree and root
recomputed every current producer and assertion without mismatch.

qa/q1-auth-cleanup/verification-rc10.json pins the final producers and evidence;
the rc.8/rc.9 and failed QA reports remain separate. The approved free candidate
now serves these rc.10 bytes; CANDIDATE-RC10-20260928.md owns exact Worker identity,
19public/17cached Git equality, cold/offline smoke and the anonymous live gate.

## Evidence boundaries and recovery

This is owned browser/SW lifecycle evidence. Successful cancellation is not a
measurement of total JS heap, network/native resource release, audibility or
physical iPhone/PWA behavior. Real Google duration/expiry, complete live state
reconstruction, full formats and historic299s READ_FAILED remain open.

Candidate Drive writes remain disabled; production Pagesv1.21.0, original media,
appData, OAuth settings and paused automation are unchanged. Source recovery is
a new revert commit; candidate rollback uses the last independently verified
Worker version, without hard reset, cookie purge, merge or push.
