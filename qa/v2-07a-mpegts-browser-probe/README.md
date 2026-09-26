# V2-07A MPEG-TS browser probe adapter

This directory packages the pure bounded MPEG-TS parser for one private,
read-only browser run against the exact `1.22.0-rc.4` candidate. It does not
modify product runtime, the service worker, the QA transport, or Drive data.

## Boundary

- The browser entrypoint is `runPrivateMpegTsProbe()` with zero arguments.
- Its first invocation synchronously removes the global entrypoint and the
  configurable private-context global. The adapter releases its captured
  runtime/private references and lifecycle listeners in `finally`.
- The run recomputes the repeated canonical-root inventory and exact 38-row
  representative selection internally. Caller file IDs and manifests are not
  accepted.
- Candidate origin/version, top-level context, account, Drive generation,
  activated same-origin `/sw.js` controller, read-only flag, page lifecycle,
  and media-idle state remain fenced for the whole run.
- Each selected row can issue exactly one serial browser media request:
  `Range: bytes=0-65535`, shortened only at EOF. The batch ceiling is 38 body
  requests and 2,490,368 received bytes.
- Body reads use the proven same-origin `/__drive_media/` service-worker route
  with the verified file size, account generation, resource key, and reserved
  diagnostic media/source generations. The browser service worker reads Drive
  directly and restores CORS-hidden range headers only from exact size/length
  evidence. This is not a server media relay. The core still validates the
  visible exact range, length, no-store policy and body length.
- Metadata uses authenticated `driveFetch` with refresh/rate retry disabled.
  The whole run allows at most 512 adapter-dispatched metadata/media requests
  and ten minutes, including inventory and JSON reads. Each metadata request
  owns its serial slot until JSON settles. Service-worker upstream behavior is
  unchanged; the dispatch ceiling does not claim to count its internal retries.
- No second Range, decode, playback, persistence, or Drive mutation is used.
- Magic routing requires three aligned 188-byte MPEG-TS sync bytes. Only that
  route invokes `probeMpegTs(bytes, { limits })` from
  `../v2-07a-container-probe/`, with live-tight 64-KiB/348-packet/1-KiB-section
  parser limits.
- Public output contains only fixed aggregate count buckets and fixed failure
  codes. It never returns rows, IDs, names, paths, resource keys, PIDs, bytes,
  parser issues, or raw exceptions.
- A fixed `priority` sub-aggregate attributes one row's processed/stable/result
  buckets to the internally verified priority selection without publishing its
  ID, index, order, or raw evidence.
- `nativeFetchUsed` reports whether the adapter dispatched a browser fetch,
  including failed runs. `mediaRelayUsed` means a server media relay and remains
  false. `decodePerformed`, `playbackPerformed`, `mutationPerformed`, and
  `persistencePerformed` remain false.
- `aggregateAvailable` is true when a bounded batch aggregate is available,
  including a batch that stopped after a per-file failure. Whole-run failures
  return `aggregateAvailable: false`; their zero counts/totals are unavailable
  aggregate placeholders and MUST NOT mean zero work or zero network activity.
  `nativeFetchUsed` remains truthful independently of aggregate availability.
- `successCount` counts successful bounded transport plus pre/post identity
  verification. It does not mean a supported container, decoder or playback.

The `target-confirmed` buckets are deliberately narrow:

- video profile: H.264 High (`profile_idc=100`) Level 3.0;
- video format: 360x640, BT.709 primaries/transfer/matrix, limited range;
- audio profile: AAC-LC, 48 kHz, stereo.

These are bounded signalling/header observations, not decode or playback
claims. Other parsed values remain only in the fixed `other-parsed` count; a
missing header inside the prefix remains `inconclusive`.
Only `MPEG_TS_STRUCTURE_COMPLETE` may publish parsed detail evidence. All other
structure outcomes retain their explicit outcome counters, but detail evidence
is `inconclusive` (or `not-applicable` without a matching stream). PMT codec-family
signalling counts remain observations, not acceptance of complete topology.

## Build and tests

```powershell
node qa/v2-07a-mpegts-browser-probe/build-browser-bundle.mjs
node --test qa/v2-07a-mpegts-browser-probe/drive-browser-adapter.test.mjs
```

The builder deterministically creates the ignored private execution artifact
`private-mpeg-ts-browser-bundle.js`. Building does not execute it or contact
Google Drive.
