# General Q1 preparation: packet copy with original clocks

This is a reusable, locally qualified worker + MediaSource adapter. App routing, labels, service-worker publication/allowlists, and deployment are owned by the integrating app. Existing TS routing is independent and remains available.

## Root wiring

```js
import { createGeneralPlayer } from './media/general-player.mjs';
const player = createGeneralPlayer({
  video,
  isCurrent: () => /* current account + current selected file generation */,
  openSource: ({ signal }) => openDriveQ1Source({
    /* same metadata, exact Range, identity and callback ownership contract as TS */
    signal, /* fileId, accountKey, accountGeneration, isCurrent, readMetadata, readRange */
  }),
  onEvent: event => { /* fixed errors; mapping; buffered; gesture-required */ },
  initialTime: 0,
  autoplay: false,
});
const mapping = await player.ready;
await player.seek(mapping.sourceOrigin + movieSeconds, { autoplay: !video.paused });
const movieTime = player.sourceTime() - player.stats().mapping.sourceOrigin;
const cleanup = await player.dispose();
// Do not replace a transport owner unless cleanup.settled === true.
```

`initialTime` and `seek` are original source-clock seconds, not normalized element seconds. At 0 the player selects the source's first presentable video packet. A seek starts at the preceding verified RAP and positions within that decoded window. The mapping has `sourceOrigin`, `sourceEnd`, `commonShift`, `targetSource`, `targetElement`, and `timestampOffset`; element time + commonShift equals source time. Both tracks share one shift. Movie time equals source time - sourceOrigin. ISO uses the original movie/edit axis; TS sourceOrigin is the first source packet timestamp. Leading audio, negative decode preroll, edits, rotation and SAR remain represented. Initial audio-only time before the first video picture is clamped to that first picture; no source timestamps are rewritten independently.

`ready` resolves when the target is buffered and positioned. `seek` returns the new generation's ready promise. `completion()` returns the current generation's stream task, which can remain pending while playback is paused at the buffer watermark. Completion alone is not a playback-success assertion: inspect `.stats().failure` / error events. `stats()` reports generation, mapping, append/removal/wait counts, observed peaks, worker/pipeline results once complete. `dispose()` cancels discovery, reads, consumers and worker, waits for source cleanup, removes MSE ownership, and returns its settled result. Failed source open cleanup is preserved; an unsettled result blocks a replacement. Identity/checksum fences survive seeks. Each source opening must belong to this caller; an unrelated source owner cannot be shared.

The standard `MediaSource` path is qualified here. `ManagedMediaSource` is not enabled by this adapter; existing platform routing must handle that distinction.

## Admission and ownership limits

- One AVC video track, zero or one AAC-LC audio track; qualified audio configuration is mono/stereo at 44.1 or 48 kHz. One ISO sample description; external data references, encrypted entries, dynamic AVC/AAC configuration, and unsupported clocks reject visibly. No encoder or Conversion is constructed.
- Flat ISO BMFF / QTFF, or strict 188-byte MPEG-TS with original decode timestamps. Fragmented ISO input, compact sample-size tables, Matroska/WebM inferred DTS, multiple content edits, and explicit end-trim requests are not admitted.
- Original `moov` <= 4 MiB, <= 2 tracks, <= 4,096 nested boxes, <= 65,536 expanded samples and table entries per track, depth <= 8. Run-length stts/ctts sums, duplicate tables, sample sizes and entry bounds are checked **before** the vendor Input is constructed. This limits concurrent flat-file indexes; larger indexes require a future paged parser and fail visibly today.
- Discovery / RAP search <= 32 MiB physical reads or 512 requests per opening. There is no lifetime read-byte, output-byte, packet-count, worker-time or pause-time limit after streaming starts. Individual physical reads <= 64 KiB; source LRU and vendor source cache each <= 256 KiB; one physical read active, at most four queued. Read deadlines are per request.
- Individual packets / TS PES <= 2 MiB; TS retained PES <= 4 MiB / 64 records; source decode/reorder lookahead <= 4 MiB / 4,096 records, SPS-declared reorder depth <= 32. The lookahead limit also bounds RAP refinement. Source TS scan caches hold <= 128 reference PES headers and <= 1,024 section boundaries; forgotten entries are rescanned.
- Mux retained samples <= 4 MiB / 4,096. Completed fragment metadata is released and the lifetime `mfra` index is omitted in streaming mode. New seeks open a new original source window. One output writer batch <= 8 MiB; each transferred chunk <= 256 KiB; exactly one current append ACK. A paused ACK has no timeout.
- MSE stops requesting new batches at 30 seconds ahead and resumes at 12 seconds or less. Removal uses an output video RAP at least 8 seconds behind playback, indexed only after its complete media payload append is acknowledged. A bounded observer retains at most 256 KiB of owned mux metadata, qualifies the video track, sample flags, presentation timestamp and single rate-1 edit, and requests an endpoint below the RAP across track-tick, native microsecond and floating-point quantization. The retained tail can exceed 8 seconds with a long GOP. Conservatively charged encoded append bytes remain capped at 24 MiB, with one bounded incoming batch; `GENERAL_RETENTION_LIMIT` fails closed if no acknowledged RAP can release enough charged bytes before buffered playback ends. Removal must advance and retain the current range. Browser-native decoded/GPU allocations are not measured by these JavaScript ownership limits.

TS final display duration comes from the demuxer's available boundary estimate; source PTS/DTS preservation is a separate assertion. No generic exact final-frame duration is inferred from a TS PES that contains no explicit duration.

## Worker extension boundary

`startGeneralWorker` owns source RPC and accepts `workerFactory(url)`. `createGeneralPlayer` passes an optional factory through. A separately qualified Q2 worker can reuse this boundary; the strict general worker never loads an audio decoder or QA module.

Messages are generation-fenced. Worker requests use strictly increasing positive `id`; the page replies `{kind:'reply',generation,id,value,error}`. At most four RPC requests may exist; chunk ACKs are serial. `read` uses inclusive `{start,end}` and returns a transferred ArrayBuffer. `window` value includes `sourcePacketOrigin`, `windowOrigin`, `videoStartTimestamp`, `sourceEndTimestamp`, optional ISO `policy`, and the final output `videoConfig` / `audioConfig` codec strings and decoder descriptions. `chunk` transfers `{buffer,position,batchSize,batchEnd}`; batchSize is the complete writer batch, repeated on each slice. `cleanup` returns the original page-owned source's shared settled barrier. `terminal` includes `result` or a fixed-code `error`, after cleanup. Cancellation aborts consumer signals and reads and rejects pending worker requests; terminal cleanup also reports consumer drainage and worker termination.

A Q2 factory must preserve this complete contract and provide its own explicit audio-lossy route/label and codec qualification. Merely injecting a different worker does not establish Q2 quality.

## Evidence and build

Run `node --test tests/general-q1.test.mjs tests/general-retention.test.mjs tests/general-q2-end.test.mjs`. The self-contained synthetic AVC fixture tests hostile expanded / duplicate indexes, source-clock B-frame seek tuples, parameter changes, references, serial chunks, cancellation, cleanup, private-error suppression, and >10,000 packet / >8 MiB streaming throughput.

`qa/q1-general-product-preparation` retains isolated Chrome + real MSE/local DriveSource callback trials, long TS throughput, source/worker fault results, build output and preferred source. It is intentionally not a product import. The earlier `qa/q1-clock-color-integrity` raw-container oracle remains the independent coded-byte/PTS/DTS/color/SAR/rotation evidence; unchanged corpus checks were not relabeled as new product tests. Direct-native versus MSE RGB is not claimed equivalent: the known single-picture native color interpretation difference remains an explicit oracle limitation. No metadata is changed to hide it.

Build with `node scripts/build-general-q1.cjs --check` on Windows x64. It verifies the pinned upstream archive, exact patch and changed source hashes, missing upstream shared files, and esbuild binary; it reproduces the shipped runtime bytes without npm lifecycle scripts. Source publication preparation and license are described in `mediabunny-q1-NOTICE.md`. App/SW/allowlist wiring and release/source publication are separate integration work.

Retention checks distinguish next-RAP native removal from a safe acknowledged endpoint, preserve reordered AVC presentation clocks, reject malformed output metadata, exercise the 24 MiB admission boundary, and settle cancellation during ahead backpressure. These deterministic checks do not establish physical-device MSE playback or full format qualification.
