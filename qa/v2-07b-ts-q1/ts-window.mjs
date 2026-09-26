import { readPes, readAnnexBNals } from './gop-boundaries.mjs';
import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const demand = (value, code) => { if (!value) throw new Error(code); };
const safe = value => Number.isSafeInteger(value) && value >= 0;
const rates = [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
const channels = [0,1,2,3,4,5,6,8];
const RECORD_LIMIT = 4096;

// Bounded QA timing-anchor scanner, not a source/PSI owner or decoder. PIDs and
// the exact EOF assertion belong to the caller. Timestamps are raw 33-bit 90 kHz
// ticks (no unwrap, epoch inference or global continuity). offset/end identify
// the first/last selected TS packet; interleaved packets may lie between them.
// Each completed PES has one AUD-delimited video candidate or complete ADTS
// frames. This does not prove complete coded pictures, decoding, or safe seeking.
// Only SPS/PPS copies escape. Assembly holds <=2*maxPesBytes of input views;
// readPes uses <=maxPesBytes scratch, SPS parsing another bounded RBSP copy.
// Record/parameter output is bounded by the <=1 MiB input and 4096 record cap.
// Leading continuations are never parsed/promoted; if still continuing at the
// right edge, both partial flags are true. Empty-track flags are both false.
export function scanTsWindow(bytes, { offset = 0, videoPid, audioPid, maxPesBytes = 65536, atEof = false } = {}) {
  demand(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 1024 * 1024
    && bytes.length % 188 === 0, 'WINDOW_INPUT');
  demand(safe(offset) && offset % 188 === 0 && Number.isSafeInteger(offset + bytes.length), 'WINDOW_OFFSET');
  demand([videoPid,audioPid].every(pid => Number.isInteger(pid) && pid >= 16 && pid < 8191)
    && videoPid !== audioPid, 'WINDOW_PIDS');
  demand(Number.isSafeInteger(maxPesBytes) && maxPesBytes >= 14 && maxPesBytes <= 65536
    && typeof atEof === 'boolean', 'WINDOW_OPTIONS');
  const video = [], audio = [], leadingPartial = { video:false, audio:false }, trailingPartial = { video:false, audio:false };
  const tracks = new Map([[videoPid,{kind:'video',active:null,started:false,leading:false,cc:null}],
    [audioPid,{kind:'audio',active:null,started:false,leading:false,cc:null}]]);

  function parseVideo(parsed) {
    let units;
    try { units = readAnnexBNals(parsed.payload); } catch { throw new Error('WINDOW_H264_FRAMING'); }
    const types = units.map(unit => unit[0] & 31);
    demand(types[0] === 9 && types.filter(type => type === 9).length === 1, 'WINDOW_VIDEO_AU');
    demand(types.every(type => [1,5,6,7,8,9].includes(type)), 'WINDOW_H264_TYPE');
    demand(units.every(unit => unit.length >= 2), 'WINDOW_H264_FRAMING');
    const vcl = types.filter(type => type === 1 || type === 5);
    demand(vcl.length > 0 && vcl.every(type => type === vcl[0]), 'WINDOW_VIDEO_PICTURE');
    const idr = vcl[0] === 5;
    const sets = {};
    for (const [name,type] of [['sps',7],['pps',8]]) {
      const found = units.filter(unit => (unit[0] & 31) === type);
      demand(found.length <= 1 && (!idr || found.length === 1), 'WINDOW_VIDEO_PARAMETERS');
      if (found.length) {
        demand((found[0][0] & 0x60) !== 0, 'WINDOW_VIDEO_PARAMETERS');
        if (type === 7) demand(parseH264Sps(found[0]).status === 'parsed', 'WINDOW_SPS');
      }
      sets[name] = found.length ? Uint8Array.from(found[0]) : null;
    }
    return { offset:parsed.offset,end:parsed.end,pts:parsed.pts,dts:parsed.dts,idr,...sets };
  }
  function parseAudio(parsed) {
    demand(parsed.pts === parsed.dts, 'WINDOW_AUDIO_TIMING');
    const payload = parsed.payload;
    let position = 0, frames = 0, sampleRate = null, channelCount = null;
    while (position < payload.length) {
      demand(position + 7 <= payload.length && payload[position] === 255 && (payload[position+1] & 254) === 240,
        'WINDOW_ADTS_HEADER');
      const header = payload[position+1] & 1 ? 7 : 9;
      const length = ((payload[position+3] & 3) << 11) | (payload[position+4] << 3) | (payload[position+5] >> 5);
      demand(length > header && position + length <= payload.length && (payload[position+6] & 3) === 0, 'WINDOW_ADTS_FRAME');
      const profile = payload[position+2] >> 6, rate = rates[(payload[position+2] >> 2) & 15];
      const count = channels[((payload[position+2] & 1) << 2) | (payload[position+3] >> 6)];
      demand(profile === 1 && rate && count, 'WINDOW_AAC_CONFIG');
      demand(sampleRate === null || (sampleRate === rate && channelCount === count), 'WINDOW_AAC_CONFIG');
      sampleRate = rate; channelCount = count; frames++; position += length;
    }
    demand(frames > 0, 'WINDOW_ADTS_FRAME');
    return { offset:parsed.offset,end:parsed.end,pts:parsed.pts,dts:parsed.dts,frames,sampleRate,channels:channelCount };
  }
  function complete(track) {
    const record = track.active;
    demand(video.length + audio.length < RECORD_LIMIT, 'WINDOW_RECORD_LIMIT');
    let parsed;
    try { parsed = readPes(record, track.kind); } catch { throw new Error('WINDOW_PES'); }
    if (track.kind === 'video') video.push(parseVideo(parsed)); else audio.push(parseAudio(parsed));
    track.active = null;
  }
  function adaptation(packet, control) {
    if (!(control & 2)) return 4;
    const length = packet[4];
    demand(length <= (control === 2 ? 183 : 182) && (control !== 2 || length === 183), 'WINDOW_ADAPTATION');
    const end = 5 + length;
    if (length) {
      const flags = packet[5];
      demand(!(flags & 128), 'WINDOW_DISCONTINUITY');
      let cursor = 6;
      // Validate optional field extents, without interpreting PCR clocks.
      for (const [flag,count] of [[16,6],[8,6],[4,1]]) if (flags & flag) cursor += count;
      demand(cursor <= end, 'WINDOW_ADAPTATION');
      for (const flag of [2,1]) if (flags & flag) {
        demand(cursor < end, 'WINDOW_ADAPTATION');
        cursor += 1 + packet[cursor]; demand(cursor <= end, 'WINDOW_ADAPTATION');
      }
    }
    return end;
  }
  for (let position = 0; position < bytes.length; position += 188) {
    const packet = bytes.subarray(position,position+188);
    demand(packet[0] === 0x47 && !(packet[1] & 128) && !(packet[3] & 192), 'WINDOW_TRANSPORT');
    const control = (packet[3] >> 4) & 3;
    demand(control !== 0, 'WINDOW_ADAPTATION');
    const payload = adaptation(packet,control);
    const track = tracks.get(((packet[1] & 31) << 8) | packet[2]);
    if (!track) continue;
    const cc = packet[3] & 15;
    demand(track.cc === null || cc === (track.cc + (control & 1 ? 1 : 0)) % 16, 'WINDOW_CONTINUITY');
    track.cc = cc;
    if (!(control & 1)) continue;
    demand(payload < 188, 'WINDOW_PAYLOAD');
    if (packet[1] & 64) {
      if (track.active) {
        demand(track.active.declared === 0 && track.kind === 'video', 'WINDOW_PES_TRUNCATED');
        complete(track);
      }
      track.started = true; track.leading = false;
      track.active = { offset:offset+position,end:offset+position+188,parts:[],size:0,prefix:new Uint8Array(6),prefixLength:0,declared:null };
    }
    if (!track.started) { track.leading = true; leadingPartial[track.kind] = true; continue; }
    demand(track.active, 'WINDOW_PES_CONTINUATION');
    const record = track.active, part = packet.subarray(payload);
    demand(record.size + part.length <= maxPesBytes, 'WINDOW_PES_LIMIT');
    const prefixBytes = Math.min(6-record.prefixLength,part.length);
    record.prefix.set(part.subarray(0,prefixBytes),record.prefixLength); record.prefixLength += prefixBytes;
    record.parts.push(part); record.size += part.length; record.end = offset+position+188;
    if (record.prefixLength === 6 && record.declared === null) {
      demand(record.prefix[0] === 0 && record.prefix[1] === 0 && record.prefix[2] === 1
        && (track.kind === 'video' ? (record.prefix[3] & 240) === 224 : (record.prefix[3] & 224) === 192), 'WINDOW_PES');
      record.declared = record.prefix[4] * 256 + record.prefix[5];
      demand(record.declared > 0 || track.kind === 'video', 'WINDOW_PES');
      demand(record.declared === 0 || record.declared + 6 <= maxPesBytes, 'WINDOW_PES_LIMIT');
    }
    if (record.declared > 0) {
      demand(record.size <= record.declared + 6, 'WINDOW_PES_LENGTH');
      if (record.size === record.declared + 6) complete(track);
    }
  }
  for (const track of tracks.values()) {
    if (track.active) {
      if (atEof) {
        demand(track.kind === 'video' && track.active.declared === 0, 'WINDOW_EOF_TRUNCATED');
        complete(track);
      } else trailingPartial[track.kind] = true;
    } else if (track.leading) trailingPartial[track.kind] = true;
  }
  return { video,audio,leadingPartial,trailingPartial,
    scope:'bounded PES/NAL/ADTS syntax anchors with raw 33-bit timestamps; no PSI/source identity, global clock continuity, exact duration, complete-picture/decode or seek guarantee' };
}
