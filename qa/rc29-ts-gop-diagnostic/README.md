# rc29 bounded TS GOP failure diagnostic

Observed local preparation only. Canonical product modules are unchanged.
The normal-UI failure's media bytes have not been read by this task.

`factory.expression.js` evaluates to `{analyze,binding}`. The pure async analyzer
accepts `{headBytes,tailBytes,sourceSize,tailOffset,headAtEof,tailAtEof,version,sourceCommit}`.
Each array must be exactly `min(524144,sourceSize)` bytes; head begins at zero,
tail begins at `sourceSize-width`, and EOF assertions must match exactly.
Use the returned binding's fixed rc29 version and source commit after verifying
the intended source independently. It performs no external I/O. Its async step
calls the unchanged canonical seek probe against those two supplied windows.
The analyzer erases its copies in `finally`; it does not erase caller inputs.

`collector.expression.js` evaluates to a start function without taking actions.
After the root verifies the loaded local file's SHA256, invoking that function
once returns `{poll,cancel}`. `poll()` returns `{started,done,summary}`. Export
only the completed safe summary. The collector consumes the existing private
`window.__resumeFailedNormalTarget` and `window.__resumeSwProof` accessors, checks
current UI metadata, idle/retired player, account/auth/token/controller/writer/
projection/source/href ownership, and makes GET requests only for that exact file.
It does not consume or erase the root's target/proof globals.

Limits are two media GETs of at most 524144 bytes each, five metadata GETs of at
most 65536 bytes each, 2 MiB total decoded response-body bytes, 60 seconds overall,
and 10 seconds per request. There are no retries or widened windows. Initial
metadata establishes version/headRevisionId/MD5 plus optional other checksums;
fresh metadata immediately before and after each range must match it. No full
file checksum is recomputed from these samples. Every response must be 206 with
an exact exposed Content-Range, or have a CORS-hidden Content-Range with exact
known source size and safe exposed Content-Length. The latter receives only the
`corsHiddenKnownSizeLength` count and does not claim range-header verification.
Content-Encoding, 200 fallback, response mismatch, overflow, owner changes and
unsettled cleanup reject. Redirects error; credentials are omitted.

Byte counts describe bytes returned by browser body reads, not TLS/network wire
bytes. An oversized chunk can exceed the cap before rejection; it is never
accepted or parsed. Browser-managed transport memory is not measured. A cleanup
timeout is explicitly uncertain and blocks a complete result.

Safe analyzer output is fixed stages/codes, frame/record counts, condition
booleans, bounded timing differences and coarse audio configuration. It never
returns source identities, URLs, metadata, media bytes, SPS/PPS or raw clock
arrays. Diagnostic success means supplied-window analysis completed; it does
not establish decodability, playable seeking or global timeline continuity.

Build and verify from repository root:

```powershell
node qa/rc29-ts-gop-diagnostic/build.mjs
node --test qa/rc29-ts-gop-diagnostic/verify.mjs qa/rc29-ts-gop-diagnostic/collector.test.mjs
```

The build verifies all canonical dependencies and current rc29 runtime bytes
against commit `10f1dd2ee9550866933e693dbf41c62e1fb2daad`. Provenance files bind
source hashes, compiler, serialized output size/hash and local producer hashes.
The serialized synthetic tests cover clean startup, 1/2-frame EOF GOP rejection,
IDR presentation order, inter-GOP overlap, duplicate PTS, syntax rejection,
source/input caps, exact/hidden range admission, malformed/oversized responses,
metadata/UI/owner drift, cancellation and request timeout. Synthetic evidence
does not identify the actual failed media's cause.
