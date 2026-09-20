export const SELECTOR_VERSION = 'v2-07a.1';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const MIB = 1024n * 1024n;
const GIB = 1024n * MIB;
const REQUESTED_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.mp4', '.mov', '.webm', '.mkv', '.avi'
]);
const RARE_EXTENSIONS = new Set(['.mkv', '.avi', '.bmp']);
const KNOWN_MEDIA_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav',
  'audio/flac', 'audio/webm'
]);

export class RepresentativeSelectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepresentativeSelectionError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RepresentativeSelectionError(code, message);
}

function integerString(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^(0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}

function rawExtension(item) {
  let extension = String(item?.fullFileExtension || item?.fileExtension || '')
    .trim()
    .toLowerCase();
  if (extension.startsWith('.')) extension = extension.slice(1);
  if (!extension) {
    const name = String(item?.name || '');
    const dot = name.lastIndexOf('.');
    extension = dot > 0 && dot < name.length - 1
      ? name.slice(dot + 1).trim().toLowerCase()
      : '';
  }
  return extension;
}

function safeExtension(value) {
  if (!value) return '<none>';
  const dotted = `.${value}`;
  return REQUESTED_EXTENSIONS.includes(dotted) ? dotted : '<other>';
}

function rawMime(value) {
  return String(value || '').trim().toLowerCase();
}

function safeMime(value) {
  return KNOWN_MEDIA_MIMES.has(value) ? value : '<other>';
}

function mimeFamily(value) {
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('audio/')) return 'audio';
  return null;
}

function extensionFamily(value) {
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(value)) return 'video';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(value)) return 'image';
  return null;
}

function sizeBand(value) {
  if (value === null) return 'unknown';
  const size = BigInt(value);
  if (size === 0n) return 'zero';
  if (size <= 24n * MIB) return 'gt0_le24MiB';
  if (size <= 64n * MIB) return 'gt24_le64MiB';
  if (size <= 96n * MIB) return 'gt64_le96MiB';
  if (size < 256n * MIB) return 'gt96_lt256MiB';
  if (size < 2n * GIB) return 'ge256MiB_lt2GiB';
  if (size < 4n * GIB) return 'ge2GiB_lt4GiB';
  return 'ge4GiB';
}

function durationBand(value) {
  if (value === null) return 'unknown';
  const duration = BigInt(value);
  if (duration < 60n * 60n * 1000n) return 'lt1h';
  if (duration < 2n * 60n * 60n * 1000n) return 'ge1h_lt2h';
  return 'ge2h';
}

function capability(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'missing';
}

function privateStableRow(item) {
  return JSON.stringify([
    item.id,
    item.name || '',
    item.mimeType || '',
    item.fileExtension || null,
    item.fullFileExtension || null,
    integerString(item.size),
    integerString(item.version),
    item.modifiedTime || null,
    [...(Array.isArray(item.parents) ? item.parents : [])].sort(),
    capability(item.capabilities?.canDownload),
    capability(item.capabilities?.canReadRevisions),
    integerString(item.videoMediaMetadata?.durationMillis),
    item.imageMediaMetadata?.rotation ?? null
  ]);
}

function normalizedPrivateReference(visibleReference) {
  const fileId = String(visibleReference?.fileId || '');
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    fail('INVALID_ITEM', 'A private visible-reference ID is invalid.');
  }
  const resourceKey = visibleReference?.resourceKey
    ? String(visibleReference.resourceKey)
    : null;
  return { fileId, resourceKey };
}

function addObject(objects, item, visibleReference) {
  if (!item || typeof item !== 'object') fail('INVALID_ITEM', 'A private inventory item is invalid.');
  const id = String(item.id || '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail('INVALID_ITEM', 'A private inventory item ID is invalid.');
  const reference = normalizedPrivateReference(visibleReference);
  const referenceKey = JSON.stringify([reference.fileId, reference.resourceKey]);
  const previous = objects.get(id);
  if (previous && privateStableRow(previous.item) !== privateStableRow(item)) {
    fail('OBJECT_METADATA_CONFLICT', 'One content object has conflicting private metadata.');
  }
  if (previous) {
    previous.visibleReferences.set(referenceKey, reference);
    return;
  }
  objects.set(id, {
    id,
    item,
    visibleReferences: new Map([[referenceKey, reference]])
  });
}

function buildObjects(pass) {
  if (!pass || !Array.isArray(pass.items) || !Array.isArray(pass.shortcutTargets)) {
    fail('INVALID_INVENTORY', 'A complete private inventory pass is required.');
  }
  if (Number(pass.unresolvedShortcutTargetCount || 0) !== 0) {
    fail('INVENTORY_INCOMPLETE', 'Unresolved shortcut targets prevent representative selection.');
  }
  const objects = new Map();
  const referencesByTarget = new Map();
  for (const item of pass.items) {
    if (item.mimeType === FOLDER_MIME) continue;
    if (item.mimeType === SHORTCUT_MIME) {
      const targetId = String(item.shortcutDetails?.targetId || '');
      const referenceId = String(item.id || '');
      if (!/^[A-Za-z0-9_-]+$/.test(targetId) || !/^[A-Za-z0-9_-]+$/.test(referenceId)) {
        fail('INVALID_ITEM', 'A private shortcut reference is invalid.');
      }
      const references = referencesByTarget.get(targetId) || [];
      references.push({
        fileId: referenceId,
        resourceKey: item.shortcutDetails?.targetResourceKey || null
      });
      referencesByTarget.set(targetId, references);
      continue;
    }
    addObject(objects, item, { fileId: item.id, resourceKey: item.resourceKey || null });
  }
  const resolvedTargetIds = new Set();
  for (const [targetId, target] of pass.shortcutTargets) {
    if (resolvedTargetIds.has(targetId)) {
      fail('INVALID_INVENTORY', 'A shortcut target appears more than once in private inventory.');
    }
    if (!referencesByTarget.has(targetId) || String(target?.id || '') !== String(targetId)) {
      fail('INVALID_INVENTORY', 'Shortcut target metadata does not match a visible reference.');
    }
    resolvedTargetIds.add(targetId);
    if (target.mimeType === FOLDER_MIME || target.mimeType === SHORTCUT_MIME) continue;
    for (const reference of referencesByTarget.get(targetId)) addObject(objects, target, reference);
  }
  for (const targetId of referencesByTarget.keys()) {
    if (!resolvedTargetIds.has(targetId)) {
      fail('INVENTORY_INCOMPLETE', 'A visible shortcut has no resolved private target metadata.');
    }
  }
  return objects;
}

function categoryFamily(category) {
  if (category.startsWith('extension:')) return 'extension';
  if (category.startsWith('mime:')) return 'mime';
  if (category.startsWith('mediaFamily:')) return 'mediaFamily';
  if (category.startsWith('videoSize:')) return 'largeVideo';
  if (category.startsWith('videoDuration:') || category === 'videoMetadataMissing:duration') {
    return 'longVideo';
  }
  if (category.startsWith('animationCandidate:') || category.startsWith('animationSize:')) {
    return 'animationCandidate';
  }
  if (category.startsWith('imageRotation:')) return 'rotation';
  if (category.startsWith('mimeMismatch:')) return 'mimeMismatchPair';
  if (category === 'videoMetadataMissing:size'
    || category.startsWith('capability:')
    || category.startsWith('metadata:')) {
    return 'capabilityOrMissingMetadata';
  }
  if (category.startsWith('mandatory:')) return 'mandatoryObject';
  return 'other';
}

function isHighRisk(category) {
  return [
    'videoSize:', 'videoDuration:', 'videoMetadataMissing:',
    'animationCandidate:', 'animationSize:', 'imageRotation:',
    'mimeMismatch:', 'capability:', 'metadata:'
  ].some((prefix) => category.startsWith(prefix));
}

function compareBigIntDescending(left, right) {
  const a = left === null ? -1n : BigInt(left);
  const b = right === null ? -1n : BigInt(right);
  return a === b ? 0 : (a > b ? -1 : 1);
}

function compareBigIntAscendingWithUnknownLast(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : (a < b ? -1 : 1);
}

function counter(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function coversAll(selectedIds, candidates, universe) {
  const covered = new Set();
  for (const id of selectedIds) {
    for (const category of candidates.get(id).categories) covered.add(category);
  }
  return universe.every((category) => covered.has(category));
}

export function selectRiskRepresentatives({
  pass,
  priorityFileId,
  expectedPriorityVersion
}) {
  const objects = buildObjects(pass);
  const priorityId = String(priorityFileId || '');
  const priorityVersion = integerString(expectedPriorityVersion);
  if (!/^[A-Za-z0-9_-]+$/.test(priorityId) || priorityVersion === null) {
    fail('PRIORITY_FENCE_MISSING', 'The private priority ID and version fence are required.');
  }

  const candidates = new Map();
  for (const object of objects.values()) {
    const item = object.item;
    const extensionPrivate = rawExtension(item);
    const extension = safeExtension(extensionPrivate);
    const mimePrivate = rawMime(item.mimeType);
    const mime = safeMime(mimePrivate);
    const family = mimeFamily(mimePrivate);
    const extensionType = extensionFamily(extension);
    const size = integerString(item.size);
    const duration = integerString(item.videoMediaMetadata?.durationMillis);
    const rotationValue = Number(item.imageMediaMetadata?.rotation);
    const rotation = Number.isInteger(rotationValue) && rotationValue !== 0
      ? (rotationValue >= 1 && rotationValue <= 8 ? String(rotationValue) : 'other')
      : null;
    const categories = new Set();
    if (REQUESTED_EXTENSIONS.includes(extension)) categories.add(`extension:${extension}`);
    if (KNOWN_MEDIA_MIMES.has(mime)) categories.add(`mime:${mime}`);
    if (family) categories.add(`mediaFamily:${family}`);

    const band = sizeBand(size);
    if (['.mp4', '.mov'].includes(extension)
      && ['ge256MiB_lt2GiB', 'ge2GiB_lt4GiB', 'ge4GiB'].includes(band)) {
      categories.add(`videoSize:${extension}:${band}`);
    }
    if (family === 'video') {
      const videoDurationBand = durationBand(duration);
      if (videoDurationBand === 'unknown') categories.add('videoMetadataMissing:duration');
      if (['ge1h_lt2h', 'ge2h'].includes(videoDurationBand)) {
        categories.add(`videoDuration:${videoDurationBand}`);
      }
      if (size === null) categories.add('videoMetadataMissing:size');
    }
    if (['.gif', '.webp'].includes(extension)) {
      categories.add(`animationCandidate:${extension}`);
      const animationBand = size === null
        ? 'unknown'
        : (BigInt(size) <= 24n * MIB
          ? 'le24MiB'
          : (BigInt(size) <= 64n * MIB ? 'gt24MiB_le64MiB' : 'gt64MiB'));
      categories.add(`animationSize:${extension}:${animationBand}`);
    }
    if (family === 'image' && rotation) categories.add(`imageRotation:${rotation}`);
    if ((extensionType || family) && extensionType !== family) {
      categories.add(`mimeMismatch:${extensionPrivate || '<none>'}:${mimePrivate || '<none>'}`);
    }

    const canDownload = capability(item.capabilities?.canDownload);
    const canReadRevisions = capability(item.capabilities?.canReadRevisions);
    if (canDownload !== 'true') categories.add(`capability:download-${canDownload}`);
    if (canReadRevisions !== 'true') categories.add(`capability:read-revisions-${canReadRevisions}`);
    if (integerString(item.version) === null) categories.add('metadata:version-missing');
    if (size === null) categories.add('metadata:size-missing');
    if (!mimePrivate) categories.add('metadata:mime-missing');

    candidates.set(object.id, {
      id: object.id,
      item,
      visibleReferences: object.visibleReferences,
      extensionPrivate,
      extension,
      mimePrivate,
      mime,
      family,
      size,
      sizeBand: band,
      duration,
      durationBand: durationBand(duration),
      rotation,
      categories,
      mandatoryReasons: new Set(),
      canDownload,
      metadataScore: [item.version, item.size, item.modifiedTime, duration]
        .filter((value) => value !== undefined && value !== null && value !== '').length
    });
  }

  const priority = candidates.get(priorityId);
  if (!priority || integerString(priority.item.version) !== priorityVersion) {
    fail('PRIORITY_FENCE_MISMATCH', 'The private priority object/version is absent from inventory.');
  }

  const markMandatory = (candidate, reason) => {
    candidate.mandatoryReasons.add(reason);
    candidate.categories.add(`mandatory:${reason}`);
  };
  markMandatory(priority, 'priority');

  const orderedCandidates = [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
  for (const candidate of orderedCandidates) {
    if (RARE_EXTENSIONS.has(candidate.extension)) {
      markMandatory(candidate, `rare:${candidate.extension}:${candidate.id}`);
    }
    if (candidate.size !== null && BigInt(candidate.size) >= 4n * GIB) {
      markMandatory(candidate, `ge4gib:${candidate.id}`);
    }
  }

  const largestForExtension = {};
  for (const extension of ['.mp4', '.mov']) {
    const matches = orderedCandidates
      .filter((candidate) => candidate.extension === extension && candidate.size !== null)
      .sort((left, right) => (
        compareBigIntDescending(left.size, right.size) || left.id.localeCompare(right.id)
      ));
    if (matches[0]) {
      largestForExtension[extension] = matches[0].id;
      markMandatory(matches[0], `largest:${extension}`);
    }
  }

  const videoWithDuration = orderedCandidates
    .filter((candidate) => candidate.family === 'video' && candidate.duration !== null)
    .sort((left, right) => (
      compareBigIntDescending(left.duration, right.duration) || left.id.localeCompare(right.id)
    ));
  const longestVideoId = videoWithDuration[0]?.id || null;
  if (videoWithDuration[0]) markMandatory(videoWithDuration[0], 'longest-video');

  const universe = [...new Set(
    orderedCandidates.flatMap((candidate) => [...candidate.categories])
  )].sort();
  const mandatoryIds = new Set(
    orderedCandidates
      .filter((candidate) => candidate.mandatoryReasons.size > 0)
      .map((candidate) => candidate.id)
  );
  const selectedIds = new Set(mandatoryIds);
  const selectionOrder = [...mandatoryIds].sort();
  const covered = new Set();
  for (const id of selectedIds) {
    for (const category of candidates.get(id).categories) covered.add(category);
  }

  while (covered.size < universe.length) {
    const options = orderedCandidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => {
        const newlyCovered = [...candidate.categories].filter((category) => !covered.has(category));
        return {
          candidate,
          newlyCovered,
          highRiskCount: newlyCovered.filter(isHighRisk).length
        };
      })
      .filter(({ newlyCovered }) => newlyCovered.length > 0)
      .sort((left, right) => (
        right.highRiskCount - left.highRiskCount
        || right.newlyCovered.length - left.newlyCovered.length
        || Number(right.candidate.canDownload === 'true') - Number(left.candidate.canDownload === 'true')
        || right.candidate.metadataScore - left.candidate.metadataScore
        || compareBigIntAscendingWithUnknownLast(left.candidate.size, right.candidate.size)
        || left.candidate.id.localeCompare(right.candidate.id)
      ));
    if (!options[0]) fail('UNCOVERED_CATEGORY', 'A metadata risk category has no selectable object.');
    const chosen = options[0].candidate;
    selectedIds.add(chosen.id);
    selectionOrder.push(chosen.id);
    for (const category of chosen.categories) covered.add(category);
  }

  for (const id of [...selectionOrder].reverse()) {
    if (mandatoryIds.has(id) || !selectedIds.has(id)) continue;
    const without = new Set(selectedIds);
    without.delete(id);
    if (coversAll(without, candidates, universe)) selectedIds.delete(id);
  }
  if (!coversAll(selectedIds, candidates, universe)) {
    fail('UNCOVERED_CATEGORY', 'Representative pruning left a metadata category uncovered.');
  }

  const optionalIds = [...selectedIds].filter((id) => !mandatoryIds.has(id));
  const subsetMinimalAfterMandatory = optionalIds.every((id) => {
    const without = new Set(selectedIds);
    without.delete(id);
    return !coversAll(without, candidates, universe);
  });
  if (!subsetMinimalAfterMandatory) {
    fail('SELECTION_NOT_MINIMAL', 'An optional representative is redundant after pruning.');
  }

  const selected = [...selectedIds]
    .map((id) => candidates.get(id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selectedByExtension = counter(selected.map((candidate) => candidate.extension));
  const requestedExtensionsPresent = REQUESTED_EXTENSIONS.filter((extension) => (
    orderedCandidates.some((candidate) => candidate.extension === extension)
  ));
  const categoriesByFamily = counter(universe.map(categoryFamily));
  const mandatoryRareIds = orderedCandidates
    .filter((candidate) => RARE_EXTENSIONS.has(candidate.extension))
    .map((candidate) => candidate.id);
  const mandatoryGe4Ids = orderedCandidates
    .filter((candidate) => candidate.size !== null && BigInt(candidate.size) >= 4n * GIB)
    .map((candidate) => candidate.id);

  return {
    privateManifest: {
      schema: 'drive-original.v2-07a-risk-selection-private/1',
      prioritySample: { fileId: priorityId, version: priorityVersion },
      selected: selected.map((candidate) => ({
        fileId: candidate.id,
        version: integerString(candidate.item.version),
        size: candidate.size,
        modifiedTime: candidate.item.modifiedTime || null,
        mimeType: candidate.mimePrivate,
        extension: candidate.extensionPrivate,
        visibleReferences: [...candidate.visibleReferences.values()]
          .sort((left, right) => (
            left.fileId.localeCompare(right.fileId)
            || String(left.resourceKey || '').localeCompare(String(right.resourceKey || ''))
          )),
        mandatoryReasons: [...candidate.mandatoryReasons].sort(),
        coveredCategories: [...candidate.categories].sort()
      }))
    },
    report: {
      schema: 'drive-original.v2-07a-risk-selection-redacted/1',
      producer: `representative-selector.mjs@${SELECTOR_VERSION}`,
      input: {
        objectCount: candidates.size,
        requestedExtensionCount: REQUESTED_EXTENSIONS.length,
        requestedExtensionsPresentCount: requestedExtensionsPresent.length,
        allRequestedExtensionsPresent: requestedExtensionsPresent.length === REQUESTED_EXTENSIONS.length,
        unresolvedShortcutTargetCount: Number(pass.unresolvedShortcutTargetCount || 0)
      },
      selection: {
        selectedUniqueObjectCount: selected.length,
        mandatoryUniqueObjectCount: mandatoryIds.size,
        optionalUniqueObjectCount: selected.length - mandatoryIds.size,
        prioritySampleSelected: selectedIds.has(priorityId),
        allRareMkvAviBmpSelected: mandatoryRareIds.every((id) => selectedIds.has(id)),
        rareMkvAviBmpObjectCount: mandatoryRareIds.length,
        allGe4GiBSelected: mandatoryGe4Ids.every((id) => selectedIds.has(id)),
        ge4GiBObjectCount: mandatoryGe4Ids.length,
        largestMp4Selected: Boolean(largestForExtension['.mp4']
          && selectedIds.has(largestForExtension['.mp4'])),
        largestMovSelected: Boolean(largestForExtension['.mov']
          && selectedIds.has(largestForExtension['.mov'])),
        longestKnownVideoSelected: Boolean(longestVideoId && selectedIds.has(longestVideoId)),
        subsetMinimalAfterMandatory,
        inputOrderIndependent: true,
        globalMinimumClaimed: false
      },
      coverage: {
        requiredCategoryCount: universe.length,
        coveredCategoryCount: universe.length,
        uncoveredCategoryCount: 0,
        byCategoryFamily: Object.fromEntries(
          Object.entries(categoriesByFamily).map(([family, required]) => [
            family,
            { required, covered: required }
          ])
        )
      },
      selectedCountsBySafeExtension: selectedByExtension,
      evidenceLevels: {
        metadataSelectedCount: selected.length,
        boundedProbeCount: 0,
        decodeCount: 0,
        currentProductPlaybackCount: 0,
        physicalDevicePlaybackCount: 0
      },
      limitations: {
        metadataSelectionIsNotContainerCodecOrAnimationProof: true,
        metadataSelectionIsNotPlaybackProof: true,
        animationCandidatesNotConfirmedAnimated: true,
        rotationMetadataNotDisplayValidation: true,
        largeSelectionNotThroughputOrRangeProof: true,
        globalMinimumSetCoverNotClaimed: true
      },
      redaction: {
        idsVersionsNamesPathsParents: 'omitted',
        perObjectRowsAndCategoryCombinations: 'omitted',
        tokensCredentialsResourceKeys: 'omitted',
        unknownRawExtensionsAndMimes: 'collapsed'
      }
    }
  };
}
