#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"
command -v emcc >/dev/null || { echo 'Activate Emscripten 4.0.15 first.' >&2; exit 1; }
emcc --version | head -n 1
mkdir -p output
OBJECT=relink/bridge.o
if [[ "${1:-}" == '--compile-bridge' ]]; then
  FFMPEG=sources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7
  # Public FFmpeg headers include this generated header, absent from the source archive.
  if [[ ! -f "$FFMPEG/libavutil/avconfig.h" ]]; then cp configuration/avconfig.h "$FFMPEG/libavutil/avconfig.h"; fi
  emcc relink/bridge.c -I"$FFMPEG" -c -msimd128 -flto -Oz -o output/bridge.o
  OBJECT=output/bridge.o
elif [[ $# -ne 0 ]]; then
  echo 'Usage: bash relink.sh [--compile-bridge]' >&2; exit 2
fi
emcc "$OBJECT" relink/libavcodec.a relink/libavutil.a \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \
 -s EXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free \
 --post-js relink/post.js -msimd128 -flto -Oz -o output/codec.mjs
