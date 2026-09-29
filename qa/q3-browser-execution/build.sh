#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
Q2="$ROOT/../q2-audio-compatibility"
WORK="$Q2/build-investigation/work"
SDK="$WORK/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1"
export EMSDK_QUIET=1
source "$SDK/emsdk_env.sh"
export PATH="$Q2/source-build/bin:$WORK/portable-make/usr/bin:/usr/bin:/bin:$PATH"
export EM_CACHE="$(cygpath -m "$WORK/emscripten-cache")"
NM="$SDK/upstream/bin/llvm-nm.exe"
test -x "$NM" || { echo 'Q3_NM_UNAVAILABLE' >&2; exit 1; }
if [ "${1:-}" = '--preflight' ]; then
 "$NM" --version
 emcc --version
 make --version
 echo 'Q3_BUILD_TOOL_PREFLIGHT_PASS; no configure, compile or link executed'
 exit 0
fi
test "$#" -eq 0 || { echo 'Q3_BUILD_ARGUMENT_INVALID' >&2; exit 1; }
mkdir -p "$ROOT/work" "$ROOT/tmp"
export TMPDIR="$ROOT/tmp" TEMP="$(cygpath -m "$ROOT/tmp")" TMP="$(cygpath -m "$ROOT/tmp")"
if [ ! -f "$ROOT/work/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7/configure" ]; then
 tar -xzf "$Q2/build-investigation/sources/ffmpeg-140fd653aed8cad774f991ba083e2d01e86420c7.tar.gz" -C "$ROOT/work"
fi
cd "$ROOT/work/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7"
if [ ! -f ffbuild/config.mak ]; then
 echo 'Q3_STAGE configure start'
 "$EMSDK_PYTHON" "$SDK/upstream/emscripten/emconfigure.py" "C:/Program Files/Git/bin/bash.exe" ./configure --target-os=none --arch=x86_32 --enable-cross-compile \
 --disable-asm --disable-x86asm --disable-inline-asm --disable-programs --disable-doc \
 --disable-debug --disable-all --disable-everything --disable-autodetect --disable-pthreads \
 --disable-runtime-cpudetect --disable-gpl --disable-nonfree --enable-avcodec \
 --enable-decoder=mpeg4 --cc=emcc --host-cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm="$NM" \
 --extra-cflags='-DNDEBUG -Oz -flto -msimd128' --extra-ldflags='-Oz -flto'
 echo 'Q3_STAGE configure exit=0'
fi
echo 'Q3_STAGE compile start jobs=1'
make -j1 libavcodec/libavcodec.a libavutil/libavutil.a
echo 'Q3_STAGE compile exit=0'
echo 'Q3_STAGE link start'
emcc "$ROOT/bridge.c" libavcodec/libavcodec.a libavutil/libavutil.a -I. \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \
 -s EXPORTED_RUNTIME_METHODS=HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free \
 -msimd128 -flto -Oz -o "$ROOT/codec.mjs"
echo 'Q3_STAGE link exit=0'
cp config.h config_components.h ffbuild/config.mak "$ROOT/"
cp libavcodec/libavcodec.a libavutil/libavutil.a "$ROOT/"
