(()=>{
const factory=(()=>{
'use strict';
const core=(()=>{
const INVENTORY_VERSION = 'v2-07a.1';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

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

class RootInventoryError extends Error {
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

async function collectInventoryPass({
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

async function collectInventoryPassWithRestart(options) {
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

function summarizeRepeatedInventory({
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

return {collectInventoryPassWithRestart,summarizeRepeatedInventory,rootFence,stableItemRow};})();
const inventory=(()=>{const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=core;
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/';
const ROOT_FIELDS = [
  'id',
  'mimeType',
  'driveId',
  'version',
  'modifiedTime',
  'trashed',
  'capabilities(canListChildren)'
].join(',');
const ITEM_FIELDS = [
  'id',
  'name',
  'mimeType',
  'fileExtension',
  'fullFileExtension',
  'size',
  'modifiedTime',
  'version',
  'parents',
  'driveId',
  'trashed',
  'capabilities(canListChildren,canDownload,canReadRevisions,canCopy)',
  'videoMediaMetadata(width,height,durationMillis)',
  'imageMediaMetadata(width,height,rotation)',
  'shortcutDetails(targetId,targetMimeType,targetResourceKey)'
].join(',');

class DriveMetadataReadError extends Error {
  constructor(status) {
    super('A read-only Drive metadata request failed.');
    this.name = 'DriveMetadataReadError';
    this.status = Number(status) || 0;
  }
}

function apiUrl(path, params = {}) {
  const url = new URL(path, DRIVE_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJson(driveFetch, url, options = {}) {
  const response = await driveFetch(url, options);
  if (!response || response.ok !== true) {
    throw new DriveMetadataReadError(response?.status);
  }
  return response.json();
}

function createAuthenticatedDriveReaders({ driveFetch }) {
  if (typeof driveFetch !== 'function') {
    throw new TypeError('The candidate app driveFetch function is required.');
  }
  let canonicalDriveId = null;

  return {
    async readAccountKey() {
      const about = await readJson(
        driveFetch,
        apiUrl('about', { fields: 'user(permissionId)' })
      );
      return about?.user?.permissionId;
    },

    async readRootMetadata(rootId) {
      const root = await readJson(
        driveFetch,
        apiUrl(`files/${encodeURIComponent(rootId)}`, {
          fields: ROOT_FIELDS,
          supportsAllDrives: 'true'
        })
      );
      canonicalDriveId = root?.driveId || null;
      return root;
    },

    async listFolderPage({ folderId, pageToken }) {
      const params = {
        q: `'${folderId}' in parents and trashed=false`,
        spaces: 'drive',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: canonicalDriveId ? 'drive' : 'user',
        driveId: canonicalDriveId,
        pageToken,
        fields: `nextPageToken,incompleteSearch,files(${ITEM_FIELDS})`
      };
      try {
        return await readJson(driveFetch, apiUrl('files', params));
      } catch (error) {
        if (pageToken && [400, 410].includes(error?.status)) {
          error.code = 'PAGE_TOKEN_REJECTED';
        }
        throw error;
      }
    },

    async readFileMetadata({ fileId, resourceKey }) {
      const options = resourceKey
        ? { headers: { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } }
        : {};
      return readJson(
        driveFetch,
        apiUrl(`files/${encodeURIComponent(fileId)}`, {
          fields: ITEM_FIELDS,
          supportsAllDrives: 'true'
        }),
        options
      );
    }
  };
}

async function runAuthenticatedRootInventory({
  driveFetch,
  rootId,
  priorityFileId,
  expectedAccountKey,
  now = () => performance.now()
}) {
  const readers = createAuthenticatedDriveReaders({ driveFetch });
  const startedAt = now();
  const canonicalRootId = String(rootId || '').trim();
  const canonicalPriorityFileId = String(priorityFileId || '').trim();
  const canonicalExpectedAccountKey = String(expectedAccountKey || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(canonicalRootId)
    || !/^[A-Za-z0-9_-]+$/.test(canonicalPriorityFileId)
    || !canonicalExpectedAccountKey) {
    throw new Error('Private account, priority-file and canonical-root provenance is required.');
  }
  const currentAccountKey = await readers.readAccountKey();
  if (currentAccountKey !== canonicalExpectedAccountKey) {
    throw new Error('The current Drive account does not match the private priority capture.');
  }
  const priorityFile = await readers.readFileMetadata({
    fileId: canonicalPriorityFileId,
    resourceKey: null
  });
  if (priorityFile?.id !== canonicalPriorityFileId
    || priorityFile.trashed === true
    || !Array.isArray(priorityFile.parents)
    || !priorityFile.parents.includes(canonicalRootId)) {
    throw new Error('The canonical root is not a current parent of the private priority file.');
  }
  const firstPass = await collectInventoryPassWithRestart({
    rootId: canonicalRootId,
    expectedAccountKey: canonicalExpectedAccountKey,
    ...readers
  });
  const secondPass = await collectInventoryPassWithRestart({
    rootId: canonicalRootId,
    expectedAccountKey: canonicalExpectedAccountKey,
    ...readers
  });
  const report = summarizeRepeatedInventory({
    firstPass,
    secondPass,
    elapsedMs: now() - startedAt,
    canonicalRootResolvedFromPriorityParent: true,
    priorityFileId: canonicalPriorityFileId
  });
  return {
    report,
    privatePasses: { firstPass, secondPass }
  };
}

return {runAuthenticatedRootInventory};})();
const selector=(()=>{
const SELECTOR_VERSION = 'v2-07a.1';

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

class RepresentativeSelectionError extends Error {
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

function selectRiskRepresentatives({
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

return {selectRiskRepresentatives};})();
const bounded=(()=>{
const MIB = 1024 * 1024;
const TOOL_VERSION = 'v2-07a-bounded-probe.2';
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const DEFAULT_LIMITS = Object.freeze({
  requestBytes: 1 * MIB,
  fileBytes: 16 * MIB,
  fileRequests: 64,
  batchBytes: 512 * MIB,
  headersMs: 10_000,
  bodyNoProgressMs: 15_000,
  fileMs: 60_000
});

const FAILURE_CODES = Object.freeze([
  'ABORTED',
  'ACCEPT_RANGES_INVALID',
  'BATCH_BYTE_LIMIT',
  'BODY_LENGTH_MISMATCH',
  'BODY_TIMEOUT',
  'BODY_UNAVAILABLE',
  'CACHE_CONTROL_INVALID',
  'CLEANUP_FAILED',
  'CLEANUP_TIMEOUT',
  'CONTENT_LENGTH_INVALID',
  'CONTENT_RANGE_INVALID',
  'DOWNLOAD_FORBIDDEN',
  'FILE_BYTE_LIMIT',
  'FILE_REQUEST_LIMIT',
  'FILE_TIMEOUT',
  'GENERATION_STALE',
  'HEADER_TIMEOUT',
  'IDENTITY_MISMATCH',
  'INVALID_IDENTITY',
  'INVALID_RANGE',
  'INVALID_READER_RESULT',
  'POSTFLIGHT_DRIFT',
  'POSTFLIGHT_FAILED',
  'PREFLIGHT_FAILED',
  'PROBE_FAILED',
  'READER_FAILURE',
  'REQUEST_BYTE_LIMIT',
  'STATUS_NOT_206'
]);

const FAILURE_CODE_SET = new Set(FAILURE_CODES);
const IDENTITY_FIELDS = Object.freeze([
  'accountKey', 'fileId', 'version', 'size', 'modifiedTime', 'mimeType', 'canDownload'
]);

class BoundedProbeError extends Error {
  constructor(code) {
    super(FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED');
    this.name = 'BoundedProbeError';
    this.code = FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED';
  }
}

function fail(code) {
  throw new BoundedProbeError(code);
}

function fixedCode(error, fallback) {
  return error instanceof BoundedProbeError ? error.code : fallback;
}

function requiredString(value) {
  const text = String(value ?? '');
  if (!text) fail('INVALID_IDENTITY');
  return text;
}

function exactIntegerText(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) fail('INVALID_IDENTITY');
    return String(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_IDENTITY');
    return String(value);
  }
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) fail('INVALID_IDENTITY');
  return String(BigInt(text));
}

function normalizeProbeIdentity(value) {
  const identity = Object.freeze({
    accountKey: requiredString(value?.accountKey),
    fileId: requiredString(value?.fileId),
    version: exactIntegerText(value?.version),
    size: exactIntegerText(value?.size),
    modifiedTime: requiredString(value?.modifiedTime),
    mimeType: requiredString(value?.mimeType),
    canDownload: value?.canDownload
  });
  if (BigInt(identity.size) <= 0n || typeof identity.canDownload !== 'boolean') {
    fail('INVALID_IDENTITY');
  }
  return identity;
}

function sameIdentity(left, right) {
  return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function normalizeObservedIdentity(value) {
  try {
    return normalizeProbeIdentity(value);
  } catch {
    fail('IDENTITY_MISMATCH');
  }
}

function assertExpectedIdentity(expected, observed) {
  if (!sameIdentity(expected, normalizeObservedIdentity(observed))) {
    fail('IDENTITY_MISMATCH');
  }
}

function normalizeLimits(value = {}) {
  const limits = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_LIMITS)) {
    const candidate = value[key] ?? defaultValue;
    if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > defaultValue) {
      fail('PROBE_FAILED');
    }
    limits[key] = candidate;
  }
  return Object.freeze(limits);
}

function abortReason(signal) {
  if (signal?.reason instanceof BoundedProbeError) return signal.reason;
  return new BoundedProbeError('ABORTED');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function linkAbort(source, target) {
  if (!source) return () => {};
  const onAbort = () => target.abort(abortReason(source));
  source.addEventListener('abort', onAbort, { once: true });
  if (source.aborted) onAbort();
  return () => source.removeEventListener('abort', onAbort);
}

function awaitWithSignal(value, signal) {
  throwIfAborted(signal);
  if (!signal) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(result);
    };
    const onAbort = () => finish(reject, abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(value).then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error)
    );
  });
}

async function cancelBody(result, reason) {
  const body = result?.body;
  try {
    await body?.cancel?.(reason);
  } catch {
    fail('CLEANUP_FAILED');
  }
}

function headerValue(headers, name) {
  if (headers?.get) return headers.get(name);
  if (!headers || typeof headers !== 'object') return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value == null ? null : String(value);
  }
  return null;
}

function parseDecimalBigInt(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

function normalizeEndpoint(value) {
  let parsed;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('INVALID_RANGE');
    parsed = BigInt(value);
  } else {
    const text = String(value ?? '').trim();
    if (!/^-?\d+$/.test(text)) fail('INVALID_RANGE');
    parsed = BigInt(text);
  }
  if (parsed < 0n || parsed > MAX_SAFE) fail('INVALID_RANGE');
  return parsed;
}

function planExactRange(startValue, endValue, sizeValue, requestLimit = DEFAULT_LIMITS.requestBytes) {
  const start = normalizeEndpoint(startValue);
  const end = normalizeEndpoint(endValue);
  let size;
  try {
    size = BigInt(exactIntegerText(sizeValue));
  } catch {
    fail('INVALID_RANGE');
  }
  if (size <= 0n || start > end || end >= size) fail('INVALID_RANGE');
  const length = end - start + 1n;
  if (length > BigInt(requestLimit)) fail('REQUEST_BYTE_LIMIT');
  return Object.freeze({
    start,
    end,
    length: Number(length),
    header: `bytes=${start}-${end}`
  });
}

function planInitialMagicRange(sizeValue, byteCount = 4096) {
  if (!Number.isSafeInteger(byteCount) || byteCount <= 0) fail('INVALID_RANGE');
  let size;
  try {
    size = BigInt(exactIntegerText(sizeValue));
  } catch {
    fail('INVALID_RANGE');
  }
  if (size <= 0n) fail('INVALID_RANGE');
  return planExactRange(0n, (size < BigInt(byteCount) ? size : BigInt(byteCount)) - 1n, size);
}

function parseExactContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  return { start: BigInt(match[1]), end: BigInt(match[2]), total: BigInt(match[3]) };
}

function validateHeaders(result, range, expectedSize) {
  if (!result || !Number.isInteger(result.status)) fail('INVALID_READER_RESULT');
  if (result.status !== 206) fail('STATUS_NOT_206');
  const contentRange = parseExactContentRange(headerValue(result.headers, 'Content-Range'));
  if (!contentRange
    || contentRange.start !== range.start
    || contentRange.end !== range.end
    || contentRange.total !== BigInt(expectedSize)) {
    fail('CONTENT_RANGE_INVALID');
  }
  const contentLength = parseDecimalBigInt(headerValue(result.headers, 'Content-Length'));
  if (contentLength == null || contentLength > MAX_SAFE || contentLength !== BigInt(range.length)) {
    fail('CONTENT_LENGTH_INVALID');
  }
  if (String(headerValue(result.headers, 'Accept-Ranges') ?? '').trim().toLowerCase() !== 'bytes') {
    fail('ACCEPT_RANGES_INVALID');
  }
  const cacheControl = String(headerValue(result.headers, 'Cache-Control') ?? '');
  if (!cacheControl.split(',').some((directive) => directive.trim().toLowerCase() === 'no-store')) {
    fail('CACHE_CONTROL_INVALID');
  }
}

function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function createTimedRejection(ms, code, setTimeoutFn, clearTimeoutFn) {
  let timer;
  let rejectPromise;
  let epoch = 0;
  let cleared = false;
  const arm = () => {
    const owner = ++epoch;
    timer = setTimeoutFn(() => {
      if (cleared || owner !== epoch) return;
      rejectPromise(new BoundedProbeError(code));
    }, ms);
  };
  const promise = new Promise((_, reject) => {
    rejectPromise = reject;
    arm();
  });
  return {
    promise,
    reset() {
      clearTimeoutFn(timer);
      arm();
    },
    clear() {
      cleared = true;
      epoch += 1;
      clearTimeoutFn(timer);
    }
  };
}

async function awaitHeaders(readRange, request, options) {
  const timeout = createTimedRejection(
    options.limits.headersMs,
    'HEADER_TIMEOUT',
    options.setTimeoutFn,
    options.clearTimeoutFn
  );
  const pending = Promise.resolve().then(() => readRange(request));
  pending.then((late) => {
    if (options.signal.aborted) void cancelBody(late, options.signal.reason).catch(() => {});
  }).catch(() => {});
  try {
    return await Promise.race([awaitWithSignal(pending, options.signal), timeout.promise]);
  } catch (error) {
    if (error instanceof BoundedProbeError && error.code === 'HEADER_TIMEOUT') {
      options.controller.abort(error);
    }
    if (error instanceof BoundedProbeError) throw error;
    fail('READER_FAILURE');
  } finally {
    timeout.clear();
  }
}

async function readExactBody(result, expectedLength, options) {
  const direct = bytesFrom(result.bytes ?? result.body);
  if (direct) {
    if (direct.byteLength > expectedLength) fail('BODY_LENGTH_MISMATCH');
    options.onReceived(direct.byteLength);
    if (direct.byteLength !== expectedLength) fail('BODY_LENGTH_MISMATCH');
    return new Uint8Array(direct);
  }
  if (!result.body?.getReader) fail('BODY_UNAVAILABLE');
  const reader = result.body.getReader();
  options.onReaderOwned();
  const chunks = [];
  let received = 0;
  const timeout = createTimedRejection(
    options.limits.bodyNoProgressMs,
    'BODY_TIMEOUT',
    options.setTimeoutFn,
    options.clearTimeoutFn
  );
  let cancellationPromise = null;
  const cancel = (reason) => {
    if (!cancellationPromise) {
      cancellationPromise = Promise.resolve()
        .then(() => {
          if (typeof reader?.cancel !== 'function') fail('CLEANUP_FAILED');
          return reader.cancel(reason);
        })
        .catch(() => { fail('CLEANUP_FAILED'); });
    }
    return cancellationPromise;
  };
  const onAbort = () => { void cancel(options.signal.reason).catch(() => {}); };
  options.signal.addEventListener('abort', onAbort, { once: true });
  try {
    try {
      while (true) {
        throwIfAborted(options.signal);
        let step;
        try {
          step = await Promise.race([
            awaitWithSignal(reader.read(), options.signal),
            timeout.promise
          ]);
        } catch (error) {
          if (error instanceof BoundedProbeError && error.code === 'BODY_TIMEOUT') {
            options.controller.abort(error);
          }
          if (error instanceof BoundedProbeError) throw error;
          fail('READER_FAILURE');
        }
        throwIfAborted(options.signal);
        if (step.done) break;
        const chunk = bytesFrom(step.value);
        if (!chunk) fail('BODY_UNAVAILABLE');
        if (received + chunk.byteLength > expectedLength) {
          fail('BODY_LENGTH_MISMATCH');
        }
        received += chunk.byteLength;
        options.onReceived(chunk.byteLength);
        if (chunk.byteLength > 0) timeout.reset();
        chunks.push(new Uint8Array(chunk));
      }
    } catch (error) {
      await cancel(error);
      throw error;
    }
  } finally {
    timeout.clear();
    options.signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock?.(); } catch {}
  }
  if (received !== expectedLength) fail('BODY_LENGTH_MISMATCH');
  const output = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function mergeUniqueInterval(intervals, start, end) {
  let added = end - start + 1n;
  let mergedStart = start;
  let mergedEnd = end;
  const kept = [];
  for (const current of intervals) {
    if (current.end + 1n < mergedStart || current.start - 1n > mergedEnd) {
      kept.push(current);
      continue;
    }
    const overlapStart = current.start > mergedStart ? current.start : mergedStart;
    const overlapEnd = current.end < mergedEnd ? current.end : mergedEnd;
    if (overlapStart <= overlapEnd) added -= overlapEnd - overlapStart + 1n;
    if (current.start < mergedStart) mergedStart = current.start;
    if (current.end > mergedEnd) mergedEnd = current.end;
  }
  kept.push({ start: mergedStart, end: mergedEnd });
  kept.sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  intervals.splice(0, intervals.length, ...kept);
  return Number(added);
}

function createBatchBudget(maxBytes = DEFAULT_LIMITS.batchBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > DEFAULT_LIMITS.batchBytes) {
    fail('PROBE_FAILED');
  }
  let receivedBytes = 0;
  return Object.freeze({
    get receivedBytes() { return receivedBytes; },
    get remainingBytes() { return maxBytes - receivedBytes; },
    canStart(byteCount) { return receivedBytes + byteCount <= maxBytes; },
    addReceived(byteCount) { receivedBytes += byteCount; },
    maxBytes
  });
}

function redactedFailureResult(code, metrics, identityState) {
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe/1',
    producer: `bounded-probe.mjs@${TOOL_VERSION}`,
    ok: false,
    failure: Object.freeze({ code: FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED' }),
    identity: Object.freeze({
      preflight: identityState.preflight,
      postflight: identityState.postflight,
      checked: IDENTITY_FIELDS
    }),
    evidence: null,
    metrics: Object.freeze({ ...metrics })
  });
}

function successResult(evidence, metrics) {
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe/1',
    producer: `bounded-probe.mjs@${TOOL_VERSION}`,
    ok: true,
    failure: null,
    identity: Object.freeze({ preflight: true, postflight: true, checked: IDENTITY_FIELDS }),
    evidence,
    metrics: Object.freeze({ ...metrics })
  });
}

async function verifyBoundedPostflight({
  expected,
  getIdentity,
  generation,
  isGenerationCurrent,
  signal,
  timeoutMs,
  setTimeoutFn,
  clearTimeoutFn
}) {
  throwIfAborted(signal);
  if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');

  const controller = new AbortController();
  const unlinkAbort = linkAbort(signal, controller);
  const timer = setTimeoutFn(
    () => controller.abort(new BoundedProbeError('POSTFLIGHT_FAILED')),
    timeoutMs
  );
  try {
    let after;
    try {
      after = await awaitWithSignal(
        Promise.resolve().then(() => getIdentity({
          phase: 'postflight',
          generation,
          signal: controller.signal
        })),
        controller.signal
      );
    } catch {
      throwIfAborted(signal);
      if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
      fail('POSTFLIGHT_FAILED');
    }
    throwIfAborted(signal);
    if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
    try {
      assertExpectedIdentity(expected, after);
    } catch (error) {
      if (error instanceof BoundedProbeError && error.code === 'IDENTITY_MISMATCH') {
        fail('POSTFLIGHT_DRIFT');
      }
      throw error;
    }
  } finally {
    clearTimeoutFn(timer);
    unlinkAbort();
    controller.abort(new BoundedProbeError('ABORTED'));
  }
}

async function runBoundedProbe({
  expectedIdentity: expectedValue,
  getIdentity,
  readRange,
  probe,
  generation,
  isGenerationCurrent = () => true,
  batchBudget = createBatchBudget(),
  signal,
  limits: limitOverrides,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
}) {
  const metrics = { requests: 0, receivedBytes: 0, uniqueBytes: 0, cacheHits: 0, dedupedReads: 0 };
  const identityState = { preflight: false, postflight: false };
  let expected;
  let limits;
  try {
    expected = normalizeProbeIdentity(expectedValue);
    limits = normalizeLimits(limitOverrides);
    if (typeof getIdentity !== 'function' || typeof readRange !== 'function' || typeof probe !== 'function'
      || typeof isGenerationCurrent !== 'function'
      || typeof setTimeoutFn !== 'function' || typeof clearTimeoutFn !== 'function') {
      fail('PROBE_FAILED');
    }
  } catch (error) {
    return redactedFailureResult(fixedCode(error, 'PROBE_FAILED'), metrics, identityState);
  }

  const lifetimeController = new AbortController();
  const unlinkAbort = linkAbort(signal, lifetimeController);
  const fileController = new AbortController();
  const unlinkLifetime = linkAbort(lifetimeController.signal, fileController);
  const postflightBudgetMs = Math.min(
    limits.headersMs,
    Math.max(1, Math.floor(limits.fileMs / 2))
  );
  const readPhaseMs = Math.max(1, limits.fileMs - postflightBudgetMs);
  const lifetimeTimer = setTimeoutFn(
    () => lifetimeController.abort(new BoundedProbeError('FILE_TIMEOUT')),
    limits.fileMs
  );
  const readPhaseTimer = setTimeoutFn(
    () => fileController.abort(new BoundedProbeError('FILE_TIMEOUT')),
    readPhaseMs
  );
  const cache = new Map();
  const inflight = new Map();
  const intervals = [];
  let activeReads = 0;
  let serialTail = Promise.resolve();
  let readFailure = null;

  const generationCheck = () => {
    if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
  };

  const addReceived = (byteCount) => {
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) fail('BODY_LENGTH_MISMATCH');
    if (metrics.receivedBytes + byteCount > limits.fileBytes) fail('FILE_BYTE_LIMIT');
    if (batchBudget.receivedBytes + byteCount > batchBudget.maxBytes) fail('BATCH_BYTE_LIMIT');
    metrics.receivedBytes += byteCount;
    batchBudget.addReceived(byteCount);
  };

  const read = async ({ start, end }) => {
    throwIfAborted(fileController.signal);
    generationCheck();
    const range = planExactRange(start, end, expected.size, limits.requestBytes);
    const key = `${range.start}-${range.end}`;
    if (cache.has(key)) {
      metrics.cacheHits += 1;
      return new Uint8Array(cache.get(key));
    }
    if (inflight.has(key)) {
      metrics.dedupedReads += 1;
      return new Uint8Array(await inflight.get(key));
    }
    const execute = async () => {
      throwIfAborted(fileController.signal);
      generationCheck();
      if (activeReads !== 0) fail('PROBE_FAILED');
      if (metrics.requests >= limits.fileRequests) fail('FILE_REQUEST_LIMIT');
      if (metrics.receivedBytes + range.length > limits.fileBytes) fail('FILE_BYTE_LIMIT');
      if (!batchBudget.canStart(range.length)) fail('BATCH_BYTE_LIMIT');
      activeReads += 1;
      metrics.requests += 1;
      let result = null;
      let bodyHandlingStarted = false;
      try {
        result = await awaitHeaders(readRange, Object.freeze({
          identity: expected,
          generation,
          start: Number(range.start),
          end: Number(range.end),
          range: range.header,
          signal: fileController.signal
        }), {
          controller: fileController,
          signal: fileController.signal,
          limits,
          setTimeoutFn,
          clearTimeoutFn
        });
        throwIfAborted(fileController.signal);
        generationCheck();
        validateHeaders(result, range, expected.size);
        const bytes = await readExactBody(result, range.length, {
          controller: fileController,
          signal: fileController.signal,
          limits,
          setTimeoutFn,
          clearTimeoutFn,
          onReceived: addReceived,
          onReaderOwned: () => { bodyHandlingStarted = true; }
        });
        throwIfAborted(fileController.signal);
        generationCheck();
        if (metrics.receivedBytes > limits.fileBytes) fail('FILE_BYTE_LIMIT');
        if (batchBudget.receivedBytes > batchBudget.maxBytes) fail('BATCH_BYTE_LIMIT');
        metrics.uniqueBytes += mergeUniqueInterval(intervals, range.start, range.end);
        cache.set(key, new Uint8Array(bytes));
        return bytes;
      } catch (error) {
        if (!bodyHandlingStarted) await cancelBody(result, error);
        throw error;
      } finally {
        activeReads -= 1;
      }
    };
    const operation = serialTail.then(execute);
    serialTail = operation.then(
      () => undefined,
      (error) => { if (!readFailure) readFailure = error; }
    );
    inflight.set(key, operation);
    try {
      return new Uint8Array(await operation);
    } finally {
      inflight.delete(key);
    }
  };

  try {
    generationCheck();
    throwIfAborted(fileController.signal);
    let before;
    try {
      before = await awaitWithSignal(
        getIdentity({ phase: 'preflight', generation, signal: fileController.signal }),
        fileController.signal
      );
    } catch (error) {
      if (fileController.signal.aborted) throw abortReason(fileController.signal);
      if (error instanceof BoundedProbeError) throw error;
      fail('PREFLIGHT_FAILED');
    }
    assertExpectedIdentity(expected, before);
    if (!expected.canDownload) fail('DOWNLOAD_FORBIDDEN');
    identityState.preflight = true;
    generationCheck();

    let evidence;
    try {
      evidence = await awaitWithSignal(probe(Object.freeze({
        read,
        sniffMagic,
        planInitialMagicRange: (byteCount) => planInitialMagicRange(expected.size, byteCount),
        signal: fileController.signal,
        generation
      })), fileController.signal);
    } catch (error) {
      if (fileController.signal.aborted) throw abortReason(fileController.signal);
      if (error instanceof BoundedProbeError) throw error;
      fail('PROBE_FAILED');
    }
    throwIfAborted(fileController.signal);
    generationCheck();

    await awaitWithSignal(serialTail, fileController.signal);
    if (readFailure) throw readFailure;
    fileController.abort(new BoundedProbeError('ABORTED'));
    clearTimeoutFn(readPhaseTimer);
    await verifyBoundedPostflight({
      expected,
      getIdentity,
      generation,
      isGenerationCurrent,
      signal: lifetimeController.signal,
      timeoutMs: postflightBudgetMs,
      setTimeoutFn,
      clearTimeoutFn
    });
    identityState.postflight = true;
    generationCheck();
    return successResult(evidence, metrics);
  } catch (error) {
    cache.clear();
    const fallback = identityState.preflight ? 'PROBE_FAILED' : 'PREFLIGHT_FAILED';
    let code = fixedCode(error, fallback);
    const needsFailurePostflight = identityState.preflight
      && metrics.requests > 0
      && code !== 'ABORTED'
      && code !== 'GENERATION_STALE'
      && code !== 'POSTFLIGHT_DRIFT'
      && code !== 'POSTFLIGHT_FAILED';
    if (needsFailurePostflight) {
      let cleanupSettled = false;
      try {
        fileController.abort(new BoundedProbeError(code));
        await awaitWithSignal(serialTail, lifetimeController.signal);
        cleanupSettled = true;
        if (readFailure instanceof BoundedProbeError && readFailure.code === 'CLEANUP_FAILED') {
          throw readFailure;
        }
        clearTimeoutFn(readPhaseTimer);
        await verifyBoundedPostflight({
          expected,
          getIdentity,
          generation,
          isGenerationCurrent,
          signal: lifetimeController.signal,
          timeoutMs: postflightBudgetMs,
          setTimeoutFn,
          clearTimeoutFn
        });
        identityState.postflight = true;
      } catch (postflightError) {
        code = fixedCode(postflightError, 'POSTFLIGHT_FAILED');
        if (!cleanupSettled && code === 'FILE_TIMEOUT') code = 'CLEANUP_TIMEOUT';
      }
    }
    if (metrics.requests > 0 && !identityState.postflight) {
      metrics.uniqueBytes = 0;
    }
    return redactedFailureResult(code, metrics, identityState);
  } finally {
    lifetimeController.abort(new BoundedProbeError('ABORTED'));
    fileController.abort(new BoundedProbeError('ABORTED'));
    clearTimeoutFn(readPhaseTimer);
    clearTimeoutFn(lifetimeTimer);
    unlinkLifetime();
    unlinkAbort();
    cache.clear();
    inflight.clear();
  }
}

async function runBoundedProbeBatch({
  representatives,
  getIdentity,
  readRange,
  probe,
  generation,
  isGenerationCurrent,
  signal,
  limits,
  setTimeoutFn,
  clearTimeoutFn
}) {
  if (!Array.isArray(representatives)) fail('PROBE_FAILED');
  const resolvedLimits = normalizeLimits(limits);
  const batchBudget = createBatchBudget(resolvedLimits.batchBytes);
  const results = [];
  let terminated = false;
  const terminalCodes = new Set([
    'ABORTED', 'BODY_TIMEOUT', 'CLEANUP_FAILED', 'CLEANUP_TIMEOUT', 'FILE_TIMEOUT',
    'GENERATION_STALE', 'HEADER_TIMEOUT', 'POSTFLIGHT_DRIFT', 'POSTFLIGHT_FAILED'
  ]);
  for (let index = 0; index < representatives.length; index += 1) {
    throwIfAborted(signal);
    const expectedIdentity = representatives[index];
    const result = await runBoundedProbe({
      expectedIdentity,
      getIdentity: (context) => getIdentity({ ...context, expectedIdentity, index }),
      readRange: (context) => readRange({ ...context, index }),
      probe: (context) => probe({ ...context, index }),
      generation,
      isGenerationCurrent,
      batchBudget,
      signal,
      limits: resolvedLimits,
      setTimeoutFn,
      clearTimeoutFn
    });
    results.push(result);
    if (!result.ok && (terminalCodes.has(result.failure.code)
      || (result.identity.preflight && result.metrics.requests > 0
        && !result.identity.postflight))) {
      terminated = true;
      break;
    }
  }
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe-batch/1',
    concurrency: 1,
    complete: !terminated && results.length === representatives.length,
    processed: results.length,
    receivedBytes: batchBudget.receivedBytes,
    results: Object.freeze(results)
  });
}

function ascii(bytes, start, length) {
  if (bytes.byteLength < start + length) return '';
  let output = '';
  for (let index = start; index < start + length; index += 1) {
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function startsWith(bytes, signature) {
  return bytes.byteLength >= signature.length
    && signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes, needle, maximum = 1024) {
  const end = Math.min(bytes.byteLength, maximum);
  const text = ascii(bytes, 0, end).toLowerCase();
  return text.includes(needle);
}

function sniffResult(kind, family) {
  return Object.freeze({
    kind,
    family,
    source: 'magic-bytes',
    decodeClaimed: false,
    playbackClaimed: false
  });
}

function sniffMagic(value) {
  const bytes = bytesFrom(value);
  if (!bytes || bytes.byteLength === 0) return sniffResult('unknown', 'unknown');
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    return sniffResult('iso-bmff', 'video-container');
  }
  if (bytes.byteLength >= 188 && bytes[0] === 0x47
    && (bytes.byteLength === 188 || bytes[188] === 0x47)) {
    return sniffResult('mpeg-ts', 'video-container');
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    if (containsAscii(bytes, 'webm')) return sniffResult('webm', 'ebml-container');
    if (containsAscii(bytes, 'matroska')) return sniffResult('matroska', 'ebml-container');
    return sniffResult('ebml', 'ebml-container');
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF') {
    if (ascii(bytes, 8, 4) === 'AVI ') return sniffResult('avi', 'riff-container');
    if (ascii(bytes, 8, 4) === 'WEBP') return sniffResult('webp', 'image');
  }
  if (startsWith(bytes, [0x42, 0x4d])) return sniffResult('bmp', 'image');
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return sniffResult('jpeg', 'image');
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return sniffResult('png', 'image');
  }
  const gif = ascii(bytes, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return sniffResult('gif', 'image');

  const sample = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (sample.startsWith('{') || sample.startsWith('[')
    || sample.startsWith('<!doctype html') || sample.startsWith('<html')
    || sample.startsWith('<?xml')) {
    return sniffResult('error-payload', 'non-media');
  }
  return sniffResult('unknown', 'unknown');
}

return {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES};})();
const scanner=(()=>{
// Local-only top-level header walk. The caller owns exact bytes and identity.
const UINT64_MAX = (1n << 64n) - 1n;
const KNOWN_TYPES = new Set(['ftyp', 'styp', 'moov', 'mdat', 'moof', 'uuid', 'free', 'skip', 'wide']);

const DEFAULT_LIMITS = Object.freeze({ maxBoxes: 128, maxHeaderBytes: 4096, maxRequests: 64 });

class ScanStop extends Error {
  constructor(code, category) {
    super(code);
    this.code = code;
    this.category = category;
  }
}

function stop(code, category) { throw new ScanStop(code, category); }

function fileSize(value) {
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^\d{1,20}$/.test(value))) {
    stop('INVALID_SIZE', 'invalid-input');
  }
  const size = BigInt(value);
  if (size < 0n || size > UINT64_MAX) stop('INVALID_SIZE', 'invalid-input');
  return size;
}

function limitsFrom(value) {
  const limits = {};
  for (const [key, ceiling] of Object.entries(DEFAULT_LIMITS)) {
    const candidate = value?.[key] ?? ceiling;
    if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > ceiling) {
      stop('INVALID_LIMITS', 'invalid-input');
    }
    limits[key] = candidate;
  }
  return limits;
}

function checkAbort(signal) {
  if (signal?.aborted) stop('ABORTED', 'cancelled');
}

// The reader must cancel its own I/O using the same caller-owned signal.
function readWithSignal(read, range, signal) {
  checkAbort(signal);
  if (!signal) return Promise.resolve().then(() => read(range));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, new ScanStop('ABORTED', 'cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      checkAbort(signal);
      return read(range);
    }).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function uint(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/**
 * read({ start: BigInt, end: BigInt }) returns exact Uint8Array bytes (inclusive).
 * Report offsets are decimal strings. Limits may only be lowered. No body reads.
 */
async function scanIsoBmffTopLevel({ size: sizeValue, read, signal, limits: overrides } = {}) {
  let size = null;
  let offset = 0n;
  let limits = null;
  let requestedHeaderBytes = 0;
  let receivedHeaderBytes = 0;
  let requests = 0;
  const boxes = [];

  const report = (status, code, category) => {
    const firstMdat = boxes.find(box => box.type === 'mdat');
    const moov = boxes.filter(box => box.type === 'moov').map(box => Object.freeze({
      offset: box.offset,
      size: box.size,
      headerBytes: box.headerBytes,
      endExclusive: box.endExclusive,
      relativeToFirstObservedMdat: !firstMdat ? 'no-mdat-observed'
        : BigInt(box.offset) < BigInt(firstMdat.offset) ? 'before' : 'after'
    }));
    return Object.freeze({
      schema: 'drive-original.v2-07a-isobmff-index/1',
      status,
      code,
      category,
      evidenceLevel: status === 'complete' ? 'top-level-headers-complete' : 'partial-top-level-headers',
      size: size === null ? null : String(size),
      nextOffset: String(offset),
      boxes: Object.freeze(boxes.slice()),
      observations: Object.freeze({
        ftypHeaderObserved: boxes.some(box => box.type === 'ftyp'),
        stypHeaderObserved: boxes.some(box => box.type === 'styp'),
        moofHeaderObserved: boxes.some(box => box.type === 'moof'),
        moov: Object.freeze(moov)
      }),
      metrics: Object.freeze({ boxes: boxes.length, requests, requestedHeaderBytes, receivedHeaderBytes }),
      claims: Object.freeze({ containerValid: false, indexParsed: false, codecsParsed: false, decode: false, playback: false })
    });
  };

  const readHeader = async (start, length) => {
    checkAbort(signal);
    if (requests >= limits.maxRequests) stop('REQUEST_LIMIT', 'limit');
    if (requestedHeaderBytes + length > limits.maxHeaderBytes) stop('HEADER_BYTE_LIMIT', 'limit');
    requests += 1;
    requestedHeaderBytes += length;
    let bytes;
    try {
      bytes = await readWithSignal(read, Object.freeze({ start, end: start + BigInt(length) - 1n }), signal);
    } catch (error) {
      checkAbort(signal);
      if (error instanceof ScanStop) throw error;
      stop('READER_FAILURE', 'reader');
    }
    checkAbort(signal);
    if (!(bytes instanceof Uint8Array)) stop('INVALID_READER_RESULT', 'reader');
    // Reject an overlong result before copying or interpreting any of it.
    if (bytes.byteLength !== length) stop('READ_LENGTH_MISMATCH', 'reader');
    receivedHeaderBytes += length;
    return bytes;
  };

  try {
    size = fileSize(sizeValue);
    limits = limitsFrom(overrides);
    if (typeof read !== 'function' || (signal != null
      && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function'))) stop('INVALID_ARGUMENT', 'invalid-input');
    checkAbort(signal);
    while (offset < size) {
      checkAbort(signal);
      if (boxes.length >= limits.maxBoxes) stop('BOX_LIMIT', 'limit');
      const remaining = size - offset;
      if (remaining < 8n) stop('TRUNCATED_BASE_HEADER', 'malformed-header');
      const base = await readHeader(offset, 8);
      const shortSize = uint(base.subarray(0, 4));
      const rawType = String.fromCharCode(...base.subarray(4, 8));
      const type = KNOWN_TYPES.has(rawType) ? rawType : 'unknown';
      let headerBytes = shortSize === 1n ? 16 : 8;
      if (type === 'uuid') headerBytes += 16;
      let boxSize = shortSize === 0n ? remaining : shortSize;
      if (shortSize === 1n) {
        if (remaining < 16n) stop('TRUNCATED_EXTENDED_HEADER', 'malformed-header');
        boxSize = uint(await readHeader(offset + 8n, 8));
      }
      if (boxSize < BigInt(headerBytes)) stop('BOX_SMALLER_THAN_HEADER', 'malformed-header');
      const next = offset + boxSize;
      if (next > UINT64_MAX) stop('BOX_END_OVERFLOW', 'malformed-header');
      if (next > size) stop('BOX_BEYOND_EOF', 'malformed-header');
      // UUID user type follows largesize when present. Its body remains unread.
      if (type === 'uuid') await readHeader(offset + BigInt(headerBytes - 16), 16);
      boxes.push(Object.freeze({
        type,
        offset: String(offset),
        size: String(boxSize),
        headerBytes,
        endExclusive: String(next),
        sizeEncoding: shortSize === 0n ? 'to-eof' : shortSize === 1n ? 'uint64' : 'uint32'
      }));
      offset = next;
    }
    return report('complete', 'EOF', 'headers-only');
  } catch (error) {
    if (error instanceof ScanStop) return report('incomplete', error.code, error.category);
    return report('incomplete', 'INVALID_ARGUMENT', 'invalid-input');
  }
}

return {scanIsoBmffTopLevel};})();
const diagnostics=(()=>{
const COMPARATOR_CODES = Object.freeze(['INVALID_PASS','ROOT_PROVENANCE_UNCONFIRMED','ACCOUNT_CHANGED','ROOT_CHANGED','PRIORITY_ANCHOR_MISSING','REPEAT_MISMATCH','CLASSIFIED_METADATA_CONFLICT','COUNT_INVARIANT_FAILED']);
const FLAGS = ['rootBeforeChanged','rootAfterChanged','accountBeforeChanged','accountAfterChanged','traversedFolderCountChanged','duplicateReferenceCountChanged','unresolvedShortcutTargetCountChanged','staleShortcutTargetMimeCountChanged'];
const COUNTS = ['itemsAdded','itemsRemoved','itemsChanged','shortcutTargetsAdded','shortcutTargetsRemoved','shortcutTargetsChanged'];
function emptyComparisonDiagnostic(cause) {
  let code;try{code=cause?.code;}catch{}
  return {comparatorCode:COMPARATOR_CODES.includes(code)?code:'COMPARATOR_UNKNOWN',diagnosticAvailable:false,
    ...Object.fromEntries(FLAGS.map(key=>[key,false])),...Object.fromEntries(COUNTS.map(key=>[key,0]))};
}
// Even injected diagnostic results cannot add private values or unknown keys.
function sanitizeComparisonDiagnostic(value,cause) {
  const result=emptyComparisonDiagnostic(cause);
  try {
    if(result.comparatorCode==='COMPARATOR_UNKNOWN'||value?.diagnosticAvailable!==true)return result;
    if(FLAGS.some(key=>typeof value[key]!=='boolean')||COUNTS.some(key=>!Number.isSafeInteger(value[key])||value[key]<0))return result;
    result.diagnosticAvailable=true;
    for(const key of [...FLAGS,...COUNTS])result[key]=value[key];
  }catch{}
  return result;
}
function difference(before,after) {
  let added=0,removed=0,changed=0;
  for(const [key,value] of before){if(!after.has(key))removed++;else if(after.get(key)!==value)changed++;}
  for(const key of after.keys())if(!before.has(key))added++;
  return {added,removed,changed};
}
function privateRows(rows,keyOf,rowOf) {
  if(!Array.isArray(rows))throw new Error('Invalid private input');
  const map=new Map();
  for(const row of rows){const key=keyOf(row);if(typeof key!=='string'||!key||map.has(key))throw new Error('Invalid private input');map.set(key,rowOf(row));}
  return map;
}
// Canonical normalizers are injected from the maintained root core's private
// lexical closure by the builder. No normalization copy or private view export.
function diagnoseComparisonFailure(cause,firstPass,secondPass,{rootFence,stableItemRow}={}) {
  const output=emptyComparisonDiagnostic(cause);
  if(output.comparatorCode==='COMPARATOR_UNKNOWN')return output;
  try {
    if(typeof rootFence!=='function'||typeof stableItemRow!=='function'||!firstPass||!secondPass)throw new Error('Unavailable');
    output.rootBeforeChanged=rootFence(firstPass.rootBefore)!==rootFence(secondPass.rootBefore);
    output.rootAfterChanged=rootFence(firstPass.rootAfter)!==rootFence(secondPass.rootAfter);
    output.accountBeforeChanged=firstPass.accountBefore!==secondPass.accountBefore;
    output.accountAfterChanged=firstPass.accountAfter!==secondPass.accountAfter;
    for(const key of ['traversedFolderCount','duplicateReferenceCount','unresolvedShortcutTargetCount','staleShortcutTargetMimeCount'])output[`${key}Changed`]=firstPass[key]!==secondPass[key];
    const items=difference(privateRows(firstPass.items,row=>row.id,stableItemRow),privateRows(secondPass.items,row=>row.id,stableItemRow));
    const shortcuts=difference(privateRows(firstPass.shortcutTargets??[],row=>row[0],row=>stableItemRow(row[1])),privateRows(secondPass.shortcutTargets??[],row=>row[0],row=>stableItemRow(row[1])));
    output.itemsAdded=items.added;output.itemsRemoved=items.removed;output.itemsChanged=items.changed;
    output.shortcutTargetsAdded=shortcuts.added;output.shortcutTargetsRemoved=shortcuts.removed;output.shortcutTargetsChanged=shortcuts.changed;
    output.diagnosticAvailable=true;
    return sanitizeComparisonDiagnostic(output,cause);
  }catch{return emptyComparisonDiagnostic(cause);}
}

return {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic};})();
const metadata=(()=>{const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',VERSION='1.22.0-rc.11',CAPS={dispatches:512,runMs:600000,metadataResponseBytes:2097152,metadataBytes:67108864};
       const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=core;const {diagnoseComparisonFailure,emptyComparisonDiagnostic,sanitizeComparisonDiagnostic}=diagnostics;
const OWNER_FIELDS=['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','accountStateAbortController'];
const CODES=new Set(['RUNTIME_REJECTED','OWNER_CHANGED','ABORTED','REQUEST_LIMIT','METADATA_FAILED','INVENTORY_FAILED','CATALOG_DRIFT','RUN_TIMEOUT']);
const fault=code=>Object.assign(new Error(code),{code});
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(value);

// This constructor has no media fetch, selection, mutation or SW runtime-version
// dependency. Its narrower claim is two current complete metadata inventories.
function createMetadataCatalogComparison(runtime,dependencies={}) {
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory;
  const compare=dependencies.compareInventory??summarizeRepeatedInventory;
  const diagnose=dependencies.comparisonDiagnostics??((cause,a,b)=>diagnoseComparisonFailure(cause,a,b,dependencies.canonicalNormalizers));
  const requestMs=Math.min(25000,Math.max(1,dependencies.metadataTimeoutMs??25000));
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,owner=null;
  let claimed=false,promise=null,finished=false,timer=null;
  const lifetime=new AbortController();
  const result={schema:'drive-original.v2-07a-metadata-catalog-comparison/1',mode:'metadata-only-catalog-comparison',
    version:VERSION,complete:false,comparisonAttempted:false,catalogStable:false,catalogComparison:null,
    inventoryRunsCompleted:0,dispatches:0,metadataReceivedBytes:0,mediaRequests:0,writeRequests:0,released:false,
    activeControllerIdentityFenced:false,freshSWRuntimeVersionVerified:false,failure:null};
  const snapshot=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!lifetime.signal.aborted)lifetime.abort(fault(code));};
  const onHide=()=>stop('ABORTED'),onAccount=()=>stop('OWNER_CHANGED');
  function current() {
    const state=live?.readState?.(),controller=live?.navigator?.serviceWorker?.controller;
    const location=new URL(live?.location?.href),script=new URL(controller?.scriptURL);
    if(live.appVersion!==VERSION||live.top!==live.self||location.origin!==ORIGIN||live.navigator.onLine!==true
      ||live.getMutationsEnabled()!==false||!controller||controller.state!=='activated'||script.origin!==ORIGIN
      ||script.pathname!=='/sw.js'||script.search||script.hash||!state||!safeId(state.accountId)||!state.authAccountKey
      ||state.authStatus!=='online'||state.demo!==false||state.accountIdentityPending===true||live.hasUsableToken()!==true
      ||!state.token||!state.accountStateAbortController?.signal||state.accountStateAbortController.signal.aborted
      ||['authGeneration','driveSessionGeneration','tokenRevision'].some(key=>!Number.isSafeInteger(state[key])||state[key]<0)
      ||typeof live.nativeFetch!=='function')throw fault('RUNTIME_REJECTED');
    return {state,controller,href:location.href,script:script.href};
  }
  function assertOwner() {
    if(lifetime.signal.aborted)throw lifetime.signal.reason;
    let now;try{now=current();}catch{stop('OWNER_CHANGED');throw fault('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.href!==owner.href||now.script!==owner.script
      ||OWNER_FIELDS.some(key=>now.state[key]!==owner.values[key])){stop('OWNER_CHANGED');throw fault('OWNER_CHANGED');}
  }
  async function race(value,signal) {
    if(signal.aborted)throw signal.reason;
    let listener;const aborted=new Promise((_,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true});});
    try{return await Promise.race([value,aborted]);}finally{signal.removeEventListener('abort',listener);}
  }
  async function metadataFetch(value,options={}) {
    assertOwner();
    const url=new URL(value),headers=new Headers(options.headers??{});
    if(url.origin!=='https://www.googleapis.com'||!/^\/drive\/v3\/(about|files(?:\/[A-Za-z0-9_-]+)?)$/.test(url.pathname)
      ||url.searchParams.has('alt')||options.body!==undefined||(options.method&&options.method!=='GET')
      ||[...headers.keys()].some(key=>key!=='x-goog-drive-resource-keys'))throw fault('METADATA_FAILED');
    if(result.dispatches>=CAPS.dispatches){stop('REQUEST_LIMIT');throw fault('REQUEST_LIMIT');}
    result.dispatches++;headers.set('Authorization',`Bearer ${owner.values.token}`);
    const controller=new AbortController(),signals=[lifetime.signal,owner.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])];
    const links=signals.map(signal=>{const callback=()=>controller.abort(signal.reason);if(signal.aborted)callback();else signal.addEventListener('abort',callback,{once:true});return {signal,callback};});
    const deadline=setTimeout(()=>controller.abort(fault('METADATA_FAILED')),requestMs),signal=controller.signal;
    let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(deadline);for(const {signal,callback} of links)signal.removeEventListener('abort',callback);};
    let response;
    try {
      const pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,signal,credentials:'omit',redirect:'error',cache:'no-store',priority:'low'}));
      pending.then(late=>{if(signal.aborted)void Promise.resolve(late?.body?.cancel?.()).catch(()=>{});},()=>{});
      response=await race(pending,signal);assertOwner();
      if(response?.status!==200||response?.ok!==true){void Promise.resolve(response?.body?.cancel?.()).catch(()=>{});throw fault('METADATA_FAILED');}
    }catch(cause){controller.abort(cause);cleanup();throw cause;}
    let consumed=false;
    return {ok:true,json:async()=>{
      if(consumed)throw fault('METADATA_FAILED');consumed=true;
      let reader=null,complete=false,bytes=0;const chunks=[];
      try {
        assertOwner();reader=response.body?.getReader?.();if(!reader)throw fault('METADATA_FAILED');
        while(true){assertOwner();const chunk=await race(reader.read(),signal);assertOwner();if(chunk.done){complete=true;break;}
          if(!(chunk.value instanceof Uint8Array))throw fault('METADATA_FAILED');
          bytes+=chunk.value.byteLength;result.metadataReceivedBytes+=chunk.value.byteLength;
          if(bytes>CAPS.metadataResponseBytes||result.metadataReceivedBytes>CAPS.metadataBytes)throw fault('METADATA_FAILED');chunks.push(chunk.value);}
        const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
        const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));assertOwner();return json;
      }catch(cause){controller.abort(cause);throw cause;}
      finally {
        if(!complete){const cancelled=Promise.resolve().then(()=>reader?reader.cancel():response.body?.cancel?.());cancelled.catch(()=>{});await race(cancelled,signal).catch(()=>{});}
        try{reader?.releaseLock();}catch{}chunks.length=0;controller.abort(fault('ABORTED'));cleanup();
      }
    }};
  }
  async function readInventory() {
    assertOwner();
    try {
      const value=await race(inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey}),lifetime.signal);
      assertOwner();
      if(value?.report?.completeness?.repeatedPrivateInventoryMatched!==true||value.report.completeness.shortcutClassificationComplete!==true||!value.privatePasses?.secondPass)throw fault('INVENTORY_FAILED');
      result.inventoryRunsCompleted++;return value;
    }catch(cause){if(lifetime.signal.aborted)throw lifetime.signal.reason;throw fault(CODES.has(cause?.code)?cause.code:'INVENTORY_FAILED');}
  }
  async function execute() {
    let first=null,second=null;
    try {
      let initial;try{initial=current();}catch{throw fault('RUNTIME_REJECTED');}
      owner={...initial,values:Object.fromEntries(OWNER_FIELDS.map(key=>[key,initial.state[key]]))};
      if(!context||!safeId(context.rootId)||!safeId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fault('RUNTIME_REJECTED');
      assertOwner();result.activeControllerIdentityFenced=true;timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);
      live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccount,{once:true});
      first=await readInventory();second=await readInventory();assertOwner();result.comparisonAttempted=true;
      try{compare({firstPass:first.privatePasses.secondPass,secondPass:second.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}
      catch(cause){try{result.catalogComparison=sanitizeComparisonDiagnostic(diagnose(cause,first.privatePasses.secondPass,second.privatePasses.secondPass),cause);}catch{result.catalogComparison=emptyComparisonDiagnostic(cause);}throw fault('CATALOG_DRIFT');}
      assertOwner();result.catalogStable=true;result.complete=true;
    }catch(cause){const actual=lifetime.signal.aborted?lifetime.signal.reason:cause;result.failure=CODES.has(actual?.code)?actual.code:'INVENTORY_FAILED';}
    finally {
      stop(result.failure??'ABORTED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
      owner?.values.accountStateAbortController?.signal.removeEventListener('abort',onAccount);first=null;second=null;owner=null;context=null;live=null;result.released=true;finished=true;
    }
    return snapshot();
  }
  return Object.freeze({run(){if(!claimed){claimed=true;promise=execute();}return promise;},cancel(){stop('ABORTED');if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){return {claimed,done:finished,inventoryRunsCompleted:result.inventoryRunsCompleted,dispatches:result.dispatches,metadataReceivedBytes:result.metadataReceivedBytes,mediaRequests:0,writeRequests:0};},done(){return {done:finished,summary:finished?snapshot():null};}});
}

return {createMetadataCatalogComparison};})();
const probe=(()=>{const {createMetadataCatalogComparison}=metadata;const {runAuthenticatedRootInventory}=inventory;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;
const VERSION = '1.22.0-rc.11';
const CAPS = Object.freeze({ files:38, mediaRequests:76, mediaBytes:39816, dispatches:512, runMs:600000 });
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
const fail = code => Object.assign(new Error(code), {code});
const codes = new Set([...FAILURE_CODES,'SELECTION_FAILED','OWNER_CHANGED','REQUEST_LIMIT','CANCELLED','RUN_TIMEOUT','RUNTIME_REJECTED']);
const scannerCodes = new Set(['EOF','INVALID_SIZE','INVALID_LIMITS','INVALID_ARGUMENT','ABORTED','REQUEST_LIMIT','HEADER_BYTE_LIMIT','READER_FAILURE','INVALID_READER_RESULT','READ_LENGTH_MISMATCH','BOX_LIMIT','TRUNCATED_BASE_HEADER','TRUNCATED_EXTENDED_HEADER','BOX_SMALLER_THAN_HEADER','BOX_END_OVERFLOW','BOX_BEYOND_EOF']);
const identityKeys = ['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
const fileLimits = Object.freeze({requestBytes:940,fileBytes:5036,fileRequests:39,batchBytes:39816,headersMs:10000,bodyNoProgressMs:15000,fileMs:60000});

// The maintained metadata driver is bundled privately with an explicit rc11 VERSION
// binding. This leaf adds only the first inventory's read-only body discriminator.
function createFirstIsoProbe(runtime, dependencies={}) {
  const driverFactory = dependencies.metadataDriverFactory ?? createMetadataCatalogComparison;
  const inventory = dependencies.inventoryRunner ?? runAuthenticatedRootInventory;
  const selector = dependencies.selector ?? selectRiskRepresentatives;
  const scanner = dependencies.scanner ?? scanIsoBmffTopLevel;
  let live=runtime, context=runtime?.privateContext?{...runtime.privateContext}:null;
  const abort=new AbortController(), budget=createBatchBudget(CAPS.mediaBytes);
  let claimed=false, promise=null, driver=null, active=true, timer=null, inventoryCount=0, bodyFailure=null;
  let summary={schema:'drive-original.v2-07a-first-iso-rc11/1',version:VERSION,scope:'first-iso-top-level-only',
    preflightAccepted:false,freshSWRuntimeVersionVerified:false,selected:0,routed:0,skippedSmall:0,
    isoFound:false,isoHeadersComplete:false,iso:null,mediaRequests:0,receivedBytes:0,dispatches:0,
    metadataReceivedBytes:0,catalogStable:false,catalogComparison:null,complete:false,failure:null,released:false,
    tracksParsed:false,codecsParsed:false,containerValidityProven:false,decoded:0,playback:0,physicalDevicePlayback:0,
    nativeQ1RetirementProven:false,genericUpstreamCleanup:'unknown'};
  const safe = () => JSON.parse(JSON.stringify(summary));
  const stop = code => {if(!abort.signal.aborted)abort.abort(fail(code));};
  const hide = () => {stop('CANCELLED');driver?.cancel();};
  let controller=null, state=null, values=null, source=null, retirement=null;
  function current() {
    if(!active||abort.signal.aborted)throw abort.signal.reason??fail('OWNER_CHANGED');
    const now=live.readState(), proof=live.getSWIdentity?.();
    if(live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.getQ1Playback()!==null
      ||live.getPlayerMediaPriorityActive()!==false||live.getMediaSourceGeneration()!==source
      ||live.getQ1RetirementResult()!==retirement||retirement?.settled!==true
      ||now!==state||live.navigator.serviceWorker.controller!==controller||controller?.state!=='activated'
      ||proof?.controller!==controller||proof?.version!==VERSION
      ||now.selected!==null||now.mediaAttempt!=='idle'||now.mediaAbortController!==null
      ||now.pendingOriginalBuffer!==null||now.pendingPlay!==false||now.mediaTransportStarted!==false
      ||Object.keys(values).some(key=>now[key]!==values[key]))throw fail('OWNER_CHANGED');
  }
  function totalGuard() {
    current();if((driver?.progress().dispatches??0)+summary.mediaRequests>=CAPS.dispatches)throw fail('REQUEST_LIMIT');
  }
  function rowsFrom(selection) {
    const manifest=selection?.privateManifest,c=selection?.report?.coverage,m=selection?.report?.selection;
    if(manifest?.schema!=='drive-original.v2-07a-risk-selection-private/1'||!Array.isArray(manifest.selected)
      ||manifest.selected.length<1||manifest.selected.length>CAPS.files
      ||manifest.prioritySample?.fileId!==context.priorityFileId||manifest.prioritySample?.version!==context.priorityVersion
      ||!Number.isSafeInteger(c?.requiredCategoryCount)||c.coveredCategoryCount!==c.requiredCategoryCount||c.uncoveredCategoryCount!==0
      ||m?.prioritySampleSelected!==true||m.allRareMkvAviBmpSelected!==true||m.allGe4GiBSelected!==true)throw fail('SELECTION_FAILED');
    const seen=new Set();
    const rows=manifest.selected.map(row=>{
      if(!id(row.fileId)||seen.has(row.fileId)||!Array.isArray(row.visibleReferences)||!row.visibleReferences.length)throw fail('SELECTION_FAILED');
      seen.add(row.fileId);const keys=new Set();
      for(const ref of row.visibleReferences){if(!id(ref.fileId)||(ref.resourceKey!==null&&!id(ref.resourceKey)))throw fail('SELECTION_FAILED');if(ref.resourceKey)keys.add(ref.resourceKey);}
      if(keys.size>1)throw fail('SELECTION_FAILED');
      const expected=normalizeProbeIdentity({accountKey:context.accountKey,fileId:row.fileId,version:row.version,size:row.size,
        modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
      if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw fail('SELECTION_FAILED');
      return {expected,resourceKey:[...keys][0]??null,observedKey:undefined,reasons:row.mandatoryReasons??[]};
    });
    if(!rows.some(row=>row.expected.fileId===context.priorityFileId&&row.expected.version===context.priorityVersion))throw fail('SELECTION_FAILED');
    // This is a search-order hint only. Actual bytes alone authorize the ISO walker.
    const rank=row=>row.reasons.some(reason=>reason.startsWith('largest:'))?0:1;
    return rows.sort((a,b)=>rank(a)-rank(b)||a.expected.fileId.localeCompare(b.expected.fileId));
  }
  async function bodies(pass,driveFetch) {
    const priority=pass.items.find(item=>item.id===context.priorityFileId)
      ??pass.shortcutTargets?.find(([key])=>key===context.priorityFileId)?.[1];
    context.priorityVersion=String(priority?.version??'');
    const rows=rowsFrom(selector({pass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion}));
    summary.selected=rows.length;
    for(const row of rows) {
      current();
      const getIdentity=async({phase,signal})=>{
        totalGuard();const url=new URL(`https://www.googleapis.com/drive/v3/files/${row.expected.fileId}`);
        url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields','id,version,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)');
        const key=row.observedKey??row.resourceKey;
        const value=await (await driveFetch(url.href,{signal,headers:key?{'X-Goog-Drive-Resource-Keys':`${row.expected.fileId}/${key}`}:{}})).json();current();
        const observed=normalizeProbeIdentity({accountKey:context.accountKey,fileId:value.id,version:value.version,size:value.size,
          modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
        const resourceKey=value.resourceKey??null;
        if(value.trashed!==false||(resourceKey!==null&&!id(resourceKey))||identityKeys.some(key=>observed[key]!==row.expected[key])
          ||(row.resourceKey&&resourceKey!==row.resourceKey)||(phase==='postflight'&&resourceKey!==row.observedKey))throw fail('IDENTITY_MISMATCH');
        if(phase==='preflight')row.observedKey=resourceKey;return observed;
      };
      const result=await runBoundedProbe({expectedIdentity:row.expected,generation:context.generation,
        isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},signal:abort.signal,batchBudget:budget,limits:fileLimits,getIdentity,
        readRange:({range,start,end,signal})=>{
          totalGuard();const size=Number(row.expected.size);
          if(end>=size-1||!((start===0&&end===939)||(start>=940&&end-start+1<=16)))throw fail('INVALID_RANGE');
          if(summary.mediaRequests>=CAPS.mediaRequests)throw fail('REQUEST_LIMIT');summary.mediaRequests++;
          const url=new URL(`/__drive_media/${row.expected.fileId}`,live.location.href);
          url.searchParams.set('accountGeneration',String(values.driveSessionGeneration));url.searchParams.set('mediaSession',String(values.mediaSession));
          url.searchParams.set('size',row.expected.size);if(row.observedKey)url.searchParams.set('resourceKey',row.observedKey);
          return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
        },
        probe:async({read,sniffMagic})=>{
          if(BigInt(row.expected.size)<=940n)return {small:true};
          const prefix=await read({start:0,end:939});current();
          if(sniffMagic(prefix).kind!=='iso-bmff')return {iso:false};
          let eofHeaderSkipped=false;
          const parsed=await scanner({size:row.expected.size,signal:abort.signal,limits:{maxRequests:38,maxHeaderBytes:4096},
            read:async({start,end})=>{
              current();const a=Number(start),b=Number(end);
              if(end>=BigInt(row.expected.size)-1n){eofHeaderSkipped=true;throw fail('INVALID_RANGE');}
              if(b<940)return prefix.slice(a,b+1);
              if(a<940){const tail=await read({start:940,end:b});const bytes=new Uint8Array(b-a+1);bytes.set(prefix.subarray(a),0);bytes.set(tail,940-a);return bytes;}
              return read({start:a,end:b});
            }});current();
          return {iso:true,parsed,eofHeaderSkipped};
        }});
      summary.receivedBytes=budget.receivedBytes;
      if(!result.ok)throw fail(codes.has(result.failure?.code)?result.failure.code:'PROBE_FAILED');
      current();
      if(result.evidence.small){summary.skippedSmall++;continue;}
      summary.routed++;
      if(result.evidence.iso){
        const p=result.evidence.parsed;
        if(!scannerCodes.has(p?.code)||!['complete','incomplete'].includes(p.status))throw fail('PROBE_FAILED');
        summary.isoFound=true;summary.isoHeadersComplete=p.status==='complete';
        summary.iso={status:p.status,code:p.code,eofHeaderSkipped:result.evidence.eofHeaderSkipped,boxes:p.metrics.boxes,headerRequests:p.metrics.requests,
          headerBytes:p.metrics.receivedHeaderBytes,ftyp:p.observations.ftypHeaderObserved,styp:p.observations.stypHeaderObserved,
          moof:p.observations.moofHeaderObserved,moovCount:p.observations.moov.length,
          moovBeforeMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='before'),
          moovAfterMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='after'),
          moovWithoutObservedMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='no-mdat-observed')};
        break;
      }
    }
  }
  async function execute() {
    let report;
    try {
      if(!live||live.appVersion!==VERSION||!context||!id(context.rootId)||!id(context.priorityFileId))throw fail('RUNTIME_REJECTED');
      state=live.readState();controller=live.navigator.serviceWorker.controller;source=live.getMediaSourceGeneration();retirement=live.getQ1RetirementResult();
      values=Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(key=>[key,state[key]]));
      current();summary.freshSWRuntimeVersionVerified=true;
      timer=setTimeout(()=>{stop('RUN_TIMEOUT');driver?.cancel();},CAPS.runMs);
      live.addEventListener?.('pagehide',hide,{once:true});live.addEventListener?.('beforeunload',hide,{once:true});
      driver=driverFactory(live,{...dependencies,inventoryRunner:async(args)=>{
        summary.preflightAccepted=true;
        const driveFetch=(url,options)=>{totalGuard();return args.driveFetch(url,options);};
        const result=await inventory({...args,driveFetch});current();
        if(inventoryCount++===0){
          if(result?.report?.completeness?.repeatedPrivateInventoryMatched!==true||result.report.completeness.shortcutClassificationComplete!==true)throw fail('SELECTION_FAILED');
          try {await bodies(result.privatePasses.secondPass,driveFetch);}
          catch(cause){bodyFailure=codes.has(cause?.code)?cause.code:'PROBE_FAILED';throw cause;}
        }
        return result;
      }});
      report=await driver.run();
      summary.dispatches=report.dispatches+summary.mediaRequests;summary.metadataReceivedBytes=report.metadataReceivedBytes;
      summary.catalogStable=report.catalogStable;summary.catalogComparison=report.catalogComparison;
      summary.failure=bodyFailure??report.failure;summary.complete=report.complete&&summary.isoFound&&summary.isoHeadersComplete;
    } catch(cause) {
      summary.failure=codes.has(cause?.code)?cause.code:'RUNTIME_REJECTED';
    } finally {
      active=false;stop('CANCELLED');clearTimeout(timer);
      const progress=driver?.progress();if(progress){summary.dispatches=progress.dispatches+summary.mediaRequests;summary.metadataReceivedBytes=progress.metadataReceivedBytes;}
      live?.removeEventListener?.('pagehide',hide);live?.removeEventListener?.('beforeunload',hide);
      summary.receivedBytes=budget.receivedBytes;summary.released=true;
      live=null;context=null;state=null;controller=null;values=null;retirement=null;
    }
    return safe();
  }
  return Object.freeze({run(){if(!claimed){claimed=true;promise=execute();}return promise;},
    cancel(){stop('CANCELLED');driver?.cancel();if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){const p=driver?.progress();return {claimed,done:summary.released,selected:summary.selected,routed:summary.routed,
      mediaRequests:summary.mediaRequests,receivedBytes:budget.receivedBytes,dispatches:(p?.dispatches??0)+summary.mediaRequests};},
    done(){return {done:summary.released,summary:summary.released?safe():null};}});
}

return {createFirstIsoProbe};})();
return runtime=>probe.createFirstIsoProbe(runtime,{canonicalNormalizers:{rootFence:core.rootFence,stableItemRow:core.stableItemRow}});
})();
const facade=(function (privateContextText, swProof) {
  'use strict';
  const rejected = () => Object.freeze({
    poll: () => ({ done: true, scope: 'rc11-first-iso-headers', failure: 'FACADE_PREFLIGHT_REJECTED', mediaRequests: 0, writeRequests: 0 }),
    cancel: () => ({ cancelled: true }),
  });
  let context, projection;
  try {
    if (typeof privateContextText !== 'string' || privateContextText.length > 4096) return rejected();
    context = JSON.parse(privateContextText);
    if (!context || Array.isArray(context) || Object.keys(context).sort().join(',') !== 'accountKey,generation,priorityFileId,rootId'
      || !['accountKey', 'priorityFileId', 'rootId'].every(key => typeof context[key] === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(context[key]))
      || !Number.isSafeInteger(context.generation) || context.generation < 0) return rejected();
    projection = JSON.parse(JSON.stringify(state.accountMediaState));
  } catch { return rejected(); }
  let owner = {
    account: state.accountId, key: state.authAccountKey, auth: state.authGeneration,
    drive: state.driveSessionGeneration, tokenRevision: state.tokenRevision,
    token: state.token, expiry: state.expiresAt, abort: state.accountStateAbortController,
    controller: navigator.serviceWorker.controller, writer: state.accountStateWriterId,
    revision: state.accountStateRevision, session: state.mediaSession,
    source: mediaSourceGeneration, retirement: q1RetirementResult,
  };
  const current = () => Boolean(owner) && APP_VERSION === '1.22.0-rc.11' && DRIVE_MUTATIONS_ENABLED === false
    && ACCOUNT_STATE_WRITES_ENABLED === true && top === self && navigator.onLine === true
    && document.visibilityState === 'visible'
    && location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    && state.accountId === owner.account && state.authAccountKey === owner.key
    && state.authGeneration === owner.auth && state.driveSessionGeneration === owner.drive
    && state.tokenRevision === owner.tokenRevision && state.token === owner.token && state.expiresAt === owner.expiry
    && state.authStatus === 'online' && state.demo === false && !state.accountIdentityPending && hasUsableToken()
    && state.accountStateAbortController === owner.abort && Boolean(owner.abort?.signal) && !owner.abort.signal.aborted
    && navigator.serviceWorker.controller === owner.controller && owner.controller?.state === 'activated'
    && state.accountStateLoaded === true && state.accountStateWriterId === owner.writer
    && typeof owner.writer === 'string' && owner.writer.length > 0
    && Number.isSafeInteger(owner.revision) && owner.revision >= 0 && state.accountStateRevision === owner.revision
    && state.accountStateSyncPromise === null && state.accountStateSyncTimer === null
    && state.accountStateSyncRetryTimer === null && state.accountStateSyncError === null
    && accountMediaStatesEqual(state.accountMediaState, projection)
    && state.mediaSession === owner.session && mediaSourceGeneration === owner.source
    && q1RetirementResult === owner.retirement && q1RetirementResult?.settled === true
    && state.selected === null && state.mediaAttempt === 'idle' && state.mediaAbortController === null
    && state.pendingOriginalBuffer === null && state.pendingPlay === false && state.mediaTransportStarted === false
    && q1Playback === null && !playerMediaPriorityActive;
  let handle;
  try {
    if (!current() || context.accountKey !== owner.account || context.generation !== owner.drive) return rejected();
    handle = this({ appVersion: APP_VERSION,
      readState: () => { if (!current()) throw new Error('OWNER_CHANGED'); return state; },
      hasUsableToken, getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,
      getSWIdentity: () => swProof?.get?.(), getQ1Playback: () => q1Playback,
      getQ1RetirementResult: () => q1RetirementResult, getMediaSourceGeneration: () => mediaSourceGeneration,
      getPlayerMediaPriorityActive: () => playerMediaPriorityActive,
      navigator, location, top, self, privateContext: context,
      nativeFetch: (...args) => { if (!current()) throw new Error('OWNER_CHANGED'); return fetch(...args); },
      addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    });
  } catch { context = null; projection = null; return rejected(); }
  let settled = false;
  // Deliberately do not return or expose this Promise: CDP receives a handle immediately.
  handle.run().then(() => { settled = true; projection = null; context = null; owner = null; }, () => {
    settled = true; projection = null; context = null; owner = null;
  });
  return Object.freeze({
    poll: () => ({ scope: 'rc11-first-iso-headers', normalEqualReadRefreshAllowed: true,
      ...handle.progress(),
      done: settled && handle.done().done, summary: settled ? handle.done().summary : null }),
    cancel: () => handle.cancel(),
  });
});
return (privateContextText,swProof)=>facade.call(factory,privateContextText,swProof);
})()
