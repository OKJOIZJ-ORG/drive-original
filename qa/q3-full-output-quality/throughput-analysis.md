# Read-only Q3 throughput inquiry — 2026-10-02

Observed full local capture started 2026-10-01T21:29:11.894Z and ended
21:33:40.557Z: 268.663s inclusive browser launch, capability/metadata probe,
conversion, 66.64MB export and cleanup. Dividing 5,400 pictures/180 media seconds
by that complete interval yields 20.0995 pictures/s and 0.669984 media/wall.
This is an inclusive QA execution rate, not measured encoder/Worker throughput.
The later native oracle start 21:34:07.583Z is not the capture endpoint.
Product terminal metrics contain counts and peaks, not phase clocks. No exact
Worker-start/terminal duration, encoder flush time, read RTT or ACK time was
captured, and none can be reconstructed faithfully from those counters.

The local source made 276 bounded reads for exactly 18,075,476 bytes with
5,404 cache hits. `rpc.exact` is called per picture but actual Worker/page reads
occur per 64KiB cache miss, not 5,400 network requests. The cache is capped at
256KiB and source/account/revision fences remain active through the normal
source owner. Successful local capture used only loopback Range GETs; this
weakens a claim that Drive network must explain every slow execution, but does
not time Android Drive I/O or exclude localhost scheduling delay.

The capture sink has a separate confound: 361 ACK-backed output chunks are
converted to JS number arrays and transported through Playwright/CDP before
synchronous file writes. 66.64MB of compressed output can incur much greater
serialized traffic. These elapsed costs were not measured. Actual playback
instead ACKs after native MSE updateend and RAP/index handling; capture timing
must not be used as an unqualified native MSE/Android encode rate.

Observed Android failed receipt
`qa/q3-actual-preparation/actual-android-q3-eof-failure-eof-cua2-safe.json`
has a 296.034s observer interval, first qualified frame at 37.274s, last qualified
70.966667s frame at 294.462s and native buffered end 71s. It reports 143 appends,
61 removals, retention waits 0 and peak ahead 0.076163s. This demonstrates an
actual sustained delivery shortfall in that observed run; the producer never
built a substantial presentation cushion. Zero retention waits rules out that
player's explicit ahead/byte-throttle branch in the recorded owner. It does
not rule out network reads, append/updateend, RAP removals, native encoder cost,
QA control maintenance/sampling or device scheduling. Live decode/encode/read/
ACK counts and phase times are absent until terminal, so none is proven the
dominant Android cause.

One new bounded offline discriminator processed only the first 300 pictures
(10 media seconds) with the actual product WASM and `createGeneralSource` cache.
It performed original picture admission, send/receive, metadata/geometry checks,
raw-plane copy and packet drain. Total loop 120.9624ms; WASM decode+metadata+
raw-copy 108.8051ms (0.362684ms/picture), cached exact reads 8.8235ms, packet
inspection/heap copy 2.9169ms; 17 simulated in-memory source reads/304 hits,
32MiB WASM heap, settled cleanup. `decode-cost-results.json` binds input, WASM
and producer hashes. This makes PC MPEG4 decoder/cache CPU an unlikely dominant
explanation for the 268.663s local capture. It does not measure Android CPU,
real Worker RPC/network, native frame construction/encoder or MSE. No browser,
device or full conversion was repeated.

The remaining serial path is explicit in `video-q3-pipeline.mjs`: each picture
is read/decoded/copied, encoded, then `await encoder.flush()` completes before
the single `pendingEncoded` packet is muxed; output fragments await each ACK.
`prefer-software` requests software VP9 at 5,184,000bps for this profile.
Flush-per-picture can remove native encoder pipelining and repeatedly drain the
backend. Software preference can avoid an available accelerator. Both are
grounded candidates, not demonstrated bottlenecks. `isConfigSupported` proves
acceptance, not hardware selection or sustainable speed.

Smallest next causal check: one short isolated synthetic timing run of the same
product path, with QA-only cumulative timers for source read RTT, WASM decode/
copy, VideoFrame construction, encode/flush, mux add/finalize and output ACK.
Use scalar count/total/max metrics and preserve bounded memory; avoid per-frame
logs/CDP arrays in the hot path. Record Worker elapsed separately from setup/
cleanup, and ACK-side native append/updateend/removal cost if testing MSE.
Use a local null compressed-output consumer to remove the current capture
serialization confound. A short run cannot certify sustained180s speed; it
can discriminate which controlled change deserves a full qualification.

Only after the timing discriminator: if flush dominates, replace the one-packet
slot with a small bounded timestamp-keyed encoder queue and bounded drain
batches, requiring one matching output for every original timestamp/duration,
no reorder/drop/extra output, unchanged color/config, explicit final flush,
bounded queue/packet/mux bytes and cancellation/retirement ACK barriers. Merely
moving flush to the end would violate current ownership and output qualification.
If software selection dominates and exact configuration is supported, compare
`no-preference`/available hardware selection before selecting it; do not presume
an Android VP9 hardware encoder exists or silently change output quality.
Original bytes and account/revision pins remain unchanged. Any encoder/queue
change requires renewed complete5400-frame color/clock/quality comparison;
the current output oracle remains valid only for the unchanged serial producer.

MEDIA-06 additionally requires a clear available quality/device/wait choice
when actual delivery cannot keep up. A longer EOF deadline can obtain a finite
completion observation but cannot repair or qualify realtime playback. This
Android receipt should not be accepted as sustained completion, and neither
local output quality nor encoder capability should close the realtime gate.

Suggested curated stage inventory (large local files stay exact/hash-pinned):
`README.md`, `capture.cjs`, `fixture.html`, `fixture.mjs`, `oracle.cjs`,
`capture-results.json`, `oracle-results.json`, `tool-bindings.json`,
`preflight-first-identity-failure.json`, `ffmpeg-comparison.log`,
`decode-cost-probe.mjs`, `decode-cost-results.json`, `throughput-analysis.md`,
`evidence-manifest.json`. Exclude compressed `output-640-180s.mp4`,
`source-probe.json`, `output-probe.json` and `psnr-frames.log` from the curated
Git unit; those exact artifacts remain locally and are included in the manifest.
