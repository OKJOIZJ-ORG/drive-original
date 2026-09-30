# Actual TS latency: bounded read-only preparation

Source audit is pinned to committed rc17
`54654ce1efb2dbe0296a9641ed01182e9e1a8322`, not the concurrently changing
working-tree rc18 app. No product edits, codec rebuild, browser attachment,
media/metadata requests, settings changes or replay were performed by this unit.
Root owns the account tab and any actual expression execution.

Root subsequently pinned/deployed rc18
`f6749c1a1b1a8345f8f76606786e0c1ccb48b21c` and owns the proposed one50%
actual trial. The source audit remains explicitly rc17. The preparation manifest
independently compares TS player/source/core/worker bytes between both commits;
the rc18 card/version edits do not change those bytes. No future actual result
is claimed by this file-only unit.

Root-provided actual rc17 observations: paused trusted 10/50/90/repeated50%
native target frames took 16.742/13.324/14.358/12.761 seconds on one 1609.408s,
approximately198MB TS. Frame target and paused settlement are correct. Four
trials are not p95. Spec §17 OBS-03 calls ~3s a Q0 initial adjustable seek budget,
not an explicit Q1 numeric hard gate. §§19 WP-01/WP-09 and §22/G5 still require
causal performance evidence and actual-environment acceptance; no budget was
weakened here.

## Source-supported critical path

* `media/ts-player.mjs:20,118`: every seek replaces a generation and awaits
  prior worker/source/MSE cleanup. The settled result is required, not a fixed
  unconditional2-second delay.
* `media/ts-player.mjs:127,171–174`: open metadata, sequential head/tail/local RAP
  probe, then a separate head read and a reread of the chosen local window.
  `qa/v2-07b-ts-q1/ts-seek.mjs:23,122,159` makes its cache local to each probe,
  so repeated50% repeats discovery. A simple interior case uses three probe
  reads plus two later reads before creating the worker: at least5Range and
  11metadata calls including open, before subsequent262KB playback reads.
  Adaptive search may add reads. These are source-derived counts, not an
  observed count for the actual file.
* `media/drive-source.mjs:178,188–220`: each read serializes fresh metadata
  preflight → SW Range headers → complete bounded body → fresh metadata
  postflight. Those content/account/permission fences remain required.
* `media/ts-player.mjs:180,198–214`: MSE sourceopen → fresh worker ready →
 262KB range reads split into64KB worker inputs → serialized fragment append
  updateend → native target seeked → presented target frame. A GOP boundary
  may need another fragment; sourceposition must not hold the worker ACK.
* `app.js:7549`: player priority suspends/cancels background thumbnail jobs.
  It does not parallelize these correctness-fenced source reads.
* Page module imports at app setup are reused within an established TS owner;
  a fresh transmux worker starts each generation. Cold worker module loading,
  parser/bootstrap work and decoder presentation compete with network cost.
  Repeated high latency alone does not select one cause.

The decisive unknown is which interval dominates **trusted input → first current
target frame**: repeated metadata/Range waits before buffering, or the interval
after final required data and before append/decoded presentation. A second
question is whether the repeated head/tail/window reads materially contribute.
Only then choose a fix. Reusing admitted probe bytes/validated discovery within
one properly fenced content owner is a candidate; immutable revision pinning is
a separate coherent owner/permission/expiry contract. Neither is implemented
or approved by this preparation. Do not weaken per-read content fences or
introduce concurrency to conceal their cost.

## Retrospective expressions

`availability.expression.js` reads exact rc17 identifiers. A trace is created
only when a sink exists at playback open; its object stores counters/owners,
not event history. Root's actual result: no sink, no current trace and no retired
trace. Selected/Q1 owners were already closed and native video paused. No guessed
state fields are used.

`retrospective-resources-executed-v1.expression.js` preserves the exact2111-byte
draft root already executed. It returned48 whitelisted rows, selected internally
from the most recent Q1 resource after Escape. Root reported repeated sequential
metadata~420–676ms, page/SW Range headers~673–769ms (one~2098ms), body~35–144ms,
and9 latest-generation Range rows. The last retained row lacks a postflight;
retention/48-row truncation and exact seek span remain unknown. Its generation
boolean compared sourceGeneration only; it was not a complete session fence.
This is root-transcribed actual evidence, not an independently captured raw
protocol log. Root owns the actual aggregate/raw record.

The corrected final expression's trimmed browser SHA matches
`750dcac677b5d7ed6f9f822a12af78882d31e2789e3316bc4af8f2714c90bad4`.
Root's safe actual aggregate is preserved separately in
`retrospective-actual17-aggregate.json`:48rows,32metadata duration sum14.8792s,
16Range sum15.3716s. Latest properly fenced generation has8Range/3,210,432bytes,
sum7.653s (headers7.0165s/body0.6365s), span15.0035s. These are request-duration
sums across retained rows; they are not trusted-intent→frame critical-path time.
One generation can keep buffering after its first target frame. Root has not
armed or replayed the prepared future observation.

`retrospective-resources.expression.js` is the corrected extraction: latest-range
generation comparison also binds the internal file pathname and media session.
It issues no requests, reads existing resource entries, and exports only literal
stage names, finite numeric relative times/byte counts and booleans, up to48rows.
File identifiers, names, request URLs, resource keys, headers and tokens never
appear in the result. A missing responseStart is hidden timing, represented by
null headers/body, not zero upstream latency. Cross-origin metadata total
duration can be exposed while its subphases are hidden. Same-origin SW Range
timing covers page/SW/end-to-end delivery; it cannot alone separate credential,
SW scheduling, Google upstream TTFB and page backpressure. Metadata rows have
no session binding and neither expression claims an exact historical seek span.

## One future passive50% seek, if needed

`future-arm.expression.js` is only preparation, not an actual execution result.
Root first confirms the approved source/account/paused TS owner normally. Execute
only if the target is not already current (the expression refuses within0.25s).
Run the expression immediately before **one trusted pointer click at50% of the
existing seek track**, with no playback resume. The expression does not seek,
pause, play, open a trace, import code, fetch or alter app callbacks/state.

It observes trusted seek-track pointerdown at document capture time, the existing
player's changing generation/phase/appends every100ms, native media events,
Resource Timing and rVFC. It accepts a target frame only after trusted intent,
a new player generation, positive append count and a finite matching target
within unchanged0.25s tolerance. Frame registration
precedes input; frame-before-seeked is retained, then300ms settlement is sampled.
An extra trusted track input or changed account/file/player/session stops it.
Rows are capped240; total arm-to-stop≤40s, sampling10Hz. No timestamps/IDs/URLs
are exported other than numeric relative clocks and source media times. The
observer's own elapsed clock starts at arm; `intentToFrameMs` measures actual
trusted pointerdown→target frame, excluding the arm-to-input gap.

After completion, execute `future-read-cleanup.expression.js` once. It returns
the safe result, cancels callbacks/timers/listeners, disconnects the observer and
deletes its QA global. Timeout and owner-change also release callbacks without
requiring a reader. The QA global remains only for bounded-result readout until
the explicit cleanup deletes it. Do not change Resource Timing buffer size,
Network/Debugger agents or global settings. Worker startup and upstream hidden
subphases remain uninstrumented; the first discriminator does not infer those
from small JS heap or elapsed time alone.

`node qa/rc18-priority-latency/verify-expressions.cjs` passed6 local mock checks:
privacy filtering after open/close, hidden timing handling, generation/intent
fencing, target-frame-before-seeked, owner-change and timeout/manual cleanup.
No actual account/browser latency test or full suite was rerun. Source and QA
producer hashes are recorded in `preparation-manifest.json`.
