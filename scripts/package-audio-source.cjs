'use strict';
// Curated corresponding-source publication. No SDK/cache, fixture or account data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'licenses');
const qa = path.join(root, 'qa/q2-audio-source-publication');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const record = JSON.parse(fs.readFileSync(path.join(root, 'media/audio-codec-build.json')));
const pins = new Map([...record.preferredSource, ...record.artifacts].map(x => [x.path, x.sha256]));
const entries = [];
function add(src, dest) {
  const data = fs.readFileSync(path.join(root, src));
  if (pins.has(src) && sha(data) !== pins.get(src)) throw Error('SOURCE_HASH:' + src);
  entries.push({src, dest, data});
}
const base = 'qa/q2-audio-compatibility/';
for (const name of [
  'ffmpeg-140fd653aed8cad774f991ba083e2d01e86420c7.tar.gz',
  'emscripten-09f52557f0d48b65b8c724853ed8f4e8bf80e669.tar.gz',
  'emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1.tar.gz',
]) add(base + 'build-investigation/sources/' + name, 'archives/' + name);
add(base + 'vendor/ac3-1.60.0.tgz', 'archives/ac3-1.60.0.tgz');
for (const name of ['bridge.c', 'bridge.o', 'post.js']) add(base + 'eac3-source-build/' + name, 'relink/' + name);
for (const name of ['libavcodec.a', 'libavutil.a']) add(base + 'source-build/' + name, 'relink/' + name);
for (const name of ['config.h', 'config_components.h', 'config.mak']) add(base + 'source-build/' + name, 'configuration/' + name);
for (const name of ['avconfig.h', 'ffversion.h']) add(base + 'build-investigation/work/FFmpeg-140fd653aed8cad774f991ba083e2d01e86420c7/libavutil/' + name, 'configuration/' + name);
for (const name of ['configure.sh', 'build.sh', 'bootstrap.py']) add(base + 'source-build/' + name, 'original-recipes/ac3-' + name);
add(base + 'eac3-source-build/build.sh', 'original-recipes/eac3-build.sh');
add(base + 'eac3-source-build/decoder.mjs', 'modified-source/qa-decoder.mjs');
for (const name of ['audio-codec.mjs', 'audio-codec.wasm', 'audio-codec.LICENSE.txt', 'audio-codec-build.json',
  'audio-runtime.mjs', 'audio-adapter.mjs', 'audio-worker.mjs', 'audio-worker-client.mjs']) add('media/' + name, 'product-source/' + name);
add('scripts/build-audio-compat.cjs', 'original-recipes/build-audio-compat.cjs');
for (const name of ['compiler-rt-LICENSE.txt', 'Emscripten-LICENSE.txt', 'FFmpeg-LGPL-2.1.txt', 'MPL-2.0.txt', 'musl-COPYRIGHT.txt'])
  add(base + 'eac3-source-build/notices/' + name, 'notices/' + name);
for (const name of ['README.md', 'relink.sh', 'configure.sh', 'build.sh', 'verify.cjs']) add('qa/q2-audio-source-publication/package-files/' + name, name);
add('scripts/package-audio-source.cjs', 'original-recipes/package-audio-source.cjs');
add('licenses/audio-source-NOTICE.md', 'NOTICE.md');
// This release manifest is upstream source metadata, not local SDK configuration.
add(base + 'build-investigation/work/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1/emsdk_manifest.json', 'toolchain/emsdk_manifest.json');
add(base + 'build-investigation/work/emsdk-389a68bc35dcff7ebae4614e1615099dafda00d1/emscripten-releases-tags.json', 'toolchain/emscripten-releases-tags.json');
const toolchain = {emsdkCommit:'389a68bc35dcff7ebae4614e1615099dafda00d1',emscriptenCommit:record.emscriptenCommit,
  version:'4.0.15',officialBundleRevision:'b412b6307e541b93dd93f01b61181e15c17302ec',
  note:'Compiler binaries/cache are not distributed. Full Emscripten/emsdk source archives and upstream release manifest are supplied. Existing-toolchain verification is separate QA evidence.'};
entries.push({src:null,dest:'toolchain/pin.json',data:Buffer.from(JSON.stringify(toolchain,null,2)+'\n')});
entries.sort((a,b) => a.dest.localeCompare(b.dest,'en'));
const inventory = entries.map(x => ({path:x.dest, bytes:x.data.length, sha256:sha(x.data)}));
entries.push({src:null,dest:'inventory.json',data:Buffer.from(JSON.stringify({format:1,files:inventory},null,2)+'\n')});
// USTAR with fixed ownership/mode/mtime and a single top-level directory.
function tarEntry(e) {
  const name='audio-source/'+e.dest;
  if (Buffer.byteLength(name)>100 || name.includes('..') || name.includes('\\')) throw Error('TAR_PATH:'+name);
  const h=Buffer.alloc(512);h.write(name,0,100,'utf8');
  const oct=(offset,len,value)=>h.write(value.toString(8).padStart(len-1,'0')+'\0',offset,len,'ascii');
  oct(100,8,e.dest.endsWith('.sh')?0o755:0o644);oct(108,8,0);oct(116,8,0);oct(124,12,e.data.length);oct(136,12,0);
  h.fill(32,148,156);h[156]=48;h.write('ustar\0',257,6);h.write('00',263,2);
  const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8);
  return [h,e.data,Buffer.alloc((512-e.data.length%512)%512)];
}
const tar=Buffer.concat([...entries.flatMap(tarEntry),Buffer.alloc(1024)]);
const archive=zlib.gzipSync(tar,{level:9,mtime:0});
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(qa,{recursive:true});
const parts=[];const limit=8*1024*1024;
for(let offset=0,i=1;offset<archive.length;offset+=limit,i++) {
  const data=archive.subarray(offset,Math.min(archive.length,offset+limit));
  const name='audio-source-v1.tar.gz.part'+String(i).padStart(3,'0');
  fs.writeFileSync(path.join(out,name),data);parts.push({path:name,bytes:data.length,sha256:sha(data)});
}
const manifest={format:1,archive:'audio-source-v1.tar.gz',bytes:archive.length,sha256:sha(archive),partLimitBytes:limit,
  targetWasm:{bytes:502740,sha256:'48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf'},
  compression:'deterministic gzip of fixed-metadata USTAR; nested official archives retain exact bytes',parts,files:inventory};
fs.writeFileSync(path.join(out,'audio-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(qa,'curated-inputs.json'),JSON.stringify(entries.filter(e=>e.src).map(e=>({source:e.src,archivePath:e.dest,bytes:e.data.length,sha256:sha(e.data)})),null,2)+'\n');
console.log(JSON.stringify({bytes:archive.length,sha256:sha(archive),parts:parts.length,files:inventory.length}));
