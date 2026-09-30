# rc.21 bounded corpus metadata producer v2

Local QA preparation only. This does not establish actual account execution, playback,
all36 representatives, full corpus completion, Android acceptance, or generic upstream cleanup.

The actual executed `../rc21-actual-corpus/factory.expression.js` remains unchanged.
`factory-v2.expression.js` is built from maintained modules plus two explicit forks:
`probe.mjs` of rc16 (current21 version fence and sparse-reader wiring only), and
`sparse-moov.mjs` of rc11. The facade is read from rc16 during build with exactly two
current21 pin replacements. `provenance.json` hashes every producer and inherited source.

The new cache coalesces only caller-proven structural metadata: fixed `tkhd`, `mdhd`,
and `hdlr` prefixes; supported `stsd` sample-entry fixed data plus at most its next8-byte
child header; an allowlisted configuration body plus at most its next8-byte child header.
Requests are clipped to that validated metadata parent and the scanner-confirmed moov.
No arbitrary moov window, sample-table payload, unknown payload, mdat, or whole-object
prefetch is admitted. Returned buffers are private copies; cache storage is cleared on
success and failure, and abort/current-owner checks also guard cache hits and late reads.

The original bounded reader still owns exact206/Content-Range/Content-Length/body
validation, physical request/byte accounting, serial I/O and cleanup. The same8-file
plan, per-file64 requests, 2MiB+8192 bytes, 1MiB/request, 50s/file, 10s headers and
10s body no-progress budgets, account/SW/session/projection/writer fences, final repeated
inventory and honest `genericUpstreamCleanup: unknown` remain. Sample-group incompleteness
and an intentionally deferred TS sample retain the prior semantics.

Build: `node qa/rc21-corpus-night/build.mjs`.
Check and save evidence: `node qa/rc21-corpus-night/verify.mjs`.

The two-track sparse synthetic counterexample compares exact results and bytes while
modeling1.1s per serial request:38→30 calls,555→555 bytes,41.8s→33.0s. This model
motivates actual rerun; it does not prove the live timeout's cause or resolution.
