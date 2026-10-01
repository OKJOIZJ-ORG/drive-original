# MPEG4 video decoder: source, modification and relinking

The Q3 video decoder uses LGPL-2.1-or-later FFmpeg commit
`140fd653aed8cad774f991ba083e2d01e86420c7`, compiled with GPL/nonfree disabled,
and a readable MIT bridge. Emscripten 4.0.15 source commit is
`09f52557f0d48b65b8c724853ed8f4e8bf80e669`. MPEG4 decoding enables its H263
dependency. Native browser VP9 encoding is separate; the MP4 muxer remains the
existing MPL-2.0 Mediabunny fork with its separately supplied preferred source.

Download `video-q3-source.tgz` and `video-q3-source-manifest.json` beside this
notice. The archive includes the exact bridge, static libraries, generated
configuration/headers, runtime wrapper/WASM, build/relink recipe and notices.
It references the complete unchanged official FFmpeg, Emscripten and emsdk
source archives already distributed in the adjacent seven-part
`audio-source-v1` package. Download those parts and `audio-source-reconstruct.cjs`,
reconstruct/extract as directed by `audio-source-NOTICE.md`, then follow
`video-q3-source/README.md`. No remote source CDN is needed for these materials.
Compiler binaries/cache are separate prerequisites, never silently installed.

You may modify the LGPL libraries and relink them with the supplied bridge or
recompile that bridge from its readable source. Reverse engineering to debug
changes to the LGPL libraries is permitted. No additional restriction is placed
on those rights. Preserve upstream copyright notices and applicable source and
license rights when redistributing; the included license texts govern.

The current unminified JavaScript is distributed directly as
`media/video-q3-input.mjs`, `media/video-q3-pipeline.mjs`,
`media/video-q3-worker.mjs`, and `media/general-player.mjs`. The first three
are the preferred source for this adaptation. Decoder bridge modifications
add decoded metadata/end-drain checks; presentation clocks remain in JavaScript
without the prototype's 32-bit timestamp argument. Runtime and source material
hashes are in the source manifest.

Technical distribution preparation is not codec patent clearance, public
availability proof, long-form quality certification or physical-device
qualification. Q3 is explicitly lossy VP9. Current runtime admission excludes
additional tracks, B frames, VFR, interlace, HDR, rotation and non-square SAR;
original dimensions/cadence are retained inside bounded metadata/packet/heap
limits. Unsupported combinations remain unsupported rather than downscaled.

Primary sources: [FFmpeg legal guidance](https://ffmpeg.org/legal.html),
[FFmpeg decode API](https://ffmpeg.org/doxygen/trunk/group__lavc__encdec.html),
[WebCodecs](https://www.w3.org/TR/webcodecs/).
