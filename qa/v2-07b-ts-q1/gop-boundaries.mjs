// QA-only bounded eligibility gate, not a streaming parser or product format verdict.
import { probeMpegTs } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const MAX_BYTES = 4 * 1024 * 1024;
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };
const equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const join = parts => {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};

// Shared bounded elementary readers. They establish syntax/framing, not decode
// validity. Runtime window ownership still needs independent media acceptance.
export { pes as readPes, nals as readAnnexBNals };

function timestamp(bytes, offset, prefix) {
  requireThat(offset + 5 <= bytes.length && bytes[offset] >> 4 === prefix
    && (bytes[offset] & bytes[offset + 2] & bytes[offset + 4] & 1) === 1, 'PES_TIMESTAMP');
  return (bytes[offset] & 14) * 536870912 + bytes[offset + 1] * 4194304
    + (bytes[offset + 2] & 254) * 16384 + bytes[offset + 3] * 128 + (bytes[offset + 4] >> 1);
}

function pes(record, kind) {
  const bytes = join(record.parts);
  requireThat(bytes.length >= 14 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1
    && (kind === 'video' ? (bytes[3] & 240) === 224 : (bytes[3] & 224) === 192), 'PES_HEADER');
  const declared = bytes[4] * 256 + bytes[5];
  requireThat((declared > 0 && declared + 6 === bytes.length) || (kind === 'video' && declared === 0), 'PES_LENGTH');
  requireThat((bytes[6] & 0xc0) === 0x80 && (bytes[6] & 0x30) === 0, 'PES_ENCRYPTED');
  const flags = bytes[7] >> 6;
  requireThat((flags === 2 || flags === 3) && bytes[8] >= (flags === 3 ? 10 : 5)
    && 9 + bytes[8] < bytes.length, 'PES_TIMING_HEADER');
  const pts = timestamp(bytes, 9, flags);
  const dts = flags === 3 ? timestamp(bytes, 14, 1) : pts;
  return { offset: record.offset, end: record.end, pts, dts, payload: bytes.subarray(9 + bytes[8]) };
}

function nals(bytes) {
  const starts = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) { starts.push([i, i + 3]); i += 2; }
    else if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) { starts.push([i, i + 4]); i += 3; }
  }
  requireThat(starts.length && starts[0][0] === 0, 'ANNEX_B_START');
  return starts.map((start, i) => {
    let end = starts[i + 1]?.[0] ?? bytes.length;
    while (end > start[1] && bytes[end - 1] === 0) end--;
    requireThat(end > start[1] && !(bytes[start[1]] & 128), 'NAL_HEADER');
    return bytes.subarray(start[1], end);
  });
}

function videoFrames(records) {
  let sps = null; let pps = null;
  const frames = records.map(record => {
    const parsed = pes(record, 'video');
    const units = nals(parsed.payload);
    const types = units.map(unit => unit[0] & 31);
    requireThat(types[0] === 9 && types.filter(type => type === 9).length === 1, 'ONE_AU_PER_PES');
    requireThat(types.every(type => [1, 5, 6, 7, 8, 9].includes(type)), 'NAL_TYPE_UNPROVEN');
    const vcl = types.filter(type => type === 1 || type === 5);
    requireThat(vcl.length && vcl.every(type => type === vcl[0]), 'MIXED_OR_ABSENT_PICTURE');
    const idr = vcl[0] === 5;
    for (const [type, prior] of [[7, sps], [8, pps]]) {
      const found = units.filter(unit => (unit[0] & 31) === type);
      requireThat(found.length <= 1 && (!idr || found.length === 1), 'PARAMETER_SET_REQUIRED');
      if (found.length) {
        requireThat(!prior || equal(prior, found[0]), 'PARAMETER_SET_CHANGE');
        if (type === 7) sps = found[0]; else pps = found[0];
      }
    }
    requireThat(sps && pps, 'PARAMETER_SET_REQUIRED');
    return { offset: parsed.offset, end: parsed.end, pts: parsed.pts, dts: parsed.dts, idr };
  });
  requireThat(frames.length >= 3 && frames[0].idr, 'FIRST_IDR_REQUIRED');
  const step = frames[1].dts - frames[0].dts;
  requireThat(step > 0 && step <= 90000 && frames.every((frame, i) => !i || frame.dts - frames[i - 1].dts === step), 'VFR_OR_DISCONTINUITY_UNPROVEN');
  const presentation = frames.map(frame => frame.pts).sort((a, b) => a - b);
  requireThat(presentation.every((pts, i) => !i || pts - presentation[i - 1] === step), 'VFR_OR_DISCONTINUITY_UNPROVEN');
  return { frames, step };
}

function audioFrames(records) {
  let config = null; let totalFrames = 0; let firstDts = null;
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  for (const record of records) {
    const parsed = pes(record, 'audio');
    requireThat(parsed.pts === parsed.dts, 'AAC_PTS_DTS');
    let offset = 0; let count = 0;
    const bytes = parsed.payload;
    while (offset < bytes.length) {
      requireThat(offset + 7 <= bytes.length && bytes[offset] === 255 && (bytes[offset + 1] & 0xfe) === 0xf0, 'ADTS_HEADER');
      const header = bytes[offset + 1] & 1 ? 7 : 9;
      const size = ((bytes[offset + 3] & 3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
      requireThat(size > header && offset + size <= bytes.length && (bytes[offset + 6] & 3) === 0, 'ADTS_CROSS_PES_UNPROVEN');
      const current = [bytes[offset + 2] >> 6, (bytes[offset + 2] >> 2) & 15, ((bytes[offset + 2] & 1) << 2) | (bytes[offset + 3] >> 6)];
      requireThat(current[0] === 1 && rates[current[1]] && current[2] > 0 && current[2] <= 7, 'AAC_CONFIGURATION_UNPROVEN');
      requireThat(!config || equal(config, current), 'AAC_CONFIGURATION_CHANGE');
      config = current; count++; offset += size;
    }
    if (firstDts === null) firstDts = parsed.dts;
    // A fresh tolerance per PES permits accumulated one-tick drift. Keep one
    // audio origin and an exact sample count for the entire admitted input.
    requireThat(count > 0 && Math.abs(parsed.dts - firstDts - totalFrames * 1024 * 90000 / rates[config[1]]) <= 1, 'AAC_TIMING_DISCONTINUITY');
    totalFrames += count;
  }
  return totalFrames;
}

export function analyzeGopBoundaries(bytes, { maxWindowBytes = 512 * 1024 } = {}) {
  requireThat(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= MAX_BYTES
    && bytes.length % 188 === 0 && Number.isSafeInteger(maxWindowBytes)
    && maxWindowBytes >= 188 && maxWindowBytes <= MAX_BYTES, 'BOUNDED_ALIGNED_INPUT_REQUIRED');
  const structure = probeMpegTs(bytes, { limits: { maxPackets: 24000, maxSections: 1024, maxIssues: 512 } });
  const duplicateSections = new Set(['PAT_SECTION_DUPLICATE', 'PMT_SECTION_DUPLICATE']);
  requireThat(structure.status === 'complete' && structure.bytes.syncOffset === 0
    && structure.issues.every(issue => duplicateSections.has(issue.code)) && structure.programs.length === 1, 'STABLE_PROGRAM_REQUIRED');
  const program = structure.programs[0];
  requireThat(program.streams.length === 2, 'TWO_TRACKS_REQUIRED');
  const video = program.streams.find(stream => stream.streamType === 27);
  const audio = program.streams.find(stream => stream.streamType === 15);
  requireThat(video && audio && video.codecDetails.status === 'parsed' && audio.codecDetails.status === 'parsed', 'H264_AAC_REQUIRED');
  const tracks = new Map([[video.elementaryPid, []], [audio.elementaryPid, []]]);
  const counters = new Map();
  for (let offset = 0; offset < bytes.length; offset += 188) {
    const packet = bytes.subarray(offset, offset + 188);
    requireThat(packet[0] === 0x47 && !(packet[1] & 128) && !(packet[3] & 192), 'TS_TRANSPORT');
    const pid = ((packet[1] & 31) << 8) | packet[2];
    const control = (packet[3] >> 4) & 3;
    requireThat(control !== 0, 'TS_ADAPTATION');
    let payload = 4;
    if (control & 2) {
      requireThat(packet[4] <= 183 && (control !== 2 || packet[4] === 183), 'TS_ADAPTATION');
      if (packet[4]) requireThat(!(packet[5] & 128), 'TS_DISCONTINUITY_UNPROVEN');
      payload += packet[4] + 1;
    }
    if (!(control & 1)) continue;
    requireThat(payload < 188, 'TS_PAYLOAD');
    if (pid !== 8191) {
      const cc = packet[3] & 15;
      requireThat(!counters.has(pid) || cc === (counters.get(pid) + 1) % 16, 'TS_CONTINUITY');
      counters.set(pid, cc);
    }
    const records = tracks.get(pid);
    if (!records) continue;
    if (packet[1] & 64) records.push({ offset, end: offset + 188, parts: [] });
    requireThat(records.length, 'PARTIAL_FIRST_PES');
    const record = records[records.length - 1];
    record.parts.push(packet.subarray(payload)); record.end = offset + 188;
  }
  const { frames, step } = videoFrames(tracks.get(video.elementaryPid));
  const audioRecords = tracks.get(audio.elementaryPid);
  const aacFrames = audioFrames(audioRecords);
  requireThat(aacFrames > 0, 'AAC_REQUIRED');
  const cuts = frames.filter(frame => frame.idr).slice(1).map(frame => frame.offset);
  for (const cut of cuts) requireThat(!audioRecords.some(record => record.offset < cut && record.end > cut), 'AUDIO_PES_CROSSES_CUT_UNPROVEN');
  const edges = [0, ...cuts, bytes.length];
  for (let i = 1; i < edges.length; i++) requireThat(audioRecords.some(record => record.offset >= edges[i - 1]
    && record.end <= edges[i]), 'EACH_FRAGMENT_NEEDS_BOTH_TRACKS');
  const largestWindowBytes = Math.max(...edges.slice(1).map((edge, i) => edge - edges[i]));
  requireThat(largestWindowBytes <= maxWindowBytes, 'GOP_WINDOW_LIMIT');
  return { schema: 'drive-original.bounded-gop-eligibility/1', videoPid: video.elementaryPid, audioPid: audio.elementaryPid,
    videoFrames: frames.length, aacFrames, dtsStep: step, frames, cuts, largestWindowBytes,
    scope: 'structural eligibility only; bounded CFR and ADTS framing; NAL payload completeness requires independent strict decode; not runtime streaming or seek proof' };
}
