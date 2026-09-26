'use strict';
// Local-only Q1 discriminator. Never serve or upload private input/derivatives.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const bundlePath = require.resolve('mux.js/dist/mux-mp4.min.js');
const { Transmuxer } = require(bundlePath);
const { preserveUnspecifiedSar } = require('./preserve-sar.cjs');
const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 16 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function command(executable, args, { json = false, maxBuffer = MAX_OUTPUT } = {}) {
  const result = spawnSync(executable, args, { windowsHide: true, timeout: 60_000, maxBuffer });
  if (result.error || result.status !== 0) {
    // FFmpeg diagnostics may include a private path: do not relay stderr.
    throw new Error(`${executable} failed (${result.error?.code || result.status}); inspect locally if needed`);
  }
  return json ? JSON.parse(result.stdout.toString('utf8')) : result.stdout;
}

function annexBNals(bytes) {
  const starts = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) { starts.push([i, i + 3]); i += 2; }
    else if (i + 3 < bytes.length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) { starts.push([i, i + 4]); i += 3; }
  }
  if (!starts.length) throw new Error('No Annex-B NALs');
  return starts.map(([start, payload], index) => {
    let end = starts[index + 1]?.[0] ?? bytes.length;
    // Annex-B trailing_zero_8bits are packaging, not NAL payload.
    while (end > payload && bytes[end - 1] === 0) end--;
    if (end <= payload) throw new Error('Empty NAL');
    const nal = bytes.subarray(payload, end);
    return { type: nal[0] & 31, bytes: nal.length, hash: sha(nal) };
  });
}

function adtsFrames(bytes) {
  const frames = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 7 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf6) !== 0xf0) throw new Error('Malformed ADTS');
    const header = bytes[offset + 1] & 1 ? 7 : 9;
    const length = ((bytes[offset + 3] & 3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
    if (length <= header || offset + length > bytes.length || (bytes[offset + 6] & 3) !== 0) throw new Error('Unsupported/truncated ADTS');
    frames.push(sha(bytes.subarray(offset + header, offset + length)));
    offset += length;
  }
  if (!frames.length) throw new Error('No AAC frames');
  return frames;
}

function extract(file) {
  const metadata = command('ffprobe', ['-v','error','-show_entries',
    'stream=index,codec_name,codec_type,profile,level,width,height,pix_fmt,sample_aspect_ratio,color_range,color_space,color_transfer,color_primaries,sample_rate,channels,channel_layout',
    '-of','json',file], { json: true });
  if (metadata.streams.length !== 2 || metadata.streams.filter(s => s.codec_type === 'video' && s.codec_name === 'h264').length !== 1
    || metadata.streams.filter(s => s.codec_type === 'audio' && s.codec_name === 'aac').length !== 1) throw new Error('Only exactly one H.264 and one AAC stream are in this bounded discriminator');
  const nals = annexBNals(command('ffmpeg', ['-v','error','-nostdin','-i',file,'-map','0:v:0','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','pipe:1']));
  const audio = adtsFrames(command('ffmpeg', ['-v','error','-nostdin','-i',file,'-map','0:a:0','-c:a','copy','-f','adts','pipe:1']));
  const packets = command('ffprobe', ['-v','error','-show_packets','-show_entries','packet=stream_index,pts_time,dts_time,duration_time','-of','json',file], { json: true }).packets;
  return { streams: metadata.streams, nals, audio, packets };
}

function compare(source, output) {
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const byType = (data, types) => data.nals.filter(nal => types.includes(nal.type)).map(nal => nal.hash);
  const parameterSets = data => [...new Set(byType(data,[7,8]))].sort();
  const metadataDifferences = [];
  const timing = [];
  const origin = data => Math.min(...data.packets.map(packet => Number(packet.dts_time)));
  const sourceOrigin = origin(source); const outputOrigin = origin(output);
  for (const kind of ['video','audio']) {
    const before = source.streams.find(stream => stream.codec_type === kind);
    const after = output.streams.find(stream => stream.codec_type === kind);
    for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      if (key !== 'index' && before[key] !== after[key]) metadataDifferences.push({ kind, field: key, source: before[key] ?? null, output: after[key] ?? null });
    }
    const a = source.packets.filter(packet => packet.stream_index === before.index);
    const b = output.packets.filter(packet => packet.stream_index === after.index);
    const tolerance = kind === 'video' ? 1/90000 + 0.000002 : 1/Number(before.sample_rate) + 0.000002;
    let maxDtsDelta = 0; let maxPtsDelta = 0; let maxDurationDelta = 0;
    for (let i = 0; i < Math.min(a.length,b.length); i++) {
      maxDtsDelta = Math.max(maxDtsDelta,Math.abs((Number(a[i].dts_time)-sourceOrigin)-(Number(b[i].dts_time)-outputOrigin)));
      maxPtsDelta = Math.max(maxPtsDelta,Math.abs((Number(a[i].pts_time)-sourceOrigin)-(Number(b[i].pts_time)-outputOrigin)));
      maxDurationDelta = Math.max(maxDurationDelta,Math.abs(Number(a[i].duration_time)-Number(b[i].duration_time)));
    }
    timing.push({ kind, sourcePackets: a.length, outputPackets: b.length, maxDtsDelta, maxPtsDelta, maxDurationDelta,
      preserved: a.length > 0 && a.length === b.length && Number.isFinite(maxDtsDelta) && Number.isFinite(maxPtsDelta)
        && Number.isFinite(maxDurationDelta) && maxDtsDelta <= tolerance && maxPtsDelta <= tolerance && maxDurationDelta <= tolerance });
  }
  const result = {
    videoVcl: { source: byType(source,[1,2,3,4,5]).length, output: byType(output,[1,2,3,4,5]).length, equal: equal(byType(source,[1,2,3,4,5]),byType(output,[1,2,3,4,5])) },
    parameterSetsEqual: equal(parameterSets(source),parameterSets(output)),
    seiEqual: equal(byType(source,[6]),byType(output,[6])),
    aac: { source: source.audio.length, output: output.audio.length, equal: equal(source.audio,output.audio) },
    metadataDifferences, timing
  };
  result.preserved = result.videoVcl.source > 0 && result.videoVcl.equal && result.parameterSetsEqual && result.seiEqual
    && result.aac.equal && !metadataDifferences.length && timing.every(track => track.preserved);
  return result;
}

function transmux(bytes, { keepOriginalTimestamps, omitUnspecifiedSar = false, chunkBytes = 188 * 349 } = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_INPUT
    || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_INPUT) throw new Error('Invalid bounded transmux input');
  const muxer = new Transmuxer({ remux: true, keepOriginalTimestamps });
  const output = []; let total = 0;
  muxer.on('data', segment => {
    if (segment.type !== 'combined') throw new Error('Expected both media tracks');
    const init = omitUnspecifiedSar ? preserveUnspecifiedSar(segment.initSegment) : segment.initSegment;
    for (const part of [init,segment.data]) {
      total += part.byteLength;
      if (total > MAX_OUTPUT) throw new Error('Output limit exceeded');
      output.push(Buffer.from(part));
    }
  });
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) muxer.push(bytes.subarray(offset,offset+chunkBytes));
  // This first discriminator flushes one bounded input at EOF. It does NOT
  // claim arbitrary chunk flushes or seekable incremental product streaming.
  muxer.flush();
  if (!output.length) throw new Error('No transmux output');
  return Buffer.concat(output);
}

function decode(file) {
  // Decode the bounded input once, without container-relative -ss trimming.
  // Packet PTS/DTS are compared independently; ordinal windows must not shift
  // because FFmpeg chooses a different container start/seek rounding rule.
  const frames = command('ffmpeg', ['-v','error','-nostdin','-threads','1','-i',file,
    '-map','0:v:0','-an','-vf','format=yuv420p','-fps_mode','passthrough','-f','framemd5','pipe:1'])
    .toString('utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'))
    .map(line => line.split(',').slice(-2).map(field => field.trim()));
  const pcm = command('ffmpeg', ['-v','error','-nostdin','-threads','1','-i',file,
    '-map','0:a:0','-vn','-c:a','pcm_s16le','-f','s16le','pipe:1']);
  if (!frames.length || !pcm.length) throw new Error('Empty decoded window');
  return { frames, pcm };
}

function run(input, label) {
  if (!['synthetic','priority-prefix'].includes(label)) throw new Error('Expected a redacted fixture label');
  const inputPath = path.resolve(input);
  const root = __dirname;
  const inputStat = fs.statSync(inputPath,{bigint:true});
  if (!inputStat.isFile()) throw new Error('Input must be a regular file');
  const fd = fs.openSync(inputPath,'r');
  const limit = Math.min(Number(inputStat.size),MAX_INPUT);
  const bytes = Buffer.alloc(limit);
  let received = 0;
  try { while (received < limit) { const n = fs.readSync(fd,bytes,received,limit-received,received); if (!n) break; received += n; } }
  finally { fs.closeSync(fd); }
  if (received !== limit) throw new Error('Source changed or short read');
  const out = fs.mkdtempSync(path.join(root,'run-'));
  const prefix = path.join(out,'input.ts');
  const observations = [];
  try {
    fs.writeFileSync(prefix,bytes,{flag:'wx'});
    const source = extract(prefix);
    const sourceDecoded = decode(prefix);
    const configurations = [{keepOriginalTimestamps:false},{keepOriginalTimestamps:true}];
    if (source.streams.find(stream => stream.codec_type==='video').sample_aspect_ratio == null) configurations.push({keepOriginalTimestamps:true,omitUnspecifiedSar:true});
    for (const [configurationIndex,configuration] of configurations.entries()) {
      const derived = path.join(out,`candidate-${configurationIndex}.mp4`);
      const output = transmux(bytes,configuration);
      fs.writeFileSync(derived,output,{flag:'wx'});
      const comparison = compare(source,extract(derived));
      const outputDecoded = decode(derived);
      const decoded = [0.1,0.5,0.9].map(fraction => {
        const frameStart = Math.max(0,Math.floor(sourceDecoded.frames.length*fraction)-15);
        const a = sourceDecoded.frames.slice(frameStart,frameStart+30); const b = outputDecoded.frames.slice(frameStart,frameStart+30);
        const audio = source.streams.find(stream => stream.codec_type === 'audio');
        const alignment = audio.channels * 2;
        const pcmStart = Math.floor(sourceDecoded.pcm.length*fraction/alignment)*alignment;
        const pcmEnd = pcmStart + Number(audio.sample_rate)*alignment;
        const pcmA = sourceDecoded.pcm.subarray(pcmStart,pcmEnd); const pcmB = outputDecoded.pcm.subarray(pcmStart,pcmEnd);
        return { fraction,frameStart,sourceFrames:a.length,outputFrames:b.length,
          frameHashesEqual:JSON.stringify(a)===JSON.stringify(b),
          sourcePcmBytes:pcmA.length,outputPcmBytes:pcmB.length,pcmEqual:pcmA.equals(pcmB) };
      });
      const decodedAllEqual = JSON.stringify(sourceDecoded.frames)===JSON.stringify(outputDecoded.frames) && sourceDecoded.pcm.equals(outputDecoded.pcm);
      observations.push({ ...configuration, outputBytes: output.length, ...comparison, decoded,
        decodedAllEqual,preserved:comparison.preserved && decodedAllEqual && decoded.every(window => window.frameHashesEqual && window.pcmEqual) });
    }
    const after = fs.statSync(inputPath,{bigint:true});
    const statUnchanged = ['dev','ino','size','mtimeNs','ctimeNs'].every(key => inputStat[key] === after[key]);
    if (!statUnchanged) throw new Error('Source identity changed during probe');
    const report = { schema:'drive-original.q1-preservation/1',label,recordedAt:new Date().toISOString(),
      library:{name:'mux.js',version:require('mux.js/package.json').version,artifact:'dist/mux-mp4.min.js',sha256:sha(fs.readFileSync(bundlePath))},
      producer:{driverSha256:sha(fs.readFileSync(__filename)),sarAdapterSha256:sha(fs.readFileSync(path.join(root,'preserve-sar.cjs'))),lockSha256:sha(fs.readFileSync(path.join(root,'package-lock.json'))),node:process.version},
      sourceBytesRead:bytes.length,wholeFileRead:BigInt(bytes.length)===inputStat.size,localStatUnchanged:statUnchanged,
      currentDriveIdentityVerified:false,observations,
      limitations:['bounded EOF flush only','no current Drive identity','no arbitrary flush or indexed seek','no browser/physical-device/color-render proof'] };
    fs.writeFileSync(path.join(out,'results.redacted.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify({report:path.relative(root,path.join(out,'results.redacted.json')),label,observations})+'\n');
    return report;
  } finally {
    // Only the four exact generated media files in this new run directory.
    for (const name of ['input.ts','candidate-0.mp4','candidate-1.mp4','candidate-2.mp4']) {
      const target = path.join(out,name);
      if (target === inputPath || path.dirname(target) !== out) throw new Error('Unsafe derivative cleanup');
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  }
}

module.exports = { annexBNals, adtsFrames, compare, transmux, run };
if (require.main === module) {
  try { run(process.argv[2],process.argv[3]); }
  catch(error) {
    // OS exceptions can embed the private input path; no raw message/stack.
    const code = ['ENOENT','EACCES','EPERM','ENOSPC','ETIMEDOUT','ENOBUFS'].includes(error?.code) ? error.code : 'PROBE_FAILED';
    process.stderr.write(`Q1 probe failed: ${code}\n`); process.exitCode=1;
  }
}
