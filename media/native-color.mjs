const IDENTITY_FIELDS = ['accountKey', 'accountGeneration', 'fileId', 'headRevisionId', 'size', 'mimeType', 'modifiedTime'];
const COLOR_FIELDS = ['primaries', 'transfer', 'matrix', 'fullRange'];
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const dimension = value => Number.isSafeInteger(value) && value > 0 && value <= 65535;

function snapshotIdentity(identity) {
  if (!identity || !text(identity.accountKey, 512) || !text(identity.fileId, 512)
      || !text(identity.headRevisionId, 512) || !text(identity.mimeType, 256) || !text(identity.modifiedTime, 128)
      || !Number.isSafeInteger(identity.accountGeneration) || identity.accountGeneration < 0
      || !(Number.isSafeInteger(identity.size) && identity.size > 0
        || typeof identity.size === 'string' && /^[1-9]\d{0,15}$/.test(identity.size) && Number.isSafeInteger(Number(identity.size)))) return null;
  const checksum = identity.sha256Checksum;
  if (checksum != null && !(typeof checksum === 'string' && /^[a-fA-F0-9]{64}$/.test(checksum))) return null;
  return Object.freeze(Object.fromEntries([...IDENTITY_FIELDS.map(key => [key, identity[key]]),
    ...(checksum == null ? [] : [['sha256Checksum', checksum]])]));
}

function snapshotColor(color) {
  if (!color || !['bt709', 'bt470bg', 'smpte170m', 'bt2020', 'smpte432'].includes(color.primaries)
      || !['bt709', 'smpte170m', 'iec61966-2-1', 'linear'].includes(color.transfer)
      || !['bt709', 'bt470bg', 'smpte170m', 'bt2020-ncl'].includes(color.matrix)
      || typeof color.fullRange !== 'boolean') return null;
  return Object.freeze(Object.fromEntries(COLOR_FIELDS.map(key => [key, color[key]])));
}

function snapshotVisibleRect(rect, codedWidth, codedHeight) {
  if (!rect || !Number.isSafeInteger(rect.x) || rect.x < 0 || !Number.isSafeInteger(rect.y) || rect.y < 0
      || !dimension(rect.width) || !dimension(rect.height)
      || rect.x + rect.width > codedWidth || rect.y + rect.height > codedHeight) return null;
  return Object.freeze({x: rect.x, y: rect.y, width: rect.width, height: rect.height});
}

// Effective native SDR color is an observation, never a recovered source declaration.
// Rebuild a small immutable DTO at every ownership boundary; incomplete identity,
// HDR/unknown color, converted RGB/high-bit frames and checksum changes cannot
// qualify it. Only observed 8-bit native YUV can describe copied AVC samples.
export function qualifyNativeColorObservation(observation, identity) {
  try {
    const actual = snapshotIdentity(identity), observed = snapshotIdentity(observation?.identity);
    if (!actual || !observed || observation.basis !== 'observed-native-frame' || !['NV12', 'I420'].includes(observation.format)
        || !IDENTITY_FIELDS.every(key => actual[key] === observed[key])
        || actual.sha256Checksum !== observed.sha256Checksum
        || !dimension(observation.codedWidth) || !dimension(observation.codedHeight)) return null;
    const colorSpace = snapshotColor(observation.colorSpace);
    const visibleRect = snapshotVisibleRect(observation.visibleRect, observation.codedWidth, observation.codedHeight);
    return colorSpace && visibleRect && Object.freeze({basis: 'observed-native-frame', format: observation.format, identity: observed,
      codedWidth: observation.codedWidth, codedHeight: observation.codedHeight, visibleRect, colorSpace});
  } catch { return null; }
}

// Capture synchronously from the caller-qualified current Q0 element. This owns
// no pixel read, copy, decoder, timer, media mutation or persistence.
export function observeNativeFrameColor({video, identity, isCurrent, scope = globalThis} = {}) {
  let frame;
  try {
    const binding = snapshotIdentity(identity);
    if (!binding || typeof isCurrent !== 'function' || !isCurrent() || typeof scope.VideoFrame !== 'function'
        || !video || !(video.readyState >= 2) || video.error || !(video.videoWidth > 0 && video.videoHeight > 0)) return null;
    frame = new scope.VideoFrame(video);
    if (!isCurrent()) return null;
    return qualifyNativeColorObservation({basis: 'observed-native-frame', format: frame.format, identity: binding,
      codedWidth: frame.codedWidth, codedHeight: frame.codedHeight, visibleRect: frame.visibleRect, colorSpace: frame.colorSpace}, identity);
  } catch { return null; }
  finally { if (frame) { try { frame.close(); } catch {} } }
}

// Preserve all meaningful original declarations, including partial metadata.
// Only an undeclared track matching the actual visible frame receives colr.
// Decoder surfaces may be padded. Display dimensions/SAR do not qualify source
// sample geometry; retain the observed surface and visible rectangle separately.
export function resolveObservedNativeOutputColor(videoConfig, observation, identity) {
  const unchanged = {outputVideoConfig: videoConfig, outputColorObservation: null};
  try {
    if (!videoConfig || COLOR_FIELDS.some(key => videoConfig.colorSpace?.[key] != null)) return unchanged;
    const qualified = qualifyNativeColorObservation(observation, identity);
    if (!qualified || videoConfig.codedWidth !== qualified.visibleRect.width || videoConfig.codedHeight !== qualified.visibleRect.height) return unchanged;
    const {basis, format, codedWidth, codedHeight, visibleRect, colorSpace} = qualified;
    return {outputVideoConfig: {...videoConfig, colorSpace: {...colorSpace}},
      outputColorObservation: Object.freeze({basis, format, codedWidth, codedHeight, visibleRect, colorSpace})};
  } catch { return unchanged; }
}
