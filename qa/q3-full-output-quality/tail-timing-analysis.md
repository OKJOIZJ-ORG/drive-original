# Short native timing discriminator — 2026-10-02

Observed passing isolated Chrome check: the same hash-pinned 180s source was
admitted, but product `targetTime:170` converted only its final300pictures/10s.
No complete180s conversion, original-file/device/account/browser-profile
interaction or product change occurred. Scalar `performance.now()` timers were
inserted into an immutable517 pipeline served only by this QA loopback server;
all other product media were served unchanged from that Git object. Original
pipeline and instrumented variants are separately hash-pinned in the receipt.
The consumer counts/discards <=256KiB ACK-backed chunks; no output number-array
CDP export or file assembly occurs. The receipt itself is returned only once
after each terminal. Both cases retain product source/packet/geometry/color/
timestamp/configuration/output-count/drain/queue/mux/WASM/retirement checks.
This is a controlled timing experiment, not a native output quality oracle.

One initial QA verdict failed after the measurement because it read
`r.result.transportCleanup` instead of owning `r.transportCleanup`. Browser and
server closed after3.121s; the first failure receipt is preserved. No measured
frame counts were saved by that faulty verdict and none is adopted from it.
The repaired verdict pushes each measurement before validation and uses the
correct optional guarded path. The changed-condition valid run completed both
cases and all cleanup in5.950s, below the requested60s action bound.

| Local scalar timing | prefer-software baseline | conditional no-preference |
| --- | ---: | ---: |
| Worker elapsed incl source/cleanup | 1780.8ms | 2151.2ms |
| 300-picture cached reads incl Worker RPC | 55.8ms | 61.9ms |
| WASM decode/inspect/copy | 144.8ms | 146.3ms |
| VideoFrame construction/encode call | 72.4ms | 74.4ms |
| Native encoder flush await | 1378.1ms | 1748.6ms |
| encode-call→native output callback | 1367.0ms | 1730.2ms |
| video.add mux path | 20.2ms | 21.2ms |
| ACK await (included in mux when dispatched) | 10.7ms | 10.4ms |
| Page source GET/body total (incl admission) | 51.1ms | 52.5ms |
| Compressed output discarded | 3,650,809B | 6,340,548B |

Flush/output intervals overlap, and ACK is nested inside mux dispatch; do not
sum them as independent costs. Source totals include a distinct admission source.
Each case had300decoded/encoded/output callbacks, 18page source reads, two
settled source aborts, 32MiB WASM heap, encoder queue1, mux sample peak30,
pending ACK peak1, no pending reads/chunks/windows at terminal and terminated
Worker. Both pages, the ephemeral isolated browser and loopback server closed.
Final window origin170/sourceEnd180 and product color/timestamp checks pass.

The baseline encoder flush is77.39% of Worker elapsed but averages4.59ms/frame;
the complete short Worker rate is168.46pictures/s (5.615media seconds/wall second).
Thus the serial software VP9 encoder is the largest short native component,
yet this desktop experiment does not demonstrate realtime insufficiency.
The full268.663s QA capture rate includes costly number-array/CDP output export
and long-run conditions, whereas this tail test discards output. Those are
different execution boundaries. The large rate difference makes capture/export
or long-run scheduling/conditions a material confound; without a matched sink
comparison or full-run phase clocks it does not quantify either contribution.
Do not call the268.663s capture a measured encoder rate.

Only because baseline flush exceeded60% of Worker elapsed was the permitted
optional comparison executed. Its sole intentional configuration override is
`hardwareAcceleration:'no-preference'`; supported exact codec/geometry/cadence/
bitrate/color/clock admission remains required. The slower elapsed and different
output-byte behavior do not support adopting this preference as a speed fix.
`no-preference` does not establish actual hardware selection, and neither case
identifies a device encoder backend. The current full quality oracle applies
only to the unchanged prefer-software full producer/output, not this unsaved
conditional encoder output. The conditional case passes product fences but
has no independent perceptual/PSNR certification.

Smallest responsible next step: retain product settings and obtain similarly
bounded live Android phase counters for reads, encode/flush and append/updateend/
removals/ACK while reducing QA control overhead. Existing Android71s/296s
delivery is a real observed shortfall; desktop timing cannot identify its cause.
If Android flush dominates, only then compare its actual supported acceleration
and bounded queue candidates. If read or MSE/QA ACK dominates, fix that owning
layer instead. The MEDIA-06 slow-rate wait/device/quality choice remains
separately required; a longer EOF timeout alone cannot qualify realtime.

Add these small evidence files to the previously suggested curated inventory:
`tail-timing.cjs`, `timing-fixture.html`, `timing-fixture.mjs`,
`tail-timing-results.json`, `tail-timing-first-verdict-failure.json`,
`tail-timing-analysis.md`. No output video was written by this unit.
