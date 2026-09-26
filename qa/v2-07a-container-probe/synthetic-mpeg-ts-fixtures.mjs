import { crc32Mpeg2 } from './mpeg-ts-probe.mjs';

const TS_PACKET_BYTES = 188;

export function concatBytes(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function withCrc(prefix) {
  const crc = crc32Mpeg2(prefix);
  return concatBytes(prefix, Uint8Array.of(crc >>> 24, crc >>> 16, crc >>> 8, crc));
}

function sectionHeader(tableId, bodyLength) {
  const sectionLength = bodyLength + 4;
  return Uint8Array.of(tableId, 0xb0 | ((sectionLength >>> 8) & 0x0f), sectionLength & 0xff);
}

export function makePatSection(programs, { transportStreamId = 1, version = 0, currentNext = 1, sectionNumber = 0, lastSectionNumber = 0 } = {}) {
  const body = [
    transportStreamId >>> 8, transportStreamId,
    0xc0 | ((version & 0x1f) << 1) | (currentNext ? 1 : 0), sectionNumber, lastSectionNumber,
  ];
  for (const { programNumber, pmtPid } of programs) {
    body.push(programNumber >>> 8, programNumber, 0xe0 | ((pmtPid >>> 8) & 0x1f), pmtPid);
  }
  return withCrc(concatBytes(sectionHeader(0x00, body.length), Uint8Array.from(body)));
}

export function makePmtSection({
  programNumber,
  pcrPid,
  streams,
  version = 0,
  currentNext = 1,
  sectionNumber = 0,
  lastSectionNumber = 0,
  programDescriptors = [],
}) {
  const body = [
    programNumber >>> 8, programNumber,
    0xc0 | ((version & 0x1f) << 1) | (currentNext ? 1 : 0), sectionNumber, lastSectionNumber,
    0xe0 | ((pcrPid >>> 8) & 0x1f), pcrPid,
    0xf0 | ((programDescriptors.length >>> 8) & 0x0f), programDescriptors.length,
    ...programDescriptors,
  ];
  for (const { streamType, elementaryPid, descriptors = [] } of streams) {
    body.push(
      streamType,
      0xe0 | ((elementaryPid >>> 8) & 0x1f), elementaryPid,
      0xf0 | ((descriptors.length >>> 8) & 0x0f), descriptors.length,
      ...descriptors,
    );
  }
  return withCrc(concatBytes(sectionHeader(0x02, body.length), Uint8Array.from(body)));
}

export function makeTsPacket({
  pid,
  continuityCounter,
  payload = new Uint8Array(),
  payloadUnitStart = false,
  discontinuity = false,
  scrambling = 0,
  forcePayloadCapacity = null,
}) {
  if (payload.length > 184) throw new RangeError('TS payload exceeds 184 bytes');
  const packet = new Uint8Array(TS_PACKET_BYTES).fill(0xff);
  packet[0] = 0x47;
  packet[1] = (payloadUnitStart ? 0x40 : 0) | ((pid >>> 8) & 0x1f);
  packet[2] = pid;
  let payloadOffset = 4;
  const requestedCapacity = forcePayloadCapacity ?? payload.length;
  const useAdaptation = discontinuity || requestedCapacity < 184;
  const adaptationControl = useAdaptation ? 3 : 1;
  packet[3] = ((scrambling & 0x03) << 6) | (adaptationControl << 4) | (continuityCounter & 0x0f);
  if (useAdaptation) {
    const capacity = Math.max(payload.length, requestedCapacity);
    const adaptationLength = 183 - capacity;
    if (adaptationLength < (discontinuity ? 1 : 0) || adaptationLength > 182) throw new RangeError('Invalid requested TS payload capacity');
    packet[4] = adaptationLength;
    if (adaptationLength > 0) packet[5] = discontinuity ? 0x80 : 0x00;
    payloadOffset = 5 + adaptationLength;
  }
  packet.set(payload, payloadOffset);
  return packet;
}

export function makeNullPacket(continuityCounter = 0) {
  return makeTsPacket({ pid: 0x1fff, continuityCounter, payload: Uint8Array.of(0), forcePayloadCapacity: 1 });
}

export function packetizePsiSection(pid, section, {
  continuityStart = 0,
  pointerPadding = new Uint8Array(),
  firstPayloadCapacity = 184,
  discontinuityFirst = false,
  continuitySequence = null,
} = {}) {
  const bytes = concatBytes(Uint8Array.of(pointerPadding.length), pointerPadding, section);
  const packets = [];
  let offset = 0;
  let packetNumber = 0;
  while (offset < bytes.length) {
    const desiredCapacity = packetNumber === 0 ? firstPayloadCapacity : 184;
    const capacity = Math.min(desiredCapacity, bytes.length - offset);
    const payload = bytes.subarray(offset, offset + capacity);
    const continuityCounter = continuitySequence?.[packetNumber] ?? ((continuityStart + packetNumber) & 0x0f);
    packets.push(makeTsPacket({
      pid,
      continuityCounter,
      payload,
      payloadUnitStart: packetNumber === 0,
      discontinuity: packetNumber === 0 && discontinuityFirst,
      forcePayloadCapacity: capacity,
    }));
    offset += capacity;
    packetNumber += 1;
  }
  return packets;
}

class BitWriter {
  constructor() { this.bits = []; }
  bit(value) { this.bits.push(value ? 1 : 0); }
  bitsValue(value, count) {
    for (let shift = count - 1; shift >= 0; shift -= 1) this.bit((value >>> shift) & 1);
  }
  ue(value) {
    const code = value + 1;
    const width = Math.floor(Math.log2(code));
    for (let index = 0; index < width; index += 1) this.bit(0);
    this.bitsValue(code, width + 1);
  }
  finishRbsp() {
    this.bit(1);
    while (this.bits.length % 8 !== 0) this.bit(0);
    const output = new Uint8Array(this.bits.length / 8);
    for (let index = 0; index < this.bits.length; index += 1) output[index >> 3] |= this.bits[index] << (7 - (index & 7));
    return output;
  }
}

function escapeRbsp(rbsp) {
  const output = [];
  let zeros = 0;
  for (const byte of rbsp) {
    if (zeros >= 2 && byte <= 3) {
      output.push(3);
      zeros = 0;
    }
    output.push(byte);
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(output);
}

export function makeHigh720pBt709Sps({ vuiPresent = true, aspectRatioIdc = null, sarWidth = 1, sarHeight = 1 } = {}) {
  const writer = new BitWriter();
  writer.bitsValue(100, 8); // High profile
  writer.bitsValue(0, 8);
  writer.bitsValue(30, 8); // Level 3.0
  writer.ue(0); // SPS id
  writer.ue(1); // 4:2:0
  writer.ue(0); // 8-bit luma
  writer.ue(0); // 8-bit chroma
  writer.bit(0); // qpprime bypass
  writer.bit(0); // no scaling matrix
  writer.ue(0); // log2_max_frame_num_minus4
  writer.ue(0); // pic_order_cnt_type
  writer.ue(0); // log2_max_pic_order_cnt_lsb_minus4
  writer.ue(1); // max_num_ref_frames
  writer.bit(0); // gaps disallowed
  writer.ue(79); // 1280 / 16 - 1
  writer.ue(44); // 720 / 16 - 1
  writer.bit(1); // frame_mbs_only
  writer.bit(1); // direct_8x8_inference
  writer.bit(0); // no crop
  writer.bit(vuiPresent);
  if (!vuiPresent) return concatBytes(Uint8Array.of(0x67), escapeRbsp(writer.finishRbsp()));
  writer.bit(aspectRatioIdc !== null);
  if (aspectRatioIdc !== null) {
    writer.bitsValue(aspectRatioIdc,8);
    if (aspectRatioIdc === 255) { writer.bitsValue(sarWidth,16); writer.bitsValue(sarHeight,16); }
  }
  writer.bit(0); // overscan absent
  writer.bit(1); // video signal present
  writer.bitsValue(5, 3); // unspecified video_format
  writer.bit(0); // limited range
  writer.bit(1); // colour description present
  writer.bitsValue(1, 8); // BT.709 primaries
  writer.bitsValue(1, 8); // BT.709 transfer
  writer.bitsValue(1, 8); // BT.709 matrix
  writer.bit(0); // chroma location absent
  writer.bit(0); // timing info absent
  writer.bit(0); // NAL HRD absent
  writer.bit(0); // VCL HRD absent
  writer.bit(0); // pic_struct_present_flag
  writer.bit(0); // bitstream restriction absent
  return concatBytes(Uint8Array.of(0x67), escapeRbsp(writer.finishRbsp()));
}

export function makeAdtsAacLcFrame({ sampleRateIndex = 3, channelConfiguration = 2, payload = Uint8Array.of(0x21, 0x10, 0x04, 0x60) } = {}) {
  const frameLength = 7 + payload.length;
  const profile = 1; // ADTS profile is audioObjectType - 1 => AAC LC
  const header = Uint8Array.of(
    0xff,
    0xf1,
    (profile << 6) | (sampleRateIndex << 2) | ((channelConfiguration >>> 2) & 1),
    ((channelConfiguration & 3) << 6) | ((frameLength >>> 11) & 3),
    (frameLength >>> 3) & 0xff,
    ((frameLength & 7) << 5) | 0x1f,
    0xfc,
  );
  return concatBytes(header, payload);
}

export function makePesPacket(streamId, elementaryBytes) {
  const pesPacketLength = Math.min(0xffff, elementaryBytes.length + 3);
  return concatBytes(
    Uint8Array.of(0x00, 0x00, 0x01, streamId, pesPacketLength >>> 8, pesPacketLength, 0x80, 0x00, 0x00),
    elementaryBytes,
  );
}

export function packetizePes(pid, pesBytes, { continuityStart = 0, firstPayloadCapacity = 184 } = {}) {
  const packets = [];
  let offset = 0;
  let index = 0;
  while (offset < pesBytes.length) {
    const desired = index === 0 ? firstPayloadCapacity : 184;
    const capacity = Math.min(desired, pesBytes.length - offset);
    packets.push(makeTsPacket({
      pid,
      continuityCounter: (continuityStart + index) & 0x0f,
      payload: pesBytes.subarray(offset, offset + capacity),
      payloadUnitStart: index === 0,
      forcePayloadCapacity: capacity,
    }));
    offset += capacity;
    index += 1;
  }
  return packets;
}

export function buildPriorityLikeH264AacTs({
  leadingBytes = new Uint8Array(),
  splitPsi = false,
  pointerPadding = new Uint8Array(),
  includeElementaryHeaders = true,
} = {}) {
  const pmtPid = 0x1000;
  const videoPid = 0x0100;
  const audioPid = 0x0101;
  const pat = makePatSection([{ programNumber: 1, pmtPid }]);
  const pmt = makePmtSection({
    programNumber: 1,
    pcrPid: videoPid,
    streams: [
      { streamType: 0x1b, elementaryPid: videoPid },
      { streamType: 0x0f, elementaryPid: audioPid },
    ],
  });
  const packets = [
    ...packetizePsiSection(0, pat, { pointerPadding, firstPayloadCapacity: splitPsi ? 9 : 184 }),
    ...packetizePsiSection(pmtPid, pmt, { firstPayloadCapacity: splitPsi ? 11 : 184 }),
  ];
  if (includeElementaryHeaders) {
    const annexB = concatBytes(Uint8Array.of(0x00, 0x00, 0x00, 0x01), makeHigh720pBt709Sps());
    packets.push(...packetizePes(videoPid, makePesPacket(0xe0, annexB), { firstPayloadCapacity: 15 }));
    packets.push(...packetizePes(audioPid, makePesPacket(0xc0, makeAdtsAacLcFrame()), { firstPayloadCapacity: 12 }));
  } else packets.push(makeNullPacket());
  return concatBytes(leadingBytes, ...packets);
}

export function buildTwoProgramTs() {
  const programs = [
    { programNumber: 1, pmtPid: 0x1000 },
    { programNumber: 2, pmtPid: 0x1001 },
  ];
  const pat = makePatSection(programs, { transportStreamId: 7 });
  const pmt1 = makePmtSection({ programNumber: 1, pcrPid: 0x0100, streams: [{ streamType: 0x1b, elementaryPid: 0x0100 }] });
  const pmt2 = makePmtSection({
    programNumber: 2,
    pcrPid: 0x0200,
    streams: [
      { streamType: 0x24, elementaryPid: 0x0200 },
      { streamType: 0x06, elementaryPid: 0x0201, descriptors: [0x59, 0x00] },
    ],
  });
  return concatBytes(
    ...packetizePsiSection(0, pat),
    ...packetizePsiSection(0x1000, pmt1),
    ...packetizePsiSection(0x1001, pmt2),
  );
}

export function buildDiscontinuityRecoveryTs() {
  const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
  const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x0100, streams: [{ streamType: 0x1b, elementaryPid: 0x0100 }] });
  const partial = makeTsPacket({
    pid: 0,
    continuityCounter: 0,
    payloadUnitStart: true,
    payload: concatBytes(Uint8Array.of(0), pat.subarray(0, 7)),
    forcePayloadCapacity: 8,
  });
  const replacement = makeTsPacket({
    pid: 0,
    continuityCounter: 7,
    payloadUnitStart: true,
    discontinuity: true,
    payload: concatBytes(Uint8Array.of(0), pat),
    forcePayloadCapacity: pat.length + 1,
  });
  return concatBytes(partial, replacement, ...packetizePsiSection(0x1000, pmt));
}
