# rc30 same-file TS replay preparation

Prepared only. No browser, device, network, or original-file operation was run by
the preparation checks. Public source is pinned to
`aa46bd083ce8c21f55cf7d9a4759f0d6709188c2`, runtime `1.22.0-rc.30`.
The local product tree may contain later product changes; it is not this binding.

## PC passive observer

Prerequisites: genuine current `window.__resumeSwProof.get()` from the maintained
rc30 source proof and browser-private `window.__resumeReplayTarget30`.
Supported private holder forms are `{metadata,savedSubset,accountId,authAccountKey}`,
`{target,account:{accountId,authAccountKey}}`, `{file,...}`, or a metadata object.
The last form captures current account privately, and does not independently prove
cross-device account identity. No private fields are returned in the safe report.

Evaluate `single-file-observer.expression.js` once. API:

```js
await window.__rc30SingleFileReplay.metadata('before');
window.__rc30SingleFileReplay.arm('startup', {targetSeconds: 0, toleranceSeconds: 3});
// Native normal card click, then sample read(). Wait at most 60s for first frame.
window.__rc30SingleFileReplay.read();
// Pause using normal UI. Measure actual slider target in source-relative seconds.
window.__rc30SingleFileReplay.arm('seek50', {targetSeconds: actualQuantizedTarget, toleranceSeconds: 1.5});
// Native normal slider gesture. Preserve deadline15.passed=false even if a later
// target frame appears in a bounded 35s diagnostic interval.
window.__rc30SingleFileReplay.read();
window.__rc30SingleFileReplay.arm('seek90', {targetSeconds: actualQuantizedTarget, toleranceSeconds: 1.5});
window.__rc30SingleFileReplay.arm('nearEOF', {targetSeconds: actualQuantizedTarget, toleranceSeconds: 1.5});
// Resume normally; bounded 45s tail wait. Read EOF evidence before closing.
// Close normally and wait for all player owners to retire, then:
window.__rc30SingleFileReplay.arm('reopen', {targetSeconds: 0, toleranceSeconds: 3});
// Same exact card, normal reopen; capture current target frame, close normally.
await window.__rc30SingleFileReplay.metadata('after');
const safeReport = window.__rc30SingleFileReplay.read();
window.__rc30SingleFileReplay.stop();
delete window.__rc30SingleFileReplay;
// Delete owned private target holder only when its owner no longer needs it.
```

Only arm the phases actually performed. `arm` never clicks, seeks, starts playback,
or forces a route. Seek/reopen acceptance requires an owner/session/source/player
generation advance relative to arming; stale pre-input frames cannot qualify.
Q1 general mapped clocks are normalized by `commonShift - sourceOrigin`; TS uses
its native presented time. Actual video owner `isCurrentMediaEvent(v)` is required.
The observer keeps one 250ms interval, at most five phases, 96 frame records per
phase, 144 sample records per phase, and 128 native media event records. It stops
its interval, callback and listeners after six minutes or explicit `stop()`.

`metadata` performs at most two canonical metadata GETs (before/after), ten seconds
each. It does not fetch media or write originals. Required stable metadata and
fresh revision/checksum fields are compared privately. Metadata mismatch is a
retained false result. No response body, path, account, identifier, URL, token,
cookie, header, filename or arbitrary error message is exported.

EOF evidence separates actual native `ended`, trusted event, current TS pipeline
`ended`, available numeric source/bootstrap/worker completion, tail buffering and
near-end presented frames. `exactFinalFrame` always remains `UNKNOWN`; native ended
alone does not identify the exact last decoded original sample. Audio counters are
diagnostic, not an audio-fidelity claim. The report does not claim broad format,
endurance, phone, iOS, Safari or standalone support.

## Local preparation checks

`node build.cjs` binds the immutable maintained rc30 source metadata and records
dependency SHA256 values. `node --test observer.test.cjs` exercises canonical
private holder, stale pre-input/generation, account/controller/source/visibility
drift, wrong file/time, mapped clock, timeout retention, EOF unknown and bounded
cleanup. These are local VM checks, not actual-device results.

## Android private recovery input (not yet executed)

The additive driver consumes a local private JSON file supplied by the parent:
`{account:{accountId,authAccountKey},target:<fresh metadata>,folderPath?:[{id,name}]}`.
Fresh metadata includes id, name, size, MIME, modifiedTime, parents, version,
headRevisionId and available checksum/resourceKey. Never stage this file. The
manifest must list only explicit safe producer/evidence files, never this private
input, private screenshots or full state. No source helpers or earlier results are
modified by this leaf.

## Additive attempt 2 (frozen handoff follows local checks)

Attempt 1 stopped before media open with `TARGET_NOT_IN_CURRENT_LIBRARY` and
successful cleanup. Its result and exact executed producer SHA256
`1d730fee60ed98aaaf1cf6c1d3a945fd87da7417dced06920e7e4a8f53543072` are preserved.
The child was still finishing preparation guards when the parent executed it;
`executed-v1-preservation.json` records the verified byte-exact reconstruction.

The new producer is `android-same-file-replay-v2.cjs`; default output is
`android-same-file-replay-attempt2-result.json`. It uses the supplied private normal
folder path. The actual product creates `button.folder-row > .folder-name` and
does not create a data-folder-id attribute. The helper requires a unique private
id/name metadata pair, a unique name across current folder metadata, and a unique
rendered name before native tap. A missing rendered row may use the ordinary
folder-more button up to three times. After each normal folder tap it waits up to
25s for exact private `currentFolderId`, idle listing and populated rows; exact
normal search then waits up to 40s for the target, using the product's own paging.
No folder navigation function or state injection is called.

`single-file-observer-v2.expression.js` preserves all v1 fences and separate 15s
deadline evidence, and accepts an actual current-generation presented target frame
before adapter readiness. Readiness, watchdog and loading visibility remain
separate observations. Failed, cancelled, disposed or aborted pipelines do not
qualify. This avoids masking a timely native target frame with late UI readiness.
V1 remains immutable and reusable; PC actual v1 evidence is separate from v2
preparation and any future Android execution.

Execute only after the parent reviews and releases the frozen handoff:

```text
node qa/rc30-ts-device-replay/android-same-file-replay-v2.cjs <LOCAL_PRIVATE_JSON> android-same-file-replay-attempt2-result.json
```

The driver reports trusted native OS injected input, not human-finger input. ASCII
search names use restricted shell-quoted native text input; unsupported Unicode or
shell-special names use explicitly labeled synthetic search-field setup. Card,
pause, transport, seek and Back remain native inputs. On a closed/source admission
failure it does not close an unrelated pre-existing player. It restores its query,
folder history and owned private proof/observer handles, and maintained common
removes only its MCP/CDP connection and ADB forward. Cleanup failures remain failures.
