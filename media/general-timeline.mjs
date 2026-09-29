import { MP4, QTFF, MATROSKA, WEBM } from './mediabunny-q1.mjs';
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
