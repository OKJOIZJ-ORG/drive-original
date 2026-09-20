export const INVENTORY_VERSION = 'v2-07a.1';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

const MIB = 1024n * 1024n;
const GIB = 1024n * MIB;
const KNOWN_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.mp4', '.mov', '.webm', '.mkv', '.avi'
]);
const RISK_EXTENSIONS = Object.freeze(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.bmp', '.gif', '.webp']);
const KNOWN_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav',
  'audio/flac', 'audio/webm'
]);

export class RootInventoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RootInventoryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RootInventoryError(code, message);
}

function requiredString(value, code, message) {
  const normalized = String(value ?? '').trim();
  if (!normalized) fail(code, message);
  return normalized;
}

function normalizeIntegerString(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^(0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}

function normalizeExtension(item) {
  const providerExtension = String(item?.fullFileExtension || item?.fileExtension || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const value = String(item?.name ?? '');
  const dot = value.lastIndexOf('.');
  const nameExtension = dot > 0 && dot < value.length - 1
    ? value.slice(dot + 1).toLowerCase()
    : '';
  const extension = providerExtension || nameExtension;
  if (!extension) return '<none>';
  const dotted = `.${extension}`;
  return KNOWN_EXTENSIONS.includes(dotted) ? dotted : '<other>';
}

function normalizeMimeType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return KNOWN_MIME_TYPES.has(normalized) ? normalized : '<other>';
}

function mediaFamily(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  return null;
}

function sizeBand(value) {
  const normalized = normalizeIntegerString(value);
  if (normalized === null) return 'unknown';
  const bytes = BigInt(normalized);
  if (bytes === 0n) return 'zero';
  if (bytes <= 24n * MIB) return '>0-24MiB';
  if (bytes <= 64n * MIB) return '>24-64MiB';
  if (bytes <= 96n * MIB) return '>64-96MiB';
  if (bytes <= 256n * MIB) return '>96-256MiB';
  if (bytes < 2n * GIB) return '>256MiB-<2GiB';
  if (bytes < 4n * GIB) return '>=2-<4GiB';
  return '>=4GiB';
}

function increment(counter, key, amount = 1) {
  counter.set(key, (counter.get(key) || 0) + amount);
}

function sortedCounter(counter) {
  return Object.fromEntries([...counter.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeCapability(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

function validateRootMetadata(metadata, expectedId) {
  if (!metadata || typeof metadata !== 'object') {
    fail('INVALID_ROOT_METADATA', 'The canonical root metadata is missing.');
  }
  const metadataId = requiredString(
    metadata.id,
    'INVALID_ROOT_METADATA',
    'The canonical root ID is missing.'
  );
  if (!/^[A-Za-z0-9_-]+$/.test(metadataId) || metadataId !== expectedId) {
    fail('ROOT_ID_MISMATCH', 'The canonical root metadata belongs to another folder.');
  }
  if (metadata.mimeType !== FOLDER_MIME || metadata.trashed === true) {
    fail('INVALID_ROOT_METADATA', 'The canonical root is not an active Drive folder.');
  }
  if (metadata.capabilities?.canListChildren !== true) {
    fail('ROOT_LIST_BLOCKED', 'The canonical root cannot list children.');
  }
  return metadata;
}

function rootFence(metadata) {
  return JSON.stringify({
    id: metadata.id,
    mimeType: metadata.mimeType,
    version: normalizeIntegerString(metadata.version),
    modifiedTime: metadata.modifiedTime || null,
    driveId: metadata.driveId || null,
    trashed: metadata.trashed === true,
    canListChildren: normalizeCapability(metadata.capabilities?.canListChildren)
  });
}

function stableItemRow(item) {
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

function normalizePage(raw) {
  if (!raw || typeof raw !== 'object') fail('INVALID_PAGE', 'Drive returned an invalid inventory page.');
  if (raw.incompleteSearch === true) {
    fail('INCOMPLETE_SEARCH', 'Drive marked the target-root inventory page incomplete.');
  }
  if (!Array.isArray(raw.files)) fail('INVALID_PAGE', 'Drive inventory page has no files array.');
  return {
    files: raw.files,
    nextPageToken: raw.nextPageToken ? String(raw.nextPageToken) : null
  };
}

function validateItem(item) {
  if (!item || typeof item !== 'object') fail('INVALID_ITEM', 'Drive returned an invalid inventory item.');
  const itemId = requiredString(item.id, 'INVALID_ITEM', 'Drive inventory item has no ID.');
  if (!/^[A-Za-z0-9_-]+$/.test(itemId)) {
    fail('INVALID_ITEM', 'Drive returned an invalid inventory item ID.');
  }
  requiredString(item.mimeType, 'INVALID_ITEM', 'Drive inventory item has no MIME type.');
  return item;
}

function validateAccountKey(value) {
  return requiredString(value, 'ACCOUNT_KEY_MISSING', 'The private Drive account key is missing.');
}

export async function collectInventoryPass({
  rootId,
  expectedAccountKey,
  readAccountKey,
  readRootMetadata,
  listFolderPage,
  readFileMetadata
}) {
  const canonicalRootId = requiredString(
    rootId,
    'INVALID_ROOT',
    'A canonical target-root ID is required.'
  );
  if (!/^[A-Za-z0-9_-]+$/.test(canonicalRootId)) {
    fail('INVALID_ROOT', 'The canonical target-root ID is invalid.');
  }
  const canonicalAccountKey = validateAccountKey(expectedAccountKey);
  if (typeof readAccountKey !== 'function'
    || typeof readRootMetadata !== 'function'
    || typeof listFolderPage !== 'function'
    || typeof readFileMetadata !== 'function') {
    fail('INVALID_READER', 'Account, root, page and shortcut-target readers are required.');
  }

  let accountBefore;
  try { accountBefore = validateAccountKey(await readAccountKey()); }
  catch (error) {
    if (error instanceof RootInventoryError) throw error;
    fail('ACCOUNT_READ_FAILED', 'The initial private Drive account read failed.');
  }
  if (accountBefore !== canonicalAccountKey) {
    fail('ACCOUNT_CHANGED', 'The Drive account does not match the inventory preflight account.');
  }

  let rootBefore;
  try {
    rootBefore = validateRootMetadata(await readRootMetadata(canonicalRootId), canonicalRootId);
  } catch (error) {
    if (error instanceof RootInventoryError) throw error;
    fail('ROOT_READ_FAILED', 'The canonical root metadata read failed.');
  }

  const queue = [canonicalRootId];
  const queued = new Set(queue);
  const visitedFolders = new Set();
  const itemsById = new Map();
  let pageCount = 0;
  let duplicateReferenceCount = 0;

  while (queue.length) {
    const folderId = queue.shift();
    if (visitedFolders.has(folderId)) continue;
    visitedFolders.add(folderId);
    const pageTokens = new Set();
    let pageToken = null;

    do {
      const tokenKey = pageToken ?? '<first-page>';
      if (pageTokens.has(tokenKey)) {
        fail('PAGINATION_CYCLE', 'Drive repeated a page token for one folder.');
      }
      pageTokens.add(tokenKey);

      let page;
      try {
        page = normalizePage(await listFolderPage({ folderId, pageToken }));
      } catch (error) {
        if (error instanceof RootInventoryError) throw error;
        if (error?.code === 'PAGE_TOKEN_REJECTED') {
          fail('PAGE_TOKEN_REJECTED', 'Drive rejected an inventory page token.');
        }
        fail('PAGE_READ_FAILED', 'A target-root inventory page read failed.');
      }
      pageCount += 1;

      for (const rawItem of page.files) {
        const item = validateItem(rawItem);
        if (item.trashed === true
          || !Array.isArray(item.parents)
          || !item.parents.includes(folderId)) {
          fail('PARENT_EDGE_MISMATCH', 'Drive returned an item outside the queried parent edge.');
        }
        const previous = itemsById.get(item.id);
        if (previous) {
          duplicateReferenceCount += 1;
          if (stableItemRow(previous) !== stableItemRow(item)) {
            fail('DUPLICATE_METADATA_CONFLICT', 'One Drive item changed across inventory pages.');
          }
          fail('DUPLICATE_REFERENCE', 'One Drive item appeared more than once in the containment inventory.');
        } else {
          itemsById.set(item.id, item);
        }

        if (item.mimeType === FOLDER_MIME
          && item.capabilities?.canListChildren !== true) {
          fail('FOLDER_LIST_BLOCKED', 'A nested target-root folder cannot list children.');
        }
        if (item.mimeType === FOLDER_MIME && !queued.has(item.id)) {
          queued.add(item.id);
          queue.push(item.id);
        }
      }

      if (page.nextPageToken && pageTokens.has(page.nextPageToken)) {
        fail('PAGINATION_CYCLE', 'Drive returned a previously consumed page token.');
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  const shortcutTargets = new Map();
  const shortcutReferencesByTarget = new Map();
  let unresolvedShortcutTargetCount = 0;
  let staleShortcutTargetMimeCount = 0;
  for (const item of itemsById.values()) {
    if (item.mimeType !== SHORTCUT_MIME) continue;
    const targetId = String(item.shortcutDetails?.targetId || '');
    if (!/^[A-Za-z0-9_-]+$/.test(targetId)) {
      unresolvedShortcutTargetCount += 1;
      continue;
    }
    const references = shortcutReferencesByTarget.get(targetId) || [];
    references.push(item);
    shortcutReferencesByTarget.set(targetId, references);
  }
  for (const [targetId, references] of shortcutReferencesByTarget) {
    let resolvedTarget = null;
    const attemptedResourceKeys = new Set();
    for (const reference of references) {
      const resourceKey = reference.shortcutDetails?.targetResourceKey || null;
      const resourceKeyFence = resourceKey || '<none>';
      if (attemptedResourceKeys.has(resourceKeyFence)) continue;
      attemptedResourceKeys.add(resourceKeyFence);
      try {
        const target = validateItem(await readFileMetadata({ fileId: targetId, resourceKey }));
        if (target.id !== targetId || target.trashed === true) {
          fail('INVALID_SHORTCUT_TARGET', 'A shortcut target is missing, trashed or has another ID.');
        }
        resolvedTarget = target;
        break;
      } catch (_) {
        // Try another private resource key for the same target before classifying it unresolved.
      }
    }
    if (!resolvedTarget) {
      unresolvedShortcutTargetCount += 1;
      continue;
    }
    shortcutTargets.set(targetId, resolvedTarget);
    for (const reference of references) {
      if (reference.shortcutDetails?.targetMimeType
        && reference.shortcutDetails.targetMimeType !== resolvedTarget.mimeType) {
        staleShortcutTargetMimeCount += 1;
      }
    }
  }

  let rootAfter;
  try {
    rootAfter = validateRootMetadata(await readRootMetadata(canonicalRootId), canonicalRootId);
  } catch (error) {
    if (error instanceof RootInventoryError) throw error;
    fail('ROOT_READ_FAILED', 'The final canonical root metadata read failed.');
  }
  if (rootFence(rootBefore) !== rootFence(rootAfter)) {
    fail('ROOT_CHANGED', 'The canonical root metadata changed during inventory.');
  }

  let accountAfter;
  try { accountAfter = validateAccountKey(await readAccountKey()); }
  catch (error) {
    if (error instanceof RootInventoryError) throw error;
    fail('ACCOUNT_READ_FAILED', 'The final private Drive account read failed.');
  }
  if (accountBefore !== accountAfter) {
    fail('ACCOUNT_CHANGED', 'The Drive account changed during target-root inventory.');
  }
  if (accountAfter !== canonicalAccountKey) {
    fail('ACCOUNT_CHANGED', 'The Drive account no longer matches the inventory preflight account.');
  }

  return {
    accountBefore,
    accountAfter,
    rootBefore,
    rootAfter,
    items: [...itemsById.values()],
    shortcutTargets: [...shortcutTargets.entries()],
    pageCount,
    traversedFolderCount: visitedFolders.size,
    duplicateReferenceCount,
    unresolvedShortcutTargetCount,
    staleShortcutTargetMimeCount,
    incompleteSearchCount: 0,
    paginationCycleCount: 0
  };
}

export async function collectInventoryPassWithRestart(options) {
  try {
    return await collectInventoryPass(options);
  } catch (error) {
    if (error?.code !== 'PAGE_TOKEN_REJECTED') throw error;
    return collectInventoryPass(options);
  }
}

function privatePassSignature(pass) {
  return JSON.stringify({
    rootBefore: rootFence(pass.rootBefore),
    rootAfter: rootFence(pass.rootAfter),
    accountBefore: pass.accountBefore,
    accountAfter: pass.accountAfter,
    items: pass.items.map(stableItemRow).sort(),
    shortcutTargets: (pass.shortcutTargets || [])
      .map(([targetId, item]) => `${targetId}\u001f${stableItemRow(item)}`)
      .sort(),
    traversedFolderCount: pass.traversedFolderCount,
    duplicateReferenceCount: pass.duplicateReferenceCount,
    unresolvedShortcutTargetCount: pass.unresolvedShortcutTargetCount,
    staleShortcutTargetMimeCount: pass.staleShortcutTargetMimeCount
  });
}

function metadataAvailability(item) {
  return {
    size: normalizeIntegerString(item.size) !== null,
    modifiedTime: Boolean(item.modifiedTime),
    version: normalizeIntegerString(item.version) !== null
  };
}

export function summarizeRepeatedInventory({
  firstPass,
  secondPass,
  elapsedMs,
  canonicalRootResolvedFromPriorityParent = false,
  priorityFileId = null
}) {
  if (!firstPass || !secondPass) fail('INVALID_PASS', 'Two inventory passes are required.');
  if (canonicalRootResolvedFromPriorityParent !== true) {
    fail('ROOT_PROVENANCE_UNCONFIRMED', 'The canonical root must come from the private priority parent capture.');
  }
  for (const pass of [firstPass, secondPass]) {
    if (pass.accountBefore !== pass.accountAfter) {
      fail('ACCOUNT_CHANGED', 'The Drive account changed within a target-root inventory pass.');
    }
    if (rootFence(pass.rootBefore) !== rootFence(pass.rootAfter)) {
      fail('ROOT_CHANGED', 'The canonical root metadata changed within a target-root inventory pass.');
    }
  }
  if (firstPass.accountAfter !== secondPass.accountBefore) {
    fail('ACCOUNT_CHANGED', 'The Drive account changed between repeated target-root inventories.');
  }
  const canonicalPriorityFileId = priorityFileId === null
    ? null
    : requiredString(
      priorityFileId,
      'PRIORITY_ANCHOR_MISSING',
      'The private priority-file anchor is missing.'
    );
  if (canonicalPriorityFileId && !/^[A-Za-z0-9_-]+$/.test(canonicalPriorityFileId)) {
    fail('PRIORITY_ANCHOR_MISSING', 'The private priority-file anchor is invalid.');
  }
  if (canonicalPriorityFileId) {
    for (const pass of [firstPass, secondPass]) {
      const directAnchorCount = pass.items.filter((item) => (
        item.id === canonicalPriorityFileId
        && item.mimeType !== FOLDER_MIME
        && item.mimeType !== SHORTCUT_MIME
      )).length;
      if (directAnchorCount !== 1) {
        fail(
          'PRIORITY_ANCHOR_MISSING',
          'The known priority file is missing from a canonical-root containment pass.'
        );
      }
    }
  }
  if (privatePassSignature(firstPass) !== privatePassSignature(secondPass)) {
    fail('REPEAT_MISMATCH', 'The repeated private target-root inventory did not match.');
  }

  const extensionCounts = new Map();
  const mimeTypeCounts = new Map();
  const sizeBandCounts = new Map();
  const capabilityDownloadCounts = new Map();
  const capabilityRevisionCounts = new Map();
  const capabilityListChildrenCounts = new Map();
  const availabilityCounts = {
    size: { present: 0, absent: 0 },
    modifiedTime: { present: 0, absent: 0 },
    version: { present: 0, absent: 0 }
  };
  const riskExtensionCounts = Object.fromEntries(RISK_EXTENSIONS.map((extension) => [extension, 0]));
  const largestSizeByRiskExtension = Object.fromEntries(RISK_EXTENSIONS.map((extension) => [extension, '0']));
  const counts = {
    totalUniqueItems: secondPass.items.length,
    folders: 0,
    shortcuts: 0,
    folderShortcutsNotTraversed: 0,
    physicalFiles: 0,
    classifiedUniqueObjects: 0,
    videoObjects: 0,
    imageObjects: 0,
    audioObjects: 0,
    otherObjects: 0,
    visibleMediaReferences: 0,
    uniqueMediaObjects: 0,
    uniqueShortcutTargets: (secondPass.shortcutTargets || []).length
  };
  const uniqueMediaObjectIds = new Set();
  const shortcutTargetMap = new Map(secondPass.shortcutTargets || []);
  const classifiedObjectsById = new Map();
  const addClassifiedObject = (item) => {
    const existing = classifiedObjectsById.get(item.id);
    if (existing && stableItemRow(existing) !== stableItemRow(item)) {
      fail(
        'CLASSIFIED_METADATA_CONFLICT',
        'One classified Drive object has conflicting containment and shortcut metadata.'
      );
    }
    if (!existing) classifiedObjectsById.set(item.id, item);
  };
  let totalKnownSize = 0n;
  let maxKnownSize = 0n;
  let knownSizeFileCount = 0;
  let unknownSizeFileCount = 0;
  let videosAtLeastOneHour = 0;
  let maximumVideoDurationMillis = 0n;
  let imagesWithRotation = 0;
  let extensionMimeMismatchCount = 0;
  let prioritySampleCount = 0;
  let animatedGifOrWebp = 0;
  let rareExtensionCount = 0;
  let largeMp4OrMov = 0;
  let downloadBlocked = 0;
  let downloadCapabilityUnknown = 0;

  for (const item of secondPass.items) {
    if (item.mimeType === FOLDER_MIME) {
      counts.folders += 1;
      increment(capabilityListChildrenCounts, normalizeCapability(item.capabilities?.canListChildren));
      continue;
    }
    if (item.mimeType === SHORTCUT_MIME) {
      counts.shortcuts += 1;
      const target = shortcutTargetMap.get(item.shortcutDetails?.targetId);
      if (target?.mimeType === FOLDER_MIME || item.shortcutDetails?.targetMimeType === FOLDER_MIME) {
        counts.folderShortcutsNotTraversed += 1;
      }
      if (target && target.mimeType !== FOLDER_MIME && target.mimeType !== SHORTCUT_MIME) {
        addClassifiedObject(target);
      }
      if (target && mediaFamily(target.mimeType)) {
        counts.visibleMediaReferences += 1;
      }
      continue;
    }

    counts.physicalFiles += 1;
    addClassifiedObject(item);
    if (mediaFamily(item.mimeType)) counts.visibleMediaReferences += 1;
  }

  if (counts.totalUniqueItems !== counts.folders + counts.shortcuts + counts.physicalFiles) {
    fail('COUNT_INVARIANT_FAILED', 'Inventory item category counts do not sum to the total.');
  }
  counts.classifiedUniqueObjects = classifiedObjectsById.size;

  for (const item of classifiedObjectsById.values()) {
    const mimeType = normalizeMimeType(item.mimeType);
    const rawMimeFamily = mediaFamily(item.mimeType);
    const extension = normalizeExtension(item);
    increment(extensionCounts, extension);
    increment(mimeTypeCounts, mimeType);
    increment(sizeBandCounts, sizeBand(item.size));
    increment(capabilityDownloadCounts, normalizeCapability(item.capabilities?.canDownload));
    increment(capabilityRevisionCounts, normalizeCapability(item.capabilities?.canReadRevisions));
    if (item.capabilities?.canDownload === false) downloadBlocked += 1;
    if (item.capabilities?.canDownload !== true && item.capabilities?.canDownload !== false) {
      downloadCapabilityUnknown += 1;
    }

    const availability = metadataAvailability(item);
    for (const [key, present] of Object.entries(availability)) {
      availabilityCounts[key][present ? 'present' : 'absent'] += 1;
    }

    const normalizedSize = normalizeIntegerString(item.size);
    if (normalizedSize === null) {
      unknownSizeFileCount += 1;
    } else {
      const size = BigInt(normalizedSize);
      knownSizeFileCount += 1;
      totalKnownSize += size;
      if (size > maxKnownSize) maxKnownSize = size;
      if (RISK_EXTENSIONS.includes(extension)) {
        const prior = BigInt(largestSizeByRiskExtension[extension]);
        if (size > prior) largestSizeByRiskExtension[extension] = size.toString();
      }
      if (['.mp4', '.mov'].includes(extension) && size >= 256n * MIB) largeMp4OrMov += 1;
    }

    if (RISK_EXTENSIONS.includes(extension)) riskExtensionCounts[extension] += 1;
    if (['.mkv', '.avi', '.bmp'].includes(extension)) rareExtensionCount += 1;
    if (['.gif', '.webp'].includes(extension)) animatedGifOrWebp += 1;
    if (canonicalPriorityFileId && item.id === canonicalPriorityFileId) prioritySampleCount += 1;
    const extensionFamily = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(extension)
      ? 'video'
      : (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(extension) ? 'image' : null);
    const mimeFamily = rawMimeFamily;
    if ((extensionFamily || mimeFamily) && extensionFamily !== mimeFamily) {
      extensionMimeMismatchCount += 1;
    }
    if (rawMimeFamily === 'video') {
      counts.videoObjects += 1;
      uniqueMediaObjectIds.add(item.id);
      const duration = normalizeIntegerString(item.videoMediaMetadata?.durationMillis);
      if (duration !== null) {
        const durationMillis = BigInt(duration);
        if (durationMillis > maximumVideoDurationMillis) maximumVideoDurationMillis = durationMillis;
        if (durationMillis >= 60n * 60n * 1000n) videosAtLeastOneHour += 1;
      }
    } else if (rawMimeFamily === 'image') {
      counts.imageObjects += 1;
      uniqueMediaObjectIds.add(item.id);
      const rotation = Number(item.imageMediaMetadata?.rotation);
      if (Number.isFinite(rotation) && rotation !== 0) imagesWithRotation += 1;
    } else if (rawMimeFamily === 'audio') {
      counts.audioObjects += 1;
      uniqueMediaObjectIds.add(item.id);
    } else {
      counts.otherObjects += 1;
    }
  }

  if (counts.classifiedUniqueObjects
    !== counts.videoObjects + counts.imageObjects + counts.audioObjects + counts.otherObjects) {
    fail('COUNT_INVARIANT_FAILED', 'Inventory object category counts do not sum to classified objects.');
  }
  counts.uniqueMediaObjects = uniqueMediaObjectIds.size;
  if (canonicalPriorityFileId && prioritySampleCount !== 1) {
    fail('PRIORITY_ANCHOR_MISSING', 'The private priority-file anchor was not classified exactly once.');
  }

  return {
    schema: 'drive-original.v2-07a-root-inventory-output-redacted/1',
    producer: `root-inventory.mjs@${INVENTORY_VERSION}`,
    source: {
      canonicalRootResolvedFromPriorityParent: true,
      knownPriorityAnchorChecked: canonicalPriorityFileId !== null,
      rootNameOrPathUsedForSelection: false,
      privateRootIdentity: 'omitted'
    },
    completeness: {
      repeatedPassCount: 2,
      repeatedPrivateInventoryMatched: true,
      accountStableWithinEachPass: true,
      rootMetadataStableWithinEachPass: true,
      recursiveFolderTraversal: true,
      folderShortcutsTraversed: false,
      traversedFolderCount: secondPass.traversedFolderCount,
      pageCountPerPass: [firstPass.pageCount, secondPass.pageCount],
      duplicateReferenceCountPerPass: [
        firstPass.duplicateReferenceCount,
        secondPass.duplicateReferenceCount
      ],
      incompleteSearchCount: 0,
      paginationCycleCount: 0,
      inventoryErrorCount: secondPass.unresolvedShortcutTargetCount,
      shortcutResolutionErrorCount: secondPass.unresolvedShortcutTargetCount,
      containmentComplete: canonicalPriorityFileId !== null,
      shortcutClassificationComplete: secondPass.unresolvedShortcutTargetCount === 0,
      providerTransactionalSnapshotGuaranteed: false,
      elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0))
    },
    counts,
    extensions: sortedCounter(extensionCounts),
    mimeTypes: sortedCounter(mimeTypeCounts),
    sizes: {
      bands: sortedCounter(sizeBandCounts),
      knownSizeFileCount,
      unknownSizeFileCount,
      totalKnownSizeBytes: totalKnownSize.toString(),
      maximumKnownSizeBytes: maxKnownSize.toString()
    },
    metadataAvailability: availabilityCounts,
    capabilities: {
      canDownload: sortedCounter(capabilityDownloadCounts),
      canReadRevisions: sortedCounter(capabilityRevisionCounts),
      canListChildren: sortedCounter(capabilityListChildrenCounts)
    },
    risk: {
      prioritySampleCount,
      extensionCounts: riskExtensionCounts,
      largestSizeBytesByExtension: largestSizeByRiskExtension,
      rareExtensionCount,
      animatedGifOrWebp,
      largeMp4OrMov,
      videosAtLeastOneHour,
      maximumVideoDurationMillis: maximumVideoDurationMillis.toString(),
      imagesWithRotation,
      extensionMimeMismatchCount,
      downloadBlocked,
      downloadCapabilityUnknown,
      missingVersion: availabilityCounts.version.absent,
      missingSize: availabilityCounts.size.absent,
      unresolvedShortcutTargetCount: secondPass.unresolvedShortcutTargetCount,
      staleShortcutTargetMimeCount: secondPass.staleShortcutTargetMimeCount
    },
    coverage: {
      metadataInventoryCount: counts.classifiedUniqueObjects,
      configuredContainerAnalysisCount: 0,
      decodedInThisRunCount: 0,
      physicalDevicePlaybackCount: 0
    },
    limitations: {
      fileBodiesRead: false,
      providerListIsNotTransactionalSnapshot: true,
      shortcutsToFoldersNotTraversed: counts.folderShortcutsNotTraversed,
      metadataInventoryIsPlaybackProof: false
    },
    redaction: {
      account: 'omitted',
      rootFileAndRevisionIds: 'omitted',
      namesAndPaths: 'omitted',
      checksumsAndInventoryDigests: 'omitted',
      pageTokensUrlsTokensAndCookies: 'omitted',
      mediaBytesFramesAndThumbnails: 'omitted'
    }
  };
}
