#!/usr/bin/env bash
set -euo pipefail
OUT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$OUT/.." && pwd -P)"
WORK="$ROOT/build-investigation/work"
SDK="$WORK/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1"
export EMSDK_QUIET=1
source "$SDK/emsdk_env.sh"
export EM_CACHE="$(cygpath -m "$WORK/emscripten-cache")"
mkdir -p "$OUT/tmp"
export TMPDIR="$OUT/tmp" TEMP="$(cygpath -m "$OUT/tmp")" TMP="$(cygpath -m "$OUT/tmp")"
cd "$OUT"
emcc bridge.c -I"$WORK/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7" -c -msimd128 -flto -Oz -o bridge.o
emcc bridge.o "$ROOT/source-build/libavcodec.a" "$ROOT/source-build/libavutil.a" \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \
 -s EXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free \
 --post-js post.js -msimd128 -flto -Oz -o codec.mjs
