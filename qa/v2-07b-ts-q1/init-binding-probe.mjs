// Public fixture QA only. FFmpeg generates/checks fixtures; the adapter and
// interval owner themselves use no native dependency or external metadata.
import { readFileSync, writeFileSync, mkdtempSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createGopStream } from './gop-stream.mjs';
import { adaptInitSar } from './init-sar.mjs';
import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const require = createRequire(import.meta.url);
const bundlePath = require.resolve('mux.js/dist/mux-mp4.min.js');
const { Transmuxer } = require(bundlePath);
const { extract, decode, initTracks } = require('./incremental-probe.cjs');
const { compare } = require('./preservation-probe.cjs');
const root = fileURLToPath(new URL('.', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const demand = condition => { if (!condition) throw new Error('INIT_BINDING_PROBE_FAILED'); };

function toolVersion(name) {
  const result = spawnSync(name,['-version'],{windowsHide:true,timeout:10000,maxBuffer:65536});
  demand(!result.error && result.status === 0);
  const match = result.stdout.toString('utf8').match(/^\w+ version ([A-Za-z0-9.+-]+)/);
  demand(match);
  return match[1];
}

const generatorArgs = ['-v','error','-hide_banner','-nostdin','-n',
  '-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=12',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=12',
  '-map','0:v:0','-map','1:a:0','-vf','setpts=PTS+0.25/TB,setsar=0',
  '-c:v','libx264','-threads:v','1','-preset','veryfast','-profile:v','high','-level:v','3.0',
  '-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2',
  '-x264-params','aud=1:repeat-headers=1','-c:a','aac','-b:a','96k','-ar','48000','-ac','2',
  '-f','mpegts'];

function packageIntervals(bytes, chunkBytes) {
  const mux = new Transmuxer({ remux:true, keepOriginalTimestamps:true });
  let config = null, rawInit = null, adaptedInit = null, sourceSupplied = 0, firstEmission = null;
  const raw = [], adapted = [], actions = [];
  let outputBytes = 0;
  mux.on('data', segment => {
    demand(config && segment.type === 'combined');
    const incoming = Buffer.from(segment.initSegment);
    initTracks(incoming);
    const result = adaptInitSar(segment.initSegment, config);
    const next = Buffer.from(result.initSegment);
    if (rawInit) demand(rawInit.equals(incoming) && adaptedInit.equals(next));
    else { rawInit = incoming; adaptedInit = next; raw.push(incoming); adapted.push(next); }
    actions.push(result.action);
    outputBytes += segment.data.byteLength;
    demand(outputBytes <= 16*1024*1024);
    raw.push(Buffer.from(segment.data)); adapted.push(Buffer.from(segment.data));
  });
  const owner = createGopStream({ onInterval:item => {
    if (firstEmission === null) firstEmission = sourceSupplied;
    if (!config) {
      demand(item.configuration);
      config = { videoTrackId:item.configuration.videoTrackId,
        sps:item.configuration.sps.slice(), pps:item.configuration.pps.slice() };
    } else demand(item.configuration === null);
    mux.push(item.bytes); mux.flush();
  }});
  for (let start=0; start<bytes.length; start+=chunkBytes) {
    sourceSupplied = Math.min(start+chunkBytes,bytes.length);
    owner.push(bytes.subarray(start,sourceSupplied));
  }
  owner.finish({sourceSize:bytes.length});
  demand(actions.length > 1 && firstEmission < bytes.length && owner.stats().state === 'finished');
  const rawOutput = Buffer.concat(raw), output = Buffer.concat(adapted);
  const changedOffsets = [];
  demand(rawOutput.length === output.length);
  for (let index=0; index<output.length; index++) if (output[index] !== rawOutput[index]) changedOffsets.push(index);
  demand(changedOffsets.every(offset => offset < rawInit.length));
  return { raw:rawOutput, output, actions, changedOffsets, firstEmission, stats:owner.stats(),
    aspectRatio:parseH264Sps(config.sps).aspectRatio };
}

function run() {
  const pinned = readFileSync(path.join(root,'synthetic-bframes-audiolead.ts'));
  demand(sha(pinned) === 'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
  demand(require('mux.js/package.json').version === '7.1.0'
    && sha(readFileSync(bundlePath)) === '4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
  const directory = mkdtempSync(path.join(root,'run-init-binding-'));
  const generatedSource = path.join(directory,'unspecified.ts');
  const rawFile = path.join(directory,'raw.mp4'), adaptedFile = path.join(directory,'adapted.mp4');
  const generated = [generatedSource,rawFile,adaptedFile];
  const observations = [];
  try {
    const generation = spawnSync('ffmpeg',[...generatorArgs,generatedSource],
      {windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    demand(!generation.error && generation.status === 0 && !generation.stderr.length);
    const unspecified = readFileSync(generatedSource);
    demand(unspecified.length < 4*1024*1024);
    for (const scenario of [
      {name:'explicit-square',bytes:pinned,file:path.join(root,'synthetic-bframes-audiolead.ts'),remove:false},
      {name:'unspecified-generated',bytes:unspecified,file:generatedSource,remove:true}
    ]) {
      // Helpers throw on any error-level decoder diagnostic, even exit zero.
      const source = extract(scenario.file), sourceDecoded = decode(scenario.file);
      for (const chunkBytes of [4093,65536]) {
        const packaged = packageIntervals(scenario.bytes,chunkBytes);
        demand(packaged.aspectRatio.status === (scenario.remove ? 'unspecified' : 'explicit'));
        demand(packaged.actions.every(action => action === (scenario.remove ? 'removed-introduced-square' : 'unchanged')));
        demand(packaged.changedOffsets.length === (scenario.remove ? 4 : 0));
        writeFileSync(rawFile,packaged.raw); writeFileSync(adaptedFile,packaged.output);
        const before = compare(source,extract(rawFile)), after = compare(source,extract(adaptedFile));
        const decoded = decode(adaptedFile);
        const decodedVideoEqual = JSON.stringify(sourceDecoded.frames) === JSON.stringify(decoded.frames);
        const decodedPcmEqual = sourceDecoded.pcm.equals(decoded.pcm);
        demand(before.preserved === !scenario.remove && after.preserved && decodedVideoEqual && decodedPcmEqual);
        if (scenario.remove) demand(before.metadataDifferences.length === 1
          && before.metadataDifferences[0].field === 'sample_aspect_ratio'
          && before.videoVcl.equal && before.aac.equal && before.parameterSetsEqual && before.seiEqual
          && before.timing.every(track => track.preserved));
        observations.push({name:scenario.name,chunkBytes,sourceBytes:scenario.bytes.length,sourceSha256:sha(scenario.bytes),
          sourceAspectRatio:packaged.aspectRatio,firstEmissionInputBytes:packaged.firstEmission,fragments:packaged.actions.length,
          action:packaged.actions[0],changedInitBytes:packaged.changedOffsets.length,rawComparison:before,adaptedComparison:after,
          decodedVideoEqual,decodedPcmEqual,outputBytes:packaged.output.length,outputSha256:sha(packaged.output),
          ownerStats:packaged.stats,preserved:true});
      }
    }
    const sources = {};
    for (const name of ['init-binding-probe.mjs','init-sar.mjs','gop-stream.mjs','elementary-stream.mjs','psi-stream.mjs',
      'gop-boundaries.mjs','../v2-07a-container-probe/mpeg-ts-probe.mjs','incremental-probe.cjs','preservation-probe.cjs','package-lock.json']) {
      sources[name] = sha(readFileSync(path.join(root,name)));
    }
    const report = {schema:'drive-original.q1-init-binding/1',recordedAt:new Date().toISOString(),
      library:{name:'mux.js',version:'7.1.0',artifact:'dist/mux-mp4.min.js',sha256:sha(readFileSync(bundlePath))},
      producer:{sources,node:process.version,ffmpeg:toolVersion('ffmpeg'),ffprobe:toolVersion('ffprobe')},publicFixtureGeneration:generatorArgs,observations,
      limitations:['QA-only public synthetic media; no product adoption or deployment',
        'runtime metadata source is copied SPS/PPS and PSI video ID, not FFprobe; native tools are independent QA oracles',
        'initial absent/IDC0 or explicit-square eligibility only; non-square/reserved/zero Extended remain open geometry work',
        'not a full MP4 conformance, audio-init, SEI/rotation/HDR or actual browser-color acceptance proof',
        'no authenticated Drive, priority strict decode, worker/MSE/MMS, duration/seek, physical device or total pipeline memory proof']};
    writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),
      observations:observations.map(({name,chunkBytes,action,preserved}) => ({name,chunkBytes,action,preserved}))})+'\n');
  } finally {
    for (const target of generated) {
      if (path.dirname(target) !== directory || path.dirname(directory) !== path.resolve(root)) throw new Error('QA_UNSAFE_CLEANUP');
      if (existsSync(target)) unlinkSync(target);
    }
  }
}

try { run(); } catch { process.stderr.write('Init binding probe failed; no product success recorded.\n'); process.exitCode=1; }
