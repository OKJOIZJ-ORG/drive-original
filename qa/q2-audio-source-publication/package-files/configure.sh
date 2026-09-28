#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT/sources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7"
emconfigure bash ./configure --target-os=none --arch=x86_32 --enable-cross-compile \
 --disable-asm --disable-x86asm --disable-inline-asm --disable-programs --disable-doc \
 --disable-debug --disable-all --disable-everything --disable-autodetect --disable-pthreads \
 --disable-runtime-cpudetect --disable-gpl --disable-nonfree --enable-avcodec \
 --enable-decoder=ac3 --enable-decoder=eac3 --cc=emcc --host-cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
 --extra-cflags='-DNDEBUG -Oz -flto -msimd128' --extra-ldflags='-Oz -flto'
