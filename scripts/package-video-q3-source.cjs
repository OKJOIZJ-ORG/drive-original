'use strict';
// Exact source/relink material, using the already-published shared source archives.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),out=path.join(root,'licenses'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const entries=[];const add=(src,dest)=>entries.push({dest,data:fs.readFileSync(path.join(root,src))});
for(const name of ['libavcodec.a','libavutil.a'])add('qa/q3-browser-execution/'+name,'relink/'+name);
for(const name of ['config.h','config_components.h','config.mak'])add('qa/q3-browser-execution/'+name,'configuration/'+name);
for(const name of ['avconfig.h','ffversion.h'])add('qa/q3-browser-execution/work/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7/libavutil/'+name,'configuration/'+name);
for(const name of ['compiler-rt-LICENSE.txt','Emscripten-LICENSE.txt','FFmpeg-LGPL-2.1.txt','musl-COPYRIGHT.txt'])add('qa/q2-audio-compatibility/eac3-source-build/notices/'+name,'notices/'+name);
add('media/video-q3-bridge.c','relink/bridge.c');
for(const name of ['video-q3-codec.mjs','video-q3-codec.wasm','video-q3-input.mjs','video-q3-pipeline.mjs','video-q3-worker.mjs'])add('media/'+name,'product-source/'+name);
add('qa/q3-browser-execution/build.sh','original-build.sh');add('scripts/link-video-q3.cjs','local-relink.cjs');add('licenses/video-q3-source-NOTICE.md','NOTICE.md');
const shared=JSON.parse(fs.readFileSync(path.join(out,'audio-source-manifest.json')));
const dependency={manifest:'../audio-source-manifest.json',archiveSha256:shared.sha256,files:shared.files.filter(x=>x.path.startsWith('archives/')&&!x.path.includes('ac3-'))};
entries.push({dest:'shared-source.json',data:Buffer.from(JSON.stringify(dependency,null,2)+'\n')});
const relink=`#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ROOT"
command -v emcc >/dev/null || { echo 'Activate compatible Emscripten 4.0.15 first.' >&2; exit 1; }
test -f sources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7/libavcodec/avcodec.h || { echo 'Extract the shared FFmpeg archive into sources/ first.' >&2; exit 1; }
mkdir -p output
cp configuration/avconfig.h configuration/ffversion.h sources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7/libavutil/
emcc relink/bridge.c relink/libavcodec.a relink/libavutil.a -Isources/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7 \\
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=67108864 \\
 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s MALLOC=emmalloc -s SUPPORT_LONGJMP=0 \\
 -s EXPORTED_RUNTIME_METHODS=HEAPU8 -s EXPORTED_FUNCTIONS=_malloc,_free -msimd128 -flto -Oz -o output/video-q3-codec.mjs
`;
entries.push({dest:'relink.sh',data:Buffer.from(relink)});
const readme=`# Q3 decoder corresponding source

Unpack the adjacent seven-part audio-source-v1 package as its notice directs.
The complete official source archives under audio-source/archives/ are shared,
unchanged dependencies listed with exact hashes in shared-source.json. Preserve
those archives and this package together when redistributing the decoder.

Extract the listed FFmpeg archive into this directory's sources/ folder. Activate
a compatible Emscripten 4.0.15 compiler, then run bash relink.sh. This recompiles
the modifiable MIT bridge and relinks supplied LGPL libraries. The resulting
output/video-q3-codec.wasm can replace the decoder for debugging modifications.
No compiler is installed by that recipe. A same-toolchain match is checked
separately; compiler/cache executables are not bundled.

For modified FFmpeg libraries, reconstruct their configuration from the supplied
configuration/config.mak and original-build.sh flags in an isolated source tree,
then compile libavcodec.a and libavutil.a and rerun relink.sh. The original build
script's workstation SDK paths are historical; use your activated toolchain.
Complete upstream copyrights/licenses remain in the shared FFmpeg archive.
Read NOTICE.md and notices/ for modification, debugging and redistribution rights.

The readable product-source files contain this package's snapshot; current
distributed unminified JavaScript remains the preferred adaptation source.
The bridge checks decoded progressive/I420/SAR1:1/BT709 limited metadata and
verifies no delayed frame remains at EOF; source-clock timestamps remain in JS.
This package excludes media fixtures, accounts, compiler cache and SDK binaries.
`;
entries.push({dest:'README.md',data:Buffer.from(readme)});
entries.sort((a,b)=>a.dest.localeCompare(b.dest,'en'));
const inventory=entries.map(x=>({path:x.dest,bytes:x.data.length,sha256:sha(x.data)}));
function tarEntry(e){const name='video-q3-source/'+e.dest;if(Buffer.byteLength(name)>100||name.includes('..'))throw Error('Q3_SOURCE_PATH');const h=Buffer.alloc(512);h.write(name,0,100);const oct=(p,n,v)=>h.write(v.toString(8).padStart(n-1,'0')+'\0',p,n);oct(100,8,e.dest.endsWith('.sh')?0o755:0o644);oct(108,8,0);oct(116,8,0);oct(124,12,e.data.length);oct(136,12,0);h.fill(32,148,156);h[156]=48;h.write('ustar\0',257,6);h.write('00',263,2);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148,8);return[h,e.data,Buffer.alloc((512-e.data.length%512)%512)];}
const archive=zlib.gzipSync(Buffer.concat([...entries.flatMap(tarEntry),Buffer.alloc(1024)]),{level:9,mtime:0});
fs.writeFileSync(path.join(out,'video-q3-source.tgz'),archive);
const target=fs.readFileSync(path.join(root,'media/video-q3-codec.wasm'));
fs.writeFileSync(path.join(out,'video-q3-source-manifest.json'),JSON.stringify({format:1,archive:'video-q3-source.tgz',bytes:archive.length,sha256:sha(archive),targetWasm:{bytes:target.length,sha256:sha(target)},sharedSource:dependency,files:inventory},null,2)+'\n');
const notice=fs.readFileSync(path.join(root,'qa/q2-audio-compatibility/eac3-source-build/notices/FFmpeg-LGPL-2.1.txt'),'utf8');
const others=['Emscripten-LICENSE.txt','musl-COPYRIGHT.txt','compiler-rt-LICENSE.txt'].map(n=>fs.readFileSync(path.join(root,'qa/q2-audio-compatibility/eac3-source-build/notices',n),'utf8'));
const mit=`Q3 bridge/adaptation: Copyright (c) 2026 Drive Original contributors.\nMIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`;
fs.writeFileSync(path.join(root,'media/video-q3-codec.LICENSE.txt'),mit+'\nFFmpeg n8.0: Copyright FFmpeg contributors; LGPL-2.1-or-later. Complete authorship is retained in the shared source archive. GPL and nonfree are disabled. See licenses/video-q3-source-NOTICE.md.\n\n'+notice+'\n\n'+others.join('\n\n'));
console.log(JSON.stringify({files:inventory.length,bytes:archive.length,wasmSha256:sha(target)}));
