// Exact function copies from maintained root-inventory.mjs; original source is hashed in build provenance.
export function normalizeIntegerString(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^(0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}
export function normalizeCapability(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}
export function stableItemRow(item) {
  const capabilities = item.capabilities || {};
  const video = item.videoMediaMetadata || {};
  const image = item.imageMediaMetadata || {};
  const shortcut = item.shortcutDetails || {};
  return JSON.stringify([
    item.id,
    item.name || '',
    item.mimeType,
    item.fileExtension || null,
    item.fullFileExtension || null,
    normalizeIntegerString(item.size),
    item.modifiedTime || null,
    normalizeIntegerString(item.version),
    item.driveId || null,
    item.trashed === true,
    [...(Array.isArray(item.parents) ? item.parents : [])].sort(),
    normalizeCapability(capabilities.canDownload),
    normalizeCapability(capabilities.canReadRevisions),
    normalizeCapability(capabilities.canListChildren),
    normalizeCapability(capabilities.canCopy),
    normalizeIntegerString(video.durationMillis),
    Number.isFinite(Number(video.width)) ? Number(video.width) : null,
    Number.isFinite(Number(video.height)) ? Number(video.height) : null,
    Number.isFinite(Number(image.width)) ? Number(image.width) : null,
    Number.isFinite(Number(image.height)) ? Number(image.height) : null,
    Number.isFinite(Number(image.rotation)) ? Number(image.rotation) : null,
    shortcut.targetId || null,
    shortcut.targetMimeType || null,
    shortcut.targetResourceKey || null
  ]);
}
