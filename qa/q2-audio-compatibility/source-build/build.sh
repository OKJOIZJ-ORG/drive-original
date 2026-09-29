#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK="$ROOT/build-investigation/work"
SDK="$WORK/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1"
export EMSDK_QUIET=1
source "$SDK/emsdk_env.sh"
export PATH="$ROOT/source-build/bin:$WORK/portable-make/usr/bin:/usr/bin:/bin:$PATH"
export EM_CACHE="$(cygpath -m "$WORK/emscripten-cache")"
mkdir -p "$WORK/tmp"
export TMPDIR="$WORK/tmp" TEMP="$(cygpath -m "$WORK/tmp")" TMP="$(cygpath -m "$WORK/tmp")"
cd "$WORK/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7"
make -j2 libavcodec/libavcodec.a libavutil/libavutil.a
emcc "$ROOT/build-investigation/decoder-only-bridge.c" libavcodec/libavcodec.a libavutil/libavutil.a -I. \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \
 -s EXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free \
 --post-js "$ROOT/source-build/post.js" -msimd128 -flto -Oz \
 -o "$ROOT/source-build/ac3-source-build.mjs"
cp config.h config_components.h ffbuild/config.mak ffbuild/config.log "$ROOT/source-build/"
cp libavcodec/libavcodec.a libavutil/libavutil.a "$ROOT/source-build/"
emcc --version > "$ROOT/source-build/toolchain-version.txt"
