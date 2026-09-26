import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const requireThat = (value, code) => { if (!value) throw new Error(code); };
const equal = (left, right) => left.length === right.length && left.every((value, i) => value === right[i]);
const IDENTITY = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];

// QA-only, browser-safe adapter for the pinned mux.js 7.1.0 init layout.
// Bind caller-owned original SPS/PPS to exactly one video track before adapting
// an introduced square pasp. No media bytes or parameter sets are rewritten.
// Explicit non-square, reserved and zero Extended SAR remain unproven/rejected.
// Caller owns source/generation identity; this pure function neither stores nor
// mutates its inputs. Successful syntax binding is not decoder/display proof.
export function adaptInitSar(initBytes, source = {}) {
  requireThat(initBytes instanceof Uint8Array && initBytes.length >= 8 && initBytes.length <= 2 * 1024 * 1024, 'SAR_INIT_INPUT');
  const { videoTrackId, sps, pps } = source ?? {};
  requireThat(Number.isInteger(videoTrackId) && videoTrackId > 0 && videoTrackId <= 0xffffffff, 'SAR_TRACK_ID');
  for (const [bytes, type] of [[sps, 7], [pps, 8]]) {
    requireThat(bytes instanceof Uint8Array && bytes.length >= 2 && bytes.length <= 65535
      && (bytes[0] & 0x9f) === type && (bytes[0] & 0x60) !== 0, 'SAR_PARAMETER_INPUT');
  }
  const parsed = parseH264Sps(sps);
  requireThat(parsed.status === 'parsed', 'SAR_SPS_INVALID');
  requireThat(parsed.width <= 65535 && parsed.height <= 65535, 'SAR_GEOMETRY_RANGE');
  const aspect = parsed.aspectRatio;
  const remove = aspect.status === 'unspecified' && (!aspect.present || aspect.idc === 0);
  requireThat(remove || (aspect.status === 'explicit' && aspect.width > 0 && aspect.width === aspect.height), 'SAR_ASPECT_UNPROVEN');

  const view = new DataView(initBytes.buffer, initBytes.byteOffset, initBytes.byteLength);
  const text = offset => String.fromCharCode(...initBytes.subarray(offset, offset + 4));
  let boxCount = 0;
  function children(start, end, allowed) {
    requireThat(start <= end, 'SAR_BOX_TRUNCATED');
    const result = [];
    for (let offset = start; offset < end;) {
      requireThat(offset + 8 <= end && ++boxCount <= 128, 'SAR_BOX_LIMIT');
      const size = view.getUint32(offset); const type = text(offset + 4);
      requireThat(size >= 8 && offset + size <= end, 'SAR_BOX_SIZE');
      requireThat(allowed.includes(type), 'SAR_BOX_UNPROVEN');
      result.push({ offset, end: offset + size, size, type });
      offset += size;
    }
    return result;
  }
  function one(boxes, type) {
    const matches = boxes.filter(box => box.type === type);
    requireThat(matches.length === 1, 'SAR_BOX_COUNT');
    return matches[0];
  }
  const inside = (box, allowed, skip = 8) => children(box.offset + skip, box.end, allowed);
  function matrix(offset) {
    requireThat(IDENTITY.every((value, i) => view.getUint32(offset + i * 4) === value), 'SAR_MATRIX_UNPROVEN');
  }
  function fullBox(box, size) {
    requireThat(box.size === size && view.getUint32(box.offset + 8) === 0, 'SAR_FULL_BOX');
  }
  function avcConfiguration(box) {
    const start = box.offset + 8;
    requireThat(box.size >= 19 && initBytes[start] === 1 && initBytes[start + 1] === sps[1]
      && initBytes[start + 2] === sps[2] && initBytes[start + 3] === sps[3]
      && initBytes[start + 4] === 255, 'SAR_AVCC_HEADER');
    // The pinned generator writes 0x01, not 0xe1, for the single SPS count.
    // Accommodate that exact known layout without repairing reserved bits.
    requireThat(initBytes[start + 5] === 1, 'SAR_AVCC_COUNT');
    let cursor = start + 6;
    function parameter(expected) {
      requireThat(cursor + 2 <= box.end, 'SAR_AVCC_LENGTH');
      const length = view.getUint16(cursor); cursor += 2;
      requireThat(length === expected.length && cursor + length <= box.end, 'SAR_AVCC_LENGTH');
      requireThat(equal(initBytes.subarray(cursor, cursor + length), expected), 'SAR_PARAMETER_MISMATCH');
      cursor += length;
    }
    parameter(sps);
    requireThat(cursor < box.end && initBytes[cursor++] === 1, 'SAR_AVCC_COUNT');
    parameter(pps);
    requireThat(cursor === box.end, 'SAR_AVCC_TRAILING');
  }

  const root = children(0, initBytes.length, ['ftyp', 'moov']);
  one(root, 'ftyp');
  const movie = inside(one(root, 'moov'), ['mvhd', 'trak', 'mvex']);
  const mvhd = one(movie, 'mvhd'); fullBox(mvhd, 108); matrix(mvhd.offset + 44);
  const tracks = movie.filter(box => box.type === 'trak');
  requireThat(tracks.length === 2, 'SAR_TRACK_COUNT');
  const identities = []; let pasp = null;
  for (const track of tracks) {
    const boxes = inside(track, ['tkhd', 'mdia']);
    const tkhd = one(boxes, 'tkhd');
    requireThat(tkhd.size === 92 && view.getUint32(tkhd.offset + 8) === 7, 'SAR_TRACK_HEADER');
    matrix(tkhd.offset + 48);
    const id = view.getUint32(tkhd.offset + 20);
    requireThat(id > 0 && !identities.some(item => item.id === id), 'SAR_TRACK_IDENTITY');
    const media = inside(one(boxes, 'mdia'), ['mdhd', 'hdlr', 'minf']);
    fullBox(one(media, 'mdhd'), 32);
    const hdlr = one(media, 'hdlr');
    requireThat(hdlr.size >= 32 && view.getUint32(hdlr.offset + 8) === 0, 'SAR_HANDLER');
    const handler = text(hdlr.offset + 16);
    requireThat(handler === 'vide' || handler === 'soun', 'SAR_HANDLER');
    identities.push({ id, handler });
    const isVideo = handler === 'vide';
    requireThat((id === videoTrackId) === isVideo, 'SAR_TRACK_IDENTITY');
    const minf = inside(one(media, 'minf'), [isVideo ? 'vmhd' : 'smhd', 'dinf', 'stbl']);
    one(minf, isVideo ? 'vmhd' : 'smhd');
    const dref = one(inside(one(minf, 'dinf'), ['dref']), 'dref');
    requireThat(dref.size === 28 && view.getUint32(dref.offset + 8) === 0
      && view.getUint32(dref.offset + 12) === 1, 'SAR_DATA_REFERENCE');
    const url = one(inside(dref, ['url '], 16), 'url ');
    requireThat(url.size === 12 && view.getUint32(url.offset + 8) === 1, 'SAR_DATA_REFERENCE');
    const table = inside(one(minf, 'stbl'), ['stsd', 'stts', 'stsc', 'stsz', 'stco']);
    for (const type of ['stts', 'stsc', 'stco']) {
      const box = one(table, type); fullBox(box, 16);
      requireThat(view.getUint32(box.offset + 12) === 0, 'SAR_NONEMPTY_SAMPLE_TABLE');
    }
    const stsz = one(table, 'stsz'); fullBox(stsz, 20);
    requireThat(view.getUint32(stsz.offset + 12) === 0 && view.getUint32(stsz.offset + 16) === 0, 'SAR_NONEMPTY_SAMPLE_TABLE');
    const stsd = one(table, 'stsd');
    requireThat(stsd.size >= 16 && view.getUint32(stsd.offset + 8) === 0
      && view.getUint32(stsd.offset + 12) === 1, 'SAR_SAMPLE_COUNT');
    const entry = one(inside(stsd, [isVideo ? 'avc1' : 'mp4a'], 16), isVideo ? 'avc1' : 'mp4a');
    requireThat(entry.size >= (isVideo ? 86 : 36) && view.getUint16(entry.offset + 14) === 1, 'SAR_SAMPLE_ENTRY');
    if (!isVideo) {
      one(inside(entry, ['esds'], 36), 'esds');
      requireThat(view.getUint32(tkhd.offset + 84) === 0 && view.getUint32(tkhd.offset + 88) === 0, 'SAR_AUDIO_GEOMETRY');
      continue;
    }
    requireThat(view.getUint16(entry.offset + 32) === parsed.width && view.getUint16(entry.offset + 34) === parsed.height
      && view.getUint32(tkhd.offset + 84) === parsed.width * 65536
      && view.getUint32(tkhd.offset + 88) === parsed.height * 65536, 'SAR_GEOMETRY_MISMATCH');
    const sample = inside(entry, ['avcC', 'btrt', 'pasp'], 86);
    avcConfiguration(one(sample, 'avcC'));
    requireThat(one(sample, 'btrt').size === 20, 'SAR_BITRATE_BOX');
    pasp = one(sample, 'pasp');
    requireThat(pasp.size === 16 && view.getUint32(pasp.offset + 8) === (remove ? 1 : aspect.width)
      && view.getUint32(pasp.offset + 12) === (remove ? 1 : aspect.height), 'SAR_PASP_MISMATCH');
  }
  requireThat(identities.filter(item => item.handler === 'vide').length === 1
    && identities.filter(item => item.handler === 'soun').length === 1 && pasp, 'SAR_TRACK_IDENTITY');
  const extensions = inside(one(movie, 'mvex'), ['trex']);
  requireThat(extensions.length === 2, 'SAR_TREX_IDENTITY');
  const extensionIds = extensions.map(box => { fullBox(box, 32); return view.getUint32(box.offset + 12); });
  requireThat(new Set(extensionIds).size === 2 && identities.every(item => extensionIds.includes(item.id)), 'SAR_TREX_IDENTITY');

  const initSegment = Uint8Array.from(initBytes);
  if (remove) initSegment.set([102, 114, 101, 101], pasp.offset + 4); // pasp -> free, same sizes/offsets/payload
  return { initSegment, action: remove ? 'removed-introduced-square' : 'unchanged',
    aspectRatio: { ...aspect }, width: parsed.width, height: parsed.height };
}
