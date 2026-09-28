// Maintained semantic summary copied from historical MPEG-TS adapter; no runtime adapter dependency.
const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
export const TS_OUTCOMES = Object.freeze(['MPEG_TS_STRUCTURE_COMPLETE','PROBE_LIMIT_REACHED','UNSUPPORTED_TS_FEATURE','MALFORMED_MPEG_TS','TRUNCATED_MPEG_TS','PSI_NOT_COMPLETE','TS_SYNC_NOT_FOUND','INPUT_TYPE_INVALID','BYTE_LIMIT_EXCEEDED','PARSER_RESULT_INVALID']);
const MPEG_TS_OUTCOME_SET = new Set(TS_OUTCOMES);
function classifySignalling(streams, kind, targetCodec) {
  const matching = streams.filter((stream) => stream.kind === kind);
  if (matching.length === 0) return 'none';
  const hasTarget = matching.some((stream) => (
    stream.codec === targetCodec || stream.codecFamily === targetCodec
  ));
  const hasOther = matching.some((stream) => (
    stream.codec !== targetCodec && stream.codecFamily !== targetCodec
  ));
  if (hasTarget && hasOther) return 'mixed';
  return hasTarget ? 'target-only' : 'other-only';
}

function classifyVideoProfile(streams) {
  const h264 = streams.filter((stream) => (
    stream.kind === 'video' && (stream.codec === 'h264' || stream.codecFamily === 'h264')
  ));
  if (h264.length === 0) return 'not-applicable';
  const parsed = h264.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.profileIdc === 100 && details.levelIdc === 30
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

function classifyAudioProfile(streams) {
  const aac = streams.filter((stream) => (
    stream.kind === 'audio' && (stream.codec === 'aac' || stream.codecFamily === 'aac')
  ));
  if (aac.length === 0) return 'not-applicable';
  const parsed = aac.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.objectType === 2 && details.sampleRate === 48_000 && details.channels === 2
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

function classifyVideoFormat(streams) {
  const h264 = streams.filter((stream) => (
    stream.kind === 'video' && (stream.codec === 'h264' || stream.codecFamily === 'h264')
  ));
  if (h264.length === 0) return 'not-applicable';
  const parsed = h264.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.width === 360
    && details.height === 640
    && isPlainObject(details.color)
    && details.color.fullRange === false
    && details.color.primaries === 'BT.709'
    && details.color.transfer === 'BT.709'
    && details.color.matrix === 'BT.709'
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

export function summarizeMpegTs(result) {
  if (!isPlainObject(result) || !isPlainObject(result.outcome)
    || !MPEG_TS_OUTCOME_SET.has(result.outcome.code)
    || !Array.isArray(result.programs)) {
    return Object.freeze({
      outcome: 'PARSER_RESULT_INVALID',
      videoSignalling: 'none',
      audioSignalling: 'none',
      videoProfileEvidence: 'not-applicable',
      videoFormatEvidence: 'not-applicable',
      audioProfileEvidence: 'not-applicable'
    });
  }
  const streams = result.programs.flatMap((program) => (
    isPlainObject(program) && Array.isArray(program.streams) ? program.streams : []
  )).filter(isPlainObject);
  const detailEvidence = result.outcome.code === 'MPEG_TS_STRUCTURE_COMPLETE'
    ? streams
    : streams.map((stream) => ({ ...stream, codecDetails: null }));
  return Object.freeze({
    outcome: result.outcome.code,
    videoSignalling: classifySignalling(streams, 'video', 'h264'),
    audioSignalling: classifySignalling(streams, 'audio', 'aac'),
    videoProfileEvidence: classifyVideoProfile(detailEvidence),
    videoFormatEvidence: classifyVideoFormat(detailEvidence),
    audioProfileEvidence: classifyAudioProfile(detailEvidence)
  });
}

