(()=>{
var diagnostic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // qa/rc29-ts-gop-diagnostic/analyzer.mjs
  var analyzer_exports = {};
  __export(analyzer_exports, {
    SOURCE_COMMIT: () => SOURCE_COMMIT,
    VERSION: () => VERSION,
    analyzeTsGops: () => analyzeTsGops
  });

  // qa/v2-07a-container-probe/mpeg-ts-probe.mjs
  var TS_PACKET_BYTES = 188;
  var ABSOLUTE_LIMITS = Object.freeze({
    maxBytes: 16 * 1024 * 1024,
    maxPackets: 65536,
    maxResyncBytes: TS_PACKET_BYTES * 128,
    maxSectionBytes: 1024,
    maxSections: 1024,
    maxPrograms: 256,
    maxStreamsPerProgram: 256,
    maxTotalStreams: 1024,
    maxElementaryBytesPerStream: 256 * 1024,
    maxIssues: 512
  });
  var DEFAULT_MPEG_TS_LIMITS = Object.freeze({
    maxBytes: 4 * 1024 * 1024,
    maxPackets: 16384,
    maxResyncBytes: TS_PACKET_BYTES * 32,
    maxSectionBytes: 1024,
    maxSections: 256,
    maxPrograms: 64,
    maxStreamsPerProgram: 64,
    maxTotalStreams: 256,
    maxElementaryBytesPerStream: 64 * 1024,
    maxIssues: 128
  });
  var STREAM_TYPES = Object.freeze({
    1: ["video", "mpeg-1-video"],
    2: ["video", "mpeg-2-video"],
    3: ["audio", "mpeg-1-audio"],
    4: ["audio", "mpeg-2-audio"],
    15: ["audio", "aac"],
    16: ["video", "mpeg-4-part-2"],
    17: ["audio", "aac-latm"],
    27: ["video", "h264"],
    36: ["video", "hevc"],
    45: ["video", "mpeg-h-part-2"]
  });
  var H264_PROFILES = Object.freeze({
    44: "CAVLC 4:4:4 Intra",
    66: "Baseline",
    77: "Main",
    83: "Scalable Baseline",
    86: "Scalable High",
    88: "Extended",
    100: "High",
    110: "High 10",
    118: "Multiview High",
    122: "High 4:2:2",
    128: "Stereo High",
    134: "MFC High",
    135: "MFC Depth High",
    138: "Multiview Depth High",
    139: "Enhanced Multiview Depth High",
    244: "High 4:4:4 Predictive"
  });
  var H264_HIGH_PROFILE_IDS = /* @__PURE__ */ new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]);
  var SAMPLE_RATES = Object.freeze([96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350]);
  var AAC_OBJECT_TYPES = Object.freeze({ 1: "AAC Main", 2: "AAC LC", 3: "AAC SSR", 4: "AAC LTP" });
  var CHANNEL_CONFIGS = Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 8 });
  function crc32Mpeg2(bytes) {
    let crc = 4294967295;
    for (const byte of bytes) {
      crc ^= byte << 24;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 2147483648) !== 0 ? (crc << 1 ^ 79764919) >>> 0 : crc << 1 >>> 0;
      }
    }
    return crc >>> 0;
  }
  function codecMapping(streamType) {
    const mapping = STREAM_TYPES[streamType];
    return mapping ? { kind: mapping[0], codec: mapping[1], codecFamily: mapping[1], mappingConfidence: "stream-type-family" } : { kind: "other", codec: null, codecFamily: null, mappingConfidence: "unknown" };
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
    const desired = /* @__PURE__ */ new Map();
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
        limitHit: false
      });
    }
  }
  function parsePat(section, state, add, packetIndex) {
    if (section.length < 12 || (section[1] & 128) === 0) {
      add("malformed", "PAT_STRUCTURE_INVALID", "PAT section is shorter than its mandatory syntax.", { packetIndex, pid: 0 });
      return;
    }
    const entriesEnd = section.length - 4;
    if ((entriesEnd - 8) % 4 !== 0) {
      add("malformed", "PAT_PROGRAM_LOOP_INVALID", "PAT program loop is not a whole number of entries.", { packetIndex, pid: 0 });
      return;
    }
    const transportStreamId = section[3] << 8 | section[4];
    const version = section[5] >> 1 & 31;
    const sectionNumber = section[6];
    const lastSectionNumber = section[7];
    if (sectionNumber > lastSectionNumber) {
      add("malformed", "PAT_SECTION_NUMBER_INVALID", "PAT section_number exceeds last_section_number.", { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
      return;
    }
    const identityChanged = state.patSet && (state.patSet.transportStreamId !== transportStreamId || state.patSet.version !== version);
    if (identityChanged) {
      add("warning", state.patSet.transportStreamId === transportStreamId ? "PAT_VERSION_REPLACED" : "PAT_IDENTITY_REPLACED", "A distinct current PAT identity replaced the previously observed topology.", {
        packetIndex,
        pid: 0,
        previousTransportStreamId: state.patSet.transportStreamId,
        transportStreamId,
        previousVersion: state.patSet.version,
        version
      });
      resetPatTopology(state);
      state.patSet = null;
    }
    if (!state.patSet) {
      state.patSet = { transportStreamId, version, lastSectionNumber, sections: /* @__PURE__ */ new Map() };
      state.transportStreamIds.clear();
      state.transportStreamIds.add(transportStreamId);
    } else if (state.patSet.lastSectionNumber !== lastSectionNumber) {
      add("malformed", "PAT_LAST_SECTION_CHANGED", "PAT sections with one identity disagree on last_section_number.", { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
      return;
    }
    const priorSection = state.patSet.sections.get(sectionNumber);
    if (priorSection) {
      if (equalBytes(priorSection, section)) add("warning", "PAT_SECTION_DUPLICATE", "Byte-identical PAT section was ignored.", { packetIndex, pid: 0, sectionNumber });
      else add("malformed", "PAT_SECTION_CONFLICT", "PAT section number repeated with different bytes.", { packetIndex, pid: 0, sectionNumber });
      return;
    }
    state.patSet.sections.set(sectionNumber, Uint8Array.from(section));
    state.patVersion = version;
    for (let offset = 8; offset < entriesEnd; offset += 4) {
      const programNumber = section[offset] << 8 | section[offset + 1];
      const pid = (section[offset + 2] & 31) << 8 | section[offset + 3];
      if (programNumber === 0) {
        state.networkPids.add(pid);
        continue;
      }
      if (!state.programs.has(programNumber) && state.programs.size >= state.limits.maxPrograms) {
        state.limitHit = true;
        add("limit", "PROGRAM_LIMIT_REACHED", "PAT declared more programs than the configured limit.", { packetIndex, pid: 0 });
        continue;
      }
      const prior = state.programs.get(programNumber);
      if (prior && prior.pmtPid !== pid) {
        add("malformed", "PAT_PROGRAM_PID_CHANGED", "A program maps to conflicting PMT PIDs in one PAT identity.", { packetIndex, pid: 0, programNumber });
        continue;
      }
      if (!prior) state.programs.set(programNumber, { programNumber, pmtPid: pid, pmt: null, pmtSet: null });
      state.pmtPids.add(pid);
    }
  }
  function parsePmt(section, state, add, packetIndex, packetPid) {
    if (section.length < 16 || (section[1] & 128) === 0) {
      add("malformed", "PMT_STRUCTURE_INVALID", "PMT section is shorter than its mandatory syntax.", { packetIndex, pid: packetPid });
      return;
    }
    const programNumber = section[3] << 8 | section[4];
    const version = section[5] >> 1 & 31;
    const sectionNumber = section[6];
    const lastSectionNumber = section[7];
    const program = state.programs.get(programNumber);
    if (!program || program.pmtPid !== packetPid) {
      add("malformed", "PMT_PROGRAM_MISMATCH", "PMT table-id-extension does not match the current PAT mapping.", { packetIndex, pid: packetPid, programNumber });
      return;
    }
    if (sectionNumber > lastSectionNumber) {
      add("malformed", "PMT_SECTION_NUMBER_INVALID", "PMT section_number exceeds last_section_number.", { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
      return;
    }
    if (program.pmtSet && program.pmtSet.version !== version) {
      add("warning", "PMT_VERSION_REPLACED", "A distinct current PMT version replaced the previous stream topology.", { packetIndex, pid: packetPid, programNumber, previousVersion: program.pmtSet.version, version });
      program.pmtSet = null;
      program.pmt = null;
      state.totalStreams = [...state.programs.values()].reduce((sum, entry) => sum + (entry.pmt?.streams.length ?? 0), 0);
      syncElementaryStates(state);
    }
    if (!program.pmtSet) program.pmtSet = { version, lastSectionNumber, sections: /* @__PURE__ */ new Map(), parts: /* @__PURE__ */ new Map() };
    else if (program.pmtSet.lastSectionNumber !== lastSectionNumber) {
      add("malformed", "PMT_LAST_SECTION_CHANGED", "PMT sections with one identity disagree on last_section_number.", { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
      return;
    }
    const priorSection = program.pmtSet.sections.get(sectionNumber);
    if (priorSection) {
      if (equalBytes(priorSection, section)) add("warning", "PMT_SECTION_DUPLICATE", "Byte-identical PMT section was ignored.", { packetIndex, pid: packetPid, programNumber, sectionNumber });
      else add("malformed", "PMT_SECTION_CONFLICT", "PMT section number repeated with different bytes.", { packetIndex, pid: packetPid, programNumber, sectionNumber });
      return;
    }
    const pcrPid = (section[8] & 31) << 8 | section[9];
    const programInfoLength = (section[10] & 15) << 8 | section[11];
    const crcStart = section.length - 4;
    let offset = 12;
    if (offset + programInfoLength > crcStart) {
      add("malformed", "PMT_PROGRAM_INFO_TRUNCATED", "PMT program descriptor loop exceeds the section.", { packetIndex, pid: packetPid });
      return;
    }
    const programDescriptors = parseDescriptorLoop(section, offset, programInfoLength);
    if (!programDescriptors.ok) {
      add("malformed", "PMT_PROGRAM_DESCRIPTOR_INVALID", "PMT program descriptor loop is malformed.", { packetIndex, pid: packetPid });
      return;
    }
    offset += programInfoLength;
    const streams = [];
    while (offset < crcStart) {
      if (offset + 5 > crcStart) {
        add("malformed", "PMT_STREAM_ENTRY_TRUNCATED", "PMT stream entry is truncated.", { packetIndex, pid: packetPid });
        return;
      }
      const streamType = section[offset];
      const elementaryPid = (section[offset + 1] & 31) << 8 | section[offset + 2];
      const esInfoLength = (section[offset + 3] & 15) << 8 | section[offset + 4];
      if (offset + 5 + esInfoLength > crcStart) {
        add("malformed", "PMT_ES_INFO_TRUNCATED", "PMT elementary descriptor loop exceeds the section.", { packetIndex, pid: packetPid, programNumber });
        return;
      }
      const descriptors = parseDescriptorLoop(section, offset + 5, esInfoLength);
      if (!descriptors.ok) {
        add("malformed", "PMT_ES_DESCRIPTOR_INVALID", "PMT elementary descriptor loop is malformed.", { packetIndex, pid: packetPid, programNumber, elementaryPid });
        return;
      }
      streams.push({ streamType, streamTypeHex: `0x${streamType.toString(16).padStart(2, "0")}`, elementaryPid, descriptorTags: descriptors.tags, ...codecMapping(streamType) });
      offset += 5 + esInfoLength;
    }
    program.pmtSet.sections.set(sectionNumber, Uint8Array.from(section));
    program.pmtSet.parts.set(sectionNumber, { pcrPid, programDescriptorTags: programDescriptors.tags, streams });
    if (!psiSetComplete(program.pmtSet)) return;
    const orderedParts = [...program.pmtSet.parts.entries()].sort(([left], [right]) => left - right).map(([, part]) => part);
    if (orderedParts.some((part) => part.pcrPid !== orderedParts[0].pcrPid)) {
      add("malformed", "PMT_PCR_PID_CONFLICT", "PMT sections with one identity disagree on PCR PID.", { packetIndex, pid: packetPid, programNumber });
      return;
    }
    const aggregateStreams = orderedParts.flatMap((part) => part.streams);
    const uniquePids = /* @__PURE__ */ new Set();
    for (const stream of aggregateStreams) {
      if (uniquePids.has(stream.elementaryPid)) {
        add("malformed", "PMT_ELEMENTARY_PID_DUPLICATE", "PMT repeats an elementary PID across its current section set.", { packetIndex, pid: packetPid, programNumber, elementaryPid: stream.elementaryPid });
        return;
      }
      uniquePids.add(stream.elementaryPid);
    }
    const otherStreamCount = [...state.programs.values()].reduce((sum, entry) => sum + (entry === program ? 0 : entry.pmt?.streams.length ?? 0), 0);
    if (aggregateStreams.length > state.limits.maxStreamsPerProgram || otherStreamCount + aggregateStreams.length > state.limits.maxTotalStreams) {
      state.limitHit = true;
      add("limit", "STREAM_LIMIT_REACHED", "Complete PMT section set declared more streams than the configured limit.", { packetIndex, pid: packetPid, programNumber });
      return;
    }
    program.pmt = { version, pcrPid: orderedParts[0].pcrPid, programDescriptorTags: orderedParts[0].programDescriptorTags, streams: aggregateStreams };
    state.totalStreams = otherStreamCount + aggregateStreams.length;
    syncElementaryStates(state);
  }
  function acceptSection(section, state, add, packetIndex, pid) {
    if (state.sectionsExamined >= state.limits.maxSections) {
      state.limitHit = true;
      add("limit", "SECTION_LIMIT_REACHED", "PSI section count exceeded the configured limit.", { packetIndex, pid });
      return;
    }
    state.sectionsExamined += 1;
    if (crc32Mpeg2(section) !== 0) {
      add("malformed", "PSI_CRC_MISMATCH", "PSI section failed the MPEG-2 CRC check.", { packetIndex, pid, tableId: section[0] });
      return;
    }
    if ((section[5] & 1) === 0) {
      add("warning", "PSI_NOT_CURRENT", "A complete PSI section is marked not-current and was ignored.", { packetIndex, pid, tableId: section[0] });
      return;
    }
    state.sectionsValid += 1;
    if (pid === 0 && section[0] === 0) parsePat(section, state, add, packetIndex);
    else if (state.pmtPids.has(pid) && section[0] === 2) parsePmt(section, state, add, packetIndex, pid);
    else add("warning", "PSI_TABLE_UNEXPECTED", "A complete PSI section has an unexpected table id for its PID.", { packetIndex, pid, tableId: section[0] });
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
      if (assembler.pending.length === 0 && chunk[offset] === 255) return;
      if (assembler.expectedLength === null) {
        const needed = 3 - assembler.pending.length;
        const take2 = Math.min(needed, chunk.length - offset);
        for (let index = 0; index < take2; index += 1) assembler.pending.push(chunk[offset + index]);
        offset += take2;
        if (assembler.pending.length < 3) return;
        const sectionLength = (assembler.pending[1] & 15) << 8 | assembler.pending[2];
        assembler.expectedLength = 3 + sectionLength;
        if (sectionLength < 4 || assembler.expectedLength > state.limits.maxSectionBytes) {
          add("malformed", "PSI_SECTION_LENGTH_INVALID", "PSI section length is outside the configured or structural bounds.", { packetIndex, pid, sectionLength });
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
  function feedMpegTsPsi(pid, payload, payloadUnitStart, continuityCounter, discontinuity, state, add, packetIndex) {
    let assembler = state.assemblers.get(pid);
    if (!assembler) {
      assembler = newAssembler();
      state.assemblers.set(pid, assembler);
    }
    if (discontinuity) {
      if (assembler.pending.length > 0) add("warning", "PSI_DISCONTINUITY_RESET", "An adaptation-field discontinuity discarded an incomplete PSI section.", { packetIndex, pid });
      assembler.pending = [];
      assembler.expectedLength = null;
      assembler.incomplete = false;
      assembler.lastPayloadCc = null;
      assembler.lastPayload = null;
    }
    if (assembler.lastPayloadCc !== null) {
      const expected = assembler.lastPayloadCc + 1 & 15;
      if (continuityCounter === assembler.lastPayloadCc) {
        if (equalBytes(assembler.lastPayload, payload)) {
          add("warning", "PSI_DUPLICATE_PAYLOAD", "Byte-identical duplicate PSI payload was ignored conservatively.", { packetIndex, pid, continuityCounter });
        } else {
          add("malformed", "PSI_CONFLICTING_DUPLICATE", "A repeated PSI continuity counter carried different payload bytes; partial state was discarded.", { packetIndex, pid, continuityCounter });
          assembler.pending = [];
          assembler.expectedLength = null;
          assembler.incomplete = false;
          assembler.lastPayload = Uint8Array.from(payload);
        }
        return;
      }
      if (continuityCounter !== expected) {
        add("malformed", "PSI_CONTINUITY_GAP", "PSI payload continuity counter skipped without a discontinuity indicator.", { packetIndex, pid, expected, actual: continuityCounter });
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
      add("malformed", "PSI_POINTER_MISSING", "Payload-unit-start packet has no pointer field.", { packetIndex, pid });
      return;
    }
    const pointer = payload[0];
    if (1 + pointer > payload.length) {
      add("malformed", "PSI_POINTER_OUT_OF_RANGE", "PSI pointer field exceeds the packet payload.", { packetIndex, pid, pointer });
      assembler.pending = [];
      assembler.expectedLength = null;
      return;
    }
    if (assembler.pending.length > 0) {
      appendPsiBytes(assembler, payload.subarray(1, 1 + pointer), state, add, packetIndex, pid);
      if (assembler.pending.length > 0) {
        add("malformed", "PSI_POINTER_LEFT_SECTION_INCOMPLETE", "Pointer field starts a new section before the previous section completed.", { packetIndex, pid, pointer });
        assembler.pending = [];
        assembler.expectedLength = null;
      }
    }
    appendPsiBytes(assembler, payload.subarray(1 + pointer), state, add, packetIndex, pid);
  }
  var isMpegTsPsiSetComplete = psiSetComplete;
  function createMpegTsPsiState(limits) {
    return {
      limits,
      assemblers: /* @__PURE__ */ new Map(),
      pmtPids: /* @__PURE__ */ new Set(),
      programs: /* @__PURE__ */ new Map(),
      esStates: /* @__PURE__ */ new Map(),
      transportStreamIds: /* @__PURE__ */ new Set(),
      networkPids: /* @__PURE__ */ new Set(),
      sectionsExamined: 0,
      sectionsValid: 0,
      patSet: null,
      patVersion: null,
      totalStreams: 0,
      limitHit: false,
      unsupported: false
    };
  }
  var BitReader = class {
    constructor(bytes) {
      this.bytes = bytes;
      this.bit = 0;
    }
    readBit() {
      if (this.bit >= this.bytes.length * 8) throw new RangeError("bitstream truncated");
      const value = this.bytes[this.bit >> 3] >> 7 - (this.bit & 7) & 1;
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
        if (zeros > 31) throw new RangeError("exp-golomb value exceeds bounded integer range");
      }
      return 2 ** zeros - 1 + (zeros === 0 ? 0 : this.readBits(zeros));
    }
    readSE() {
      const codeNum = this.readUE();
      return (codeNum & 1) === 1 ? (codeNum + 1) / 2 : -(codeNum / 2);
    }
  };
  function removeEmulationPrevention(bytes) {
    const output = [];
    let zeros = 0;
    for (const byte of bytes) {
      if (zeros >= 2 && byte === 3) {
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
    let aspectRatio = { status: "unspecified", present: false, idc: null, width: null, height: null };
    if (reader.readBit()) {
      const aspectRatioIdc = reader.readBits(8);
      const table = [
        null,
        [1, 1],
        [12, 11],
        [10, 11],
        [16, 11],
        [40, 33],
        [24, 11],
        [20, 11],
        [32, 11],
        [80, 33],
        [18, 11],
        [15, 11],
        [64, 33],
        [160, 99],
        [4, 3],
        [3, 2],
        [2, 1]
      ];
      const ratio = aspectRatioIdc === 255 ? [reader.readBits(16), reader.readBits(16)] : table[aspectRatioIdc];
      aspectRatio = {
        status: aspectRatioIdc === 0 || ratio && (!ratio[0] || !ratio[1]) ? "unspecified" : ratio ? "explicit" : "reserved",
        present: true,
        idc: aspectRatioIdc,
        width: ratio?.[0] ?? null,
        height: ratio?.[1] ?? null
      };
    }
    if (reader.readBit()) reader.readBit();
    if (reader.readBit()) {
      reader.readBits(3);
      color.fullRange = reader.readBit() === 1;
      if (reader.readBit()) {
        color.primariesCode = reader.readBits(8);
        color.transferCode = reader.readBits(8);
        color.matrixCode = reader.readBits(8);
        color.primaries = color.primariesCode === 1 ? "BT.709" : null;
        color.transfer = color.transferCode === 1 ? "BT.709" : null;
        color.matrix = color.matrixCode === 1 ? "BT.709" : null;
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
    return { color, aspectRatio };
  }
  function parseH264Hrd(reader) {
    const cpbCount = reader.readUE() + 1;
    if (cpbCount > 32) throw new RangeError("HRD CPB count exceeds the bounded syntax limit");
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
  function parseH264Sps(nal) {
    if (!(nal instanceof Uint8Array)) return { status: "malformed", code: "H264_SPS_INPUT_INVALID" };
    if (nal.length > 64 * 1024) return { status: "incomplete", code: "H264_SPS_BYTE_LIMIT" };
    try {
      if (nal.length < 5) return { status: "incomplete", code: "H264_SPS_TRUNCATED" };
      if ((nal[0] & 31) !== 7) return { status: "malformed", code: "H264_SPS_INVALID" };
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
        if (chromaFormatIdc > 3) return { status: "malformed", code: "H264_CHROMA_FORMAT_INVALID" };
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
        if (cycle > 256) return { status: "malformed", code: "H264_POC_CYCLE_LIMIT" };
        for (let index = 0; index < cycle; index += 1) reader.readSE();
      } else if (picOrderCntType !== 2) return { status: "malformed", code: "H264_POC_TYPE_INVALID" };
      reader.readUE();
      reader.readBit();
      const picWidthInMbsMinus1 = reader.readUE();
      const picHeightInMapUnitsMinus1 = reader.readUE();
      const frameMbsOnlyFlag = reader.readBit();
      if (!frameMbsOnlyFlag) reader.readBit();
      reader.readBit();
      let cropLeft = 0;
      let cropRight = 0;
      let cropTop = 0;
      let cropBottom = 0;
      if (reader.readBit()) {
        cropLeft = reader.readUE();
        cropRight = reader.readUE();
        cropTop = reader.readUE();
        cropBottom = reader.readUE();
      }
      let color = { fullRange: null, primariesCode: null, transferCode: null, matrixCode: null, primaries: null, transfer: null, matrix: null };
      let aspectRatio = { status: "unspecified", present: false, idc: null, width: null, height: null };
      const vuiPresent = reader.readBit() === 1;
      if (vuiPresent) ({ color, aspectRatio } = parseH264Vui(reader));
      if (!hasValidRbspTrailingBits(reader)) return { status: "incomplete", code: "H264_RBSP_TRAILING_BITS_INVALID" };
      const chromaArrayType = separateColourPlaneFlag ? 0 : chromaFormatIdc;
      const subWidthC = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1;
      const subHeightC = chromaArrayType === 1 ? 2 : 1;
      const cropUnitX = chromaArrayType === 0 ? 1 : subWidthC;
      const cropUnitY = chromaArrayType === 0 ? 2 - frameMbsOnlyFlag : subHeightC * (2 - frameMbsOnlyFlag);
      const width = (picWidthInMbsMinus1 + 1) * 16 - cropUnitX * (cropLeft + cropRight);
      const height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16 - cropUnitY * (cropTop + cropBottom);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 131072 || height > 131072) {
        return { status: "malformed", code: "H264_DIMENSIONS_INVALID" };
      }
      return {
        status: "parsed",
        source: "annex-b-sps",
        codec: "h264",
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
        vuiPresent,
        aspectRatio
      };
    } catch (error) {
      return { status: "incomplete", code: "H264_SPS_TRUNCATED", message: error instanceof Error ? error.message : "SPS bitstream is incomplete." };
    }
  }

  // qa/v2-07b-ts-q1/gop-boundaries.mjs
  var MAX_BYTES = 4 * 1024 * 1024;
  var requireThat = (condition, code) => {
    if (!condition) throw new Error(code);
  };
  var join = (parts) => {
    const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  function timestamp(bytes, offset, prefix) {
    requireThat(offset + 5 <= bytes.length && bytes[offset] >> 4 === prefix && (bytes[offset] & bytes[offset + 2] & bytes[offset + 4] & 1) === 1, "PES_TIMESTAMP");
    return (bytes[offset] & 14) * 536870912 + bytes[offset + 1] * 4194304 + (bytes[offset + 2] & 254) * 16384 + bytes[offset + 3] * 128 + (bytes[offset + 4] >> 1);
  }
  function pes(record, kind) {
    const bytes = join(record.parts);
    requireThat(bytes.length >= 14 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && (kind === "video" ? (bytes[3] & 240) === 224 : (bytes[3] & 224) === 192), "PES_HEADER");
    const declared = bytes[4] * 256 + bytes[5];
    requireThat(declared > 0 && declared + 6 === bytes.length || kind === "video" && declared === 0, "PES_LENGTH");
    requireThat((bytes[6] & 192) === 128 && (bytes[6] & 48) === 0, "PES_ENCRYPTED");
    const flags = bytes[7] >> 6;
    requireThat((flags === 2 || flags === 3) && bytes[8] >= (flags === 3 ? 10 : 5) && 9 + bytes[8] < bytes.length, "PES_TIMING_HEADER");
    const pts = timestamp(bytes, 9, flags);
    const dts = flags === 3 ? timestamp(bytes, 14, 1) : pts;
    return { offset: record.offset, end: record.end, pts, dts, payload: bytes.subarray(9 + bytes[8]) };
  }
  function nals(bytes) {
    const starts = [];
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) {
        starts.push([i, i + 3]);
        i += 2;
      } else if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) {
        starts.push([i, i + 4]);
        i += 3;
      }
    }
    requireThat(starts.length && starts[0][0] === 0, "ANNEX_B_START");
    return starts.map((start, i) => {
      let end = starts[i + 1]?.[0] ?? bytes.length;
      while (end > start[1] && bytes[end - 1] === 0) end--;
      requireThat(end > start[1] && !(bytes[start[1]] & 128), "NAL_HEADER");
      return bytes.subarray(start[1], end);
    });
  }

  // qa/v2-07b-ts-q1/ts-window.mjs
  var demand = (value, code) => {
    if (!value) throw new Error(code);
  };
  var safe = (value) => Number.isSafeInteger(value) && value >= 0;
  var rates = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
  var channels = [0, 1, 2, 3, 4, 5, 6, 8];
  var RECORD_LIMIT = 4096;
  function scanTsWindow(bytes, { offset = 0, videoPid, audioPid, maxPesBytes = 65536, atEof = false } = {}) {
    demand(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 1024 * 1024 && bytes.length % 188 === 0, "WINDOW_INPUT");
    demand(safe(offset) && offset % 188 === 0 && Number.isSafeInteger(offset + bytes.length), "WINDOW_OFFSET");
    demand([videoPid, audioPid].every((pid) => Number.isInteger(pid) && pid >= 16 && pid < 8191) && videoPid !== audioPid, "WINDOW_PIDS");
    demand(Number.isSafeInteger(maxPesBytes) && maxPesBytes >= 14 && maxPesBytes <= 65536 && typeof atEof === "boolean", "WINDOW_OPTIONS");
    const video = [], audio = [], leadingPartial = { video: false, audio: false }, trailingPartial = { video: false, audio: false };
    const tracks = /* @__PURE__ */ new Map([
      [videoPid, { kind: "video", active: null, started: false, leading: false, cc: null }],
      [audioPid, { kind: "audio", active: null, started: false, leading: false, cc: null }]
    ]);
    function parseVideo(parsed) {
      let units;
      try {
        units = nals(parsed.payload);
      } catch {
        throw new Error("WINDOW_H264_FRAMING");
      }
      const types = units.map((unit) => unit[0] & 31);
      demand(types[0] === 9 && types.filter((type) => type === 9).length === 1, "WINDOW_VIDEO_AU");
      demand(types.every((type) => [1, 5, 6, 7, 8, 9].includes(type)), "WINDOW_H264_TYPE");
      demand(units.every((unit) => unit.length >= 2), "WINDOW_H264_FRAMING");
      const vcl = types.filter((type) => type === 1 || type === 5);
      demand(vcl.length > 0 && vcl.every((type) => type === vcl[0]), "WINDOW_VIDEO_PICTURE");
      const idr = vcl[0] === 5;
      const sets = {};
      for (const [name, type] of [["sps", 7], ["pps", 8]]) {
        const found = units.filter((unit) => (unit[0] & 31) === type);
        demand(found.length <= 1 && (!idr || found.length === 1), "WINDOW_VIDEO_PARAMETERS");
        if (found.length) {
          demand((found[0][0] & 96) !== 0, "WINDOW_VIDEO_PARAMETERS");
          if (type === 7) demand(parseH264Sps(found[0]).status === "parsed", "WINDOW_SPS");
        }
        sets[name] = found.length ? Uint8Array.from(found[0]) : null;
      }
      return { offset: parsed.offset, end: parsed.end, pts: parsed.pts, dts: parsed.dts, idr, ...sets };
    }
    function parseAudio(parsed) {
      demand(parsed.pts === parsed.dts, "WINDOW_AUDIO_TIMING");
      const payload = parsed.payload;
      let position = 0, frames = 0, sampleRate = null, channelCount = null;
      while (position < payload.length) {
        demand(
          position + 7 <= payload.length && payload[position] === 255 && (payload[position + 1] & 254) === 240,
          "WINDOW_ADTS_HEADER"
        );
        const header = payload[position + 1] & 1 ? 7 : 9;
        const length = (payload[position + 3] & 3) << 11 | payload[position + 4] << 3 | payload[position + 5] >> 5;
        demand(length > header && position + length <= payload.length && (payload[position + 6] & 3) === 0, "WINDOW_ADTS_FRAME");
        const profile = payload[position + 2] >> 6, rate = rates[payload[position + 2] >> 2 & 15];
        const count = channels[(payload[position + 2] & 1) << 2 | payload[position + 3] >> 6];
        demand(profile === 1 && rate && count, "WINDOW_AAC_CONFIG");
        demand(sampleRate === null || sampleRate === rate && channelCount === count, "WINDOW_AAC_CONFIG");
        sampleRate = rate;
        channelCount = count;
        frames++;
        position += length;
      }
      demand(frames > 0, "WINDOW_ADTS_FRAME");
      return { offset: parsed.offset, end: parsed.end, pts: parsed.pts, dts: parsed.dts, frames, sampleRate, channels: channelCount };
    }
    function complete(track) {
      const record = track.active;
      demand(video.length + audio.length < RECORD_LIMIT, "WINDOW_RECORD_LIMIT");
      let parsed;
      try {
        parsed = pes(record, track.kind);
      } catch {
        throw new Error("WINDOW_PES");
      }
      if (track.kind === "video") video.push(parseVideo(parsed));
      else audio.push(parseAudio(parsed));
      track.active = null;
    }
    function adaptation(packet, control) {
      if (!(control & 2)) return 4;
      const length = packet[4];
      demand(length <= (control === 2 ? 183 : 182) && (control !== 2 || length === 183), "WINDOW_ADAPTATION");
      const end = 5 + length;
      if (length) {
        const flags = packet[5];
        demand(!(flags & 128), "WINDOW_DISCONTINUITY");
        let cursor = 6;
        for (const [flag, count] of [[16, 6], [8, 6], [4, 1]]) if (flags & flag) cursor += count;
        demand(cursor <= end, "WINDOW_ADAPTATION");
        for (const flag of [2, 1]) if (flags & flag) {
          demand(cursor < end, "WINDOW_ADAPTATION");
          cursor += 1 + packet[cursor];
          demand(cursor <= end, "WINDOW_ADAPTATION");
        }
      }
      return end;
    }
    for (let position = 0; position < bytes.length; position += 188) {
      const packet = bytes.subarray(position, position + 188);
      demand(packet[0] === 71 && !(packet[1] & 128) && !(packet[3] & 192), "WINDOW_TRANSPORT");
      const control = packet[3] >> 4 & 3;
      demand(control !== 0, "WINDOW_ADAPTATION");
      const payload = adaptation(packet, control);
      const track = tracks.get((packet[1] & 31) << 8 | packet[2]);
      if (!track) continue;
      const cc = packet[3] & 15;
      demand(track.cc === null || cc === (track.cc + (control & 1 ? 1 : 0)) % 16, "WINDOW_CONTINUITY");
      track.cc = cc;
      if (!(control & 1)) continue;
      demand(payload < 188, "WINDOW_PAYLOAD");
      if (packet[1] & 64) {
        if (track.active) {
          demand(track.active.declared === 0 && track.kind === "video", "WINDOW_PES_TRUNCATED");
          complete(track);
        }
        track.started = true;
        track.leading = false;
        track.active = { offset: offset + position, end: offset + position + 188, parts: [], size: 0, prefix: new Uint8Array(6), prefixLength: 0, declared: null };
      }
      if (!track.started) {
        track.leading = true;
        leadingPartial[track.kind] = true;
        continue;
      }
      demand(track.active, "WINDOW_PES_CONTINUATION");
      const record = track.active, part = packet.subarray(payload);
      demand(record.size + part.length <= maxPesBytes, "WINDOW_PES_LIMIT");
      const prefixBytes = Math.min(6 - record.prefixLength, part.length);
      record.prefix.set(part.subarray(0, prefixBytes), record.prefixLength);
      record.prefixLength += prefixBytes;
      record.parts.push(part);
      record.size += part.length;
      record.end = offset + position + 188;
      if (record.prefixLength === 6 && record.declared === null) {
        demand(record.prefix[0] === 0 && record.prefix[1] === 0 && record.prefix[2] === 1 && (track.kind === "video" ? (record.prefix[3] & 240) === 224 : (record.prefix[3] & 224) === 192), "WINDOW_PES");
        record.declared = record.prefix[4] * 256 + record.prefix[5];
        demand(record.declared > 0 || track.kind === "video", "WINDOW_PES");
        demand(record.declared === 0 || record.declared + 6 <= maxPesBytes, "WINDOW_PES_LIMIT");
      }
      if (record.declared > 0) {
        demand(record.size <= record.declared + 6, "WINDOW_PES_LENGTH");
        if (record.size === record.declared + 6) complete(track);
      }
    }
    for (const track of tracks.values()) {
      if (track.active) {
        if (atEof) {
          demand(track.kind === "video" && track.active.declared === 0, "WINDOW_EOF_TRUNCATED");
          complete(track);
        } else trailingPartial[track.kind] = true;
      } else if (track.leading) trailingPartial[track.kind] = true;
    }
    return {
      video,
      audio,
      leadingPartial,
      trailingPartial,
      scope: "bounded PES/NAL/ADTS syntax anchors with raw 33-bit timestamps; no PSI/source identity, global clock continuity, exact duration, complete-picture/decode or seek guarantee"
    };
  }

  // qa/v2-07b-ts-q1/psi-stream.mjs
  function createPsiStream({ maxSectionBytes = 1024, maxSnapshotBytes = 8192, maxSections = 16 } = {}) {
    const valid = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    if (!valid(maxSectionBytes, 16, 1024) || !valid(maxSnapshotBytes, 32, 32768) || !valid(maxSections, 2, 32)) throw new Error("PSI_LIMIT_OPTIONS");
    let state = createMpegTsPsiState({
      maxSectionBytes,
      maxSections: Number.MAX_SAFE_INTEGER,
      maxPrograms: 1,
      maxStreamsPerProgram: 2,
      maxTotalStreams: 2
    });
    let terminal = false;
    let topology = null;
    let peakRetainedBytes = 0;
    let retainedBytes = 0;
    let snapshotBytes = 0;
    let sectionCount = 0;
    const startFlags = /* @__PURE__ */ new Map();
    const release = () => {
      state = null;
      startFlags.clear();
      retainedBytes = 0;
      snapshotBytes = 0;
      sectionCount = 0;
    };
    const fail = (code) => {
      terminal = true;
      topology = null;
      release();
      throw new Error(code);
    };
    const requireThat2 = (value, code) => {
      if (!value) fail(code);
    };
    const active = () => {
      if (terminal) throw new Error("PSI_TERMINAL");
    };
    const repeated = /* @__PURE__ */ new Set(["PAT_SECTION_DUPLICATE", "PMT_SECTION_DUPLICATE", "PSI_DUPLICATE_PAYLOAD"]);
    const add = (_severity, code) => {
      if (!repeated.has(code)) fail(code);
    };
    function validateState() {
      const sections = [...state.patSet?.sections.values() ?? []];
      for (const program2 of state.programs.values()) sections.push(...program2.pmtSet?.sections.values() ?? []);
      snapshotBytes = sections.reduce((sum, bytes) => sum + bytes.length, 0);
      sectionCount = sections.length;
      retainedBytes = snapshotBytes;
      for (const assembler of state.assemblers.values()) retainedBytes += assembler.pending.length + (assembler.lastPayload?.length ?? 0);
      peakRetainedBytes = Math.max(peakRetainedBytes, retainedBytes);
      requireThat2(sectionCount <= maxSections && snapshotBytes <= maxSnapshotBytes, "PSI_SNAPSHOT_LIMIT");
      for (const section of sections) {
        requireThat2((section[1] & 240) === 176 && (section[5] & 192) === 192 && section[7] < maxSections, "PSI_SECTION_SYNTAX");
        if (section[0] === 0) {
          for (let i = 8; i < section.length - 4; i += 4) requireThat2((section[i + 2] & 224) === 224, "PSI_SECTION_SYNTAX");
        } else {
          requireThat2((section[8] & 224) === 224 && (section[10] & 240) === 240, "PSI_SECTION_SYNTAX");
          let i = 12 + ((section[10] & 15) << 8) + section[11];
          for (; i < section.length - 4; i += 5 + ((section[i + 3] & 15) << 8) + section[i + 4]) {
            requireThat2((section[i + 1] & 224) === 224 && (section[i + 3] & 240) === 240, "PSI_SECTION_SYNTAX");
          }
        }
      }
      requireThat2(state.networkPids.size === 0, "PSI_NETWORK_TABLE_UNPROVEN");
      for (const pid of state.pmtPids) requireThat2(pid >= 16 && pid < 8191, "PSI_PID_INVALID");
      if (!isMpegTsPsiSetComplete(state.patSet)) return;
      requireThat2(state.programs.size === 1, "PSI_SINGLE_PROGRAM_REQUIRED");
      const program = [...state.programs.values()][0];
      if (!program.pmt || !isMpegTsPsiSetComplete(program.pmtSet)) return;
      const streams = program.pmt.streams;
      const video = streams.find((stream) => stream.streamType === 27);
      const audio = streams.find((stream) => stream.streamType === 15);
      requireThat2(streams.length === 2 && video && audio, "PSI_H264_ADTS_REQUIRED");
      for (const stream of streams) requireThat2(stream.elementaryPid >= 16 && stream.elementaryPid < 8191 && stream.elementaryPid !== program.pmtPid, "PSI_PID_INVALID");
      requireThat2(program.pmt.pcrPid >= 16 && program.pmt.pcrPid < 8191 && program.pmt.pcrPid !== program.pmtPid, "PSI_PID_INVALID");
      requireThat2(!program.pmt.programDescriptorTags.includes(9) && streams.every((stream) => !stream.descriptorTags.includes(9)), "PSI_CA_UNPROVEN");
      const next = {
        transportStreamId: state.patSet.transportStreamId,
        programNumber: program.programNumber,
        pmtPid: program.pmtPid,
        pcrPid: program.pmt.pcrPid,
        patVersion: state.patVersion,
        pmtVersion: program.pmt.version,
        videoPid: video.elementaryPid,
        audioPid: audio.elementaryPid
      };
      requireThat2(!topology || Object.keys(next).every((key) => next[key] === topology[key]), "PSI_TOPOLOGY_CHANGE");
      if (!topology) topology = Object.freeze(next);
    }
    return Object.freeze({
      push(packet) {
        active();
        requireThat2(packet instanceof Uint8Array && packet.length === 188 && packet[0] === 71 && !(packet[1] & 128) && !(packet[3] & 192), "PSI_TS_TRANSPORT");
        const pid = (packet[1] & 31) << 8 | packet[2];
        const control = packet[3] >> 4 & 3;
        requireThat2(control !== 0, "PSI_TS_ADAPTATION");
        let offset = 4;
        if (control & 2) {
          requireThat2(packet[4] <= 183 && (control !== 2 || packet[4] === 183), "PSI_TS_ADAPTATION");
          if (packet[4]) requireThat2(!(packet[5] & 128), "PSI_DISCONTINUITY");
          offset += 1 + packet[4];
        }
        if (!(control & 1)) {
          const assembler2 = state.assemblers.get(pid);
          requireThat2(assembler2?.lastPayloadCc == null || (packet[3] & 15) === assembler2.lastPayloadCc, "PSI_ADAPTATION_CONTINUITY");
          return topology;
        }
        requireThat2(offset < 188, "PSI_TS_PAYLOAD");
        if (pid !== 0 && !state.pmtPids.has(pid)) return topology;
        const payload = packet.subarray(offset);
        const start = Boolean(packet[1] & 64);
        const cc = packet[3] & 15;
        const assembler = state.assemblers.get(pid);
        if (assembler?.lastPayloadCc === cc) requireThat2(startFlags.get(pid) === start, "PSI_DUPLICATE_START_CONFLICT");
        else if (!start) requireThat2(assembler?.pending.length > 0, "PSI_ORPHAN_CONTINUATION");
        if (start && !assembler?.pending.length) requireThat2(payload[0] === 0, "PSI_ORPHAN_POINTER");
        state.sectionsExamined = 0;
        state.sectionsValid = 0;
        feedMpegTsPsi(pid, payload, start, cc, false, state, add, 0);
        startFlags.set(pid, start);
        validateState();
        return topology;
      },
      finish() {
        active();
        requireThat2(topology && [...state.assemblers.values()].every((a) => !a.pending.length), "PSI_INCOMPLETE");
        const result = topology;
        terminal = true;
        release();
        return result;
      },
      abort() {
        terminal = true;
        topology = null;
        release();
      },
      stats() {
        return {
          terminal,
          retainedBytes,
          peakRetainedBytes,
          snapshotBytes,
          sectionCount,
          maxRetainedEncodedBytes: maxSnapshotBytes + 3 * maxSectionBytes + 2 * 188
        };
      }
    });
  }

  // qa/v2-07b-ts-q1/video-clock.mjs
  var demand2 = (ok) => {
    if (!ok) throw new Error("VIDEO_CLOCK_UNPROVEN");
  };
  var tick = (n) => Number.isSafeInteger(n) && n >= 0 && n < 2 ** 33;
  var MAX_VIDEO_INTERVAL = 9e4;
  function validateVideoClock(rows, { referenceStep, previousDts = null } = {}) {
    demand2(Array.isArray(rows) && rows.length > 0 && Number.isSafeInteger(referenceStep) && referenceStep > 0 && referenceStep <= MAX_VIDEO_INTERVAL);
    const seen = /* @__PURE__ */ new Set();
    let previous = previousDts;
    for (const row of rows) {
      demand2(tick(row.dts) && tick(row.pts));
      if (previous !== null) demand2(row.dts > previous && row.dts - previous <= MAX_VIDEO_INTERVAL);
      demand2(!seen.has(row.pts) && Math.abs(row.pts - row.dts) <= 16 * referenceStep);
      seen.add(row.pts);
      previous = row.dts;
    }
  }
  function videoGopTiming(rows, { referenceStep, following = null, previousMaxPts = null } = {}) {
    demand2(rows.length >= 3);
    validateVideoClock(rows, { referenceStep });
    const presentation = [...rows].sort((a, b) => a.pts - b.pts);
    demand2(presentation[0].pts === rows[0].pts);
    for (let i = 1; i < presentation.length; i++) demand2(presentation[i].pts - presentation[i - 1].pts <= MAX_VIDEO_INTERVAL);
    if (previousMaxPts !== null) demand2(presentation[0].pts > previousMaxPts && presentation[0].pts - previousMaxPts <= MAX_VIDEO_INTERVAL);
    const last = presentation.at(-1).pts, lastDtsInterval = rows.at(-1).dts - rows.at(-2).dts;
    if (following) {
      validateVideoClock([following], { referenceStep, previousDts: rows.at(-1).dts });
      demand2(following.pts > last && following.pts - last <= MAX_VIDEO_INTERVAL);
    }
    const endPts = following ? following.pts : last + lastDtsInterval;
    demand2(tick(endPts));
    return { presentation, endPts, lastDtsInterval, endInferred: !following };
  }

  // qa/v2-07a-bounded-probe/bounded-probe.mjs
  var MIB = 1024 * 1024;
  var MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  var DEFAULT_LIMITS = Object.freeze({
    requestBytes: 1 * MIB,
    fileBytes: 16 * MIB,
    fileRequests: 64,
    batchBytes: 512 * MIB,
    headersMs: 1e4,
    bodyNoProgressMs: 15e3,
    fileMs: 6e4
  });
  var FAILURE_CODES = Object.freeze([
    "ABORTED",
    "ACCEPT_RANGES_INVALID",
    "BATCH_BYTE_LIMIT",
    "BODY_LENGTH_MISMATCH",
    "BODY_TIMEOUT",
    "BODY_UNAVAILABLE",
    "CACHE_CONTROL_INVALID",
    "CLEANUP_FAILED",
    "CLEANUP_TIMEOUT",
    "CONTENT_LENGTH_INVALID",
    "CONTENT_RANGE_INVALID",
    "DOWNLOAD_FORBIDDEN",
    "FILE_BYTE_LIMIT",
    "FILE_REQUEST_LIMIT",
    "FILE_TIMEOUT",
    "GENERATION_STALE",
    "HEADER_TIMEOUT",
    "IDENTITY_MISMATCH",
    "INVALID_IDENTITY",
    "INVALID_RANGE",
    "INVALID_READER_RESULT",
    "POSTFLIGHT_DRIFT",
    "POSTFLIGHT_FAILED",
    "PREFLIGHT_FAILED",
    "PROBE_FAILED",
    "READER_FAILURE",
    "REQUEST_BYTE_LIMIT",
    "STATUS_NOT_206"
  ]);
  var FAILURE_CODE_SET = new Set(FAILURE_CODES);
  var IDENTITY_FIELDS = Object.freeze([
    "accountKey",
    "fileId",
    "version",
    "size",
    "modifiedTime",
    "mimeType",
    "canDownload"
  ]);
  var BoundedProbeError = class extends Error {
    constructor(code) {
      super(FAILURE_CODE_SET.has(code) ? code : "PROBE_FAILED");
      this.name = "BoundedProbeError";
      this.code = FAILURE_CODE_SET.has(code) ? code : "PROBE_FAILED";
    }
  };

  // qa/v2-07b-ts-q1/ts-seek.mjs
  var demand3 = (condition, code) => {
    if (!condition) throw new Error(code);
  };
  var equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
  var align = (value) => Math.floor(value / 188) * 188;
  var anchor = ({ offset, pts, dts }) => ({ offset, pts, dts });
  async function probeTsSeek({ read, sourceSize, fraction, positionSeconds, windowBytes = 524144, maxWindows = 12, onInput = null } = {}) {
    demand3(
      typeof read === "function" && Number.isSafeInteger(sourceSize) && sourceSize > 0 && sourceSize % 188 === 0,
      "SEEK_OPTIONS"
    );
    const absolute = positionSeconds !== void 0;
    demand3((absolute ? fraction === void 0 && Number.isFinite(positionSeconds) && positionSeconds >= 0 : Number.isFinite(fraction) && fraction > 0 && fraction < 1) && Number.isSafeInteger(windowBytes) && windowBytes >= 188 && windowBytes <= 1024 * 1024 && windowBytes % 188 === 0 && Number.isInteger(maxWindows) && maxWindows >= 1 && maxWindows <= 16 && (onInput === null || typeof onInput === "function"), "SEEK_OPTIONS");
    const width = Math.min(windowBytes, sourceSize), cache = /* @__PURE__ */ new Map(), windows = [];
    const widest = Math.min(align(1024 * 1024), sourceSize);
    const key = (start, length = width) => `${start}:${length}`;
    let topology = null, sourceSps = null, sourcePps = null, audioConfig = null, step = null;
    let firstAudioPts = null;
    try {
      let inspectPsi2 = function(bytes, required) {
        const psi = createPsiStream();
        let found2 = null, started = false;
        try {
          for (let i = 0; i < bytes.length; i += 188) {
            const packet = bytes.subarray(i, i + 188), pid = (packet[1] & 31) << 8 | packet[2];
            if (!started) {
              if (pid !== 0 || !(packet[1] & 64)) continue;
              started = true;
            }
            found2 = psi.push(packet) || found2;
          }
        } catch {
          throw new Error("SEEK_PSI_INVALID");
        } finally {
          psi.abort();
        }
        demand3(!required || found2, "SEEK_HEAD_UNPROVEN");
        if (found2 && topology) demand3(Object.keys(topology).every((key2) => topology[key2] === found2[key2]), "SEEK_TOPOLOGY_CHANGED");
        return found2;
      }, validate = function(result) {
        demand3(result.video.length >= 3 && result.audio.length > 0, "SEEK_WINDOW_UNPROVEN");
        const delta = result.video[1].dts - result.video[0].dts;
        demand3(delta > 0 && delta <= 9e4, "SEEK_VIDEO_CLOCK_UNPROVEN");
        if (step === null) step = delta;
        try {
          validateVideoClock(result.video, { referenceStep: step });
        } catch {
          throw new Error("SEEK_VIDEO_CLOCK_UNPROVEN");
        }
        for (const row of result.video) {
          if (row.sps) demand3(equal(row.sps, sourceSps), "SEEK_PARAMETERS_CHANGED");
          if (row.pps) demand3(equal(row.pps, sourcePps), "SEEK_PARAMETERS_CHANGED");
        }
        let samples = 0;
        const origin = result.audio[0].pts;
        for (const row of result.audio) {
          demand3(row.sampleRate === audioConfig.sampleRate && row.channels === audioConfig.channels, "SEEK_AUDIO_CONFIG_CHANGED");
          const ticksPerFrame = 1024 * 9e4 / row.sampleRate;
          demand3(
            Math.abs(row.pts - origin - samples * 9e4 / row.sampleRate) <= 1 && Math.abs(row.pts - firstAudioPts - Math.round((row.pts - firstAudioPts) / ticksPerFrame) * ticksPerFrame) <= 1,
            "SEEK_AUDIO_CLOCK_UNPROVEN"
          );
          samples += row.frames * 1024;
        }
      }, validateSampleOrder = function() {
        for (const kind of ["video", "audio"]) {
          const samples = /* @__PURE__ */ new Map();
          for (const item2 of cache.values()) for (const row of item2.result[kind]) {
            const prior2 = samples.get(row.offset);
            demand3(!prior2 || prior2.pts === row.pts && prior2.dts === row.dts && prior2.end === row.end, "SEEK_SAMPLE_CONFLICT");
            samples.set(row.offset, row);
          }
          const ordered = [...samples.values()].sort((a, b) => a.offset - b.offset);
          for (let i = 1; i < ordered.length; i++) demand3(ordered[i].dts > ordered[i - 1].dts, "SEEK_SAMPLED_CLOCK_ORDER");
        }
      }, gops = function(item2) {
        const frames = item2.result.video, ids = frames.flatMap((row, index) => row.idr ? [index] : []), result = [];
        for (let n = 0; n < ids.length; n++) {
          const next = ids[n + 1];
          if (next === void 0 && item2.end + 1 !== sourceSize) continue;
          const group2 = frames.slice(ids[n], next);
          let presentation;
          try {
            ({ presentation } = videoGopTiming(group2, { referenceStep: step, following: next === void 0 ? null : frames[next] }));
          } catch {
            throw new Error("SEEK_GOP_PRESENTATION_UNPROVEN");
          }
          result.push({ rap: group2[0], presentation, next: next === void 0 ? null : frames[next], count: group2.length });
        }
        return result;
      }, find = function() {
        let chosen = null;
        for (const item2 of cache.values()) for (const group2 of gops(item2)) {
          if (group2.rap.pts > targetTicks || group2.next && targetTicks >= group2.next.pts) continue;
          const following2 = group2.presentation.find((row) => row.pts >= targetTicks) || group2.next;
          const prior2 = [...group2.presentation].reverse().find((row) => row.pts <= targetTicks);
          if (!following2 || !prior2) continue;
          if (!chosen || group2.rap.offset > chosen.rap.offset) chosen = { group: group2, item: item2, rap: group2.rap, prior: prior2, following: following2 };
        }
        return chosen;
      };
      async function sample(start, head2 = false, length = width) {
        start = Math.max(0, Math.min(sourceSize - length, align(start)));
        if (cache.has(key(start, length))) return cache.get(key(start, length));
        demand3(windows.length < maxWindows, "SEEK_WINDOW_BUDGET");
        const end = start + length - 1;
        let bytes;
        try {
          bytes = await read({ start, end });
        } catch (error) {
          if (error instanceof BoundedProbeError) throw new BoundedProbeError(error.code);
          throw new Error("SEEK_READ_FAILED");
        }
        demand3(bytes instanceof Uint8Array && bytes.length === length, "SEEK_READ_LENGTH");
        bytes = Uint8Array.from(bytes);
        const observed = inspectPsi2(bytes, head2);
        if (head2) topology = observed;
        let result;
        try {
          result = scanTsWindow(bytes, { offset: start, videoPid: topology.videoPid, audioPid: topology.audioPid, atEof: end + 1 === sourceSize });
        } catch {
          throw new Error("SEEK_WINDOW_INVALID");
        }
        if (head2) {
          const first = result.video[0];
          demand3(first?.idr && first.sps && first.pps && result.audio.length && !result.leadingPartial.video && !result.leadingPartial.audio, "SEEK_HEAD_UNPROVEN");
          sourceSps = Uint8Array.from(first.sps);
          sourcePps = Uint8Array.from(first.pps);
          firstAudioPts = result.audio[0].pts;
          audioConfig = { sampleRate: result.audio[0].sampleRate, channels: result.audio[0].channels };
        }
        validate(result);
        const item2 = { start, end, result, bytes: onInput ? bytes : null };
        cache.set(key(start, length), item2);
        validateSampleOrder();
        windows.push({
          start,
          end,
          bytes: length,
          videoAnchors: result.video.length,
          audioAnchors: result.audio.length,
          firstVideoDts: result.video[0].dts,
          lastVideoDts: result.video.at(-1).dts,
          topologyReobserved: Boolean(observed)
        });
        return item2;
      }
      let head = await sample(0, true), tail = await sample(sourceSize - width);
      if (!gops(head).length && width < widest) head = await sample(0, true, widest);
      if (!gops(tail).length && width < widest) tail = await sample(sourceSize - widest, false, widest);
      const headGops = gops(head), tailGops = gops(tail);
      demand3(headGops.length && tailGops.length, "SEEK_EDGE_GOP_UNPROVEN");
      const originTicks = Math.min(...head.result.video.map((row) => row.pts), head.result.audio[0].pts);
      const tailFrames = tail.result.video;
      const videoEnd = Math.max(...tailFrames.map((row) => row.pts)) + (tailFrames.at(-1).dts - tailFrames.at(-2).dts);
      const audioLast = tail.result.audio.at(-1), audioEnd = audioLast.pts + audioLast.frames * 1024 * 9e4 / audioLast.sampleRate;
      const endTicks = Math.max(videoEnd, audioEnd);
      demand3(
        endTicks > originTicks && endTicks < 2 ** 33 && Math.max(videoEnd, audioEnd) - Math.min(videoEnd, audioEnd) <= 9e4,
        "SEEK_TIMELINE_UNPROVEN"
      );
      const lastVideoPts = Math.max(...tail.result.video.map((row) => row.pts));
      const targetTicks = absolute ? Math.max(head.result.video[0].pts, Math.min(lastVideoPts, originTicks + positionSeconds * 9e4)) : originTicks + fraction * (endTicks - originTicks);
      demand3(targetTicks >= head.result.video[0].pts, "SEEK_TARGET_BEFORE_VIDEO");
      demand3(targetTicks <= lastVideoPts, "SEEK_TARGET_AFTER_LAST_ANCHOR");
      const timeline = {
        kind: "sampled-candidate",
        originTicks,
        endTicks,
        durationSeconds: (endTicks - originTicks) / 9e4,
        videoEndTicks: videoEnd,
        audioEndTicks: audioEnd,
        videoStepTicks: step,
        videoTiming: "observed-intervals",
        finalVideoDurationInferred: true,
        globalContinuityVerified: false
      };
      let found = find(), lower = head.result.video[0], upper = tail.result.video.at(-1);
      while (!found) {
        demand3(lower.dts < upper.dts && lower.offset < upper.offset, "SEEK_TARGET_UNBRACKETED");
        const ratio = Math.max(0, Math.min(1, (targetTicks - lower.pts) / (upper.pts - lower.pts)));
        let start = align(lower.offset + ratio * (upper.offset - lower.offset) - width / 2);
        start = Math.max(0, Math.min(sourceSize - width, start));
        if (cache.has(key(start))) {
          const center = start, alternatives = [center - align(width / 2), center + align(width / 2), align(lower.offset + (upper.offset - lower.offset) / 2 - width / 2)];
          start = alternatives.map((value) => Math.max(0, Math.min(sourceSize - width, align(value)))).find((value) => !cache.has(key(value)));
          demand3(start !== void 0, "SEEK_TARGET_UNBRACKETED");
        }
        const item2 = await sample(start), frames = item2.result.video;
        found = find();
        if (!found) {
          const firstPts = Math.min(...frames.map((row) => row.pts)), lastPts = Math.max(...frames.map((row) => row.pts));
          if (lastPts < targetTicks && frames.at(-1).offset > lower.offset) lower = { ...frames.at(-1), pts: lastPts };
          else if (firstPts > targetTicks && frames[0].offset < upper.offset) upper = { ...frames[0], pts: firstPts };
          else {
            const expanded = Math.max(0, Math.min(sourceSize - widest, align(start - (widest - width) / 2)));
            if (width < widest && !cache.has(key(expanded, widest))) {
              await sample(expanded, false, widest);
              found = find();
            }
            demand3(found, "SEEK_LOCAL_GOP_UNPROVEN");
          }
        }
      }
      const { rap, group, item, prior, following } = found;
      const plan = {
        topology: { ...topology },
        sourceSize,
        timeline,
        targetTicks,
        rap: { offset: rap.offset, end: rap.end, pts: rap.pts, dts: rap.dts, sps: Uint8Array.from(rap.sps), pps: Uint8Array.from(rap.pps) },
        local: {
          windowStart: item.start,
          windowEndExclusive: item.end + 1,
          videoFrames: group.count,
          before: anchor(prior),
          after: anchor(following),
          followingRap: group.next ? anchor(group.next) : null,
          sourceClockPreserved: true,
          completePicturesVerified: false,
          decodeStartSliceVerified: false
        },
        windows: windows.map((row) => ({ ...row })),
        readBytes: windows.reduce((sum, row) => sum + row.bytes, 0),
        scope: "bounded sampled RAP candidate with observed-clock/bracket evidence; not global timeline, exact duration, decoded seek or a directly playable TS slice"
      };
      if (onInput) {
        const delivered = onInput({
          headBytes: head.bytes.subarray(0, Math.min(sourceSize, Math.floor(65536 / 188) * 188)),
          bytes: item.bytes,
          offset: item.start,
          plan
        });
        if (delivered && typeof delivered.then === "function") {
          Promise.resolve(delivered).catch(() => {
          });
          throw new Error("SEEK_INPUT_CALLBACK");
        }
        demand3(delivered === void 0, "SEEK_INPUT_CALLBACK");
      }
      return plan;
    } finally {
      for (const item of cache.values()) item.bytes = null;
      cache.clear();
    }
  }

  // qa/rc29-ts-gop-diagnostic/analyzer.mjs
  var VERSION = "1.22.0-rc.29";
  var SOURCE_COMMIT = "10f1dd2ee9550866933e693dbf41c62e1fb2daad";
  var WIDTH = 524144;
  var MAX = 9e4;
  var safeTick = (n) => Number.isSafeInteger(n) && n >= 0 && n < 2 ** 33;
  var goodStep = (n) => Number.isSafeInteger(n) && n > 0 && n <= MAX;
  var attempt = (fn) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  var safeDelta = (n) => Number.isSafeInteger(n) && Math.abs(n) < 2 ** 33 ? n : null;
  function clockConditions(rows, step) {
    return {
      ticksValid: rows.every((r) => safeTick(r.pts) && safeTick(r.dts)),
      referenceStepValid: goodStep(step),
      dtsStrictlyIncreasing: rows.every((r, i) => !i || r.dts > rows[i - 1].dts),
      dtsIntervalsBounded: rows.every((r, i) => !i || r.dts - rows[i - 1].dts <= MAX),
      uniquePts: new Set(rows.map((r) => r.pts)).size === rows.length,
      reorderBounded: goodStep(step) && rows.every((r) => Math.abs(r.pts - r.dts) <= 16 * step),
      canonicalClockPass: attempt(() => validateVideoClock(rows, { referenceStep: step }))
    };
  }
  function groupSummary(rows, step, following, eof) {
    const presentation = [...rows].sort((a, b) => a.pts - b.pts), first = rows[0], last = presentation.at(-1);
    const lastInterval = rows.length >= 2 ? rows.at(-1).dts - rows.at(-2).dts : null;
    return {
      frameCount: rows.length,
      atEof: eof,
      hasFollowing: !!following,
      shorterThanThree: rows.length < 3,
      ...clockConditions(rows, step),
      idrIsMinimumPts: first.pts === presentation[0].pts,
      presentationIntervalsBounded: presentation.every((r, i) => !i || r.pts - presentation[i - 1].pts <= MAX),
      followingDecodePass: !following || attempt(() => validateVideoClock([following], { referenceStep: step, previousDts: rows.at(-1).dts })),
      followingPtsAfterMaximum: !following || following.pts > last.pts,
      followingPtsGapBounded: !following || following.pts - last.pts <= MAX,
      endTickValid: following ? safeTick(following.pts) : lastInterval !== null && safeTick(last.pts + lastInterval),
      minimumMinusIdrTicks: safeDelta(presentation[0].pts - first.pts),
      followingMinusMaximumTicks: following ? safeDelta(following.pts - last.pts) : null,
      lastDecodeIntervalTicks: safeDelta(lastInterval),
      canonicalTimingPass: attempt(() => videoGopTiming(rows, { referenceStep: step, following }))
    };
  }
  function summarize(result, step, eof) {
    const frames = result.video, ids = frames.flatMap((r, i) => r.idr ? [i] : []), groups = [];
    for (let n = 0; n < ids.length; n++) {
      const next = ids[n + 1];
      if (next === void 0 && !eof) continue;
      groups.push(groupSummary(frames.slice(ids[n], next), step, next === void 0 ? null : frames[next], next === void 0 && eof));
    }
    const failures = groups.filter((g) => !g.canonicalTimingPass);
    return {
      videoFrames: frames.length,
      audioRecords: result.audio.length,
      leadingPartial: { ...result.leadingPartial },
      trailingPartial: { ...result.trailingPartial },
      ...clockConditions(frames, step),
      gopCount: groups.length,
      failedGopCount: failures.length,
      firstGop: groups[0] ?? null,
      lastGop: groups.at(-1) ?? null,
      failedGops: failures.slice(0, 8),
      failureDetailsTruncated: failures.length > 8,
      audioSampleRate: result.audio[0]?.sampleRate ?? null,
      audioChannels: result.audio[0]?.channels ?? null
    };
  }
  function inspectPsi(bytes, required) {
    const psi = createPsiStream();
    let found = null, started = false;
    try {
      for (let i = 0; i < bytes.length; i += 188) {
        const p = bytes.subarray(i, i + 188), pid = (p[1] & 31) << 8 | p[2];
        if (!started) {
          if (pid !== 0 || !(p[1] & 64)) continue;
          started = true;
        }
        found = psi.push(p) || found;
      }
      if (required && !found) throw Error("PSI");
      return found;
    } finally {
      psi.abort();
    }
  }
  var PROBE_CODES = /* @__PURE__ */ new Set([
    "SEEK_OPTIONS",
    "SEEK_PSI_INVALID",
    "SEEK_HEAD_UNPROVEN",
    "SEEK_TOPOLOGY_CHANGED",
    "SEEK_WINDOW_UNPROVEN",
    "SEEK_VIDEO_CLOCK_UNPROVEN",
    "SEEK_PARAMETERS_CHANGED",
    "SEEK_AUDIO_CONFIG_CHANGED",
    "SEEK_AUDIO_CLOCK_UNPROVEN",
    "SEEK_SAMPLE_CONFLICT",
    "SEEK_SAMPLED_CLOCK_ORDER",
    "SEEK_WINDOW_BUDGET",
    "SEEK_READ_FAILED",
    "SEEK_READ_LENGTH",
    "SEEK_WINDOW_INVALID",
    "SEEK_GOP_PRESENTATION_UNPROVEN",
    "SEEK_EDGE_GOP_UNPROVEN",
    "SEEK_TIMELINE_UNPROVEN",
    "SEEK_TARGET_BEFORE_VIDEO",
    "SEEK_TARGET_AFTER_LAST_ANCHOR",
    "SEEK_TARGET_UNBRACKETED",
    "SEEK_LOCAL_GOP_UNPROVEN"
  ]);
  async function analyzeTsGops(input = {}) {
    const { headBytes, tailBytes, sourceSize, tailOffset, headAtEof, tailAtEof, version, sourceCommit } = input;
    if (version !== VERSION || sourceCommit !== SOURCE_COMMIT) return { stage: "binding", code: "FIXED29_BINDING_REQUIRED" };
    const width = Math.min(WIDTH, sourceSize);
    if (!Number.isSafeInteger(sourceSize) || sourceSize < 188 || sourceSize % 188 !== 0 || !(headBytes instanceof Uint8Array) || !(tailBytes instanceof Uint8Array) || headBytes.length !== width || tailBytes.length !== width || tailOffset !== sourceSize - width || tailOffset % 188 !== 0 || headAtEof !== (width === sourceSize) || tailAtEof !== true)
      return { stage: "input", code: "TWO_BOUNDED_EDGE_WINDOWS_REQUIRED" };
    const head = Uint8Array.from(headBytes), tail = Uint8Array.from(tailBytes);
    try {
      if (tailOffset === 0 && !head.every((v, i) => v === tail[i])) return { stage: "input", code: "SAME_WINDOW_CONFLICT" };
      let topology, tailTopology;
      try {
        topology = inspectPsi(head, true);
        tailTopology = inspectPsi(tail, false);
      } catch {
        return { stage: "psi", code: "PSI_REJECTED" };
      }
      if (tailTopology && !Object.keys(topology).every((k) => topology[k] === tailTopology[k])) return { stage: "psi", code: "TOPOLOGY_CHANGED" };
      let h, t;
      try {
        h = scanTsWindow(head, { offset: 0, ...topology, atEof: headAtEof });
      } catch {
        return { stage: "head-syntax", code: "WINDOW_SYNTAX_REJECTED" };
      }
      try {
        t = scanTsWindow(tail, { offset: tailOffset, ...topology, atEof: true });
      } catch {
        return { stage: "tail-syntax", code: "WINDOW_SYNTAX_REJECTED" };
      }
      const step = h.video[1]?.dts - h.video[0]?.dts;
      let reads = 0, beyond = false, code = "CANONICAL_STARTUP_PLAN_PASS";
      try {
        await probeTsSeek({ sourceSize, positionSeconds: 0, windowBytes: width, maxWindows: 2, read: async ({ start, end }) => {
          reads++;
          if (reads > 2 || end - start + 1 !== width || start !== 0 && start !== tailOffset) {
            beyond = true;
            throw Error("UNSUPPLIED");
          }
          return start === 0 ? head : tail;
        } });
      } catch (error) {
        code = beyond ? "FIXED_WINDOWS_EXHAUSTED" : PROBE_CODES.has(error?.message) ? error.message : "CANONICAL_REJECTED";
      }
      return {
        stage: "timing",
        code,
        referenceStepTicks: safeDelta(step),
        canonicalReadCount: reads,
        additionalWindowsNeeded: beyond || code === "SEEK_WINDOW_BUDGET",
        head: summarize(h, step, headAtEof),
        tail: summarize(t, step, true)
      };
    } finally {
      head.fill(0);
      tail.fill(0);
    }
  }
  return __toCommonJS(analyzer_exports);
})();

return Object.freeze({analyze:diagnostic.analyzeTsGops,binding:Object.freeze({"version":"1.22.0-rc.29","sourceCommit":"10f1dd2ee9550866933e693dbf41c62e1fb2daad","sourceSHA256":{"qa/rc29-ts-gop-diagnostic/analyzer.mjs":"a6816b5336afb7a8bea1842deba14e2baead67ea3873430477a33d0ca8bca39e","qa/v2-07a-bounded-probe/bounded-probe.mjs":"41aca3c9e48fdb67b094f3d57b6188def1405f59cb23853365b3272a30d84000","qa/v2-07a-container-probe/mpeg-ts-probe.mjs":"3d2753568f655d3bcd534303dcdc7b2b37092e7cc6fff82563b3e64e3c92e08e","qa/v2-07b-ts-q1/gop-boundaries.mjs":"1d8453075e89abb64e4f6e7112c0b11fafcaeaf1f17f1b2f7c8f3f760a221df2","qa/v2-07b-ts-q1/psi-stream.mjs":"005e2fbb81754b76d3be5a7c051cfd02bdee343369740a34a86cb82264d4aa0b","qa/v2-07b-ts-q1/ts-seek.mjs":"6a382de8854f8bc517d244bcc98d9960d81386a7dc85f956724fa706d6ff7470","qa/v2-07b-ts-q1/ts-window.mjs":"3ff06e6da20108eda6fd527b20247bf61339b3c7d51a8a9c1b6b9ef97db0a450","qa/v2-07b-ts-q1/video-clock.mjs":"490425b3e7d8a60fe95eba6a44a30bda899a800966ea9995c81f19884f5963c8","media/q1-core.mjs":"7347d2b05e50f08501bee2e50ab7ed30e76f1dd653b0f9129bba6e0c047ccff8","media/transmux-worker.mjs":"373c3a822061addcddb1a67048f9f73a77b352d6d301f9f62e63d6578cb87bbc","app.js":"52942a10481ccf4107db5f6cee0c1e7b7308965fc146d600fa497c4d418af01e","sw.js":"7e91f5b433bfd70a62b28876937435ac0aa701aefec8a026f4fba7c8b16c2394","version.json":"3e84682dd19aae6157d6282acccc40e90d1327b10509a17a4856edbd8e7d13de"}})});
})()
