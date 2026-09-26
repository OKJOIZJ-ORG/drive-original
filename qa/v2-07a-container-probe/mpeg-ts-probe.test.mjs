import test from 'node:test';
import assert from 'node:assert/strict';

import { probeMpegTs } from './mpeg-ts-probe.mjs';
import {
  buildDiscontinuityRecoveryTs,
  buildPriorityLikeH264AacTs,
  buildTwoProgramTs,
  concatBytes,
  makePatSection,
  makePmtSection,
  makeNullPacket,
  makeAdtsAacLcFrame,
  makeHigh720pBt709Sps,
  makePesPacket,
  makeTsPacket,
  packetizePes,
  packetizePsiSection,
} from './synthetic-mpeg-ts-fixtures.mjs';

function payloadOffset(packet, packetOffset = 0) {
  const adaptationControl = (packet[packetOffset + 3] >> 4) & 3;
  if ((adaptationControl & 2) === 0) return packetOffset + 4;
  return packetOffset + 5 + packet[packetOffset + 4];
}

function stream(result, programIndex, streamIndex) {
  return result.programs[programIndex].streams[streamIndex];
}

function probeAudioPackets(...packets) {
  return probeMpegTs(concatBytes(buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }), ...packets));
}

test('complete ADTS headers without the declared frame never confirm AAC details', () => {
  const frame = makeAdtsAacLcFrame();
  for (const available of [7, 9, 10]) {
    const result = probeAudioPackets(...packetizePes(0x101, makePesPacket(0xc0, frame.subarray(0, available))));
    const details = stream(result, 0, 1).codecDetails;
    assert.equal(details.code, 'ADTS_FRAME_TRUNCATED');
    assert.equal(details.profile, undefined);
  }
});

test('bytes beyond a finite PES declaration cannot supply an ADTS frame', () => {
  const pes = makePesPacket(0xc0, makeAdtsAacLcFrame());
  for (const declaredPayloadBytes of [0, 7, 10]) {
    const bounded = pes.slice();
    bounded[4] = 0;
    bounded[5] = 3 + declaredPayloadBytes;
    const result = probeAudioPackets(...packetizePes(0x101, bounded, { firstPayloadCapacity: 16 }));
    assert.notEqual(stream(result, 0, 1).codecDetails.status, 'parsed');
  }
});

test('TEI with reserved adaptation control still invalidates elementary fragments', () => {
  const packets = packetizePes(0x101, makePesPacket(0xc0, makeAdtsAacLcFrame()), { firstPayloadCapacity: 16 });
  const error = makeTsPacket({ pid: 0x101, continuityCounter: 1, payload: Uint8Array.of(1) });
  error[1] |= 0x80;
  error[3] &= 0xcf;
  const result = probeAudioPackets(packets[0], error, packets[1]);
  assert.equal(result.status, 'malformed');
  assert.ok(result.issues.some(({ code }) => code === 'TRANSPORT_ERROR_INDICATOR'));
  assert.ok(result.issues.some(({ code }) => code === 'ADAPTATION_CONTROL_INVALID'));
  assert.equal(stream(result, 0, 1).codecDetails.code, 'ELEMENTARY_CONTINUITY_LOSS');
});

test('SPS needs the VUI remainder and valid RBSP stop/alignment bits', () => {
  const valid = makeHigh720pBt709Sps();
  const missingStop = valid.slice();
  missingStop[missingStop.length - 1] = 0;
  const invalidAlignment = valid.slice();
  invalidAlignment[invalidAlignment.length - 1] |= 1;
  for (const sps of [valid.subarray(0, valid.length - 1), missingStop, invalidAlignment]) {
    const result = probeAudioPackets(...packetizePes(0x100, makePesPacket(0xe0, concatBytes(Uint8Array.of(0, 0, 1), sps))));
    const details = stream(result, 0, 0).codecDetails;
    assert.equal(details.status, 'incomplete');
    assert.equal(details.profile, undefined);
  }
});

test('a later complete PUSI cannot erase an elementary continuity gap', () => {
  const pes = makePesPacket(0xc0, makeAdtsAacLcFrame());
  const result = probeAudioPackets(...packetizePes(0x101, pes), ...packetizePes(0x101, pes, { continuityStart: 3 }));
  assert.ok(result.issues.some(({ code }) => code === 'ELEMENTARY_CONTINUITY_GAP'));
  assert.equal(stream(result, 0, 1).codecDetails.code, 'ELEMENTARY_CONTINUITY_LOSS');
});

test('conflicting duplicate followed by a complete PUSI cannot confirm codec details', () => {
  const pes = makePesPacket(0xc0, makeAdtsAacLcFrame());
  const first = packetizePes(0x101, pes)[0];
  const conflicting = first.slice();
  conflicting[187] ^= 1;
  const result = probeAudioPackets(first, conflicting, ...packetizePes(0x101, pes, { continuityStart: 1 }));
  assert.equal(result.status, 'malformed');
  assert.equal(stream(result, 0, 1).codecDetails.code, 'ELEMENTARY_CONTINUITY_LOSS');
});

test('declared discontinuity never joins a partial old frame with a new PES', () => {
  const frame = makeAdtsAacLcFrame();
  const old = packetizePes(0x101, makePesPacket(0xc0, frame.subarray(0, 7)));
  const newPes = makePesPacket(0xc0, frame.subarray(7));
  const next = makeTsPacket({ pid: 0x101, continuityCounter: 8, payloadUnitStart: true, discontinuity: true, payload: newPes, forcePayloadCapacity: newPes.length });
  const result = probeAudioPackets(...old, next);
  assert.notEqual(stream(result, 0, 1).codecDetails.status, 'parsed');
});

test('a complete fresh frame after declared discontinuity is independent evidence', () => {
  const frame = makeAdtsAacLcFrame();
  const old = packetizePes(0x101, makePesPacket(0xc0, frame.subarray(0, 7)));
  const newPes = makePesPacket(0xc0, frame);
  const next = makeTsPacket({ pid: 0x101, continuityCounter: 8, payloadUnitStart: true, discontinuity: true, payload: newPes, forcePayloadCapacity: newPes.length });
  const result = probeAudioPackets(...old, next);
  assert.equal(stream(result, 0, 1).codecDetails.status, 'parsed');
});

test('parses priority-like H.264 High 3.0 BT.709 plus AAC-LC headers without MIME or extension input', () => {
  const bytes = buildPriorityLikeH264AacTs({ leadingBytes: Uint8Array.of(0x12, 0x34, 0x56) });
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'complete');
  assert.equal(result.outcome.code, 'MPEG_TS_STRUCTURE_COMPLETE');
  assert.equal(result.bytes.syncOffset, 3);
  assert.deepEqual(result.transportStreamIds, [1]);
  assert.equal(result.programs.length, 1);
  assert.equal(result.programs[0].pmtPid, 0x1000);
  assert.equal(result.programs[0].pcrPid, 0x0100);
  assert.equal(result.trackSummary.total, 2);
  assert.equal(result.trackSummary.elementaryHeadersParsed, 2);

  const video = stream(result, 0, 0);
  assert.equal(video.kind, 'video');
  assert.equal(video.codec, 'h264');
  assert.equal(video.mappingConfidence, 'stream-type-family');
  assert.deepEqual(
    {
      status: video.codecDetails.status,
      source: video.codecDetails.source,
      profile: video.codecDetails.profile,
      level: video.codecDetails.level,
      width: video.codecDetails.width,
      height: video.codecDetails.height,
      primaries: video.codecDetails.color.primaries,
      transfer: video.codecDetails.color.transfer,
      matrix: video.codecDetails.color.matrix,
    },
    {
      status: 'parsed', source: 'annex-b-sps', profile: 'High', level: '3.0',
      width: 1280, height: 720, primaries: 'BT.709', transfer: 'BT.709', matrix: 'BT.709',
    },
  );

  const audio = stream(result, 0, 1);
  assert.equal(audio.kind, 'audio');
  assert.equal(audio.codec, 'aac');
  assert.deepEqual(
    {
      status: audio.codecDetails.status,
      source: audio.codecDetails.source,
      profile: audio.codecDetails.profile,
      sampleRate: audio.codecDetails.sampleRate,
      channels: audio.codecDetails.channels,
    },
    { status: 'parsed', source: 'adts-header', profile: 'AAC LC', sampleRate: 48_000, channels: 2 },
  );
});

test('parses multiple PAT programs and PMTs while leaving private stream types unknown', () => {
  const result = probeMpegTs(buildTwoProgramTs());

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.programs.map(({ programNumber, pmtPid, pcrPid }) => ({ programNumber, pmtPid, pcrPid })), [
    { programNumber: 1, pmtPid: 0x1000, pcrPid: 0x0100 },
    { programNumber: 2, pmtPid: 0x1001, pcrPid: 0x0200 },
  ]);
  assert.equal(stream(result, 1, 0).codec, 'hevc');
  assert.equal(stream(result, 1, 1).codec, null);
  assert.equal(stream(result, 1, 1).mappingConfidence, 'unknown');
  assert.deepEqual(stream(result, 1, 1).descriptorTags, [0x59]);
});

test('reassembles split PAT and PMT sections and honors a non-zero pointer field', () => {
  const result = probeMpegTs(buildPriorityLikeH264AacTs({
    splitPsi: true,
    pointerPadding: Uint8Array.of(0xff, 0xff, 0xff),
    includeElementaryHeaders: false,
  }));

  assert.equal(result.status, 'complete');
  assert.equal(result.psi.patSections, 1);
  assert.equal(result.psi.pmtSections, 1);
  assert.equal(result.trackSummary.total, 2);
  assert.equal(stream(result, 0, 0).codecDetails.status, 'not-observed');
  assert.equal(stream(result, 0, 1).codecDetails.status, 'not-observed');
});

test('parses multiple same-packet PSI sections, stops at stuffing, and keeps section versions separate', () => {
  const patSection0 = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }], { version: 4, sectionNumber: 0, lastSectionNumber: 1 });
  const patSection1 = makePatSection([{ programNumber: 2, pmtPid: 0x1001 }], { version: 4, sectionNumber: 1, lastSectionNumber: 1 });
  const pmt1 = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
  const pmt2 = makePmtSection({ programNumber: 2, pcrPid: 0x200, streams: [{ streamType: 0x0f, elementaryPid: 0x201 }] });
  const patPayload = concatBytes(Uint8Array.of(0), patSection0, patSection1);
  const bytes = concatBytes(
    makeTsPacket({ pid: 0, continuityCounter: 0, payloadUnitStart: true, payload: patPayload, forcePayloadCapacity: 184 }),
    ...packetizePsiSection(0x1000, pmt1),
    ...packetizePsiSection(0x1001, pmt2),
  );
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'complete');
  assert.equal(result.psi.patSections, 2);
  assert.equal(result.psi.patVersion, 4);
  assert.deepEqual(result.programs.map(({ programNumber }) => programNumber), [1, 2]);
});

test('ignores current_next=0 and replaces, rather than merges, changed PAT and PMT versions', () => {
  const patV0 = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }], { version: 0 });
  const futurePat = makePatSection([{ programNumber: 9, pmtPid: 0x1009 }], { version: 7, currentNext: 0 });
  const patV1 = makePatSection([{ programNumber: 3, pmtPid: 0x1003 }], { version: 1 });
  const patV2 = makePatSection([{ programNumber: 2, pmtPid: 0x1001 }], { transportStreamId: 2, version: 2 });
  const pmtV0 = makePmtSection({ programNumber: 2, pcrPid: 0x200, version: 0, streams: [{ streamType: 0x1b, elementaryPid: 0x200 }] });
  const pmtV1 = makePmtSection({ programNumber: 2, pcrPid: 0x201, version: 1, streams: [{ streamType: 0x0f, elementaryPid: 0x201 }] });
  const patPayload = concatBytes(Uint8Array.of(0), patV0, futurePat, patV1, patV2);
  const pmtPayload = concatBytes(Uint8Array.of(0), pmtV0, pmtV1);
  const bytes = concatBytes(
    makeTsPacket({ pid: 0, continuityCounter: 0, payloadUnitStart: true, payload: patPayload, forcePayloadCapacity: 184 }),
    makeTsPacket({ pid: 0x1001, continuityCounter: 0, payloadUnitStart: true, payload: pmtPayload, forcePayloadCapacity: 184 }),
    makeNullPacket(),
  );
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'complete');
  assert.equal(result.psi.patVersion, 2);
  assert.deepEqual(result.transportStreamIds, [2]);
  assert.deepEqual(result.programs.map(({ programNumber }) => programNumber), [2]);
  assert.equal(result.programs[0].pmtVersion, 1);
  assert.equal(result.programs[0].pcrPid, 0x201);
  assert.deepEqual(result.programs[0].streams.map(({ codec }) => codec), ['aac']);
  assert.ok(result.issues.some(({ code }) => code === 'PSI_NOT_CURRENT'));
  assert.ok(result.issues.some(({ code }) => code === 'PAT_VERSION_REPLACED'));
  assert.ok(result.issues.some(({ code }) => code === 'PAT_IDENTITY_REPLACED'));
  assert.ok(result.issues.some(({ code }) => code === 'PMT_VERSION_REPLACED'));
});

test('does not call incomplete PAT or PMT section sets complete', async (t) => {
  await t.test('PAT section set', () => {
    const pat0 = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }], { sectionNumber: 0, lastSectionNumber: 1 });
    const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
    const result = probeMpegTs(concatBytes(...packetizePsiSection(0, pat0), ...packetizePsiSection(0x1000, pmt), makeNullPacket()));
    assert.equal(result.status, 'incomplete');
    assert.equal(result.psi.patComplete, false);
  });

  await t.test('PMT section set', () => {
    const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
    const pmt0 = makePmtSection({
      programNumber: 1, pcrPid: 0x100, sectionNumber: 0, lastSectionNumber: 1,
      streams: [{ streamType: 0x1b, elementaryPid: 0x100 }],
    });
    const result = probeMpegTs(concatBytes(...packetizePsiSection(0, pat), ...packetizePsiSection(0x1000, pmt0), makeNullPacket()));
    assert.equal(result.status, 'incomplete');
    assert.equal(result.programs[0].pmtStatus, 'incomplete');
    assert.equal(result.programs[0].streams.length, 0);
  });
});

test('adaptation discontinuity resets an incomplete PSI section before a continuity jump', () => {
  const result = probeMpegTs(buildDiscontinuityRecoveryTs());

  assert.equal(result.status, 'complete');
  assert.equal(result.programs.length, 1);
  assert.ok(result.issues.some(({ code }) => code === 'PSI_DISCONTINUITY_RESET'));
  assert.ok(!result.issues.some(({ code }) => code === 'PSI_CONTINUITY_GAP'));
});

test('adaptation-only packets do not advance PSI payload continuity', () => {
  const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
  const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
  const patPackets = packetizePsiSection(0, pat, { firstPayloadCapacity: 8, continuitySequence: [0, 1] });
  const adaptationOnly = new Uint8Array(188).fill(0xff);
  adaptationOnly.set([0x47, 0x00, 0x00, 0x20, 0xb7, 0x00], 0);
  const result = probeMpegTs(concatBytes(patPackets[0], adaptationOnly, patPackets[1], ...packetizePsiSection(0x1000, pmt)));

  assert.equal(result.status, 'complete');
  assert.ok(!result.issues.some(({ code }) => code === 'PSI_CONTINUITY_GAP'));
});

test('identical duplicate PSI payload is ignored but conflicting duplicate invalidates partial state', async (t) => {
  const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
  const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
  const patPackets = packetizePsiSection(0, pat, { firstPayloadCapacity: 8, continuitySequence: [0, 1] });

  await t.test('identical duplicate', () => {
    const result = probeMpegTs(concatBytes(patPackets[0], patPackets[0], patPackets[1], ...packetizePsiSection(0x1000, pmt)));
    assert.equal(result.status, 'complete');
    assert.ok(result.issues.some(({ code }) => code === 'PSI_DUPLICATE_PAYLOAD'));
  });

  await t.test('conflicting duplicate', () => {
    const conflicting = patPackets[0].slice();
    conflicting[187] ^= 1;
    const result = probeMpegTs(concatBytes(patPackets[0], conflicting, patPackets[1], ...packetizePsiSection(0x1000, pmt)));
    assert.equal(result.status, 'malformed');
    assert.ok(result.issues.some(({ code }) => code === 'PSI_CONFLICTING_DUPLICATE'));
    assert.equal(result.programs.length, 0);
  });
});

test('continuity gaps without a discontinuity indicator are malformed and do not stitch sections', () => {
  const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
  const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
  const bytes = concatBytes(
    ...packetizePsiSection(0, pat, { firstPayloadCapacity: 8, continuitySequence: [0, 3] }),
    ...packetizePsiSection(0x1000, pmt),
  );
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'malformed');
  assert.ok(result.issues.some(({ code }) => code === 'PSI_CONTINUITY_GAP'));
  assert.equal(result.programs.length, 0);
});

test('rejects stray sync bytes that do not form a robust 188-byte cadence', () => {
  const bytes = new Uint8Array(700).fill(0x22);
  bytes[5] = 0x47;
  bytes[211] = 0x47;
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'not-mpeg-ts');
  assert.equal(result.outcome.code, 'TS_SYNC_NOT_FOUND');
  assert.equal(result.bytes.packetsParsed, 0);
});

test('requires at least three aligned complete packets for initial sync', () => {
  const twoPackets = buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }).subarray(0, 2 * 188);
  const result = probeMpegTs(twoPackets);
  assert.equal(result.status, 'not-mpeg-ts');
  assert.equal(result.bytes.packetsParsed, 0);
});

test('ignores a bounded final partial packet without reading beyond supplied bytes', () => {
  const complete = buildPriorityLikeH264AacTs();
  const view = new Uint8Array(complete.length + 64).fill(0x47);
  view.set(complete, 13);
  const supplied = view.subarray(13, 13 + complete.length - 17);
  const result = probeMpegTs(supplied);

  assert.equal(result.status, 'complete');
  assert.equal(result.outcome.code, 'MPEG_TS_STRUCTURE_COMPLETE');
  assert.equal(result.bytes.supplied, supplied.length);
  assert.equal(result.bytes.inspected + result.bytes.trailingBytes, supplied.length);
  assert.equal(result.bytes.trailingBytes, 171);
  assert.ok(result.issues.some(({ code }) => code === 'TRAILING_PARTIAL_PACKET_IGNORED'));
});

test('reports bytes ending inside a recognized PSI section as truncated', () => {
  const complete = buildPriorityLikeH264AacTs({ splitPsi: true, includeElementaryHeaders: false });
  const result = probeMpegTs(complete.subarray(0, complete.length - 2 * 188));

  assert.equal(result.status, 'truncated');
  assert.equal(result.outcome.code, 'TRUNCATED_MPEG_TS');
  assert.equal(result.psi.patSections, 1);
  assert.equal(result.psi.pmtSections, 0);
});

test('fails closed on CRC mismatch even when the PMT remains available', () => {
  const bytes = buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }).slice();
  bytes[187] ^= 0x01;
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'malformed');
  assert.ok(result.issues.some(({ code, tableId }) => code === 'PSI_CRC_MISMATCH' && tableId === 0));
  assert.equal(result.programs.length, 0);
});

test('reports malformed section lengths explicitly', () => {
  const bytes = buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }).slice();
  const start = payloadOffset(bytes);
  bytes[start + 2] = 0;
  bytes[start + 3] = 0;
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'malformed');
  assert.ok(result.issues.some(({ code }) => code === 'PSI_SECTION_LENGTH_INVALID'));
});

test('invalid adaptation length, pointer field, and transport error indicator are explicit', async (t) => {
  const valid = buildPriorityLikeH264AacTs({ includeElementaryHeaders: false });

  await t.test('adaptation length', () => {
    const bytes = valid.slice();
    bytes[4] = 183;
    const result = probeMpegTs(bytes);
    assert.equal(result.status, 'malformed');
    assert.ok(result.issues.some(({ code }) => code === 'ADAPTATION_FIELD_TRUNCATED'));
  });

  await t.test('pointer field', () => {
    const invalidPointer = makeTsPacket({ pid: 0, continuityCounter: 0, payloadUnitStart: true, payload: Uint8Array.of(184), forcePayloadCapacity: 184 });
    const result = probeMpegTs(concatBytes(invalidPointer, valid));
    assert.equal(result.status, 'malformed');
    assert.ok(result.issues.some(({ code }) => code === 'PSI_POINTER_OUT_OF_RANGE'));
  });

  await t.test('transport error', () => {
    const bytes = valid.slice();
    bytes[1] |= 0x80;
    const result = probeMpegTs(bytes);
    assert.equal(result.status, 'malformed');
    assert.ok(result.issues.some(({ code }) => code === 'TRANSPORT_ERROR_INDICATOR'));
    assert.equal(result.programs.length, 0);
  });
});

test('elementary duplicate continuity accepts only byte-identical payloads', async (t) => {
  const bytes = buildPriorityLikeH264AacTs();
  const packets = [];
  for (let offset = 0; offset < bytes.length; offset += 188) packets.push(bytes.subarray(offset, offset + 188));

  await t.test('identical payload', () => {
    const result = probeMpegTs(concatBytes(packets[0], packets[1], packets[2], packets[2], ...packets.slice(3)));
    assert.equal(result.status, 'complete');
    assert.equal(stream(result, 0, 0).codecDetails.status, 'parsed');
    assert.ok(!result.issues.some(({ code }) => code === 'ELEMENTARY_CONFLICTING_DUPLICATE'));
  });

  await t.test('conflicting payload', () => {
    const conflicting = packets[2].slice();
    conflicting[187] ^= 1;
    const result = probeMpegTs(concatBytes(packets[0], packets[1], packets[2], conflicting, ...packets.slice(3)));
    assert.equal(result.status, 'malformed');
    assert.equal(stream(result, 0, 0).codecDetails.status, 'incomplete');
    assert.ok(result.issues.some(({ code }) => code === 'ELEMENTARY_CONFLICTING_DUPLICATE'));
  });
});

test('reports encrypted PSI as unsupported rather than guessing topology', () => {
  const pat = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }]);
  const pmt = makePmtSection({ programNumber: 1, pcrPid: 0x100, streams: [{ streamType: 0x1b, elementaryPid: 0x100 }] });
  const pmtPayload = concatBytes(Uint8Array.of(0), pmt);
  const bytes = concatBytes(
    ...packetizePsiSection(0, pat),
    makeTsPacket({ pid: 0x1000, continuityCounter: 0, payloadUnitStart: true, scrambling: 2, payload: pmtPayload }),
    makeNullPacket(),
  );
  const result = probeMpegTs(bytes);

  assert.equal(result.status, 'unsupported');
  assert.equal(result.outcome.code, 'UNSUPPORTED_TS_FEATURE');
  assert.equal(result.programs[0].pmtStatus, 'not-observed');
});

test('hard byte, packet, program, and elementary sample limits are explicit', async (t) => {
  await t.test('byte limit refuses the input without scanning', () => {
    const bytes = buildPriorityLikeH264AacTs();
    const result = probeMpegTs(bytes, { limits: { maxBytes: bytes.length - 1 } });
    assert.equal(result.status, 'limit-exceeded');
    assert.equal(result.outcome.code, 'BYTE_LIMIT_EXCEEDED');
    assert.equal(result.bytes.inspected, 0);
  });

  await t.test('packet limit stops packet parsing', () => {
    const result = probeMpegTs(buildPriorityLikeH264AacTs(), { limits: { maxPackets: 2 } });
    assert.equal(result.status, 'limit-exceeded');
    assert.ok(result.issues.some(({ code }) => code === 'PACKET_LIMIT_REACHED'));
    assert.equal(result.bytes.packetsParsed, 2);
  });

  await t.test('program limit does not silently drop extra programs', () => {
    const result = probeMpegTs(buildTwoProgramTs(), { limits: { maxPrograms: 1 } });
    assert.equal(result.status, 'limit-exceeded');
    assert.ok(result.issues.some(({ code }) => code === 'PROGRAM_LIMIT_REACHED'));
    assert.equal(result.programs.length, 1);
  });

  await t.test('section limit is explicit even for complete same-packet sections', () => {
    const first = makePatSection([{ programNumber: 1, pmtPid: 0x1000 }], { sectionNumber: 0, lastSectionNumber: 1 });
    const second = makePatSection([{ programNumber: 2, pmtPid: 0x1001 }], { sectionNumber: 1, lastSectionNumber: 1 });
    const packet = makeTsPacket({ pid: 0, continuityCounter: 0, payloadUnitStart: true, payload: concatBytes(Uint8Array.of(0), first, second), forcePayloadCapacity: 184 });
    const result = probeMpegTs(concatBytes(packet, packet, makeNullPacket()), { limits: { maxSections: 1 } });
    assert.equal(result.status, 'limit-exceeded');
    assert.ok(result.issues.some(({ code }) => code === 'SECTION_LIMIT_REACHED'));
  });

  await t.test('stream limit is explicit', () => {
    const result = probeMpegTs(buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }), { limits: { maxStreamsPerProgram: 1 } });
    assert.equal(result.status, 'limit-exceeded');
    assert.ok(result.issues.some(({ code }) => code === 'STREAM_LIMIT_REACHED'));
  });

  await t.test('elementary sample limit prevents detail overclaiming', () => {
    const result = probeMpegTs(buildPriorityLikeH264AacTs(), { limits: { maxElementaryBytesPerStream: 2 } });
    assert.equal(result.status, 'complete');
    assert.equal(stream(result, 0, 0).codecDetails.status, 'limit-exceeded');
    assert.equal(stream(result, 0, 1).codecDetails.status, 'limit-exceeded');
  });
});

test('truncated ADTS and SPS headers are explicit and never promoted from PMT family mapping', () => {
  const full = buildPriorityLikeH264AacTs();
  const packetCount = full.length / 188;
  assert.ok(Number.isInteger(packetCount));

  const withoutLastAudioContinuation = full.subarray(0, full.length - 188);
  const audioResult = probeMpegTs(withoutLastAudioContinuation);
  assert.equal(audioResult.status, 'complete');
  assert.equal(stream(audioResult, 0, 1).codec, 'aac');
  assert.equal(stream(audioResult, 0, 1).codecDetails.status, 'incomplete');
  assert.equal(stream(audioResult, 0, 1).codecDetails.profile, undefined);

  const topologyOnly = probeMpegTs(buildPriorityLikeH264AacTs({ includeElementaryHeaders: false }));
  assert.equal(topologyOnly.status, 'complete');
  assert.equal(stream(topologyOnly, 0, 0).codec, 'h264');
  assert.equal(stream(topologyOnly, 0, 0).codecDetails.status, 'not-observed');
  assert.equal(stream(topologyOnly, 0, 0).codecDetails.profile, undefined);
});
