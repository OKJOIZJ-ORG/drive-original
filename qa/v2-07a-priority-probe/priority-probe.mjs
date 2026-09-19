import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

export const PROBE_VERSION = 'v2-07a.2';
export const FFPROBE_SIZE_OPTION_BYTES = 8 * 1024 * 1024;
export const FFPROBE_ANALYZE_DURATION_US = 5 * 1000 * 1000;
export const FFPROBE_TIMEOUT_MS = 30 * 1000;
export const MIN_Q1_PROBE_SCORE = 50;

const execFileAsync = promisify(execFile);

export class PriorityProbeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PriorityProbeError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PriorityProbeError(code, message);
}

function requiredString(value, code, message) {
  const normalized = String(value ?? '').trim();
  if (!normalized) fail(code, message);
  return normalized;
}

function requiredPositiveInteger(value, code, message) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) fail(code, message);
  return normalized;
}

function normalizeExpected(privateEvidence) {
  const fileName = requiredString(
    privateEvidence?.drive?.name,
    'INVALID_EXPECTATION',
    'The private expectation must include the Drive file name.'
  );
  const mimeType = requiredString(
    privateEvidence?.drive?.mimeType,
    'INVALID_EXPECTATION',
    'The private expectation must include the Drive MIME type.'
  );
  const sha256 = requiredString(
    privateEvidence?.localBytes?.sha256,
    'INVALID_EXPECTATION',
    'The private expectation must include the local mirror SHA-256.'
  ).toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(sha256)) {
    fail('INVALID_EXPECTATION', 'The private expectation SHA-256 is malformed.');
  }
  return Object.freeze({
    extension: path.extname(fileName).toLowerCase(),
    mimeType,
    size: requiredPositiveInteger(
      privateEvidence?.drive?.size,
      'INVALID_EXPECTATION',
      'The private expectation must include a positive safe file size.'
    ),
    driveVersionBaseline: requiredPositiveInteger(
      privateEvidence?.drive?.driveApiIntegerVersion,
      'INVALID_EXPECTATION',
      'The private expectation must include the historical Drive files.version baseline.'
    ),
    sha256
  });
}

function normalizeRatio(value) {
  const text = String(value ?? '');
  return /^\d+\/\d+$/.test(text) ? text : null;
}

function normalizeNumberString(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeNumericOrRatio(value) {
  return normalizeRatio(value) ?? normalizeNumberString(value);
}

function normalizeSideData(stream) {
  return (Array.isArray(stream?.side_data_list) ? stream.side_data_list : []).map((entry) => ({
    type: entry?.side_data_type || null,
    rotationDegrees: normalizeNumberString(entry?.rotation),
    maxContentLightLevel: normalizeNumberString(entry?.max_content),
    maxFrameAverageLightLevel: normalizeNumberString(entry?.max_average),
    masteringDisplay: {
      redX: normalizeNumericOrRatio(entry?.red_x),
      redY: normalizeNumericOrRatio(entry?.red_y),
      greenX: normalizeNumericOrRatio(entry?.green_x),
      greenY: normalizeNumericOrRatio(entry?.green_y),
      blueX: normalizeNumericOrRatio(entry?.blue_x),
      blueY: normalizeNumericOrRatio(entry?.blue_y),
      whitePointX: normalizeNumericOrRatio(entry?.white_point_x),
      whitePointY: normalizeNumericOrRatio(entry?.white_point_y),
      minLuminance: normalizeNumericOrRatio(entry?.min_luminance),
      maxLuminance: normalizeNumericOrRatio(entry?.max_luminance)
    }
  }));
}

function inferBitDepth(stream) {
  const explicit = normalizeNumberString(stream?.bits_per_raw_sample);
  const match = String(stream?.pix_fmt || '').match(/p(9|10|12|14|16)(?:le|be)?$/i);
  const pixelFormatDepth = match ? Number(match[1]) : null;
  if (explicit && explicit > 0 && pixelFormatDepth) return Math.max(explicit, pixelFormatDepth);
  if (explicit && explicit > 0) return explicit;
  return pixelFormatDepth;
}

function hdrSignals(stream, sideData, bitDepth) {
  const signals = [];
  const transfer = String(stream?.color_transfer || '').toLowerCase();
  const primaries = String(stream?.color_primaries || '').toLowerCase();
  if (transfer === 'smpte2084') signals.push('pq-transfer');
  if (transfer === 'arib-std-b67') signals.push('hlg-transfer');
  if (primaries === 'bt2020' && Number(bitDepth) >= 10) signals.push('bt2020-high-bit-depth');
  if (sideData.some((entry) => /mastering display|content light/i.test(entry.type || ''))) {
    signals.push('static-hdr-side-data');
  }
  if (sideData.some((entry) => /dynamic hdr|smpte\s*2094|dovi|dolby vision/i.test(entry.type || ''))) {
    signals.push('dynamic-hdr-side-data');
  }
  return [...new Set(signals)];
}

function normalizeVideo(stream) {
  if (!stream) return null;
  const sideData = normalizeSideData(stream);
  const sideDataRotation = sideData.find((entry) => entry.rotationDegrees !== null)?.rotationDegrees;
  const tagRotation = normalizeNumberString(stream.tags?.rotate);
  const bitDepth = inferBitDepth(stream);
  const detectedHdrSignals = hdrSignals(stream, sideData, bitDepth);
  return {
    codec: stream.codec_name || null,
    codecTag: stream.codec_tag_string || null,
    profile: stream.profile || null,
    level: Number.isFinite(Number(stream.level)) ? Number(stream.level) : null,
    width: Number.isFinite(Number(stream.width)) ? Number(stream.width) : null,
    height: Number.isFinite(Number(stream.height)) ? Number(stream.height) : null,
    pixelFormat: stream.pix_fmt || null,
    bitDepth,
    averageFrameRate: normalizeRatio(stream.avg_frame_rate),
    realFrameRate: normalizeRatio(stream.r_frame_rate),
    sampleAspectRatio: stream.sample_aspect_ratio || null,
    displayAspectRatio: stream.display_aspect_ratio || null,
    colorRange: stream.color_range || null,
    colorSpace: stream.color_space || null,
    colorTransfer: stream.color_transfer || null,
    colorPrimaries: stream.color_primaries || null,
    rotationDegrees: sideDataRotation ?? tagRotation,
    rotationSource: sideDataRotation !== undefined
      ? 'display-matrix-side-data'
      : (tagRotation !== null ? 'stream-tag' : null),
    sideData,
    hdrMetadataPresent: sideData.some((entry) => /mastering display|content light/i.test(entry.type || '')),
    hdrBearing: detectedHdrSignals.length > 0,
    hdrSignals: detectedHdrSignals,
    default: stream.disposition?.default === 1
  };
}

function normalizeAudio(stream) {
  if (!stream) return null;
  return {
    codec: stream.codec_name || null,
    codecTag: stream.codec_tag_string || null,
    profile: stream.profile || null,
    sampleRate: Number.isFinite(Number(stream.sample_rate)) ? Number(stream.sample_rate) : null,
    channels: Number.isFinite(Number(stream.channels)) ? Number(stream.channels) : null,
    channelLayout: stream.channel_layout || null,
    language: stream.tags?.language || null,
    default: stream.disposition?.default === 1
  };
}

export function analyzePriorityProbe({
  ffprobe,
  expected,
  actualSize,
  actualSha256Before,
  actualSha256After,
  sourceStateUnchanged,
  elapsedMs,
  ffprobeVersion,
  driveVersionBefore,
  driveVersionAfter
}) {
  const normalizedExpected = normalizeExpected(expected);
  const normalizedSize = requiredPositiveInteger(
    actualSize,
    'INVALID_SOURCE',
    'The probed source size is invalid.'
  );
  if (normalizedSize !== normalizedExpected.size) {
    fail('IDENTITY_MISMATCH', 'The local mirror size does not match the private expectation.');
  }
  if (String(actualSha256Before || '').toUpperCase() !== normalizedExpected.sha256
    || String(actualSha256After || '').toUpperCase() !== normalizedExpected.sha256) {
    fail('IDENTITY_MISMATCH', 'The local mirror fingerprint does not match the private expectation.');
  }
  if (sourceStateUnchanged !== true) {
    fail('SOURCE_CHANGED', 'The source file state changed during the read-only probe.');
  }
  const normalizedDriveVersionBefore = requiredPositiveInteger(
    driveVersionBefore,
    'INVALID_DRIVE_FENCE',
    'The Drive files.version read before the probe is required.'
  );
  const normalizedDriveVersionAfter = requiredPositiveInteger(
    driveVersionAfter,
    'INVALID_DRIVE_FENCE',
    'The Drive files.version read after the probe is required.'
  );
  if (normalizedDriveVersionBefore !== normalizedDriveVersionAfter) {
    fail('DRIVE_VERSION_CHANGED', 'Drive files.version changed across the local probe.');
  }
  if (normalizedDriveVersionBefore < normalizedExpected.driveVersionBaseline) {
    fail('DRIVE_VERSION_REGRESSION', 'Drive files.version predates the private identity baseline.');
  }

  const streams = Array.isArray(ffprobe?.streams) ? ffprobe.streams : [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const subtitles = streams.filter((stream) => stream.codec_type === 'subtitle');
  const otherStreams = streams.filter((stream) => !['video', 'audio', 'subtitle'].includes(stream.codec_type));
  const formatNames = String(ffprobe?.format?.format_name || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const containerIsMpegTs = formatNames.includes('mpegts');
  const metadataSaysMp4 = normalizedExpected.extension === '.mp4'
    && normalizedExpected.mimeType === 'video/mp4';
  const probeScore = normalizeNumberString(ffprobe?.format?.probe_score);
  const probeConfidence = probeScore === null
    ? 'unknown'
    : (probeScore >= MIN_Q1_PROBE_SCORE ? 'high' : 'low');
  const exactH264AacPair = streams.length === 2
    && videos.length === 1
    && audios.length === 1
    && subtitles.length === 0
    && otherStreams.length === 0
    && videos[0].codec_name === 'h264'
    && audios[0].codec_name === 'aac';
  const packagingMismatch = metadataSaysMp4 && containerIsMpegTs;
  const normalizedVideo = normalizeVideo(videos[0]);
  const q1Candidate = packagingMismatch
    && exactH264AacPair
    && probeScore !== null
    && probeScore >= MIN_Q1_PROBE_SCORE
    && normalizedVideo?.hdrBearing !== true;

  return {
    schema: 'drive-original.v2-07a-priority-probe-output-redacted/2',
    producer: `priority-probe.mjs@${PROBE_VERSION}`,
    source: {
      label: 'priority-sample-1',
      metadataExtension: normalizedExpected.extension,
      metadataMimeType: normalizedExpected.mimeType,
      sizeBytes: normalizedExpected.size,
      localFingerprintMatchedBeforeAndAfter: true,
      localFileStateUnchanged: true,
      privateIdentityValues: 'omitted'
    },
    driveFence: {
      filesVersionMatchedBeforeAfter: true,
      filesVersionAtOrAbovePrivateBaseline: true,
      filesVersionAdvancedSincePrivateBaseline:
        normalizedDriveVersionBefore > normalizedExpected.driveVersionBaseline,
      privateValues: 'omitted'
    },
    configuredContainerAnalysis: {
      ffprobeVersion: requiredString(
        ffprobeVersion,
        'INVALID_PROBE',
        'The FFprobe version is required.'
      ),
      probeAnalysisSizeOptionBytes: FFPROBE_SIZE_OPTION_BYTES,
      analyzeDurationOptionUs: FFPROBE_ANALYZE_DURATION_US,
      processTimeoutMs: FFPROBE_TIMEOUT_MS,
      totalInputBytesReadMeasured: false,
      elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
      probeScore,
      probeConfidence,
      formatNames,
      formatLongName: ffprobe?.format?.format_long_name || null,
      durationSeconds: normalizeNumberString(ffprobe?.format?.duration),
      startTimeSeconds: normalizeNumberString(ffprobe?.format?.start_time),
      bitRate: normalizeNumberString(ffprobe?.format?.bit_rate),
      streamCount: streams.length,
      streamTypeCounts: {
        video: videos.length,
        audio: audios.length,
        subtitle: subtitles.length,
        other: otherStreams.length
      },
      otherStreamTypes: otherStreams.map((stream) => stream.codec_type || 'unknown'),
      video: normalizedVideo,
      audio: normalizeAudio(audios[0]),
      subtitles: subtitles.map((stream) => ({
        codec: stream.codec_name || null,
        codecTag: stream.codec_tag_string || null,
        language: stream.tags?.language || null,
        default: stream.disposition?.default === 1
      })),
      indexPresence: 'not-measured',
      seekBehavior: 'not-measured'
    },
    classification: {
      metadataContainerMismatch: packagingMismatch,
      exactH264AacPair,
      corruptionConfirmed: false,
      qPathCandidate: q1Candidate
        ? 'Q1-container-only-stream-copy'
        : 'unverified',
      result: 'unverified-current-playback',
      currentProductPlaybackVerified: false,
      physicalIphoneOrPwaVerified: false
    },
    coverage: {
      metadataInventoryCount: 1,
      boundedProbeCount: 1,
      decodedInThisRunCount: 0
    },
    redaction: {
      account: 'omitted',
      fileIdAndRevisions: 'omitted',
      checksums: 'omitted',
      paths: 'omitted',
      mediaBytesAndFrames: 'omitted'
    },
    limitations: {
      ffprobeAnalysisOptionsAreNotTotalIoBounds: true,
      indexAndSeekNotMeasured: true,
      decodeOrPlaybackPerformed: false
    }
  };
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  } catch (_) {
    fail('SOURCE_READ_FAILED', 'The read-only local mirror could not be fingerprinted.');
  }
  return hash.digest('hex').toUpperCase();
}

async function readPrivateExpectation(expectationPath) {
  try {
    return JSON.parse(await readFile(expectationPath, 'utf8'));
  } catch (_) {
    fail('EXPECTATION_READ_FAILED', 'The private expectation could not be read.');
  }
}

async function runFfprobe(ffprobePath, mediaPath) {
  const entries = [
    'format=format_name,format_long_name,duration,size,bit_rate,start_time,probe_score',
    'stream=index,codec_name,profile,codec_type,codec_tag_string,level,width,height,pix_fmt,bits_per_raw_sample,r_frame_rate,avg_frame_rate,sample_aspect_ratio,display_aspect_ratio,color_range,color_space,color_transfer,color_primaries,sample_rate,channels,channel_layout',
    'stream_tags=language,rotate',
    'stream_disposition',
    'stream_side_data'
  ].join(':');
  const startedAt = performance.now();
  let result;
  let version;
  try {
    [result, version] = await Promise.all([
      execFileAsync(ffprobePath, [
        '-v', 'error',
        '-probesize', String(FFPROBE_SIZE_OPTION_BYTES),
        '-analyzeduration', String(FFPROBE_ANALYZE_DURATION_US),
        '-show_entries', entries,
        '-of', 'json',
        '--', mediaPath
      ], {
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        timeout: FFPROBE_TIMEOUT_MS,
        killSignal: 'SIGKILL'
      }),
      execFileAsync(ffprobePath, ['-version'], {
        maxBuffer: 128 * 1024,
        windowsHide: true,
        timeout: FFPROBE_TIMEOUT_MS,
        killSignal: 'SIGKILL'
      })
    ]);
  } catch (_) {
    fail('FFPROBE_FAILED', 'The bounded FFprobe process failed.');
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (_) {
    fail('FFPROBE_INVALID_OUTPUT', 'FFprobe returned invalid JSON.');
  }
  const versionLine = String(version.stdout || '').split(/\r?\n/, 1)[0];
  return { parsed, elapsedMs: performance.now() - startedAt, versionLine };
}

export async function runPriorityProbe({
  mediaPath,
  expectationPath,
  ffprobePath,
  driveVersionBefore,
  driveVersionAfter
}) {
  for (const [value, label] of [
    [mediaPath, 'media path'],
    [expectationPath, 'private expectation path'],
    [ffprobePath, 'FFprobe path']
  ]) requiredString(value, 'INVALID_ARGUMENT', `A ${label} is required.`);

  const expected = await readPrivateExpectation(expectationPath);
  let before;
  try { before = await stat(mediaPath); }
  catch (_) { fail('SOURCE_READ_FAILED', 'The read-only local mirror is unavailable.'); }
  if (!before.isFile()) fail('INVALID_SOURCE', 'The read-only local mirror is not a regular file.');

  const actualSha256Before = await sha256File(mediaPath);
  const ffprobeResult = await runFfprobe(ffprobePath, mediaPath);
  const actualSha256After = await sha256File(mediaPath);
  let after;
  try { after = await stat(mediaPath); }
  catch (_) { fail('SOURCE_READ_FAILED', 'The read-only local mirror disappeared after probing.'); }
  const sourceStateUnchanged = before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs
    && before.birthtimeMs === after.birthtimeMs
    && before.mode === after.mode
    && before.dev === after.dev
    && before.ino === after.ino;

  return analyzePriorityProbe({
    ffprobe: ffprobeResult.parsed,
    expected,
    actualSize: after.size,
    actualSha256Before,
    actualSha256After,
    sourceStateUnchanged,
    elapsedMs: ffprobeResult.elapsedMs,
    ffprobeVersion: ffprobeResult.versionLine,
    driveVersionBefore,
    driveVersionAfter
  });
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || ![
      '--media',
      '--expect',
      '--ffprobe',
      '--drive-version-before',
      '--drive-version-after'
    ].includes(key)) {
      fail(
        'INVALID_ARGUMENT',
        'Use --media, --expect, --ffprobe and both Drive version arguments exactly once each.'
      );
    }
    if (options[key]) fail('INVALID_ARGUMENT', `Duplicate ${key} argument.`);
    options[key] = value;
  }
  return {
    mediaPath: options['--media'],
    expectationPath: options['--expect'],
    ffprobePath: options['--ffprobe'],
    driveVersionBefore: options['--drive-version-before'],
    driveVersionAfter: options['--drive-version-after']
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await runPriorityProbe(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof PriorityProbeError ? error.code : 'UNEXPECTED_FAILURE';
    process.stderr.write(`${code}: ${error instanceof PriorityProbeError ? error.message : 'The probe failed.'}\n`);
    process.exitCode = 1;
  }
}
