# V2-03A local range comparator

This directory is a local, read-only diagnostic. It compares bounded front,
middle and tail ranges from the current service-worker path and an independent
official Drive API request. It never persists bytes, accepts no token or URL,
and emits no account key, file ID, file version, resource key, URL, token or
media bytes. SHA-256 digests are kept only in the returned in-memory report.

The caller supplies one exact private identity (`accountKey + fileId +
fileVersion + size`) and two injected readers. Each reader must prove that same
identity before its response is accepted. An exact `206` with a matching
`Content-Range`, body length and optional `Content-Length` is marked `exact`.
When direct CORS access does not expose `Content-Range`, an otherwise consistent
206 is marked `opaque`, not falsely exact; it is byte-comparable only against the
other identity-bound route's digest. A `200`, `416`, malformed visible range,
identity change or reader failure is not promoted to equality. Each sampled body
is limited to at most the requested bytes plus one detection byte (1 MiB maximum
per interval).

`getIdentity` receives `{ phase, signal }` for both the pre-fetch and post-fetch
checks. Both checks race the signal. If cancellation or identity validation
failure occurs after a response opens, its body is cancelled before the error is
propagated, and no later reader is started.

## Deterministic test

```powershell
node --test qa/v2-03a-range-comparator/range-comparator.test.mjs
```

## Live use in the already authenticated app tab

Serve this checkout from the same `http://localhost:4173` origin already used by
the authenticated validation tab. In DevTools, keep the desired private file
selected and run the following expression in the app page context. Supply the
known stable version only in the local variable; do not paste it into reports or
chat. The independent reader calls the app's existing `driveFetch`, so the access
token stays inside the authenticated app and is never read by the comparator.

```js
const comparator = await import('./qa/v2-03a-range-comparator/range-comparator.mjs');
const expectedVersion = '<known stable private version>';
const readLiveIdentity = async ({ signal } = {}) => {
  const selectedId = String(state.selected.id);
  const metadataUrl = `${DRIVE_API}/files/${encodeURIComponent(selectedId)}?fields=id,size,version,headRevisionId,sha256Checksum,modifiedTime&supportsAllDrives=true`;
  const response = await driveFetch(metadataUrl, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Private identity metadata was unavailable.');
  const metadata = await response.json();
  const observed = {
    accountKey: String(state.accountId),
    fileId: String(metadata.id),
    fileVersion: String(metadata.version),
    size: Number(metadata.size),
    contentRevision: metadata.headRevisionId || null,
    checksum: metadata.sha256Checksum || null,
    modifiedTime: metadata.modifiedTime || null
  };
  if (observed.fileVersion !== String(expectedVersion)) {
    throw new Error('The private file version changed; comparison stopped.');
  }
  return observed;
};
const exactIdentity = Object.freeze(await readLiveIdentity());
const snapshotIdentity = () => ({
  ...exactIdentity,
  accountKey: String(state.accountId),
  fileId: String(state.selected.id),
  size: Number(state.selected.size)
});
const currentSwReader = comparator.createIdentityBoundReader({
  getIdentity: snapshotIdentity,
  fetchRange: ({ range, signal }) => fetch(buildMediaUrl(state.selected), {
    method: 'GET', headers: { Range: range }, cache: 'no-store', signal
  })
});
const independentApiReader = comparator.createIdentityBoundReader({
  getIdentity: snapshotIdentity,
  fetchRange: ({ range, signal }) => {
    const headers = { Range: range };
    if (state.selected.resourceKey) {
      headers['X-Goog-Drive-Resource-Keys'] = `${state.selected.id}/${state.selected.resourceKey}`;
    }
    const endpoint = `${DRIVE_API}/files/${encodeURIComponent(state.selected.id)}?alt=media&supportsAllDrives=true`;
    return driveFetch(endpoint, { method: 'GET', headers, cache: 'no-store', signal });
  }
});
const comparisonAbort = new AbortController();
globalThis.__v203aComparisonAbort = comparisonAbort;
globalThis.__v203aComparison = await comparator.compareFrontMidTail({
  identity: exactIdentity,
  currentSwReader,
  independentApiReader,
  sampleBytes: 65536,
  versions: { app: APP_VERSION, build: 'fe9c359', worker: APP_VERSION },
  verifyIdentity: readLiveIdentity,
  signal: comparisonAbort.signal
});
console.table(globalThis.__v203aComparison.ranges.map((entry) => ({
  interval: entry.label,
  swStatus: entry.currentSw.status,
  apiStatus: entry.independentApi.status,
  swRange: entry.currentSw.range.verdict,
  apiRange: entry.independentApi.range.verdict,
  swLength: entry.currentSw.receivedLength,
  apiLength: entry.independentApi.receivedLength,
  bytesEqual: entry.equality.bytesEqual,
  swHeadersMs: entry.currentSw.timingsMs.headers,
  apiHeadersMs: entry.independentApi.timingsMs.headers,
  swFirstByteMs: entry.currentSw.timingsMs.firstByte,
  apiFirstByteMs: entry.independentApi.timingsMs.firstByte
})));
```

Keep `headers` as a plain record in this binding. The current app `driveFetch`
merges headers with object spread, which does not enumerate entries from a
`Headers` instance. The first exact-module attempt therefore lost `Range`,
received `200`, and was correctly classified as inconclusive; it is not the
recorded comparison result. The recorded rerun used the plain record above and
received bounded `206` responses from both routes.

To cancel an in-flight run, execute
`globalThis.__v203aComparisonAbort?.abort()`. Do not serialize or share the full
report because its digests are content-derived. Share only the redacted table,
the equality summary, and whether the single identity remained validated.

The redacted authenticated result is recorded in `live-results.redacted.json`.
The public-only `_site` intentionally omits QA modules, so live validation must
import this exact module from a local development-served checkout or an exact
in-memory copy of the committed module. Record the module version separately
from the app/build/worker versions. Keep the full report in page memory and
export only status, `exact`/`opaque` verdicts, lengths, timings, equality and
identity-stability booleans; absolute offsets, digests, private identity values,
tokens, URLs and media bytes stay omitted.
