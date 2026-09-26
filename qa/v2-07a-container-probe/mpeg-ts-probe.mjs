const TS_PACKET_BYTES = 188;
const ABSOLUTE_LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxPackets: 65_536,
  maxResyncBytes: TS_PACKET_BYTES * 128,
  maxSectionBytes: 1_024,
  maxSections: 1_024,
  maxPrograms: 256,
  maxStreamsPerProgram: 256,
  maxTotalStreams: 1_024,
  maxElementaryBytesPerStream: 256 * 1024,
  maxIssues: 512,
});

export const DEFAULT_MPEG_TS_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxPackets: 16_384,
  maxResyncBytes: TS_PACKET_BYTES * 32,
  maxSectionBytes: 1_024,
  maxSections: 256,
  maxPrograms: 64,
  maxStreamsPerProgram: 64,
  maxTotalStreams: 256,
  maxElementaryBytesPerStream: 64 * 1024,
  maxIssues: 128,
});

const STREAM_TYPES = Object.freeze({
  0x01: ['video', 'mpeg-1-video'],
  0x02: ['video', 'mpeg-2-video'],
  0x03: ['audio', 'mpeg-1-audio'],
  0x04: ['audio', 'mpeg-2-audio'],
  0x0f: ['audio', 'aac'],
  0x10: ['video', 'mpeg-4-part-2'],
  0x11: ['audio', 'aac-latm'],
  0x1b: ['video', 'h264'],
  0x24: ['video', 'hevc'],
  0x2d: ['video', 'mpeg-h-part-2'],
});

const H264_PROFILES = Object.freeze({
  44: 'CAVLC 4:4:4 Intra',
  66: 'Baseline',
  77: 'Main',
  83: 'Scalable Baseline',
  86: 'Scalable High',
  88: 'Extended',
  100: 'High',
  110: 'High 10',
  118: 'Multiview High',
  122: 'High 4:2:2',
  128: 'Stereo High',
  134: 'MFC High',
  135: 'MFC Depth High',
  138: 'Multiview Depth High',
  139: 'Enhanced Multiview Depth High',
  244: 'High 4:4:4 Predictive',
});

const H264_HIGH_PROFILE_IDS = new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]);
const SAMPLE_RATES = Object.freeze([96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350]);
const AAC_OBJECT_TYPES = Object.freeze({ 1: 'AAC Main', 2: 'AAC LC', 3: 'AAC SSR', 4: 'AAC LTP' });
const CHANNEL_CONFIGS = Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 8 });

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

function resolveLimits(options) {
  const requested = options?.limits ?? {};
  const limits = {};
  for (const [name, fallback] of Object.entries(DEFAULT_MPEG_TS_LIMITS)) {
    const value = requested[name] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > ABSOLUTE_LIMITS[name]) {
      throw new RangeError(`${name} must be a positive safe integer no greater than ${ABSOLUTE_LIMITS[name]}`);
    }
    limits[name] = value;
  }
  return Object.freeze(limits);
}

function baseResult(bytes, limits) {
  return {
    schemaVersion: 1,
    probe: 'bounded-mpeg-ts-container',
    container: 'mpeg-ts',
    status: 'incomplete',
    outcome: { code: 'UNCLASSIFIED', message: 'No outcome was assigned.' },
    limits: { ...limits },
    bytes: {
      supplied: bytes?.byteLength ?? 0,
      inspected: 0,
      packetSize: TS_PACKET_BYTES,
      syncOffset: null,
      packetsParsed: 0,
      resyncBytes: 0,
      trailingBytes: 0,
    },
    psi: { sectionsExamined: 0, sectionsValid: 0, patSections: 0, pmtSections: 0, patVersion: null, patComplete: false, crcChecked: true },
    transportStreamIds: [],
    networkPids: [],
    programs: [],
    trackSummary: { total: 0, video: 0, audio: 0, other: 0, elementaryHeadersParsed: 0 },
    issues: [],
  };
}

function issueSink(result, limits) {
  let omitted = 0;
  const add = (severity, code, message, context = {}) => {
    if (result.issues.length < limits.maxIssues) result.issues.push({ severity, code, message, ...context });
    else omitted += 1;
  };
  add.finish = () => {
    if (omitted > 0) {
      const summary = { severity: 'limit', code: 'ISSUE_LIMIT_REACHED', message: 'Additional issues were omitted.', omitted };
      if (result.issues.length >= limits.maxIssues) result.issues[result.issues.length - 1] = summary;
      else result.issues.push(summary);
    }
  };
  return add;
}

function findSync(bytes, start, maxDistance) {
  const finalCandidate = Math.min(bytes.length - TS_PACKET_BYTES * 3, start + maxDistance);
  for (let offset = start; offset <= finalCandidate; offset += 1) {
    if (bytes[offset] !== 0x47) continue;
    const packetsAvailable = Math.floor((bytes.length - offset) / TS_PACKET_BYTES);
    const checks = Math.min(4, packetsAvailable);
    if (checks < 3) continue;
    let valid = true;
    for (let index = 1; index < checks; index += 1) {
      if (bytes[offset + index * TS_PACKET_BYTES] !== 0x47) {
        valid = false;
        break;
      }
    }
    if (valid) return offset;
  }
  return -1;
}

export function crc32Mpeg2(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000_0000) !== 0 ? ((crc << 1) ^ 0x04c1_1db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function codecMapping(streamType) {
  const mapping = STREAM_TYPES[streamType];
  return mapping
    ? { kind: mapping[0], codec: mapping[1], codecFamily: mapping[1], mappingConfidence: 'stream-type-family' }
    : { kind: 'other', codec: null, codecFamily: null, mappingConfidence: 'unknown' };
}

function parseDescriptorLoop(bytes, start, length) {
  const tags = [];
  const end = start + length;
  let offset = start;
  while (offset < end) {
    if (offset + 2 > end) return { ok: false, tags };
    const tag = bytes[offset];
    const descriptorLength = bytes[offset + 1];
    if (offset + 2 + descriptorLength > end) return { ok: false, tags };
    tags.push(tag);
    offset += 2 + descriptorLength;
  }
  return { ok: offset === end, tags };
}

function resetPatTopology(state) {
  state.programs.clear();
  state.pmtPids.clear();
  state.networkPids.clear();
  state.esStates.clear();
  state.totalStreams = 0;
  for (const pid of [...state.assemblers.keys()]) if (pid !== 0) state.assemblers.delete(pid);
}

function psiSetComplete(set) {
  if (!set || set.sections.size !== set.lastSectionNumber + 1) return false;
  for (let sectionNumber = 0; sectionNumber <= set.lastSectionNumber; sectionNumber += 1) {
    if (!set.sections.has(sectionNumber)) return false;
  }
  return true;
}

function syncElementaryStates(state) {
  const desired = new Map();
  for (const program of state.programs.values()) {
    for (const stream of program.pmt?.streams ?? []) desired.set(stream.elementaryPid, stream.streamType);
  }
  for (const pid of [...state.esStates.keys()]) if (!desired.has(pid)) state.esStates.delete(pid);
  for (const [pid, streamType] of desired) {
    const existing = state.esStates.get(pid);
    if (existing?.streamType === streamType) continue;
    state.esStates.set(pid, {
      streamType,
      bytes: [],
      currentPes: null,
      lastPayloadCc: null,
      lastPayload: null,
      continuityLost: false,
      truncated: false,
      limitHit: false,
    });
  }
}

function parsePat(section, state, add, packetIndex) {
  if (section.length < 12 || (section[1] & 0x80) === 0) {
    add('malformed', 'PAT_STRUCTURE_INVALID', 'PAT section is shorter than its mandatory syntax.', { packetIndex, pid: 0 });
    return;
  }
  const entriesEnd = section.length - 4;
  if ((entriesEnd - 8) % 4 !== 0) {
    add('malformed', 'PAT_PROGRAM_LOOP_INVALID', 'PAT program loop is not a whole number of entries.', { packetIndex, pid: 0 });
    return;
  }
  const transportStreamId = (section[3] << 8) | section[4];
  const version = (section[5] >> 1) & 0x1f;
  const sectionNumber = section[6];
  const lastSectionNumber = section[7];
  if (sectionNumber > lastSectionNumber) {
    add('malformed', 'PAT_SECTION_NUMBER_INVALID', 'PAT section_number exceeds last_section_number.', { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
    return;
  }
  const identityChanged = state.patSet && (state.patSet.transportStreamId !== transportStreamId || state.patSet.version !== version);
  if (identityChanged) {
    add('warning', state.patSet.transportStreamId === transportStreamId ? 'PAT_VERSION_REPLACED' : 'PAT_IDENTITY_REPLACED', 'A distinct current PAT identity replaced the previously observed topology.', {
      packetIndex, pid: 0, previousTransportStreamId: state.patSet.transportStreamId, transportStreamId,
      previousVersion: state.patSet.version, version,
    });
    resetPatTopology(state);
    state.patSet = null;
  }
  if (!state.patSet) {
    state.patSet = { transportStreamId, version, lastSectionNumber, sections: new Map() };
    state.transportStreamIds.clear();
    state.transportStreamIds.add(transportStreamId);
  } else if (state.patSet.lastSectionNumber !== lastSectionNumber) {
    add('malformed', 'PAT_LAST_SECTION_CHANGED', 'PAT sections with one identity disagree on last_section_number.', { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
    return;
  }
  const priorSection = state.patSet.sections.get(sectionNumber);
  if (priorSection) {
    if (equalBytes(priorSection, section)) add('warning', 'PAT_SECTION_DUPLICATE', 'Byte-identical PAT section was ignored.', { packetIndex, pid: 0, sectionNumber });
    else add('malformed', 'PAT_SECTION_CONFLICT', 'PAT section number repeated with different bytes.', { packetIndex, pid: 0, sectionNumber });
    return;
  }
  state.patSet.sections.set(sectionNumber, Uint8Array.from(section));
  state.patVersion = version;
  for (let offset = 8; offset < entriesEnd; offset += 4) {
    const programNumber = (section[offset] << 8) | section[offset + 1];
    const pid = ((section[offset + 2] & 0x1f) << 8) | section[offset + 3];
    if (programNumber === 0) {
      state.networkPids.add(pid);
      continue;
    }
    if (!state.programs.has(programNumber) && state.programs.size >= state.limits.maxPrograms) {
      state.limitHit = true;
      add('limit', 'PROGRAM_LIMIT_REACHED', 'PAT declared more programs than the configured limit.', { packetIndex, pid: 0 });
      continue;
    }
    const prior = state.programs.get(programNumber);
    if (prior && prior.pmtPid !== pid) {
      add('malformed', 'PAT_PROGRAM_PID_CHANGED', 'A program maps to conflicting PMT PIDs in one PAT identity.', { packetIndex, pid: 0, programNumber });
      continue;
    }
    if (!prior) state.programs.set(programNumber, { programNumber, pmtPid: pid, pmt: null, pmtSet: null });
    state.pmtPids.add(pid);
  }
}

function parsePmt(section, state, add, packetIndex, packetPid) {
  if (section.length < 16 || (section[1] & 0x80) === 0) {
    add('malformed', 'PMT_STRUCTURE_INVALID', 'PMT section is shorter than its mandatory syntax.', { packetIndex, pid: packetPid });
    return;
  }
  const programNumber = (section[3] << 8) | section[4];
  const version = (section[5] >> 1) & 0x1f;
  const sectionNumber = section[6];
  const lastSectionNumber = section[7];
  const program = state.programs.get(programNumber);
  if (!program || program.pmtPid !== packetPid) {
    add('malformed', 'PMT_PROGRAM_MISMATCH', 'PMT table-id-extension does not match the current PAT mapping.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  if (sectionNumber > lastSectionNumber) {
    add('malformed', 'PMT_SECTION_NUMBER_INVALID', 'PMT section_number exceeds last_section_number.', { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
    return;
  }
  if (program.pmtSet && program.pmtSet.version !== version) {
    add('warning', 'PMT_VERSION_REPLACED', 'A distinct current PMT version replaced the previous stream topology.', { packetIndex, pid: packetPid, programNumber, previousVersion: program.pmtSet.version, version });
    program.pmtSet = null;
    program.pmt = null;
    state.totalStreams = [...state.programs.values()].reduce((sum, entry) => sum + (entry.pmt?.streams.length ?? 0), 0);
    syncElementaryStates(state);
  }
  if (!program.pmtSet) program.pmtSet = { version, lastSectionNumber, sections: new Map(), parts: new Map() };
  else if (program.pmtSet.lastSectionNumber !== lastSectionNumber) {
    add('malformed', 'PMT_LAST_SECTION_CHANGED', 'PMT sections with one identity disagree on last_section_number.', { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
    return;
  }
  const priorSection = program.pmtSet.sections.get(sectionNumber);
  if (priorSection) {
    if (equalBytes(priorSection, section)) add('warning', 'PMT_SECTION_DUPLICATE', 'Byte-identical PMT section was ignored.', { packetIndex, pid: packetPid, programNumber, sectionNumber });
    else add('malformed', 'PMT_SECTION_CONFLICT', 'PMT section number repeated with different bytes.', { packetIndex, pid: packetPid, programNumber, sectionNumber });
    return;
  }
  const pcrPid = ((section[8] & 0x1f) << 8) | section[9];
  const programInfoLength = ((section[10] & 0x0f) << 8) | section[11];
  const crcStart = section.length - 4;
  let offset = 12;
  if (offset + programInfoLength > crcStart) {
    add('malformed', 'PMT_PROGRAM_INFO_TRUNCATED', 'PMT program descriptor loop exceeds the section.', { packetIndex, pid: packetPid });
    return;
  }
  const programDescriptors = parseDescriptorLoop(section, offset, programInfoLength);
  if (!programDescriptors.ok) {
    add('malformed', 'PMT_PROGRAM_DESCRIPTOR_INVALID', 'PMT program descriptor loop is malformed.', { packetIndex, pid: packetPid });
    return;
  }
  offset += programInfoLength;
  const streams = [];
  while (offset < crcStart) {
    if (offset + 5 > crcStart) {
      add('malformed', 'PMT_STREAM_ENTRY_TRUNCATED', 'PMT stream entry is truncated.', { packetIndex, pid: packetPid });
      return;
    }
    const streamType = section[offset];
    const elementaryPid = ((section[offset + 1] & 0x1f) << 8) | section[offset + 2];
    const esInfoLength = ((section[offset + 3] & 0x0f) << 8) | section[offset + 4];
    if (offset + 5 + esInfoLength > crcStart) {
      add('malformed', 'PMT_ES_INFO_TRUNCATED', 'PMT elementary descriptor loop exceeds the section.', { packetIndex, pid: packetPid, programNumber });
      return;
    }
    const descriptors = parseDescriptorLoop(section, offset + 5, esInfoLength);
    if (!descriptors.ok) {
      add('malformed', 'PMT_ES_DESCRIPTOR_INVALID', 'PMT elementary descriptor loop is malformed.', { packetIndex, pid: packetPid, programNumber, elementaryPid });
      return;
    }
    streams.push({ streamType, streamTypeHex: `0x${streamType.toString(16).padStart(2, '0')}`, elementaryPid, descriptorTags: descriptors.tags, ...codecMapping(streamType) });
    offset += 5 + esInfoLength;
  }
  program.pmtSet.sections.set(sectionNumber, Uint8Array.from(section));
  program.pmtSet.parts.set(sectionNumber, { pcrPid, programDescriptorTags: programDescriptors.tags, streams });
  if (!psiSetComplete(program.pmtSet)) return;
  const orderedParts = [...program.pmtSet.parts.entries()].sort(([left], [right]) => left - right).map(([, part]) => part);
  if (orderedParts.some((part) => part.pcrPid !== orderedParts[0].pcrPid)) {
    add('malformed', 'PMT_PCR_PID_CONFLICT', 'PMT sections with one identity disagree on PCR PID.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  const aggregateStreams = orderedParts.flatMap((part) => part.streams);
  const uniquePids = new Set();
  for (const stream of aggregateStreams) {
    if (uniquePids.has(stream.elementaryPid)) {
      add('malformed', 'PMT_ELEMENTARY_PID_DUPLICATE', 'PMT repeats an elementary PID across its current section set.', { packetIndex, pid: packetPid, programNumber, elementaryPid: stream.elementaryPid });
      return;
    }
    uniquePids.add(stream.elementaryPid);
  }
  const otherStreamCount = [...state.programs.values()].reduce((sum, entry) => sum + (entry === program ? 0 : (entry.pmt?.streams.length ?? 0)), 0);
  if (aggregateStreams.length > state.limits.maxStreamsPerProgram || otherStreamCount + aggregateStreams.length > state.limits.maxTotalStreams) {
    state.limitHit = true;
    add('limit', 'STREAM_LIMIT_REACHED', 'Complete PMT section set declared more streams than the configured limit.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  program.pmt = { version, pcrPid: orderedParts[0].pcrPid, programDescriptorTags: orderedParts[0].programDescriptorTags, streams: aggregateStreams };
  state.totalStreams = otherStreamCount + aggregateStreams.length;
  syncElementaryStates(state);
}

function acceptSection(section, state, add, packetIndex, pid) {
  if (state.sectionsExamined >= state.limits.maxSections) {
    state.limitHit = true;
    add('limit', 'SECTION_LIMIT_REACHED', 'PSI section count exceeded the configured limit.', { packetIndex, pid });
    return;
  }
  state.sectionsExamined += 1;
  if (crc32Mpeg2(section) !== 0) {
    add('malformed', 'PSI_CRC_MISMATCH', 'PSI section failed the MPEG-2 CRC check.', { packetIndex, pid, tableId: section[0] });
    return;
  }
  if ((section[5] & 0x01) === 0) {
    add('warning', 'PSI_NOT_CURRENT', 'A complete PSI section is marked not-current and was ignored.', { packetIndex, pid, tableId: section[0] });
    return;
  }
  state.sectionsValid += 1;
  if (pid === 0 && section[0] === 0x00) parsePat(section, state, add, packetIndex);
  else if (state.pmtPids.has(pid) && section[0] === 0x02) parsePmt(section, state, add, packetIndex, pid);
  else add('warning', 'PSI_TABLE_UNEXPECTED', 'A complete PSI section has an unexpected table id for its PID.', { packetIndex, pid, tableId: section[0] });
}

function newAssembler() {
  return { pending: [], expectedLength: null, lastPayloadCc: null, lastPayload: null, incomplete: false };
}

function equalBytes(left, right) {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function appendPsiBytes(assembler, chunk, state, add, packetIndex, pid) {
  let offset = 0;
  while (offset < chunk.length) {
    if (assembler.pending.length === 0 && chunk[offset] === 0xff) return;
    if (assembler.expectedLength === null) {
      const needed = 3 - assembler.pending.length;
      const take = Math.min(needed, chunk.length - offset);
      for (let index = 0; index < take; index += 1) assembler.pending.push(chunk[offset + index]);
      offset += take;
      if (assembler.pending.length < 3) return;
      const sectionLength = ((assembler.pending[1] & 0x0f) << 8) | assembler.pending[2];
      assembler.expectedLength = 3 + sectionLength;
      if (sectionLength < 4 || assembler.expectedLength > state.limits.maxSectionBytes) {
        add('malformed', 'PSI_SECTION_LENGTH_INVALID', 'PSI section length is outside the configured or structural bounds.', { packetIndex, pid, sectionLength });
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.incomplete = false;
        return;
      }
    }
    const remaining = assembler.expectedLength - assembler.pending.length;
    const take = Math.min(remaining, chunk.length - offset);
    for (let index = 0; index < take; index += 1) assembler.pending.push(chunk[offset + index]);
    offset += take;
    if (assembler.pending.length === assembler.expectedLength) {
      acceptSection(Uint8Array.from(assembler.pending), state, add, packetIndex, pid);
      assembler.pending = [];
      assembler.expectedLength = null;
      assembler.incomplete = false;
    } else {
      assembler.incomplete = true;
      return;
    }
  }
}

export function feedMpegTsPsi(pid, payload, payloadUnitStart, continuityCounter, discontinuity, state, add, packetIndex) {
  let assembler = state.assemblers.get(pid);
  if (!assembler) {
    assembler = newAssembler();
    state.assemblers.set(pid, assembler);
  }
  if (discontinuity) {
    if (assembler.pending.length > 0) add('warning', 'PSI_DISCONTINUITY_RESET', 'An adaptation-field discontinuity discarded an incomplete PSI section.', { packetIndex, pid });
    assembler.pending = [];
    assembler.expectedLength = null;
    assembler.incomplete = false;
    assembler.lastPayloadCc = null;
    assembler.lastPayload = null;
  }
  if (assembler.lastPayloadCc !== null) {
    const expected = (assembler.lastPayloadCc + 1) & 0x0f;
    if (continuityCounter === assembler.lastPayloadCc) {
      if (equalBytes(assembler.lastPayload, payload)) {
        add('warning', 'PSI_DUPLICATE_PAYLOAD', 'Byte-identical duplicate PSI payload was ignored conservatively.', { packetIndex, pid, continuityCounter });
      } else {
        add('malformed', 'PSI_CONFLICTING_DUPLICATE', 'A repeated PSI continuity counter carried different payload bytes; partial state was discarded.', { packetIndex, pid, continuityCounter });
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.incomplete = false;
        assembler.lastPayload = Uint8Array.from(payload);
      }
      return;
    }
    if (continuityCounter !== expected) {
      add('malformed', 'PSI_CONTINUITY_GAP', 'PSI payload continuity counter skipped without a discontinuity indicator.', { packetIndex, pid, expected, actual: continuityCounter });
      assembler.pending = [];
      assembler.expectedLength = null;
      assembler.incomplete = false;
      if (!payloadUnitStart) {
        assembler.lastPayloadCc = continuityCounter;
        return;
      }
    }
  }
  assembler.lastPayloadCc = continuityCounter;
  assembler.lastPayload = Uint8Array.from(payload);
  if (!payloadUnitStart) {
    if (assembler.pending.length > 0) appendPsiBytes(assembler, payload, state, add, packetIndex, pid);
    return;
  }
  if (payload.length < 1) {
    add('malformed', 'PSI_POINTER_MISSING', 'Payload-unit-start packet has no pointer field.', { packetIndex, pid });
    return;
  }
  const pointer = payload[0];
  if (1 + pointer > payload.length) {
    add('malformed', 'PSI_POINTER_OUT_OF_RANGE', 'PSI pointer field exceeds the packet payload.', { packetIndex, pid, pointer });
    assembler.pending = [];
    assembler.expectedLength = null;
    return;
  }
  if (assembler.pending.length > 0) {
    appendPsiBytes(assembler, payload.subarray(1, 1 + pointer), state, add, packetIndex, pid);
    if (assembler.pending.length > 0) {
      add('malformed', 'PSI_POINTER_LEFT_SECTION_INCOMPLETE', 'Pointer field starts a new section before the previous section completed.', { packetIndex, pid, pointer });
      assembler.pending = [];
      assembler.expectedLength = null;
    }
  }
  appendPsiBytes(assembler, payload.subarray(1 + pointer), state, add, packetIndex, pid);
}

// Shared PSI state/assembly primitives; the bounded file probe and stricter
// streaming QA owner apply their own lifecycle and acceptance policies.
const feedPsi = feedMpegTsPsi;
export { psiSetComplete as isMpegTsPsiSetComplete };
export function createMpegTsPsiState(limits) {
  return {
    limits, assemblers: new Map(), pmtPids: new Set(), programs: new Map(), esStates: new Map(),
    transportStreamIds: new Set(), networkPids: new Set(), sectionsExamined: 0, sectionsValid: 0,
    patSet: null, patVersion: null, totalStreams: 0, limitHit: false, unsupported: false,
  };
}

function appendElementary(state, bytes, limits) {
  const room = limits.maxElementaryBytesPerStream - state.bytes.length;
  if (room <= 0) {
    state.limitHit = true;
    return;
  }
  const take = Math.min(room, bytes.length);
  for (let index = 0; index < take; index += 1) state.bytes.push(bytes[index]);
  if (take < bytes.length) state.limitHit = true;
}

function resetElementarySegment(esState) {
  esState.currentPes = null;
  esState.lastPayloadCc = null;
  esState.lastPayload = null;
  // A signalled discontinuity permits a new segment, never stitching across it.
  // Unexpected loss remains sticky for this bounded probe.
  esState.bytes = [];
  esState.truncated = false;
}

function appendPesPayload(esState, payload, limits) {
  const pes = esState.currentPes;
  const take = pes.remaining === null ? payload.length : Math.min(pes.remaining, payload.length);
  appendElementary(esState, payload.slice(0, take), limits);
  if (pes.remaining !== null) pes.remaining -= take;
}

function feedElementary(esState, payload, payloadUnitStart, continuityCounter, discontinuity, limits, add, packetIndex, pid) {
  if (discontinuity) resetElementarySegment(esState);
  if (esState.lastPayloadCc !== null) {
    const expected = (esState.lastPayloadCc + 1) & 0x0f;
    if (continuityCounter === esState.lastPayloadCc) {
      if (!equalBytes(esState.lastPayload, payload)) {
        esState.currentPes = null;
        esState.truncated = true;
        esState.continuityLost = true;
        esState.lastPayload = Uint8Array.from(payload);
        add('malformed', 'ELEMENTARY_CONFLICTING_DUPLICATE', 'A repeated elementary continuity counter carried different payload bytes; PES state was discarded.', { packetIndex, pid, continuityCounter });
      }
      return;
    }
    if (continuityCounter !== expected) {
      esState.currentPes = null;
      esState.truncated = true;
      esState.continuityLost = true;
      add('warning', 'ELEMENTARY_CONTINUITY_GAP', 'Elementary payload continuity was lost; later headers in this probe remain inconclusive.', { packetIndex, pid, expected, actual: continuityCounter });
      if (!payloadUnitStart) {
        esState.lastPayloadCc = continuityCounter;
        esState.lastPayload = Uint8Array.from(payload);
        return;
      }
    }
  }
  esState.lastPayloadCc = continuityCounter;
  esState.lastPayload = Uint8Array.from(payload);
  if (payloadUnitStart) {
    if (esState.currentPes?.remaining > 0) {
      esState.continuityLost = true;
      add('warning', 'PES_PREMATURE_RESTART', 'A new PES began before the declared previous payload completed.', { packetIndex, pid });
    }
    esState.currentPes = { header: [], payloadOffset: null, remaining: null, invalid: false };
  }
  const pes = esState.currentPes;
  if (!pes || pes.invalid) return;
  if (pes.payloadOffset !== null) {
    appendPesPayload(esState, payload, limits);
    return;
  }
  for (const byte of payload) pes.header.push(byte);
  if (pes.header.length < 9) {
    esState.truncated = true;
    return;
  }
  if (pes.header[0] !== 0 || pes.header[1] !== 0 || pes.header[2] !== 1) {
    pes.invalid = true;
    add('malformed', 'PES_START_CODE_INVALID', 'Elementary PID payload-unit-start lacks a PES start code.', { packetIndex, pid });
    return;
  }
  const payloadOffset = 9 + pes.header[8];
  const packetLength = (pes.header[4] << 8) | pes.header[5];
  if (packetLength !== 0 && packetLength < payloadOffset - 6) {
    pes.invalid = true;
    esState.continuityLost = true;
    add('malformed', 'PES_PACKET_LENGTH_INVALID', 'Declared PES length ends inside its optional header.', { packetIndex, pid });
    return;
  }
  if (payloadOffset > 264) {
    pes.invalid = true;
    add('malformed', 'PES_HEADER_LENGTH_INVALID', 'PES optional header exceeds its structural maximum.', { packetIndex, pid });
    return;
  }
  if (pes.header.length < payloadOffset) {
    esState.truncated = true;
    return;
  }
  pes.remaining = packetLength === 0 ? null : packetLength - (payloadOffset - 6);
  appendPesPayload(esState, pes.header.slice(payloadOffset), limits);
  pes.header = [];
  pes.payloadOffset = payloadOffset;
  esState.truncated = false;
}

class BitReader {
  constructor(bytes) { this.bytes = bytes; this.bit = 0; }
  readBit() {
    if (this.bit >= this.bytes.length * 8) throw new RangeError('bitstream truncated');
    const value = (this.bytes[this.bit >> 3] >> (7 - (this.bit & 7))) & 1;
    this.bit += 1;
    return value;
  }
  readBits(count) {
    let value = 0;
    for (let index = 0; index < count; index += 1) value = value * 2 + this.readBit();
    return value;
  }
  readUE() {
    let zeros = 0;
    while (this.readBit() === 0) {
      zeros += 1;
      if (zeros > 31) throw new RangeError('exp-golomb value exceeds bounded integer range');
    }
    return (2 ** zeros - 1) + (zeros === 0 ? 0 : this.readBits(zeros));
  }
  readSE() {
    const codeNum = this.readUE();
    return (codeNum & 1) === 1 ? (codeNum + 1) / 2 : -(codeNum / 2);
  }
}

function removeEmulationPrevention(bytes) {
  const output = [];
  let zeros = 0;
  for (const byte of bytes) {
    if (zeros >= 2 && byte === 0x03) {
      zeros = 0;
      continue;
    }
    output.push(byte);
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(output);
}

function skipScalingList(reader, size) {
  let lastScale = 8;
  let nextScale = 8;
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) nextScale = (lastScale + reader.readSE() + 256) % 256;
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

function parseH264Vui(reader) {
  const color = { fullRange: null, primariesCode: null, transferCode: null, matrixCode: null, primaries: null, transfer: null, matrix: null };
  if (reader.readBit()) {
    const aspectRatioIdc = reader.readBits(8);
    if (aspectRatioIdc === 255) reader.readBits(32);
  }
  if (reader.readBit()) reader.readBit();
  if (reader.readBit()) {
    reader.readBits(3);
    color.fullRange = reader.readBit() === 1;
    if (reader.readBit()) {
      color.primariesCode = reader.readBits(8);
      color.transferCode = reader.readBits(8);
      color.matrixCode = reader.readBits(8);
      color.primaries = color.primariesCode === 1 ? 'BT.709' : null;
      color.transfer = color.transferCode === 1 ? 'BT.709' : null;
      color.matrix = color.matrixCode === 1 ? 'BT.709' : null;
    }
  }
  if (reader.readBit()) {
    reader.readUE();
    reader.readUE();
  }
  if (reader.readBit()) {
    reader.readBits(32);
    reader.readBits(32);
    reader.readBit();
  }
  const nalHrdPresent = reader.readBit() === 1;
  if (nalHrdPresent) parseH264Hrd(reader);
  const vclHrdPresent = reader.readBit() === 1;
  if (vclHrdPresent) parseH264Hrd(reader);
  if (nalHrdPresent || vclHrdPresent) reader.readBit();
  reader.readBit();
  if (reader.readBit()) {
    reader.readBit();
    reader.readUE();
    reader.readUE();
    reader.readUE();
    reader.readUE();
    reader.readUE();
    reader.readUE();
  }
  return color;
}

function parseH264Hrd(reader) {
  const cpbCount = reader.readUE() + 1;
  if (cpbCount > 32) throw new RangeError('HRD CPB count exceeds the bounded syntax limit');
  reader.readBits(4);
  reader.readBits(4);
  for (let index = 0; index < cpbCount; index += 1) {
    reader.readUE();
    reader.readUE();
    reader.readBit();
  }
  reader.readBits(5);
  reader.readBits(5);
  reader.readBits(5);
  reader.readBits(5);
}

function hasValidRbspTrailingBits(reader) {
  if (reader.bit >= reader.bytes.length * 8 || reader.readBit() !== 1) return false;
  while ((reader.bit & 7) !== 0) if (reader.readBit() !== 0) return false;
  return reader.bit === reader.bytes.length * 8;
}

export function parseH264Sps(nal) {
  try {
    if (nal.length < 5) return { status: 'incomplete', code: 'H264_SPS_TRUNCATED' };
    if ((nal[0] & 0x1f) !== 7) return { status: 'malformed', code: 'H264_SPS_INVALID' };
    const rbsp = removeEmulationPrevention(nal.subarray(1));
    const reader = new BitReader(rbsp);
    const profileIdc = reader.readBits(8);
    const constraintFlags = reader.readBits(8);
    const levelIdc = reader.readBits(8);
    reader.readUE();
    let chromaFormatIdc = 1;
    let separateColourPlaneFlag = 0;
    let bitDepthLuma = 8;
    let bitDepthChroma = 8;
    if (H264_HIGH_PROFILE_IDS.has(profileIdc)) {
      chromaFormatIdc = reader.readUE();
      if (chromaFormatIdc > 3) return { status: 'malformed', code: 'H264_CHROMA_FORMAT_INVALID' };
      if (chromaFormatIdc === 3) separateColourPlaneFlag = reader.readBit();
      bitDepthLuma = reader.readUE() + 8;
      bitDepthChroma = reader.readUE() + 8;
      reader.readBit();
      if (reader.readBit()) {
        const count = chromaFormatIdc !== 3 ? 8 : 12;
        for (let index = 0; index < count; index += 1) if (reader.readBit()) skipScalingList(reader, index < 6 ? 16 : 64);
      }
    }
    reader.readUE();
    const picOrderCntType = reader.readUE();
    if (picOrderCntType === 0) reader.readUE();
    else if (picOrderCntType === 1) {
      reader.readBit();
      reader.readSE();
      reader.readSE();
      const cycle = reader.readUE();
      if (cycle > 256) return { status: 'malformed', code: 'H264_POC_CYCLE_LIMIT' };
      for (let index = 0; index < cycle; index += 1) reader.readSE();
    } else if (picOrderCntType !== 2) return { status: 'malformed', code: 'H264_POC_TYPE_INVALID' };
    reader.readUE();
    reader.readBit();
    const picWidthInMbsMinus1 = reader.readUE();
    const picHeightInMapUnitsMinus1 = reader.readUE();
    const frameMbsOnlyFlag = reader.readBit();
    if (!frameMbsOnlyFlag) reader.readBit();
    reader.readBit();
    let cropLeft = 0; let cropRight = 0; let cropTop = 0; let cropBottom = 0;
    if (reader.readBit()) {
      cropLeft = reader.readUE(); cropRight = reader.readUE(); cropTop = reader.readUE(); cropBottom = reader.readUE();
    }
    let color = { fullRange: null, primariesCode: null, transferCode: null, matrixCode: null, primaries: null, transfer: null, matrix: null };
    if (reader.readBit()) color = parseH264Vui(reader);
    if (!hasValidRbspTrailingBits(reader)) return { status: 'incomplete', code: 'H264_RBSP_TRAILING_BITS_INVALID' };
    const chromaArrayType = separateColourPlaneFlag ? 0 : chromaFormatIdc;
    const subWidthC = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1;
    const subHeightC = chromaArrayType === 1 ? 2 : 1;
    const cropUnitX = chromaArrayType === 0 ? 1 : subWidthC;
    const cropUnitY = chromaArrayType === 0 ? 2 - frameMbsOnlyFlag : subHeightC * (2 - frameMbsOnlyFlag);
    const width = (picWidthInMbsMinus1 + 1) * 16 - cropUnitX * (cropLeft + cropRight);
    const height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16 - cropUnitY * (cropTop + cropBottom);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 131_072 || height > 131_072) {
      return { status: 'malformed', code: 'H264_DIMENSIONS_INVALID' };
    }
    return {
      status: 'parsed',
      source: 'annex-b-sps',
      codec: 'h264',
      profileIdc,
      profile: H264_PROFILES[profileIdc] ?? null,
      constraintFlags,
      levelIdc,
      level: `${Math.floor(levelIdc / 10)}.${levelIdc % 10}`,
      width,
      height,
      chromaFormatIdc,
      bitDepthLuma,
      bitDepthChroma,
      color,
    };
  } catch (error) {
    return { status: 'incomplete', code: 'H264_SPS_TRUNCATED', message: error instanceof Error ? error.message : 'SPS bitstream is incomplete.' };
  }
}

function findAnnexBSps(bytes) {
  let index = 0;
  while (index + 4 <= bytes.length) {
    let prefix = 0;
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) prefix = 3;
    else if (index + 4 <= bytes.length && bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 0 && bytes[index + 3] === 1) prefix = 4;
    if (!prefix) { index += 1; continue; }
    const nalStart = index + prefix;
    let next = nalStart + 1;
    let foundNextStartCode = false;
    while (next + 3 <= bytes.length) {
      if (bytes[next] === 0 && bytes[next + 1] === 0 && (bytes[next + 2] === 1 || (bytes[next + 2] === 0 && bytes[next + 3] === 1))) {
        foundNextStartCode = true;
        break;
      }
      next += 1;
    }
    if (!foundNextStartCode) next = bytes.length;
    if ((bytes[nalStart] & 0x1f) === 7) return parseH264Sps(bytes.subarray(nalStart, Math.min(next, bytes.length)));
    index = next;
  }
  return null;
}

function parseAdts(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0xff) continue;
    if (index + 1 >= bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    if ((bytes[index + 1] & 0xf6) !== 0xf0) continue;
    if (index + 7 > bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    const protectionAbsent = bytes[index + 1] & 1;
    const headerBytes = protectionAbsent ? 7 : 9;
    if (index + headerBytes > bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    const objectType = ((bytes[index + 2] >> 6) & 0x03) + 1;
    const sampleRateIndex = (bytes[index + 2] >> 2) & 0x0f;
    const sampleRate = SAMPLE_RATES[sampleRateIndex] ?? null;
    const channelConfiguration = ((bytes[index + 2] & 1) << 2) | ((bytes[index + 3] >> 6) & 0x03);
    const frameLength = ((bytes[index + 3] & 0x03) << 11) | (bytes[index + 4] << 3) | ((bytes[index + 5] >> 5) & 0x07);
    if (!sampleRate || channelConfiguration === 0 || frameLength < headerBytes) return { status: 'malformed', code: 'ADTS_HEADER_INVALID' };
    if (index + frameLength > bytes.length) return { status: 'incomplete', code: 'ADTS_FRAME_TRUNCATED', declaredFrameLength: frameLength, availableFrameBytes: bytes.length - index };
    return {
      status: 'parsed', source: 'adts-header', codec: 'aac', objectType,
      profile: AAC_OBJECT_TYPES[objectType] ?? null, sampleRate, channelConfiguration,
      channels: CHANNEL_CONFIGS[channelConfiguration] ?? null, protectionAbsent: protectionAbsent === 1,
    };
  }
  return null;
}

function elementaryDetails(stream, esState) {
  if (!esState) return { status: 'not-observed', code: 'ELEMENTARY_PID_NOT_OBSERVED' };
  const bytes = Uint8Array.from(esState.bytes);
  let parsed = null;
  if (stream.streamType === 0x1b) parsed = findAnnexBSps(bytes);
  else if (stream.streamType === 0x0f) parsed = parseAdts(bytes);
  else return { status: 'not-applicable', code: 'ELEMENTARY_HEADER_PARSER_NOT_IMPLEMENTED' };
  if (esState.continuityLost) return { status: 'incomplete', code: 'ELEMENTARY_CONTINUITY_LOSS' };
  if (parsed?.status === 'parsed' || parsed?.status === 'malformed') return parsed;
  if (esState.limitHit) return { status: 'limit-exceeded', code: 'ELEMENTARY_SAMPLE_LIMIT_REACHED' };
  if (parsed) return parsed;
  if (esState.truncated) return { status: 'incomplete', code: 'ELEMENTARY_PES_TRUNCATED' };
  return { status: 'not-observed', code: 'ELEMENTARY_HEADER_NOT_OBSERVED' };
}

function finalize(result, state, add) {
  result.psi.sectionsExamined = state.sectionsExamined;
  result.psi.sectionsValid = state.sectionsValid;
  result.psi.patSections = state.patSet?.sections.size ?? 0;
  result.psi.pmtSections = [...state.programs.values()].reduce((sum, program) => sum + (program.pmtSet?.sections.size ?? 0), 0);
  result.psi.patVersion = state.patVersion;
  result.psi.patComplete = psiSetComplete(state.patSet);
  result.transportStreamIds = [...state.transportStreamIds].sort((a, b) => a - b);
  result.networkPids = [...state.networkPids].sort((a, b) => a - b);
  result.programs = [...state.programs.values()].sort((a, b) => a.programNumber - b.programNumber).map((program) => ({
    programNumber: program.programNumber,
    pmtPid: program.pmtPid,
    pmtVersion: program.pmt?.version ?? null,
    pcrPid: program.pmt?.pcrPid ?? null,
    programDescriptorTags: program.pmt?.programDescriptorTags ?? [],
    pmtStatus: program.pmt ? 'complete' : (program.pmtSet ? 'incomplete' : 'not-observed'),
    streams: (program.pmt?.streams ?? []).map((stream) => ({
      ...stream,
      codecDetails: elementaryDetails(stream, state.esStates.get(stream.elementaryPid)),
    })),
  }));
  for (const program of result.programs) {
    for (const stream of program.streams) {
      result.trackSummary.total += 1;
      if (stream.kind === 'video') result.trackSummary.video += 1;
      else if (stream.kind === 'audio') result.trackSummary.audio += 1;
      else result.trackSummary.other += 1;
      if (stream.codecDetails.status === 'parsed') result.trackSummary.elementaryHeadersParsed += 1;
    }
  }
  const severities = new Set(result.issues.map((entry) => entry.severity));
  const incompletePsi = [...state.assemblers.values()].some((assembler) => assembler.pending.length > 0);
  const missingPmt = state.programs.size > 0 && [...state.programs.values()].some((program) => !program.pmt);
  if (state.limitHit || severities.has('limit')) {
    result.status = 'limit-exceeded';
    result.outcome = { code: 'PROBE_LIMIT_REACHED', message: 'A hard parser limit stopped or constrained the probe.' };
  } else if (state.unsupported) {
    result.status = 'unsupported';
    result.outcome = { code: 'UNSUPPORTED_TS_FEATURE', message: 'Encrypted or otherwise unsupported PSI prevented a complete result.' };
  } else if (severities.has('malformed')) {
    result.status = 'malformed';
    result.outcome = { code: 'MALFORMED_MPEG_TS', message: 'The inspected transport stream violates a structural, continuity, or CRC contract.' };
  } else if (incompletePsi) {
    result.status = 'truncated';
    result.outcome = { code: 'TRUNCATED_MPEG_TS', message: 'The supplied bytes end inside a packet or PSI section.' };
  } else if (!result.psi.patComplete || state.programs.size === 0 || missingPmt) {
    result.status = 'incomplete';
    result.outcome = { code: 'PSI_NOT_COMPLETE', message: 'The bounded bytes do not contain a complete PAT and every referenced PMT.' };
  } else {
    result.status = 'complete';
    result.outcome = { code: 'MPEG_TS_STRUCTURE_COMPLETE', message: 'Complete PAT/PMT topology was parsed within the supplied bounded bytes.' };
  }
  add.finish();
  return result;
}

export function probeMpegTs(input, options = {}) {
  const bytes = asBytes(input);
  const limits = resolveLimits(options);
  const result = baseResult(bytes, limits);
  const add = issueSink(result, limits);
  if (!bytes) {
    result.status = 'malformed';
    result.outcome = { code: 'INPUT_TYPE_INVALID', message: 'Input must be an ArrayBuffer or ArrayBuffer view.' };
    return result;
  }
  if (bytes.length > limits.maxBytes) {
    result.status = 'limit-exceeded';
    result.outcome = { code: 'BYTE_LIMIT_EXCEEDED', message: 'Supplied bytes exceed the configured hard byte limit; no bytes were scanned.' };
    add('limit', 'BYTE_LIMIT_EXCEEDED', result.outcome.message, { supplied: bytes.length, allowed: limits.maxBytes });
    add.finish();
    return result;
  }
  const initialSync = findSync(bytes, 0, limits.maxResyncBytes);
  if (initialSync < 0) {
    result.bytes.inspected = Math.min(bytes.length, limits.maxResyncBytes + TS_PACKET_BYTES * 3);
    result.status = 'not-mpeg-ts';
    result.outcome = { code: 'TS_SYNC_NOT_FOUND', message: 'No robust 188-byte transport-stream sync sequence was found within the resynchronization bound.' };
    return result;
  }
  result.bytes.syncOffset = initialSync;
  result.bytes.resyncBytes = initialSync;
  if (initialSync > 0) add('warning', 'LEADING_BYTES_SKIPPED', 'Bytes before the first robust TS sync sequence were skipped.', { skipped: initialSync });
  const state = {
    limits, assemblers: new Map(), pmtPids: new Set(), programs: new Map(), esStates: new Map(),
    transportStreamIds: new Set(), networkPids: new Set(), sectionsExamined: 0, sectionsValid: 0,
    patSet: null, patVersion: null, totalStreams: 0, limitHit: false, unsupported: false,
  };
  let position = initialSync;
  let packetsParsed = 0;
  while (position + TS_PACKET_BYTES <= bytes.length) {
    if (packetsParsed >= limits.maxPackets) {
      state.limitHit = true;
      add('limit', 'PACKET_LIMIT_REACHED', 'Packet count exceeded the configured hard limit.', { packetIndex: packetsParsed });
      break;
    }
    if (bytes[position] !== 0x47) {
      const remaining = limits.maxResyncBytes - result.bytes.resyncBytes;
      const next = remaining > 0 ? findSync(bytes, position + 1, remaining) : -1;
      if (next < 0) {
        add('malformed', 'TS_SYNC_LOST', 'Transport-stream sync was lost and could not be recovered inside the resynchronization bound.', { packetIndex: packetsParsed });
        break;
      }
      const skipped = next - position;
      result.bytes.resyncBytes += skipped;
      add('malformed', 'TS_RESYNCHRONIZED', 'Transport-stream sync was recovered after skipping bounded bytes.', { packetIndex: packetsParsed, skipped });
      for (const assembler of state.assemblers.values()) {
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.lastPayloadCc = null;
        assembler.lastPayload = null;
      }
      for (const esState of state.esStates.values()) {
        esState.currentPes = null;
        esState.lastPayloadCc = null;
        esState.lastPayload = null;
        esState.continuityLost = true;
        esState.truncated = true;
      }
      position = next;
      continue;
    }
    const packetIndex = packetsParsed;
    const b1 = bytes[position + 1];
    const b2 = bytes[position + 2];
    const b3 = bytes[position + 3];
    const transportError = (b1 & 0x80) !== 0;
    const payloadUnitStart = (b1 & 0x40) !== 0;
    const pid = ((b1 & 0x1f) << 8) | b2;
    const scrambling = (b3 >> 6) & 0x03;
    const adaptationControl = (b3 >> 4) & 0x03;
    const continuityCounter = b3 & 0x0f;
    if (transportError) add('malformed', 'TRANSPORT_ERROR_INDICATOR', 'Packet is marked with a transport error.', { packetIndex, pid });
    if (adaptationControl === 0) {
      add('malformed', 'ADAPTATION_CONTROL_INVALID', 'Packet has reserved adaptation_field_control value 0.', { packetIndex, pid });
    }
    if (transportError || adaptationControl === 0) {
      const assembler = state.assemblers.get(pid);
      if (assembler) {
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.incomplete = false;
        assembler.lastPayloadCc = null;
        assembler.lastPayload = null;
      }
      const esState = state.esStates.get(pid);
      if (esState) {
        esState.currentPes = null;
        esState.lastPayloadCc = null;
        esState.lastPayload = null;
        esState.continuityLost = true;
        esState.truncated = true;
      }
      position += TS_PACKET_BYTES; packetsParsed += 1; continue;
    }
    let payloadOffset = position + 4;
    let discontinuity = false;
    if ((adaptationControl & 0x02) !== 0) {
      const adaptationLength = bytes[payloadOffset];
      const maximum = adaptationControl === 2 ? 183 : 182;
      if (adaptationLength > maximum || payloadOffset + 1 + adaptationLength > position + TS_PACKET_BYTES) {
        add('malformed', 'ADAPTATION_FIELD_TRUNCATED', 'Adaptation field exceeds its TS packet.', { packetIndex, pid, adaptationLength });
        position += TS_PACKET_BYTES; packetsParsed += 1; continue;
      }
      if (adaptationLength > 0) discontinuity = (bytes[payloadOffset + 1] & 0x80) !== 0;
      payloadOffset += 1 + adaptationLength;
    }
    const hasPayload = (adaptationControl & 0x01) !== 0 && payloadOffset < position + TS_PACKET_BYTES;
    if (discontinuity && !hasPayload) {
      const assembler = state.assemblers.get(pid);
      if (assembler) {
        assembler.pending = []; assembler.expectedLength = null; assembler.lastPayloadCc = null; assembler.lastPayload = null;
      }
      const esState = state.esStates.get(pid);
      if (esState) resetElementarySegment(esState);
    }
    if (hasPayload) {
      const payload = bytes.subarray(payloadOffset, position + TS_PACKET_BYTES);
      const isPsi = pid === 0 || state.pmtPids.has(pid);
      if (isPsi) {
        if (scrambling !== 0) {
          state.unsupported = true;
          add('unsupported', 'SCRAMBLED_PSI_UNSUPPORTED', 'Scrambled PAT/PMT payload is not parsed.', { packetIndex, pid, scrambling });
        } else feedPsi(pid, payload, payloadUnitStart, continuityCounter, discontinuity, state, add, packetIndex);
      }
      const esState = state.esStates.get(pid);
      if (esState) {
        if (scrambling !== 0) add('warning', 'SCRAMBLED_ELEMENTARY_UNINSPECTED', 'Scrambled elementary payload was not inspected.', { packetIndex, pid, scrambling });
        else feedElementary(esState, payload, payloadUnitStart, continuityCounter, discontinuity, limits, add, packetIndex, pid);
      }
    }
    position += TS_PACKET_BYTES;
    packetsParsed += 1;
  }
  result.bytes.packetsParsed = packetsParsed;
  result.bytes.inspected = Math.min(bytes.length, position);
  result.bytes.trailingBytes = Math.max(0, bytes.length - position);
  if (result.bytes.trailingBytes > 0 && !state.limitHit) {
    add('warning', 'TRAILING_PARTIAL_PACKET_IGNORED', 'Bytes after the last complete 188-byte packet were not parsed.', { trailingBytes: result.bytes.trailingBytes });
  }
  return finalize(result, state, add);
}
