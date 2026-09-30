# rc.16 isolated native-resource investigation

Observed 2026-09-30 KST. Public source is byte-for-byte committed
`e57d7b5b3154a2a838d01f631cf71fa063044280`; installed Chrome is
`154.0.8037.58`, Playwright `1.63.0`, Node `v24.18.0`.
This is local synthetic actual-app/SW evidence. It is not actual-account,
device, audible-output, corpus-wide or production acceptance.

The raw files, exact QA producers and SHA manifest preserve every attempt,
including QA failures. `summary.json` gives the complete run/resource table.
No product bytes were edited. All isolated browsers and loopback servers close
through `finally`; only their own PID census is measured. Stop gates remain
1.5 GiB host commit headroom and 1 GiB available physical memory.

## Discriminating evidence

The first eight Q2 cycles created 40 each of MediaSource, SourceBuffer and
Worker. All SourceBuffer and Worker wrappers were collected/finalized after
settled closes. Exactly one deliberately retained MediaSource remained alive,
closed with zero SourceBuffers; releasing it collected/finalized the last one.
An inert negative control also collected. Both the page worker census and CDP
worker target census were zero at closed samples. This contradicts accumulating
app-held references to these wrappers in the observed runs. It does not alone
prove release of every underlying native allocation.

Keeping the same closed page alive, disabling the **actual** isolated
Playwright page and SW Network agents produced:

| Eight cycles | Main renderer private before/after | Total Chrome private before/after |
| --- | --- | --- |
| Q2 | 199.0 / 73.7 MiB | 522.0 / 394.4 MiB |
| Q1 | 196.7 / 76.8 MiB | 529.9 / 392.5 MiB |

This identifies instrumentation Network retention as the dominant measured
renderer growth in these trials. Chromium's Network agent holds resource data
and clears it on disable, providing a mechanism consistent with this experiment:
[Chromium InspectorNetworkAgent](https://chromium.googlesource.com/chromium/src/+/202450827155ff3c67b14243d13aca104ca632b2/third_party/blink/renderer/core/inspector/inspector_network_agent.cc).
That reference is a mechanism source, not proof of exact Chrome154 implementation
or which individual response/native stack caused growth. Repeated allocations
near the 686,739-byte Mediabunny module remain a hypothesis; no symbolized
component attribution or product leak patch is justified.

Q2 sampled estimated allocations fell 97,976,320 to 3,080,192 bytes after agent
disable. Q1 sampling disagreed with Windows process reclaim (111,449,728 to
98,932,352 estimated bytes). Preserve this discrepancy: the sampled values are
not exact full-native memory and their stacks are unsymbolized.

## Observer controls and current-code qualification

The installed protocol declares `Network.enable.maxTotalBufferSize` and
`maxResourceBufferSize` as response-payload preservation budgets. Zero budgets
were applied to the exact page/SW managers and future owned worker sessions.
Network metadata and Fetch interception remain active; three safe synthetic
media response probes confirm body retrieval unavailable. A small mixed3
control passes all nine native seeks. Zero body budgets alone leave residual
native retention, so they are not presented as a complete observer correction.

The final mixed50 protocol explicitly resets these exact Network agents only
after the app and actual SW ownership/cleanup checks settle, waits five seconds
while disabled, then re-enables metadata with zero body budgets and restores
Playwright's existing cache-disabled interception state. It retains the same
page, video element, SW, actual product route and actual app seek function.
Before/disabled/after native PID/profile observations are taken at cycle1,
every4 and the last cycle. Latest-owner readiness, finite timeline, dimensions
and native frame proof are required before opening/seek snapshots.

The final result, 17 Q1 + 17 Q2 + 16 Q0 cycles with 150 target-frame seeks,
passes. All 170 each of MediaSource, SourceBuffer and Worker wrappers collected
and finalized after the deliberate control was released. Closed observations
from cycle12 through50 show the main renderer between66.4 and77.7MiB, total
isolated Chrome between403.4 and413.9MiB; cycle4's earlier renderer sample was
97.2MiB. Native sampled estimated allocations fluctuate4.8–15.3MB over the
cycle12–50 closed samples, without the prior monotonic accumulation. After15s
idle the main renderer is71.4MiB; context close removes all renderer PIDs,
and owned browser close leaves no owned processes. Minimum observed host
headroom is2.103GiB commit/2.902GiB physical, above both stop thresholds.
The complete native trend is in `summary.json`. Observed resource ranges
and delayed-retirement behavior must be interpreted with this five-second
cadence and explicit observer reset. No normal-runtime native ceiling, physical
device acceptance or account/production gate is closed merely by these results.

## Preserved QA failures

- A prelaunch adapter variable scope failure started no browser.
- First Network-shedding trial passed eight cycles, then used `_delegate`
  instead of the inspected current Playwright `delegate` bridge; it disabled
  no agent. The failure producer and raw record are retained.
- First capped mixed6 passed all18 seeks; final QA probe assertion counted
  resolved promises twice and issued2/3 probes. Both actual probes observed
  body eviction. Its original producer/raw are retained.
- First fast-reset mixed50 stopped after nine passes when the opening snapshot
  observed general generation2 `opening`, null mapping, zero width/frames.
  The earlier predicate admitted an old generation's readiness. No product or
  engine error was observed; the previously documented snapshot-restore path
  synchronously starts the second generation. The raw failure and producer are
  retained; the final producer guards the latest ready owner before snapshots.

The historical cold `GENERAL_PIPELINE_FAILED` decoder-open occurrence remains
unexplained in the prior rc15 evidence. Passing current trials do not erase it.

## Responsible-layer audit and reproduction

`media/general-player.mjs` awaits prior retirement, append drain, worker stop
and original-source abort; detaches the video src, calls load and revokes the
URL. Its ended-MSE branch skips explicit removeSourceBuffer, but the positive
closed control has zero attached SourceBuffers and the observed wrappers all
collect. `media/general-owner.mjs` drains consumers, terminates workers and
reports transport ownership; actual worker-target absence independently backs
those counters. Q2 codec cleanup is scoped inside the terminated general worker.
These observations support no current product patch from native growth alone.

Exact producers reuse `qa/rc15-lifecycle-qualification/qualify.cjs` and its
maintained loopback/provider/resource helpers. HTTP product bodies are unchanged;
all public file SHA maps are bound before/after to rc16 Git source. Only local
synthetic fixtures and a fake token/provider are used; real Google traffic is
blocked. The private in-process Playwright bridge is fenced by package version
and core bundle SHA. Do not apply this bridge to the user's normal browser.

Run the small control before larger qualification:

```powershell
node qa/rc16-native-resource/probe.cjs trend-q2 8
node qa/rc16-native-resource/network-shed.cjs trend-q2 8
node qa/rc16-native-resource/network-shed.cjs trend-q1 8
node qa/rc16-native-resource/capped-network.cjs cycles 3
node qa/rc16-native-resource/reset-network.cjs cycles 3
node qa/rc16-native-resource/reset-network.cjs cycles 50
node qa/rc16-native-resource/summarize.cjs
```

Do not rerun obsolete failed producers to qualify a release; they reproduce
their preserved QA failures. The two fixtures are existing Git-tracked QA seeds;
their exact bytes and SHA are bound in every raw record. Duplicate fixtures,
node_modules/SDK caches,
private accounts/profiles and original media are excluded from curated evidence.
Before staging, preserve this new namespace's exact bytes with scoped Git
attributes; the recorded producer hashes bind the bytes actually executed.
