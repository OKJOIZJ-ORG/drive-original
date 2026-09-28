# Audio codec corresponding source and relinking

This directory is the extracted corresponding-source package for Drive Original's source-built AC3/EAC3 audio codec. `inventory.json` binds every supplied material except itself. Run `node verify.cjs` immediately after extraction. All official source archive bytes are retained exactly; the package contains no media fixture, browser/account record, installed SDK binary or cache.

## Relink using supplied objects and libraries

Prerequisites: Bash, Node, and Emscripten 4.0.15 (source commit `09f52557f0d48b65b8c724853ed8f4e8bf80e669`) with its compatible LLVM/Binaryen/system libraries. Use an existing installed compiler or inspect the complete `archives/emsdk-*.tar.gz` and `toolchain/emsdk_manifest.json` to acquire the pinned official toolchain. Installing that compiler is an explicit separate build step and requires a substantial download. `toolchain/pin.json` records the official bundle revision. Full preferred-source Emscripten and emsdk archives are supplied, including documentation/tests omitted by a normal binary tool installation.

From the extracted `audio-source` directory, activate that SDK in the shell with its `emsdk_env.sh`, then run:

```bash
bash relink.sh
node verify.cjs output/codec.wasm
```

`relink.sh` uses only relative package paths and the compiler already on PATH. It passes the supplied `relink/bridge.o`, `libavcodec.a`, `libavutil.a` and `post.js` to emcc and writes `output/codec.mjs` and `output/codec.wasm`. The original WASM target is 502,740 bytes with SHA-256 `48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf`. Same verified Windows compiler relinking was tested for this publication package. Other hosts or compiler bundles may produce different bytes and require their own behavior verification. Modified sources/libraries naturally change the hash; that expected mismatch is not a prohibition on modification.

For deployment naming, replace the two `codec.wasm` strings in `output/codec.mjs` with `audio-codec.wasm`; rename the output files accordingly. `product-source/audio-codec.mjs` and `.wasm` are the exact reference product artifacts. The original packaging recipe is supplied under `original-recipes/`; its historical QA workspace paths are provenance, while the scripts at this directory's root are portable recipes.

## Modify or rebuild

Extract the complete FFmpeg archive into `sources/` (the archive contains its pinned top-level directory), for example:

```bash
mkdir -p sources
tar -xzf archives/ffmpeg-140fd653aed8cad774f991ba083e2d01e86420c7.tar.gz -C sources
bash configure.sh
bash build.sh
```

The active SDK and GNU Make are prerequisites. These scripts retain the actual configuration: only required avcodec/avutil AC3/EAC3 decode components, no programs/encoders/protocols, no GPL/nonfree/autodetection/threading/assembly. `configuration/` retains the original generated `config.h`, `config_components.h`, `config.mak`, `avconfig.h` and `ffversion.h`. Newly configured outputs live in `sources/FFmpeg-<commit>`; originals are left untouched. `build.sh` recompiles libraries, then recompiles the modifiable `relink/bridge.c` and links them. To modify only the bridge while reusing supplied libraries, run `bash relink.sh --compile-bridge` after extracting FFmpeg source. This mode supplies the original generated public `avconfig.h` if it is absent. Rebuilt bridge object is written to `output/bridge.o`, preserving the supplied reference object.

The original generated `ffversion.h` contains `v1.20.0-130-g7f3ef0f`: FFmpeg's version script found the enclosing application's Git description during the recorded build. This string is retained as exact build evidence; the complete official FFmpeg source is pinned independently to n8.0 commit `140fd653aed8cad774f991ba083e2d01e86420c7`. A new full library build in another directory may change this generated version string. Exact byte reproduction here is demonstrated for relinking the supplied static libraries and for recompiling the bridge, not for a new complete cross-host library build.

The modified decoder wrapper and exact product runtime/adapter/worker source are supplied under `modified-source/` and `product-source/`. They are source-form materials; the historical QA wrapper imports its original QA core path. The owning application's separately distributed Mediabunny core and application pipeline are not required to relink the WASM, and this package does not include an incomplete/new application pipeline. `archives/ac3-1.60.0.tgz` preserves upstream bridge/wrapper source and notices for comparison. See `NOTICE.md` and `notices/` for source, modification, license and relink rights. Do not interpret this package as codec patent clearance or device playback qualification.
