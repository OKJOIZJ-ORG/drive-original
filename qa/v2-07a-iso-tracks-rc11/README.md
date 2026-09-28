# rc.11 single-file ISO track discriminator

QA-only, no product/deployment/Drive mutation. The scope is one **actual current
`state.files` object**, supplied privately as a CDP object handle. No inventory is
run and no pathname, file ID, token, URL, media bytes or private metadata is
exported in summaries. An extension/MIME can select a candidate but only the
actual 940-byte magic admits the ISO scanner. Non-ISO input returns `NOT_ISO`;
the coordinator may choose another file as a separate bounded run.

## Build and focused checks

```
node --test qa/v2-07a-iso-tracks-rc11/parser.test.mjs qa/v2-07a-iso-tracks-rc11/probe.test.mjs qa/v2-07a-iso-tracks-rc11/sparse-moov.test.mjs
node qa/v2-07a-iso-tracks-rc11/verify-seed.mjs
node qa/v2-07a-iso-tracks-rc11/build.mjs
node --check qa/v2-07a-iso-tracks-rc11/browser.generated.js
```

`provenance.json` pins producers and generated browser bundle. `seed-results.json`
compares the existing local synthetic H264/AAC seed with independent ffprobe
stream metadata (codec tags, dimensions, sample rate, channel configuration).
It proves no actual Drive playback or decoding.

## Private browser integration

1. Close/retire the player. Ensure current rc.11, visible top-level candidate,
   online same-account session, no state write/sync pending, and a settled Q1
   retirement. Do not alter state timers or production settings.
2. Obtain fresh active-controller runtime proof with the existing
   `../v2-07a-isobmff-rc11/sw-runtime-proof.expression.js` mechanism after reboot.
   A served `sw.js` byte check alone is not runtime proof. Keep its private handle.
3. Evaluate `browser.generated.js` in the actual app's main execution context,
   retaining the returned function by object ID. Call it with an exact object
   from `state.files` and that SW-proof handle. Neither argument is serialized
   to disk. The facade verifies object membership. It returns the job immediately
   and starts the run; CDP need not await a long promise.
4. Call `job.poll()` for redacted `{done,summary}`. `complete` means **one bounded
   structurally parsed derived moov metadata tree with matching pre/post identity**, never full
   container validity, decoding, support, playback or corpus completeness.
5. Only successful jobs retain `job.selectedFile()` as a **private object** for
   the coordinator's subsequent normal UI lookup/playback. Do not export that
   method by value into results or logs. Call `job.release()` after extracting
   the needed in-page handle, then release both CDP object groups. `cancel()`
   aborts pending I/O; poll until settled before new work.

## Limits and ownership

Two metadata GETs total: the first binds current version/headRevision/checksum,
the last compares them. Available normal-list size/MIME/modifiedTime/version/
canDownload/content fields must agree with first metadata. App lists need not
already contain version. Exact ID/download permission/trashed/resource key and
the bounded reader's account/version/size/time/MIME identity all remain fenced.
No relaxed identity is invented and no whole-catalog stability is claimed.

The facade fences account/auth/token revision+string/expiry, controller proof,
media/playback/source generations, Q1/retirement identity, state writer/revision/
projection and quiescent write state, top-level origin, visibility and online
authentication on each fetch/read and result. Equal read-only state refresh is
allowed; changed data or any pending writer stops the run.

Media reads use the candidate's same-origin `__drive_media` SW route. Existing
strict bounded reader checks exact206/Content-Range/body length/no-store/abort;
the production SW owns its existing safe hidden-CORS206 normalization. The
QA helper does not synthesize upstream headers. It reads 940-byte prefix, sparse
top-level headers, then selected nested moov metadata. The moov itself can exceed
2MiB; that does not increase the read budget. `sparse-moov.mjs` validates nested
headers and lengths using BigInt before reading only required tkhd/mdhd/hdlr
prefixes, stsd sample entry prefixes and known codec configurations. It skips
stsz/stco/stsc and other sample tables, unknown payloads, edit-list contents,
fragment defaults, handler names and unparsed color/encryption payloads.
Unknown sample-entry layouts/extended QuickTime audio fail incomplete.

The existing parser receives a **derived compact metadata tree**, not the
original moov. Container sizes are reconstructed; required leaf data is copied;
edts/mvex/sinf/colr and unknown sample-child presence are represented as empty
markers only. It preserves relevant limitations without asserting payload
validation. `sparseMoov` reports validated header/track/description counts,
bytes/requests, skipped categories and derived size, never original offsets.
The already-validated original moov root header and cached940-byte prefix are
reused. A sparse logical read is not necessarily a new network request.

Maximum64media requests/2MiB+8192 received media bytes, 32KiB per metadata response,
10s metadata/header/body inactivity, 50s bounded file lifetime, 60s overall run.
Small files<=940bytes skip before body. No complete-file request is allowed;
an exact moov/header range may include EOF only when that box requires it.
Requests are serial, low priority, no retries. Caller cancellation/owner change
never claims successful postflight. Existing bounded cleanup timeout remains
terminal; actual generic upstream transport cleanup is not inferred.

`released`/`localReferencesReleased` mean local runtime handles were dropped,
not that a browser's underlying network transport was proven retired.
`genericUpstreamCleanup` remains `unknown`. Metadata cleanup explicitly waits
for a late fetch response and its body cancellation, at most2s; rejection/timeout
is terminal `CLEANUP_FAILED`/`CLEANUP_TIMEOUT` with `complete=false`, no retained
selection and no next request. Finalization drains any still-running metadata
cleanup before publishing completion. Identity uses `authAccountKey`; the
distinct `accountId` subject is independently pinned as an owner fence.

Sparse traversal independently permits at most256headers/32tracks/16sample
descriptions per stsd, 256KiB per known codec configuration, 2MiB requested
metadata bytes and64logical reads. These ceilings can only be lowered. The
shared reader additionally counts actual requests and exact received bytes
across prefix, top-level and nested metadata reads, with the unchanged64total
request ceiling. Bounds/count/byte/request/unsupported/cancel failures remain
incomplete; no cap is raised for a large moov. The sparse helper only owns local
traversal; the caller's strict reader retains transport cancellation ownership.

## Parser boundary

Reports track kind, declared dimensions/matrix identity/timescale, sample entry
codec tags, basic video config headers, sound fields and bounded elementary AAC
AudioSpecificConfig fields. Unknown codec bytes are replaced by `unknown`.
Nested lengths/counts/versions are checked; max32tracks/16descriptions/4096boxes/
4096descriptors and descriptor depth4. Malformed/truncated input is incomplete.

Complex QuickTime audio, nondefault data references, encrypted entries, edit
lists, fragment defaults, unknown sample layouts, complex AAC config and
nonidentity matrices carry explicit limitations. Sample tables, parameter sets,
complete config bitstreams, actual frame timing, HDR/VFR/subtitle behavior,
fragment payloads and decoder capability are unqualified. An unsupported layout
can still be structurally observed; `parsed` does not claim it is supported.

Field-layout references: [Apple track header](https://developer.apple.com/documentation/quicktime-file-format/track_header_atom),
[video sample description](https://developer.apple.com/documentation/quicktime-file-format/video_sample_description),
[sound sample description version0](https://developer.apple.com/documentation/quicktime-file-format/sound_sample_description_version_0).
Browser request priority follows the modern-web-guidance background-fetch guide;
unsupported `priority` options are only a scheduling hint and cannot weaken limits.
