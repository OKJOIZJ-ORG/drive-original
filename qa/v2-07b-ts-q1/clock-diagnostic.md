# Bounded clock diagnosis — 2026-09-29

Actual candidate evidence is owned by
`qa/v2-live-format-playback-rc11/mkv-results.json`: declared Matroska, actual
strict-188 TS admission, zero frames, terminal `SEEK_VIDEO_CLOCK_UNPROVEN`.
The source's display name and file/account identifiers are not recorded here.

Canonical producer `ts-seek.mjs:47–53` requires one exact positive integer DTS
step across all sampled windows, head-relative PTS/DTS phase, unique PTS, and
bounded reordering. Range completion alone does not prove that a window passed clock admission;
the earlier inference that two reads proved head admission was unjustified.
Independent diagnostic samples subsequently established the exact differences. This is before MSE creation or decoder input,
so it is not evidence of an unsupported H264 decoder.

The same CFR restriction occurs independently in `seek-input.mjs:96–102` and
`elementary-stream.mjs:17–20,44–45`. Existing VFR/phase-change tests intentionally
reject these timelines. Removing one demand would leave downstream failures and
could invent GOP durations/brackets. No admission rule has been changed.

## One requested proof

Evaluate `clock-diagnostic.generated.js` as an expression. It returns:

```js
diagnoseTsClock({ read, sourceSize, isCurrent })
```

Pass the existing `openDriveQ1Source` owner's bound read method and current-owner
predicate. Keep its account/content/checksum, metadata pre/post, Range body and
cancellation guards. The root owns current app metadata selection, browser
access, total deadline and final source abort/settled check. Do not store input
bytes. Two serial head/tail reads total at most 1,048,288 bytes; small sources are
deduplicated. Results contain only capped timestamp histograms/violation samples
and counts, no bytes, SPS/PPS, URLs, names, tokens or file/account identity.

The result distinguishes differing DTS cadence, PTS-only phase drift, duplicate
PTS and excessive reordering. This does not prove full-source continuity,
complete pictures or decode. A safe next implementation depends on which of
these the actual file exhibits.

The ready browser wrapper is `clock-live.expression.js`, evaluating to
`(selected, clock, swProof) => job`. Pass the exact current `state.files` object,
the diagnostic function above, and a fresh runtime proof handle. It imports the
currently deployed `./media/drive-source.mjs`, uses only ordinary generic media
routes, and returns immediate `poll()` / `cancel()` methods. `poll()` returns
`{done, summary}` with a summary only after cleanup. No global app state changes.

Wrapper SHA256:
`53991a52ef4466639e6a6939940e2fa03fa25183a86858ee20402e213b83e059`.
It binds list metadata, account/subject, token string/revision/expiry, controller,
fresh SW version, idle player, settled retirement, state writer/projection, and
generations. Maximum: two exact 524144-byte media reads, five metadata GETs and
32768 metadata bytes; 60-second run, 10-second metadata and 15-second Source
request deadlines. Local Source cleanup must settle. Generic upstream cleanup
remains explicitly unknown even after complete body consumption. Cancellation
rejection/timeout is terminal and does not authorize another probe.

Combined diagnostic + wrapper tests: 7/7 pass, including the real Source reader
with synthetic responses and a metadata cancellation rejection. Producer hashes
are in `clock-live-provenance.json`. Actual execution is owned by the root.

Generated SHA256:
`2a24937f4f92869b721bd7e324ea8c836af2aef37655b3215277e747a2f05b49`.
Built with the repository's existing esbuild 0.28.1, IIFE/browser/es2022/minified,
entry `clock-diagnostic.mjs`, wrapped to return its exported function.
`node --test qa/v2-07b-ts-q1/clock-diagnostic.test.mjs`: 3/3 pass (known CFR,
synthetic phase drift, cancellation/short response). No product bundle changed.

## Generic processing boundary

Shipped media modules implement this narrow original-byte Q1 path, not a generic
Q2/Q3 engine. No WebCodecs decoder/encoder or FFmpeg execution is wired there.
For this H264/AAC TS source, clock-preserving Q1 extension precedes reencoding.

[WebCodecs](https://www.w3.org/TR/webcodecs/) does not mandate codec availability;
per-configuration support and actual decode are required. It cannot by itself
add a decoder absent from the browser. The currently documented
[ffmpeg.wasm build](https://ffmpegwasm.netlify.app/docs/faq/) has a 2 GB input limit
and significant execution/memory costs; that is not a universal permanent
WebAssembly limit. A bounded demux/process/mux path needs actual codec, timing,
seek, cancellation and device-resource proof before Q2/Q3 can be claimed.
