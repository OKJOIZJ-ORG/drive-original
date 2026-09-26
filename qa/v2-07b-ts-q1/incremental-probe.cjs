'use strict';
// Public synthetic input only. This does not bind a product or a Drive account.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { annexBNals, adtsFrames, compare } = require('./preservation-probe.cjs');
const bundlePath = require.resolve('mux.js/dist/mux-mp4.min.js');
const { Transmuxer } = require(bundlePath);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const LIMIT = 16 * 1024 * 1024;

function command(executable, args, json = false, diagnostics = null) {
  const result = spawnSync(executable, args, { windowsHide: true, timeout: 60000, maxBuffer: LIMIT });
  if (result.error || result.status !== 0) throw new Error('QA_EXTERNAL_COMMAND_FAILED');
  // -v error output means damaged input/output even if FFmpeg concealed it and
  // exited zero. Never compare concealed buffers as preservation evidence.
  if (result.stderr.length) {
    if (!diagnostics) throw new Error('QA_EXTERNAL_COMMAND_DIAGNOSTIC');
    diagnostics.push({ executable,code:'ERROR_LEVEL_MEDIA_DIAGNOSTIC' });
  }
  return json ? JSON.parse(result.stdout.toString('utf8')) : result.stdout;
}

function extract(file, diagnostics = null) {
  const streams = command('ffprobe', ['-v','error','-show_entries',
    'stream=index,codec_name,codec_type,profile,level,width,height,pix_fmt,sample_aspect_ratio,color_range,color_space,color_transfer,color_primaries,sample_rate,channels,channel_layout',
    '-of','json',file], true, diagnostics).streams;
  if (streams.length !== 2 || streams.filter(s => s.codec_type === 'video' && s.codec_name === 'h264').length !== 1
    || streams.filter(s => s.codec_type === 'audio' && s.codec_name === 'aac').length !== 1) throw new Error('QA_EXPECTED_TWO_TRACKS');
  const nals = annexBNals(command('ffmpeg', ['-v','error','-nostdin','-i',file,'-map','0:v:0','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','pipe:1'], false, diagnostics));
  const audio = adtsFrames(command('ffmpeg', ['-v','error','-nostdin','-i',file,'-map','0:a:0','-c:a','copy','-f','adts','pipe:1'], false, diagnostics));
  const packets = command('ffprobe', ['-v','error','-show_packets','-show_entries','packet=stream_index,pts_time,dts_time,duration_time','-of','json',file], true, diagnostics).packets;
  return { streams, nals, audio, packets };
}

function decode(file, diagnostics = null) {
  const frames = command('ffmpeg', ['-v','error','-nostdin','-threads','1','-i',file,'-map','0:v:0','-an',
    '-vf','format=yuv420p','-fps_mode','passthrough','-f','framemd5','pipe:1'], false, diagnostics).toString('utf8')
    .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').slice(-2).map(s => s.trim()));
  const pcm = command('ffmpeg', ['-v','error','-nostdin','-threads','1','-i',file,'-map','0:a:0','-vn','-c:a','pcm_s16le','-f','s16le','pipe:1'], false, diagnostics);
  if (!frames.length || !pcm.length) throw new Error('QA_EMPTY_DECODE');
  return { frames, pcm };
}

function initTracks(bytes) {
  const tracks = [];
  function boxes(start, end, inTrack = null) {
    for (let offset = start; offset < end;) {
      if (offset + 8 > end) throw new Error('QA_INIT_BOX');
      const size = bytes.readUInt32BE(offset); const type = bytes.toString('ascii',offset + 4,offset + 8);
      if (size < 8 || offset + size > end) throw new Error('QA_INIT_BOX');
      if (type === 'moov' || type === 'mdia') boxes(offset + 8,offset + size,inTrack);
      if (type === 'trak') { const track = {}; tracks.push(track); boxes(offset + 8,offset + size,track); }
      if (inTrack && type === 'tkhd') {
        const idOffset = offset + (bytes[offset + 8] === 1 ? 28 : 20);
        if (idOffset + 4 > offset + size || ![0,1].includes(bytes[offset + 8])) throw new Error('QA_INIT_TRACK');
        inTrack.id = bytes.readUInt32BE(idOffset);
      }
      if (inTrack && type === 'hdlr') {
        if (size < 20) throw new Error('QA_INIT_HANDLER');
        inTrack.type = bytes.toString('ascii',offset + 16,offset + 20);
      }
      offset += size;
    }
  }
  boxes(0,bytes.length);
  if (tracks.length !== 2 || new Set(tracks.map(track => track.id)).size !== 2
    || tracks.some(track => !Number.isInteger(track.id) || track.id <= 0)
    || tracks.filter(track => track.type === 'vide').length !== 1
    || tracks.filter(track => track.type === 'soun').length !== 1) throw new Error('QA_INIT_TRACK_IDENTITY');
  return tracks;
}

function transmuxAtCuts(bytes, cuts) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 4 * 1024 * 1024
    || !Array.isArray(cuts) || cuts.some((cut,i) => !Number.isSafeInteger(cut) || cut <= (cuts[i-1] ?? 0) || cut >= bytes.length || cut % 188)) throw new Error('QA_CUTS');
  const muxer = new Transmuxer({ remux: true, keepOriginalTimestamps: true });
  let initial = null; let total = 0; let fragments = 0;
  const chunks = [];
  muxer.on('data', segment => {
    if (segment.type !== 'combined') throw new Error('QA_TRACK_OUTPUT');
    const init = Buffer.from(segment.initSegment); initTracks(init);
    if (initial && !initial.equals(init)) throw new Error('QA_INIT_CHANGE');
    if (!initial) { initial = init; chunks.push(initial); total += initial.length; }
    total += segment.data.byteLength;
    if (total > LIMIT) throw new Error('QA_OUTPUT_LIMIT');
    chunks.push(Buffer.from(segment.data)); fragments++;
  });
  let start = 0;
  for (const end of [...cuts, bytes.length]) {
    // Network chunking is separate from the elementary flush boundary.
    for (let cursor = start; cursor < end; cursor += 188 * 83) muxer.push(bytes.subarray(cursor, Math.min(cursor + 188 * 83, end)));
    muxer.flush(); start = end;
  }
  if (!initial || fragments !== cuts.length + 1) throw new Error('QA_MISSING_FRAGMENT');
  return { bytes: Buffer.concat(chunks), fragments };
}

async function run() {
  const { analyzeGopBoundaries } = await import('./gop-boundaries.mjs');
  const { variant, crossAdts, vfr } = await import('./synthetic-variants.mjs');
  const input = path.join(__dirname,'synthetic-bframes-audiolead.ts');
  const bytes = fs.readFileSync(input);
  if (sha(bytes) !== 'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4') throw new Error('QA_FIXTURE_IDENTITY');
  if (require('mux.js/package.json').version !== '7.1.0'
    || sha(fs.readFileSync(bundlePath)) !== '4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f') throw new Error('QA_LIBRARY_IDENTITY');
  const boundary = analyzeGopBoundaries(bytes);
  const source = extract(input); const sourceDecoded = decode(input);
  const cases = [
    { name:'single-eof-control', cuts:[], expectedPreserved:true },
    { name:'before-verified-idr', cuts:boundary.cuts, expectedPreserved:true },
    { name:'every-30-video-pes-negative', cuts:boundary.frames.filter((_,i) => i > 0 && i % 30 === 0).map(frame => frame.offset), expectedPreserved:false },
    { name:'one-ts-packet-after-idr-negative', cuts:boundary.cuts.map(offset => offset + 188), expectedPreserved:false },
    { name:'fixed-349-packet-negative', cuts:Array.from({length:Math.floor((bytes.length-1)/(188*349))},(_,i)=>(i+1)*188*349), expectedPreserved:false }
  ];
  const repacketized = variant(); const split = crossAdts(); const varying = vfr();
  cases.push({ name:'repacketized-idr-control',input:repacketized.bytes,cuts:repacketized.cuts,expectedPreserved:true },
    { name:'cross-pes-adts-eof-control',input:split.bytes,cuts:[],expectedPreserved:true },
    { name:'cross-pes-adts-idr-negative',input:split.bytes,cuts:split.cuts,expectedPreserved:false },
    { name:'vfr-boundary-duration-negative',input:varying.bytes,cuts:varying.cuts,expectedPreserved:false });
  const out = fs.mkdtempSync(path.join(__dirname,'run-incremental-'));
  const generated = cases.flatMap((_,i) => [path.join(out,`candidate-${i}.mp4`),path.join(out,`source-${i}.ts`)]);
  const observations = [];
  try {
    for (const [i, scenario] of cases.entries()) {
      const candidate = path.join(out,`candidate-${i}.mp4`); const variantPath = path.join(out,`source-${i}.ts`);
      let before = source; let beforeDecoded = sourceDecoded;
      if (scenario.input) { fs.writeFileSync(variantPath,scenario.input,{flag:'wx'}); before = extract(variantPath); beforeDecoded = decode(variantPath); }
      const output = transmuxAtCuts(scenario.input || bytes,scenario.cuts);
      fs.writeFileSync(candidate,output.bytes,{flag:'wx'});
      const mediaDiagnostics = [];
      const after = extract(candidate, mediaDiagnostics);
      const comparison = compare(before,after);
      const decoded = decode(candidate, mediaDiagnostics);
      const decodedVideoEqual = JSON.stringify(beforeDecoded.frames) === JSON.stringify(decoded.frames);
      const decodedPcmEqual = beforeDecoded.pcm.equals(decoded.pcm);
      const videoIndex = after.streams.find(stream => stream.codec_type === 'video').index;
      const packets = after.packets.filter(packet => packet.stream_index === videoIndex);
      // TS duration_time can be nominal for VFR. Independently check the MP4
      // sample duration against the next decode timestamp instead of trusting it.
      const maxVideoDecodeTimelineOverlap = Math.max(0,...packets.slice(0,-1).map((packet,index) =>
        Number(packet.dts_time)+Number(packet.duration_time)-Number(packets[index+1].dts_time)));
      observations.push({ name:scenario.name, expectedPreserved:scenario.expectedPreserved, fragments:output.fragments,
        ...comparison, outputBytes:output.bytes.length,outputSha256:sha(output.bytes),decodedVideoEqual, decodedPcmEqual, maxVideoDecodeTimelineOverlap, mediaDiagnostics,
        preserved:!mediaDiagnostics.length && comparison.preserved && decodedVideoEqual && decodedPcmEqual && maxVideoDecodeTimelineOverlap <= 1/90000+0.000002 });
    }
    const report = { schema:'drive-original.q1-incremental-discriminator/1',recordedAt:new Date().toISOString(),
      library:{name:'mux.js',version:'7.1.0',artifact:'dist/mux-mp4.min.js',sha256:sha(fs.readFileSync(bundlePath))},
      producer:{driverSha256:sha(fs.readFileSync(__filename)),boundarySha256:sha(fs.readFileSync(path.join(__dirname,'gop-boundaries.mjs'))),
        containerProbeSha256:sha(fs.readFileSync(path.join(__dirname,'../v2-07a-container-probe/mpeg-ts-probe.mjs'))),
        comparisonSha256:sha(fs.readFileSync(path.join(__dirname,'preservation-probe.cjs'))),variantSha256:sha(fs.readFileSync(path.join(__dirname,'synthetic-variants.mjs'))),
        lockSha256:sha(fs.readFileSync(path.join(__dirname,'package-lock.json'))),node:process.version},
      fixture:{sha256:sha(bytes),bytes:bytes.length},boundary:{cuts:boundary.cuts,largestWindowBytes:boundary.largestWindowBytes,dtsStep:boundary.dtsStep},
      observations,discriminated:observations.every(row => row.preserved === row.expectedPreserved),
      limitations:['public synthetic only','bounded complete input analyzed before output; not streaming memory proof','CFR/one AU per PES/complete ADTS per PES only',
        'no Drive, priority sample, browser/MSE/MMS, seek or physical device proof','no general VFR/wrap/discontinuity/track changes or cross-PES ADTS support'] };
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify({report:path.relative(__dirname,path.join(out,'results.json')),discriminated:report.discriminated,
      observations:observations.map(row => ({name:row.name,fragments:row.fragments,video:row.videoVcl,aac:row.aac,preserved:row.preserved}))})+'\n');
    if (!report.discriminated) throw new Error('QA_DISCRIMINATION_FAILED');
    return report;
  } finally {
    for (const target of generated) {
      if (path.dirname(target) !== out || path.dirname(out) !== __dirname) throw new Error('QA_UNSAFE_CLEANUP');
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  }
}

module.exports = { initTracks, transmuxAtCuts, decode, run };
if (require.main === module) run().catch(() => { process.stderr.write('Incremental Q1 probe failed; no product success recorded.\n'); process.exitCode = 1; });
