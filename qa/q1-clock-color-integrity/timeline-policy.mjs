import { MP4, QTFF, MATROSKA, WEBM } from './vendor/mediabunny.min.mjs';
const demand = (condition, code) => { if (!condition) throw new Error(`TIMING_${code}`); };
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u32 = (bytes, offset) => view(bytes).getUint32(offset);
const integer64 = (bytes, offset, signed = false) => {
  const value = signed ? view(bytes).getBigInt64(offset) : view(bytes).getBigUint64(offset);
  demand(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER), 'INTEGER_RANGE'); return Number(value);
};
const type = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
function children(bytes) {
  const result = []; for (let offset = 0; offset < bytes.length;) {
    demand(offset + 8 <= bytes.length, 'BOX_HEADER'); let size = u32(bytes, offset), header = 8;
    if (size === 1) { demand(offset + 16 <= bytes.length, 'BOX_HEADER'); size = integer64(bytes, offset + 8); header = 16; }
    else if (size === 0) size = bytes.length - offset;
    demand(size >= header && offset + size <= bytes.length, 'BOX_BOUNDS');
    result.push({ type: type(bytes, offset + 4), data: bytes.subarray(offset + header, offset + size) }); offset += size;
  } return result;
}
const child = (box, name) => children(box.data).find(entry => entry.type === name);
async function exact(rpc, start, length) {
  demand(Number.isSafeInteger(length) && length > 0 && length <= 4 * 1024 * 1024, 'METADATA_LIMIT');
  const out = new Uint8Array(length); let position = 0;
  while (position < length) { const bytes = await rpc.request({ generation: rpc.metrics.generation, start: start + position, end: start + length }); out.set(bytes, position); position += bytes.length; }
  return out;
}
async function mp4Policy(rpc, selected) {
  const size = rpc.metrics.size; let position = 0, moov;
  for (let count = 0; count < 128 && position < size; count++) {
    const bytes = await exact(rpc, position, Math.min(16, size - position)); demand(bytes.length >= 8, 'BOX_HEADER');
    let length = u32(bytes, 0), header = 8;
    if (length === 1) { demand(bytes.length === 16, 'BOX_HEADER'); length = integer64(bytes, 8); header = 16; }
    else if (length === 0) length = size - position;
    demand(length >= header && position + length <= size, 'BOX_BOUNDS');
    if (type(bytes, 4) === 'moov') { moov = { data: await exact(rpc, position + header, length - header) }; break; }
    position += length;
  }
  demand(moov, 'MOOV_NOT_FOUND'); const movie = child(moov, 'mvhd'); demand(movie, 'MOVIE_HEADER');
  const version = movie.data[0]; demand(version <= 1, 'MOVIE_VERSION');
  const timescale = u32(movie.data, version ? 20 : 12), ticks = version ? integer64(movie.data, 24) : u32(movie.data, 16);
  demand(timescale > 0, 'MOVIE_TIMESCALE');
  const tracks = [];
  for (const trak of children(moov.data).filter(box => box.type === 'trak')) {
    const header = child(trak, 'tkhd'); demand(header && header.data[0] <= 1, 'TRACK_HEADER');
    const id = u32(header.data, header.data[0] ? 20 : 12); if (!selected.some(track => track.id === id)) continue;
    const editBox = child(trak, 'edts'), edit = editBox && child(editBox, 'elst');
    let leadingEmptyTicks = 0, mediaTime = null, contentEntries = 0, entryCount = 0;
    if (edit) {
      const v = edit.data[0]; demand(v <= 1, 'EDIT_VERSION'); entryCount = u32(edit.data, 4); demand(entryCount <= 16, 'EDIT_COUNT');
      const width = v ? 20 : 12; demand(edit.data.length === 8 + width * entryCount, 'EDIT_LENGTH');
      for (let index = 0; index < entryCount; index++) {
        const offset = 8 + width * index, duration = v ? integer64(edit.data, offset) : u32(edit.data, offset);
        const time = v ? integer64(edit.data, offset + 8, true) : view(edit.data).getInt32(offset + 4);
        const rate = view(edit.data).getInt32(offset + (v ? 16 : 8)); demand(rate === 65536, 'EDIT_RATE_UNSUPPORTED');
        if (time === -1 && !contentEntries) leadingEmptyTicks += duration;
        else { demand(time >= 0 && contentEntries++ === 0 && index === entryCount - 1, 'EDIT_SEQUENCE_UNSUPPORTED'); mediaTime = time; }
      }
      demand(entryCount === 0 || contentEntries === 1, 'EMPTY_ONLY_EDIT_UNSUPPORTED');
    }
    tracks.push({ id, leadingEmptySeconds: leadingEmptyTicks / timescale, contentEntries, entryCount, mediaTime });
  }
  demand(tracks.length === selected.length, 'SELECTED_TRACKS');
  const validPresentationStart = Math.min(...tracks.map(track => track.leadingEmptySeconds));
  // Different leading gaps are representable when each later track starts at
  // its valid boundary. A later track's preroll overlapping another track's
  // valid region requires per-track masking, which one append window lacks.
  for (const record of tracks) {
    const track = selected.find(track => track.id === record.id);
    record.firstPacketTimestamp = await track.getFirstTimestamp();
    const tolerance = Math.max(1 / timescale, 1 / await track.getTimeResolution());
    demand(!(record.leadingEmptySeconds > validPresentationStart + tolerance && record.firstPacketTimestamp < record.leadingEmptySeconds - tolerance), 'TRACK_PREROLL_WINDOW_DIFFER');
  }
  return { kind: 'isobmff-movie-axis', presentationOrigin: 0, validPresentationStart,
    declaredEnd: ticks > 0 ? ticks / timescale : null, authority: 'bounded original mvhd and selected-track elst bytes; leading-empty + one unit-rate content edit', tracks };
}
export async function resolveTimelinePolicy(rpc, input, tracks) {
  const format = await input.getFormat();
  if (format === MP4 || format === QTFF) return mp4Policy(rpc, tracks);
  if (format === MATROSKA || format === WEBM) {
    return { kind: 'matroska-segment-axis', presentationOrigin: 0, validPresentationStart: 0,
      declaredEnd: await tracks[0].getDurationFromMetadata(), authority: 'segment timestamp axis; pinned demuxer Duration metadata is segment-wide, not per-track final duration',
      tracks: tracks.map(track => ({ id: track.id })) };
  }
  throw new Error('TIMING_CONTAINER_POLICY_UNSUPPORTED');
}
export function aacLcFrameDuration(config) {
  demand(config.codec === 'mp4a.40.2' && config.description, 'AAC_CONFIGURATION_UNSUPPORTED');
  const bytes = new Uint8Array(config.description.buffer || config.description, config.description.byteOffset || 0, config.description.byteLength);
  let position = 0;
  const read = count => { demand(position + count <= bytes.length * 8, 'ASC_TRUNCATED'); let result = 0; for (let i = 0; i < count; i++) result = result * 2 + ((bytes[position >> 3] >> (7 - position++ % 8)) & 1); return result; };
  demand(read(5) === 2, 'AAC_OBJECT_TYPE'); const index = read(4), rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const sampleRate = index === 15 ? read(24) : rates[index]; demand(sampleRate === config.sampleRate, 'AAC_RATE');
  const channels = read(4); demand(channels > 0 && channels <= 6 && channels === config.numberOfChannels, 'AAC_CHANNEL_CONFIGURATION');
  demand(read(1) === 0 && read(1) === 0 && read(1) === 0, 'AAC_FRAME_FLAGS_UNSUPPORTED');
  if (bytes.length * 8 - position >= 17) {
    demand(read(11) === 0x2b7 && read(5) === 5 && read(1) === 0, 'AAC_EXTENSION_UNSUPPORTED');
  }
  while (position < bytes.length * 8) demand(read(1) === 0, 'AAC_EXTENSION_UNSUPPORTED');
  return 1024 / sampleRate;
}
function hasIdr(packet, config) {
  const data = packet.data, description = config.description && new Uint8Array(config.description.buffer || config.description, config.description.byteOffset || 0, config.description.byteLength);
  if (description?.[0] === 1) {
    const width = (description[4] & 3) + 1;
    for (let offset = 0; offset < data.length;) { let length = 0; demand(offset + width <= data.length, 'AVC_LENGTH');
      for (let index = 0; index < width; index++) length = length * 256 + data[offset++]; demand(length > 0 && offset + length <= data.length, 'AVC_LENGTH');
      if ((data[offset] & 31) === 5) return true; offset += length; }
  } else for (let i = 0; i + 4 < data.length; i++) if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1 && (data[i + 3] & 31) === 5) return true;
  return false;
}
export function createDurationCursor({ sink, kind, track, config, policy, omittedEvidence, limits = {} }) {
  const queue = [], resolutions = []; let bytes = 0, peakBytes = 0, resolutionCount = 0;
  const maxPackets = limits.maxTimingLookaheadPackets ?? 64, maxBytes = limits.maxTimingLookaheadBytes ?? 2 * 1024 * 1024;
  async function fetchAfter(packet) { return sink.getNextPacket(packet, kind === 'video' ? { verifyKeyPackets: true } : undefined); }
  async function peek(index, current) {
    while (queue.length <= index) { const next = await fetchAfter(queue.at(-1) || current); if (!next) return null;
      demand(queue.length < maxPackets && bytes + next.data.length <= maxBytes, 'LOOKAHEAD_LIMIT'); queue.push(next); bytes += next.data.length; peakBytes = Math.max(peakBytes, bytes); }
    return queue[index];
  }
  return { resolutions, get resolutionCount() { return resolutionCount; }, get peakBytes() { return peakBytes; }, async advance(current) {
    if (queue.length) { const next = queue.shift(); bytes -= next.data.length; return next; } return fetchAfter(current);
  }, async resolve(packet) {
    if (packet.duration > 0) return { packet, evidence: null };
    demand(policy?.kind === 'matroska-segment-axis' && omittedEvidence === 'generated-simpleblock-no-explicit-duration', 'OMISSION_NOT_ESTABLISHED');
    let nextTimestamp = Infinity, closed = false, eof = false;
    for (let index = 0; !closed; index++) {
      const next = await peek(index, packet); if (!next) { eof = true; break; }
      if (next.timestamp > packet.timestamp) nextTimestamp = Math.min(nextTimestamp, next.timestamp);
      if (kind === 'audio') { demand(next.timestamp > packet.timestamp, 'AUDIO_PRESENTATION_ORDER'); closed = true; }
      else if (track.codec === 'avc' && next.type === 'key' && hasIdr(next, config)) closed = true;
    }
    let duration, basis;
    if (Number.isFinite(nextTimestamp)) { duration = nextTimestamp - packet.timestamp; basis = kind === 'audio' ? 'next same-track presentation boundary' : 'bounded next presentation boundary closed by verified IDR or EOF'; }
    else if (eof && kind === 'audio' && track.codec === 'aac') {
      duration = aacLcFrameDuration(config); basis = 'AAC-LC ASC 1024-sample frame; no frame-length/core/SBR/PS extensions';
      const tick = 1 / await track.getTimeResolution();
      demand(!Number.isFinite(policy.declaredEnd) || packet.timestamp + duration <= policy.declaredEnd + tick, 'AAC_FINAL_PADDING_AMBIGUOUS');
    } else if (eof && kind === 'video' && policy.tracks.length === 1 && Number.isFinite(policy.declaredEnd)) {
      duration = policy.declaredEnd - packet.timestamp; basis = 'declared segment end for sole timed track; recovered boundary, not preserved absent packet metadata';
    } else throw new Error(`TIMING_FINAL_DURATION_AMBIGUOUS:${kind}`);
    demand(duration > 0 && duration <= 0.5, 'DURATION_BOUND');
    const evidence = { kind, timestamp: packet.timestamp, originalDuration: packet.duration, resolvedDuration: duration, basis };
    resolutionCount++; if (resolutions.length < 32) resolutions.push(evidence); return { packet: packet.clone({ duration }), evidence };
  } };
}
