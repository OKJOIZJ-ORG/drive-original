# Product preparation: AC3/EAC3 audio compatibility

Prepared local product modules only. The app, service worker, public allowlist and deployment are unchanged by this unit. `media/audio-codec-build.json` deliberately has `distributionReady: false`; source hosting and license review remain required before root integration/publication.

## Root integration API

1. On the page, observe the actual track config with `observeAudioCompatibility(config)`. Admission requires unsupported native AC3/EAC3 input, stereo48kHz, observed native Opus320k encoding and Opus MSE support. Do not register/use this path when the returned `eligible` is false. The observer throws for unsupported profiles instead of changing channels/rate. Native feature observations must be repeated on the actual target browser/device.
2. In the existing generic media Worker, import `registerAudioCompatibility` from `media/audio-adapter.mjs` and pass the pinned Mediabunny core explicitly. There is no imported QA core or duplicated source reader in any product module:

```js
const registration = registerAudioCompatibility(pinnedCore, {
  mapping: { generation, sourceStart, sourceEnd, presentationOrigin },
  signal: jobSignal,
});
try {
  // Existing source owner, encoded-video copy, AudioSampleSink and native
  // Opus AudioSampleSource pipeline remain owned by the generic media job.
} finally {
  const cleanup = await registration.dispose();
  // Preserve shared original-source + MSE updateend/consumer drain barriers.
  // Terminate the owning generic Worker after the job's cleanup.
}
```

Use one registration/runtime per owning Worker job, then terminate that Worker. Disposal disables the registered class's `supports()` method. The core has no unregister API; do not accumulate registrations in a persistent page/global registry. Mapping is copied and frozen. The decoder preserves the source window origin; packet timestamps are resolved on the48kHz sample clock and are not rebased to window zero. The PCM wrapper/core also uses this sample clock; arbitrary off-grid/fractional presentation cases still need route-level timing qualification.

`createAudioRuntime()` is also available directly. `createSession(config,mapping,{signal})` provides `ready`, `decode`, `flush`, `close`, immutable `profile/window`, and `metrics`. Close is idempotent and drains a decode already awaiting module initialization. A canceled asynchronous module load may still finish as a cached32MiB WASM module, but cannot allocate a late native decoder context. The report exposes `moduleLoading`; `settled` at this layer describes native-context/decode ownership, not completion of an outstanding codec-module fetch. The enclosing Worker must still terminate, which releases the module/heap and pending module work.

For separate codec isolation, `createAudioWorkerClient({config,mapping,signal})` uses `audio-worker.mjs` and the same runtime. Await `ready`, then `decode(packet, async (pcm,{signal}) => { ... })`, and always await `close()` in `finally`. It copies only the bounded encoded packet before transferring it, preserving the caller's original packet buffer. It permits one PCM reply until consumption finishes and an ACK returns. This PCM ACK is an internal codec ownership boundary; it **does not replace the existing MSE ACK after native SourceBuffer updateend**.

Close aborts the PCM consumer signal, awaits its completion and native close, then terminates the Worker. A consumer that ignores cancellation/time bounds yields `settled:false, consumersSettled:false`; its still-pending PCM counter is retained honestly. Native contexts are still freed and the Worker is terminated. Open failure automatically initiates this close path. Stale generation replies cannot complete current calls. Default RPC/consumer timeout is5s, configurable only within20ms–10s; an unresponsive Worker is terminated after the bounded close attempt, with unsettled state reported rather than invented native-close proof.

## Bounds and quality contract

The exact source-built EAC3 WASM is preserved: SHA-256 `48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf`,502,740 bytes. Only two local WASM URL references in the generated JS are renamed to `audio-codec.wasm`. The build script verifies both input artifact hashes and the exact two-reference contract before writing output.

Per runtime: one native context,32MiB initial/64MiB engine maximum; per packet≤64KiB; PCM≤4096 frames and32KiB; one in-flight decode and one transferred PCM awaiting ACK. Counters expose current/peak heap, context/open/decode counts, packets/PCM bytes and worker/consumer ownership. There is no8MiB or other cumulative output/packet limit. The session mapping may describe long media; existing source/window, packet admission and MSE owners remain responsible for their own concurrent bounds. Multiple runtimes/Workers multiply heaps, so the media owner must keep its existing one-active-job/window rule. This is not a browser-process/JS/encoder/GPU total-memory guarantee.

`AUDIO_OUTPUT_STATUS` explicitly labels Q2 and `audio:'lossy-transformed'`, Opus320k and `bitPerfectAudio:false`. Its video-copy value is the route's required contract, not proof that this audio-only backend validated a video track. Root must retain original coded-video/timing/color admission and actual encoded-copy integration. Do not label this path Q1 or bit-perfect audio.

5.1 is rejected with `AUDIO_STEREO_48K_REQUIRED`, with no downmix/resample. Earlier actual Chrome proof established native Opus encoder maximum2 channels despite generic Opus MSE MIME support; EAC3 software decoding itself could emit six planes. This module does not broaden that qualification or claim a6-channel output path.

## Verification

- `node --test tests/audio-compat-lifecycle.mjs`: **14/14** ownership/fault tests. These use an explicitly labelled deterministic C-API stub for race/fault injection, not native codec capability proof. They cover delayed open/decode cancellation, idempotent native-context closure, codec-error callback sequencing, context/packet limits, source-buffer retention, ACK ordering, held-consumer cancellation, module-open failure, stale arriving PCM suppression, and visibly unsettled uncooperative consumers.700 decoded stub packets cross8MiB cumulative PCM while peak owned PCM remains12,288 bytes.
- `node qa/q2-audio-product-preparation/native-audit.cjs`: **7/7**, actual isolated Chrome153.0.8010.54, zero page errors or unexpected resources. Tests exercise the new product URLs and actual source-built WASM: AC3 and EAC3 native Worker decode/clock/ACK/close; real corrupt-packet close; cancel during held PCM consumption; actual WASM module loading delayed while open and decode are canceled; actual pinned-core AudioSample adapter and non-poisoning error/close sequence. Normal Workers close exactly one context and report liveContexts0; canceled delayed opening allocates none; heap is32MiB.
- The exact underlying WASM's64MiB denied-grow,30-cycle heap/close and full original-video/audio oracles are reused from the accepted source-built evidence, not repeated or replaced with stubs. Historical75-file and128-file manifests remain byte-identical (`historical-integrity.json`). Those proofs include144 copied video payload/pixel hashes and exactPTS/DTS/color, EAC3 stereo full-window SNR45.14/43.12dB and zero residual sample lag.

Rebuild/copy codec assets with `node scripts/build-audio-compat.cjs`. This command is offline and consumes the existing verified QA artifact; it does not install a compiler or fetch a codec. It regenerates the provenance/notices and keeps the distribution gate closed. Native QA serves only an explicit loopback file allowlist and synthetic packet fixtures, using the known isolated native Chrome fallback. It touches no private account/browser profile or audio volume/output setting.

## Corresponding source and publication gate

`media/audio-codec-build.json` records source/toolchain commits, exact input/output hashes and preferred-source/relink paths. The source bundle must include the pinned full FFmpeg and Emscripten archives, emsdk archive/manifest, generated FFmpeg configuration, build scripts, modified MPL bridge and wrapper, bridge object, static FFmpeg libraries, post-JS, and notices. The exact materials already exist under the accepted QA leaves; no multi-gigabyte SDK/cache or raw PATH diagnostic log was copied.

`media/audio-codec.LICENSE.txt` includes LGPL2.1, MPL2.0, Emscripten, musl and compiler-rt notices. These notices alone are insufficient: before public allowlisting, root must provide actual corresponding-source access and a usable modification/relink arrangement, retain required copyright/source notices and LGPL/MPL rights, and complete applicable codec distribution review. No source-hosting endpoint or public legal promise is invented here. The old opaque prebuilt binary remains excluded; the new public file list is entirely root-owned.

Owned product paths are the eight `media/audio-*` files, `scripts/build-audio-compat.cjs`, and `tests/audio-compat-lifecycle.mjs`; all new QA evidence is in this subleaf. No Git commit/deploy was performed. Current evidence and exact product producers are bound by this subleaf's `evidence-manifest.json`.
