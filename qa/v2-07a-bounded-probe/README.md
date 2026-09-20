# V2-07A identity-fenced bounded probe foundation

This directory is the first read-only body-probe foundation for the private
V2-07A representative set. It is dependency-free ESM and does not import the
product runtime. It performs no Drive mutation, full-file/open-ended/suffix
request, decode, playback, Cache API write, OPFS write or filesystem write.

`runBoundedProbe()` owns the whole evidence lifetime:

1. Normalize the expected private identity using exact strings and `BigInt`.
2. Preflight `accountKey + fileId + version + size + modifiedTime + mimeType +
   canDownload`. A missing/mismatched fence or `canDownload !== true` prevents
   every body read.
3. Expose only `read({ start, end })`. Both endpoints are required, inclusive,
   non-negative and no larger than `Number.MAX_SAFE_INTEGER` before the injected
   reader is called. The file size may remain an exact larger integer string.
4. Send `bytes=<start>-<end>` and accept only an exact `206` whose visible
   `Content-Range`, safe `Content-Length`, `Accept-Ranges: bytes`, `no-store`
   cache policy, and received body length all match.
5. Run reads serially with memory-only exact-range cache/in-flight dedupe,
   generation ownership, abort propagation, and separate received/unique byte
   accounting.
6. Settle every started read and its cancellation before postflight. Reader or
   response cancellation rejection becomes terminal `CLEANUP_FAILED`; cleanup
   that cannot settle inside the file lifetime becomes terminal
   `CLEANUP_TIMEOUT`. Neither case can start the next batch item.
7. Postflight the same seven identity fields after successful reads and after a
   failed request whose cleanup settled. Any drift returns only
   `POSTFLIGHT_DRIFT`; parsed evidence and successful-body evidence are removed.

The hard default ceilings are 1 MiB per request, 16 MiB and 64 requests per
file, 512 MiB per batch, one concurrent request, 10 seconds to headers, 15
seconds without a positive body-byte chunk, and 60 seconds per file. The file
lifetime reserves up to one header-timeout interval for cleanup plus postflight;
with defaults the read phase therefore stops at 50 seconds and the absolute
file wall remains 60 seconds. Callers may lower, but not raise, these ceilings.
Budget exhaustion and timeouts are probe failures/unknowns; they are not
corruption, compatibility, decode or playback verdicts.

## Injected contract

The private selection manifest does not itself contain `accountKey` or the
download capability. The authenticated page must join each selected row back to
the still-private stable inventory/account owner before calling this module.
Neither joined identities nor media bytes should be serialized.

```js
const result = await runBoundedProbe({
  expectedIdentity: {
    accountKey, fileId, version, size, modifiedTime, mimeType, canDownload
  },
  generation,
  isGenerationCurrent: (owner) => owner === currentProbeGeneration,
  getIdentity: async ({ phase, signal }) => {
    // Re-read live account ownership and Drive fields on both phases.
    return readExactPrivateIdentity({ phase, signal });
  },
  readRange: async ({ identity, range, start, end, signal }) => {
    // `range` is always an exact inclusive header. Use no-store and return
    // { status, headers, body } or { status, headers, bytes }.
    return readPrivateDriveRange({ identity, range, start, end, signal });
  },
  probe: async ({ read, sniffMagic, planInitialMagicRange }) => {
    const initial = planInitialMagicRange();
    const bytes = await read(initial);
    return { initialFormat: sniffMagic(bytes) };
  }
});
```

`headers` may be a `Headers` instance or a plain case-insensitive header record.
`body` may be a `Uint8Array`, `ArrayBuffer`, typed-array view, or a Web
`ReadableStream`-like object with `getReader()`. The injected reader must honor
the signal and must not add persistence. The core also cancels an opened body on
header, ownership, timeout, abort, or length failure.

`runBoundedProbeBatch()` shares the 512 MiB ledger and processes representatives
strictly one at a time. Its fixed `complete` and `processed` fields distinguish a
full batch from a fail-closed terminal stop. Abort, generation loss, timeouts,
postflight uncertainty, and unsettled/failed cleanup stop the batch before any
next representative request. Structural identity values are not copied into
results, and failures contain only a fixed code; raw exceptions are not returned.
Success evidence is supplied by the private parser callback and is therefore
private by contract: keep the complete result in the authenticated page only. A
separate reviewed browser adapter/redactor must emit the tracked aggregate; never
serialize this core result directly.

This module deliberately does not choose a network endpoint. It is not safe for
live private data until the separately reviewed browser adapter constrains the
callbacks to lexical authenticated metadata reads and same-origin exact-Range
`GET` requests with no persistence or mutation.

## Initial magic router

`sniffMagic(bytes)` consults bytes only—never extension or MIME metadata. It
recognizes ISO-BMFF (`ftyp`), MPEG-TS sync packets, generic EBML plus WebM and
Matroska doc-type markers, RIFF AVI/WebP, BMP, JPEG, PNG, GIF87a/GIF89a,
conservative JSON/HTML/XML error payloads, and unknown bytes. Every result
explicitly sets `decodeClaimed:false` and `playbackClaimed:false`. It is only an
initial route selector; native box/index/track parsers and product/device tests
remain later units.

## Focused verification

```powershell
node --test qa/v2-07a-bounded-probe/bounded-probe.test.mjs
node --check qa/v2-07a-bounded-probe/bounded-probe.mjs
```
