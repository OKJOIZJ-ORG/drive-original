#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "$0")/../.."
export EMSDK_QUIET=1
source qa/q2-audio-compatibility/build-investigation/work/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1/emsdk_env.sh
export EM_CACHE="$(cygpath -m "$PWD/qa/q2-audio-compatibility/build-investigation/work/emscripten-cache")"
bash qa/q3-product-integration/relink-check/video-q3-source/relink.sh