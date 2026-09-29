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
emcc --version
make --version
"$EMSDK_PYTHON" "$SDK/upstream/emscripten/emconfigure.py" "C:/Program Files/Git/bin/bash.exe" ./configure --target-os=none --arch=x86_32 --enable-cross-compile \
 --disable-asm --disable-x86asm --disable-inline-asm --disable-programs --disable-doc \
 --disable-debug --disable-all --disable-everything --disable-autodetect --disable-pthreads \
 --disable-runtime-cpudetect --disable-gpl --disable-nonfree --enable-avcodec \
 --enable-decoder=ac3 --enable-decoder=eac3 --cc=emcc --host-cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
 --extra-cflags='-DNDEBUG -Oz -flto -msimd128' --extra-ldflags='-Oz -flto'
