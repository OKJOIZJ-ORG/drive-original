// Browser-safe, QA-only incremental PSI owner. push(raw188) returns null until
// complete, then the same frozen topology object. No elementary codec inference.
// finish() requires complete topology and no pending PSI; abort()/failure/finish
// are terminal (create a new owner for a new source generation). Errors contain
// fixed codes only. Other PIDs are not retained or interpreted as PSI.
// maxSnapshotBytes bounds retained section copies; a packet's assembly scratch
// can transiently add <= maxSectionBytes + 188 before the post-packet check.
// stats() counts encoded retained bytes, NOT JS object/array heap overhead.
import { createMpegTsPsiState, feedMpegTsPsi, isMpegTsPsiSetComplete } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

export function createPsiStream({ maxSectionBytes = 1024, maxSnapshotBytes = 8192, maxSections = 16 } = {}) {
  const valid = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!valid(maxSectionBytes, 16, 1024) || !valid(maxSnapshotBytes, 32, 32768)
    || !valid(maxSections, 2, 32)) throw new Error('PSI_LIMIT_OPTIONS');
  let state = createMpegTsPsiState({ maxSectionBytes, maxSections: Number.MAX_SAFE_INTEGER,
    maxPrograms: 1, maxStreamsPerProgram: 2, maxTotalStreams: 2 });
  let terminal = false; let topology = null; let peakRetainedBytes = 0;
  let retainedBytes = 0; let snapshotBytes = 0; let sectionCount = 0;
  const startFlags = new Map();
  const release = () => { state = null; startFlags.clear(); retainedBytes = 0; snapshotBytes = 0; sectionCount = 0; };
  const fail = code => { terminal = true; topology = null; release(); throw new Error(code); };
  const requireThat = (value, code) => { if (!value) fail(code); };
  const active = () => { if (terminal) throw new Error('PSI_TERMINAL'); };
  const repeated = new Set(['PAT_SECTION_DUPLICATE', 'PMT_SECTION_DUPLICATE', 'PSI_DUPLICATE_PAYLOAD']);
  const add = (_severity, code) => { if (!repeated.has(code)) fail(code); };

  function validateState() {
    const sections = [...(state.patSet?.sections.values() ?? [])];
    for (const program of state.programs.values()) sections.push(...(program.pmtSet?.sections.values() ?? []));
    snapshotBytes = sections.reduce((sum, bytes) => sum + bytes.length, 0);
    sectionCount = sections.length;
    retainedBytes = snapshotBytes;
    for (const assembler of state.assemblers.values()) retainedBytes += assembler.pending.length + (assembler.lastPayload?.length ?? 0);
    peakRetainedBytes = Math.max(peakRetainedBytes, retainedBytes);
    requireThat(sectionCount <= maxSections && snapshotBytes <= maxSnapshotBytes, 'PSI_SNAPSHOT_LIMIT');
    for (const section of sections) {
      requireThat((section[1] & 0xf0) === 0xb0 && (section[5] & 0xc0) === 0xc0
        && section[7] < maxSections, 'PSI_SECTION_SYNTAX');
      if (section[0] === 0) {
        for (let i = 8; i < section.length - 4; i += 4) requireThat((section[i + 2] & 0xe0) === 0xe0, 'PSI_SECTION_SYNTAX');
      } else {
        requireThat((section[8] & 0xe0) === 0xe0 && (section[10] & 0xf0) === 0xf0, 'PSI_SECTION_SYNTAX');
        let i = 12 + ((section[10] & 15) << 8) + section[11];
        for (; i < section.length - 4; i += 5 + ((section[i + 3] & 15) << 8) + section[i + 4]) {
          requireThat((section[i + 1] & 0xe0) === 0xe0 && (section[i + 3] & 0xf0) === 0xf0, 'PSI_SECTION_SYNTAX');
        }
      }
    }
    requireThat(state.networkPids.size === 0, 'PSI_NETWORK_TABLE_UNPROVEN');
    for (const pid of state.pmtPids) requireThat(pid >= 16 && pid < 8191, 'PSI_PID_INVALID');
    if (!isMpegTsPsiSetComplete(state.patSet)) return;
    requireThat(state.programs.size === 1, 'PSI_SINGLE_PROGRAM_REQUIRED');
    const program = [...state.programs.values()][0];
    if (!program.pmt || !isMpegTsPsiSetComplete(program.pmtSet)) return;
    const streams = program.pmt.streams;
    const video = streams.find(stream => stream.streamType === 27);
    const audio = streams.find(stream => stream.streamType === 15);
    requireThat(streams.length === 2 && video && audio, 'PSI_H264_ADTS_REQUIRED');
    for (const stream of streams) requireThat(stream.elementaryPid >= 16 && stream.elementaryPid < 8191
      && stream.elementaryPid !== program.pmtPid, 'PSI_PID_INVALID');
    requireThat(program.pmt.pcrPid >= 16 && program.pmt.pcrPid < 8191 && program.pmt.pcrPid !== program.pmtPid, 'PSI_PID_INVALID');
    requireThat(!program.pmt.programDescriptorTags.includes(9) && streams.every(stream => !stream.descriptorTags.includes(9)), 'PSI_CA_UNPROVEN');
    const next = { transportStreamId: state.patSet.transportStreamId, programNumber: program.programNumber,
      pmtPid: program.pmtPid, pcrPid: program.pmt.pcrPid, patVersion: state.patVersion,
      pmtVersion: program.pmt.version, videoPid: video.elementaryPid, audioPid: audio.elementaryPid };
    requireThat(!topology || Object.keys(next).every(key => next[key] === topology[key]), 'PSI_TOPOLOGY_CHANGE');
    if (!topology) topology = Object.freeze(next);
  }

  return Object.freeze({
    push(packet) {
      active();
      requireThat(packet instanceof Uint8Array && packet.length === 188 && packet[0] === 0x47
        && !(packet[1] & 128) && !(packet[3] & 192), 'PSI_TS_TRANSPORT');
      const pid = ((packet[1] & 31) << 8) | packet[2];
      const control = (packet[3] >> 4) & 3;
      requireThat(control !== 0, 'PSI_TS_ADAPTATION');
      let offset = 4;
      if (control & 2) {
        requireThat(packet[4] <= 183 && (control !== 2 || packet[4] === 183), 'PSI_TS_ADAPTATION');
        if (packet[4]) requireThat(!(packet[5] & 128), 'PSI_DISCONTINUITY');
        offset += 1 + packet[4];
      }
      if (!(control & 1)) {
        const assembler = state.assemblers.get(pid);
        requireThat(assembler?.lastPayloadCc == null || (packet[3] & 15) === assembler.lastPayloadCc, 'PSI_ADAPTATION_CONTINUITY');
        return topology;
      }
      requireThat(offset < 188, 'PSI_TS_PAYLOAD');
      if (pid !== 0 && !state.pmtPids.has(pid)) return topology;
      const payload = packet.subarray(offset); const start = Boolean(packet[1] & 64); const cc = packet[3] & 15;
      const assembler = state.assemblers.get(pid);
      if (assembler?.lastPayloadCc === cc) requireThat(startFlags.get(pid) === start, 'PSI_DUPLICATE_START_CONFLICT');
      else if (!start) requireThat(assembler?.pending.length > 0, 'PSI_ORPHAN_CONTINUATION');
      if (start && !assembler?.pending.length) requireThat(payload[0] === 0, 'PSI_ORPHAN_POINTER');
      // Lifetime repeat counts are not a memory limit. The shared parser still
      // validates every section CRC; unique snapshots are bounded separately.
      state.sectionsExamined = 0; state.sectionsValid = 0;
      feedMpegTsPsi(pid, payload, start, cc, false, state, add, 0);
      startFlags.set(pid, start);
      validateState();
      return topology;
    },
    finish() {
      active();
      requireThat(topology && [...state.assemblers.values()].every(a => !a.pending.length), 'PSI_INCOMPLETE');
      const result = topology; terminal = true; release(); return result;
    },
    abort() { terminal = true; topology = null; release(); },
    stats() { return { terminal, retainedBytes, peakRetainedBytes, snapshotBytes, sectionCount,
      maxRetainedEncodedBytes: maxSnapshotBytes + 3 * maxSectionBytes + 2 * 188 }; },
  });
}
