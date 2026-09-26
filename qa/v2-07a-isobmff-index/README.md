# V2-07A local ISO-BMFF top-level index planning

`scanIsoBmffTopLevel` walks declared top-level box boundaries through a caller's
exact inclusive `read({ start: BigInt, end: BigInt }) => Uint8Array` callback.
It reads 8-byte base headers, another 8 bytes for extended size, and another
16 bytes for UUID user type. It skips every payload, including `mdat`, `moov`,
`ftyp`, `styp` and `moof`. Unknown box payloads are skipped by their bounded
declared size; their contents are not validated. No byte-signature search occurs
inside `mdat`. A zero size consumes the rest of the file.

Defaults and hard ceilings are 128 boxes, 4,096 requested header bytes, and 64
reader calls. Callers may lower these limits. Each read is at most 16 bytes;
there are no retries. Size must be an unsigned decimal string (at most 20 digits)
or BigInt, at most `2^64 - 1`. Offset/size arithmetic stays BigInt, and report
offsets/sizes are decimal strings. A reader failure, limit, cancellation or
malformed header produces an explicit `incomplete` result with a fixed code.
The byte metric counts only exact accepted responses; malformed or aborted
responses have unknown receipt size and are not accounted as accepted bytes.

`complete` / `top-level-headers-complete` means the declared header chain reached
EOF. Empty files and files without `ftyp` can have a complete header walk. This
does **not** identify a valid ISO-BMFF file. `ftyp`, `styp` and `moof` observations
only name accepted top-level headers, not valid brands or validated fragmentation.
`moov` entries locate candidate future metadata reads and state whether they are
before/after the first observed `mdat`; they are not parsed indexes or a faststart
classification. Partial observations never prove absence. No nested boxes,
tracks, sample tables, codecs, decode, seek, playback, corruption confirmation,
authenticated Drive reads or device behavior are claimed.

The module has no native fetch, URLs, identity fields, persistence or media
decoder. Returned offsets remain private local evidence; do not publish raw
reports tied to live files. Caller owns version/identity/HTTP validation, deadlines,
and cancellation of underlying I/O. An AbortSignal stops the walk and its pending
await, but cannot forcibly cancel an arbitrary callback; wire the same signal
into the reader. Use the existing bounded core for real transport ownership.

## Existing core integration shape (not executed against live media)

```js
import { runBoundedProbe } from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { scanIsoBmffTopLevel } from './isobmff-index.mjs';

// All bindings are supplied privately by the existing authenticated adapter.
const result = await runBoundedProbe({
  expectedIdentity,
  getIdentity,
  readRange,
  generation,
  isGenerationCurrent,
  signal,
  probe: ({ read, signal: probeSignal }) => scanIsoBmffTopLevel({
    size: expectedIdentity.size,
    read,
    signal: probeSignal,
    limits: { maxRequests: 64 }
  })
});
// First require result.ok and core identity checks, then inspect evidence.status.
// Core ok means its own contract passed; an incomplete header report is possible.
```

The unchanged core additionally caps each file at 64 reads and rejects endpoints
above `Number.MAX_SAFE_INTEGER`. This parser's sparse virtual-reader tests above
`2^53` demonstrate local arithmetic only, not support by that core or live Drive.
The integration shows the shared 64-read cap explicitly. Body/identity failures
owned by the core discard parser detail and retain the core's failure code.
A reader error rejected before core dispatch (such as an unsafe endpoint) can
instead yield `ok: true` with `evidence.status: 'incomplete'`; require both layers.

Syntax references: [Bento4 atom factory](https://github.com/axiomatic-systems/Bento4/blob/master/Source/C%2B%2B/Core/Ap4AtomFactory.cpp)
for size, extended size, UUID and EOF header mechanics;
[W3C ISO-BMFF byte stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/)
for the distinction between initialization and media segment boxes. The W3C
document is an MSE subset, not generic MOV/ISO-BMFF conformance. No vendor source
or dependency is copied into this slice.

Run deterministic synthetic tests with:

```powershell
node --test qa/v2-07a-isobmff-index/isobmff-index.test.mjs
```
