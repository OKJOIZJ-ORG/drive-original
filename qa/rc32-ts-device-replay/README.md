# Exact candidate32 TS replay (prepared; actual execution is root-owned)

Immutable binding: `1d79897fd32c569137cab079bfd93107be2ee33f`,
`1.22.0-rc.32`. This additive leaf preserves rc30/rc31 producers and actual
failures. Local fixtures qualify the producer, not device behavior or a speedup.

`bind.cjs` only accepts that full literal commit and derives SHA256 values from
its committed Git blobs, including all40 cached public modules/assets and5
fresh source files. It never infers HEAD or reads protected target data.
`binding-gate.cjs` verifies the preparation and generated binding freezes before
the Android executor can read its explicitly supplied private argument.
An existing result filename is refused, preserving the first actual receipt;
choose an additive attempt filename after any failed execution.

Root commands, from `C:\extensions\Drive-Original\source`:

```powershell
node qa/rc32-ts-device-replay/bind.cjs 1d79897fd32c569137cab079bfd93107be2ee33f
node qa/rc32-ts-device-replay/verify.cjs
node qa/rc32-ts-device-replay/android-replay.cjs <root-owned-protected-json-path> actual-android-rc32-ts-replay-result.json
```

The executor does no reload/update itself: root first uses the normal current
candidate update, leaves exactly one signed-in candidate tab in portrait,
closed/retired, and preserves sufficient credential lifetime for this unit.
It then proves32 version, current activated controller/registration, fresh5
public source hashes and40 exact cached blobs plus root alias. Executing worker
bytes are not independently read. No login, forced renewal, cookies, volume or
OS settings are changed. The root-only protected JSON has `{account,target,
folderPath}` with exact fresh original metadata and checksums. No protected data
is stored in this leaf. Ordinary native folder/card/transport/slider/Back input
is used; an empty or already exact query is required. Unsupported ASCII search
names require an already exact query. Only cleanup restores prior query/scroll
through explicit presentation setters; it does not change original media.

One observer covers startup30s, seek50/seek90/nearEOF35s each, native EOF45s,
reopen30s and normal close/retirement15s. Its work budget is360s, polled between
operations; an in-flight CDP command can take45s and finally cleanup has separate
bounded operations. Folder prep caps8 levels,3 reveals per level,25s per
population, search40s. Two canonical metadata reads cap1MiB and10s each; media
reads occur only through the ordinary player. Prior15s failures remain distinct
even when later frames arrive. Native OS ADB input is not a human-finger claim.

`observer.expression.js` is reusable on the normal PC without the Android
executor. Root privately saves any prior `__resumeSwProof`, evaluates
`source-proof.expression.js` on closed32, and supplies its protected holder as
`window.__resumeReplayTarget30` (`metadata`/`accountId`/`authAccountKey` or
`target`/`account` are accepted). Evaluate `observer.expression.js`; call
`__rc32TsReplay.metadata('before')`, then `arm('startup',{targetSeconds:0,
toleranceSeconds:3})` **before** the normal card input. Read at bounded intervals.
Normal UI pause/reveal precedes each `arm('seek50'|'seek90'|'nearEOF',
{targetSeconds,toleranceSeconds})` and native slider action. Use the actual
quantized UI target, with nearEOF around duration−4s; do not manually seek via
player functions. The new owner/generation must advance for seek/reopen frames.
Resume normally after nearEOF and observe native+pipeline ended, source offset
equal to size, finished bootstrap/worker and presented final-window frames.
Exact final original frame and audio fidelity remain UNKNOWN/NOT_TESTED.

Immediately before each ordinary close, call
`captureMetrics('preclose-eof'|'preclose-reopen')`. After normal settled close,
call `captureMetrics('postclose-eof'|'postclose-reopen')`. Arm reopen before the
normal card; repeat startup frame and close. Finish `metadata('after')`, `read()`,
`stop()`, delete the owned observer/protected holder and restore prior proof.
On failure preserve bounded journals, close normally, wait retirement and stop.

Metrics include numeric/null metadata/physical Range/received/released counts
and `cacheHits`, `cacheBytes`, `logicalReturnedBytes`, `probeRetainedBytes`.
Unavailable live source/retention stats remain null. At most6 public stats
objects are privately retained under actual current owner/source/account/content
admission fences. Each generation is reduced separately after ordinary
retirement; it cannot qualify another generation's frame. Before-close fences
are freshly captured; generation mismatch nulls metrics. A cap overflow is
explicit. Final disposal may publish retainedBytes0, while a prior retired seek
can expose nonzero same-player retention. These are observation times, not
invented live values or raw retained bytes. `stop()` clears these private refs
and owned timer/listeners/RVFC. Common cleanup removes only its own ADB forward,
CDP session and MCP client. No original-byte equivalence or latency improvement
is claimed before actual32 evidence is reviewed.
