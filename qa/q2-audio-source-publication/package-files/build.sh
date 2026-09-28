#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
FFMPEG="$ROOT/sources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7"
cd "$FFMPEG"
make -j2 libavcodec/libavcodec.a libavutil/libavutil.a
cd "$ROOT"
# Retain the shipped reference libraries and use freshly built libraries instead.
mkdir -p output
emcc relink/bridge.c -I"$FFMPEG" -c -msimd128 -flto -Oz -o output/bridge.o
emcc output/bridge.o "$FFMPEG/libavcodec/libavcodec.a" "$FFMPEG/libavutil/libavutil.a" \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \
 -s EXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free \
 --post-js relink/post.js -msimd128 -flto -Oz -o output/codec.mjs
