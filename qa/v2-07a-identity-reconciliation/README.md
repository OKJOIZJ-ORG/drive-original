# V2-07A metadata-only identity reconciliation

This unit diagnoses a bounded-probe `IDENTITY_MISMATCH` without reading or
retrying media bytes. It is a separate, zero-argument, one-shot browser adapter
for the exact read-only `1.22.0-rc.4` candidate. The caller cannot provide a
manifest, file ID, or metadata row.

The adapter performs a fresh authenticated repeated root inventory and the
reviewed deterministic 38-object selection inside its private closure. It then
reads only the fixed Drive metadata fields for every selected object twice,
serially. Account, generation, service-worker controller, page lifecycle, and
the six app-owned media-idle fields remain fenced throughout.

Allowed reads are official Drive v3 HTTPS `GET` requests without `Range`,
`alt=media`, request bodies, or non-resource-key headers. The operation has a
512-request whole-run ceiling, a 76-request reconciliation ceiling, and a
10-minute wall. The 512-request ceiling leaves bounded slack over the previously
observed roughly 138-request path and the under-200 path when each inventory
pass uses its one permitted page-token restart. One request owns both its headers
and JSON body before another request may start.

The public result contains only aggregate counts for mismatches in `fileId`,
`version`, `size`, `modifiedTime`, `mimeType`, `canDownload`, `trashed`, and
resource-key presence, plus pre/post drift counts and fixed failure codes. It
never publishes row order, identifiers, metadata values, resource keys, names,
paths, provider messages, or raw errors. `complete:true` requires paired pre/post
reads for all 38 rows; otherwise `unresolvedIdentityCount` is positive and the
result remains explicitly incomplete.

There is no media URL, native fetch, Range, decode, playback, mutation, cache,
OPFS, filesystem, or other persistence path. The generated browser bundle is
temporary and ignored. Build it only after source review:

```powershell
node qa/v2-07a-identity-reconciliation/build-browser-bundle.mjs
node --check qa/v2-07a-identity-reconciliation/private-identity-reconciliation-browser-bundle.js
```

Focused verification:

```powershell
node --test qa/v2-07a-identity-reconciliation/drive-identity-reconciliation.test.mjs qa/v2-07a-browser-transport/transport.test.mjs
```

## Live redacted result

`results.redacted.json` records the authenticated candidate run. All 38 selected
rows produced paired pre/post metadata reads and were stable across every fixed
dimension. The operation used 138 Drive metadata requests in total, including
exactly 76 reconciliation reads, and produced zero media requests or bodies.

The earlier front sniff's one pre-body `IDENTITY_MISMATCH` did not reproduce.
Because that earlier result intentionally retained no row or dimension identity,
its historic cause remains unknown. This result must not be read as proof that
the earlier event never occurred, as a new front signature for that row, or as
container, track, decode, playback, expiry, sleep/wake, or physical-device proof.
