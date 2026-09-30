(()=>{const create=(()=>{
'use strict';
const root=(()=>{
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
const inventory=(()=>{const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=root;
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
const parser=(()=>{
// Bounded structural metadata only. No decoder/capability or sample-table verdict.
const MAX_MOOV_BYTES = 2 * 1024 * 1024;
const error = code => { throw Object.assign(new Error(code), { code }); };
const knownCodecs = new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4a','Opus','ac-3','ec-3','alac','fLaC','enca','encv','tx3g','wvtt','stpp']);
function parseMoov(input) {
  let count=0, descriptorCount=0, tracks=[];
  const limitations=new Set(['sample-tables-unparsed','sample-payloads-unread','decode-and-capability-unproven','hdr-vfr-subtitles-unqualified']);
  const report=(status,code,fragmented=null)=>({schema:'drive-original.iso-tracks/1',status,code,fragmented,tracks,
    boxesParsed:count,limitations:[...limitations],containerValidityProven:false,decode:false,playback:false});
  try {
    if(!(input instanceof Uint8Array)||input.byteLength<8||input.byteLength>MAX_MOOV_BYTES)error('MOOV_SIZE_LIMIT');
    const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
    const need=(offset,n,end=input.length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+n>end)error('TRUNCATED_FIELD');};
    const u16=(p,end)=>{need(p,2,end);return view.getUint16(p);};
    const u32=(p,end)=>{need(p,4,end);return view.getUint32(p);};
    const type=p=>String.fromCharCode(...input.subarray(p,p+4));
    const boxes=(start,end)=>{
      const out=[];
      for(let p=start;p<end;){
        if(++count>4096)error('BOX_LIMIT');need(p,8,end);
        let size=u32(p,end),header=8;
        if(size===1){need(p,16,end);const n=view.getBigUint64(p+8);if(n>BigInt(MAX_MOOV_BYTES))error('BOX_SIZE_LIMIT');size=Number(n);header=16;}
        if(size===0)size=end-p;
        if(size<header||p+size>end)error('INVALID_BOX_SIZE');
        out.push({type:type(p+4),start:p,body:p+header,end:p+size});p+=size;
      }
      return out;
    };
    const one=(list,t,required=true)=>{const found=list.filter(b=>b.type===t);if(found.length>1||(!found.length&&required))error('MISSING_OR_DUPLICATE_BOX');return found[0]??null;};
    const full=(box,versions=[0])=>{need(box.body,4,box.end);const v=input[box.body];if(!versions.includes(v))error('UNSUPPORTED_BOX_VERSION');return v;};
    const configs=(entry,start)=>{
      const result={};
      for(const b of boxes(start,entry.end)){
        if(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','sinf','pasp','colr'].includes(b.type)){
          if(result[b.type])error('DUPLICATE_CODEC_CONFIG');
          result[b.type]={present:true,bytes:b.end-b.body};
          if(b.type==='avcC'){need(b.body,5,b.end);if(input[b.body]!==1)error('INVALID_AVCC');Object.assign(result[b.type],{profile:input[b.body+1],compatibility:input[b.body+2],level:input[b.body+3],lengthSize:(input[b.body+4]&3)+1});limitations.add('avcc-parameter-sets-unparsed');}
          else if(b.type==='hvcC'){need(b.body,23,b.end);if(input[b.body]!==1)error('INVALID_HVCC');Object.assign(result[b.type],{profileIdc:input[b.body+1]&31,levelIdc:input[b.body+12],bitDepthLuma:8+(input[b.body+17]&7),bitDepthChroma:8+(input[b.body+18]&7)});limitations.add('hvcc-arrays-unparsed');}
          else if(b.type==='esds'){
            full(b);const descriptor=(p,end,depth=0)=>{
              if(depth>4)error('DESCRIPTOR_DEPTH');let asc=null;
              while(p<end){if(++descriptorCount>4096)error('DESCRIPTOR_LIMIT');need(p,2,end);const tag=input[p++];let n=0,k=0,more;
                do{need(p,1,end);const v=input[p++];more=v&128;n=n*128+(v&127);if(++k>4)error('INVALID_DESCRIPTOR_LENGTH');}while(more);
                need(p,n,end);const next=p+n;
                if(tag===3){need(p,3,next);const flags=input[p+2];p+=3;if(flags&128){need(p,2,next);p+=2;}if(flags&64){need(p,1,next);const len=input[p++];need(p,len,next);p+=len;}if(flags&32){need(p,2,next);p+=2;}asc=descriptor(p,next,depth+1)??asc;}
                else if(tag===4){need(p,13,next);result.esds.objectTypeIndication=input[p];asc=descriptor(p+13,next,depth+1)??asc;}
                else if(tag===5){need(p,2,next);const a=input[p],c=input[p+1],objectType=a>>3,freqIndex=((a&7)<<1)|(c>>7),channelConfig=(c>>3)&15;
                  asc={objectType,freqIndex,channelConfig};if(objectType===31||freqIndex===15||![1,2,3,4].includes(objectType)||channelConfig===0)limitations.add('complex-audio-specific-config-unparsed');}
                p=next;
              }return asc;
            };result.esds.audioSpecificConfig=descriptor(b.body+4,b.end);limitations.add('audio-specific-config-extension-bits-unparsed');
          } else if(b.type==='sinf')limitations.add('encrypted-sample-entry-unqualified');
          else if(b.type==='colr')limitations.add('color-description-unparsed');
        } else limitations.add('unknown-sample-entry-child');
      }return result;
    };
    const top=boxes(0,input.length);if(top.length!==1||top[0].type!=='moov')error('EXPECTED_EXACT_MOOV');
    const children=boxes(top[0].body,top[0].end),fragmented=children.some(b=>b.type==='mvex');
    if(fragmented)limitations.add('fragment-defaults-and-fragments-unparsed');
    const traks=children.filter(b=>b.type==='trak');if(!traks.length||traks.length>32)error('TRACK_COUNT_LIMIT');
    const ids=new Set();
    for(const trak of traks){
      const tc=boxes(trak.body,trak.end),tk=one(tc,'tkhd'),tv=full(tk,[0,1]);
      const id=u32(tk.body+(tv===1?20:12),tk.end);if(!id||ids.has(id))error('DUPLICATE_TRACK_ID');ids.add(id);
      const dim=tk.body+(tv===1?88:76),width=u32(dim,tk.end)/65536,height=u32(dim+4,tk.end)/65536;
      const matrix=tk.body+(tv===1?52:40);need(matrix,36,tk.end);
      const identityMatrix=[65536,0,0,0,65536,0,0,0,1073741824].every((v,i)=>view.getInt32(matrix+i*4)===v);
      if(!identityMatrix)limitations.add('nonidentity-track-matrix-unqualified');
      if(tc.some(b=>b.type==='edts'))limitations.add('edit-list-unparsed');
      const mdia=one(tc,'mdia'),mc=boxes(mdia.body,mdia.end),hd=one(mc,'hdlr');full(hd);need(hd.body+8,4,hd.end);
      const rawHandler=type(hd.body+8),handler=['vide','soun','subt','text','sbtl','meta','hint'].includes(rawHandler)?rawHandler:'unknown';
      const mh=one(mc,'mdhd'),mv=full(mh,[0,1]),time=mh.body+(mv===1?20:12),timescale=u32(time,mh.end);if(!timescale)error('INVALID_TIMESCALE');
      const minf=one(mc,'minf'),stbl=one(boxes(minf.body,minf.end),'stbl'),stsd=one(boxes(stbl.body,stbl.end),'stsd');full(stsd);
      const entries=boxes(stsd.body+8,stsd.end);if(u32(stsd.body+4,stsd.end)!==entries.length||entries.length<1||entries.length>16)error('SAMPLE_DESCRIPTION_COUNT');
      const descriptions=entries.map(entry=>{
        need(entry.body,8,entry.end);const raw=entry.type,codec=knownCodecs.has(raw)?raw:'unknown',encrypted=['enca','encv'].includes(raw);
        const out={codec,encrypted,dataReferenceIndex:u16(entry.body+6,entry.end)};
        if(out.dataReferenceIndex!==1)limitations.add('nondefault-data-reference-unqualified');
        if(encrypted)limitations.add('encrypted-sample-entry-unqualified');
        if(handler==='vide'&&['avc1','avc3','hvc1','hev1','av01','vp09','encv'].includes(raw)){
          need(entry.body,78,entry.end);out.width=u16(entry.body+24,entry.end);out.height=u16(entry.body+26,entry.end);out.config=configs(entry,entry.body+78);
          const required={avc1:'avcC',avc3:'avcC',hvc1:'hvcC',hev1:'hvcC',av01:'av1C',vp09:'vpcC'}[raw];if(required&&!out.config[required])error('MISSING_CODEC_CONFIG');
        }else if(handler==='soun'&&['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca'].includes(raw)){
          need(entry.body,28,entry.end);const version=u16(entry.body+8,entry.end);out.soundVersion=version;
          out.channels=u16(entry.body+16,entry.end);out.sampleSize=u16(entry.body+18,entry.end);out.sampleRate=u32(entry.body+24,entry.end)/65536;
          if(version!==0){limitations.add('quicktime-audio-version-unimplemented');out.config=null;}else{out.config=configs(entry,entry.body+28);if(raw==='mp4a'&&!out.config.esds)limitations.add('mp4a-esds-missing');}
        }else limitations.add('sample-entry-layout-unimplemented');
        return out;
      });
      tracks.push({type:handler,width,height,identityMatrix,timescale,descriptions});
    }
    return report('parsed','STRUCTURAL_METADATA_ONLY',fragmented);
  }catch(e){return report('incomplete',e?.code??'INVALID_INPUT');}
}

return {parseMoov};})();
const sparse=(()=>{
// Build a derived, compact metadata tree. Sample tables/payloads are never read.
const SPARSE_LIMITS=Object.freeze({bytes:2*1024*1024,requests:64,boxes:256,tracks:32,descriptions:16,configBytes:256*1024});
const stop=code=>{throw Object.assign(new Error(code),{code});};
const video=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','encv']);
const audio=new Set(['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca']);
const configs=new Set(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','pasp']);
const tableTypes=new Set(['stts','ctts','cslg','stsc','stsz','stz2','stco','co64','stss','stsh','padb','stdp','sdtp','sbgp','sgpd','subs','saiz','saio','senc']);
const uint=b=>{let n=0n;for(const v of b)n=(n<<8n)|BigInt(v);return n;};
const concat=parts=>{const size=parts.reduce((n,v)=>n+v.length,0),out=new Uint8Array(size);let p=0;for(const v of parts){out.set(v,p);p+=v.length;}return out;};
const pack=(type,parts=[])=>{const body=concat(parts),out=new Uint8Array(body.length+8),view=new DataView(out.buffer);view.setUint32(0,out.length);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(body,8);return out;};

async function readSparseMoov({box,fileSize,read,signal,limits:overrides={}}={}){
  const metrics={requests:0,receivedBytes:0,boxes:0,tracks:0,descriptions:0,sampleTableBoxesSkipped:0,unknownPayloadsSkipped:0,fixedLeafSuffixesSkipped:0,originalBoundsValidated:false,derivedBytes:0};
  let limits=null;
  const check=()=>{if(signal?.aborted)stop('SPARSE_ABORTED');};
  const result=(status,code,bytes=null)=>({status,code,bytes,metrics:{...metrics},derivedStructuralMetadata:true,originalSampleTablesRead:false,containerValidityProven:false});
  try{
    limits=Object.fromEntries(Object.entries(SPARSE_LIMITS).map(([k,v])=>{const n=overrides[k]??v;if(!Number.isSafeInteger(n)||n<1||n>v)stop('SPARSE_INVALID_LIMIT');return [k,n];}));
    if(typeof read!=='function')stop('SPARSE_INVALID_ARGUMENT');
    const size=BigInt(fileSize),start=BigInt(box.offset),end=BigInt(box.endExclusive),declared=BigInt(box.size),head=BigInt(box.headerBytes);
    if(size>BigInt(Number.MAX_SAFE_INTEGER)||start<0n||end>size||declared!==end-start||head<8n||head>16n||declared<head)stop('SPARSE_INVALID_BOUNDS');
    const bytes=async(p,n,bound)=>{
      check();if(!Number.isSafeInteger(n)||n<1||p<start||p+BigInt(n)>bound||bound>end)stop('SPARSE_INVALID_BOUNDS');
      if(metrics.requests>=limits.requests)stop('SPARSE_REQUEST_LIMIT');if(metrics.receivedBytes+n>limits.bytes)stop('SPARSE_BYTE_LIMIT');metrics.requests++;
      const pending=Promise.resolve().then(()=>{check();return read({start:p,end:p+BigInt(n)-1n});});
      let value;
      if(!signal)value=await pending;
      else value=await new Promise((resolve,reject)=>{const onAbort=()=>finish(reject,Object.assign(new Error('SPARSE_ABORTED'),{code:'SPARSE_ABORTED'}));const finish=(fn,v)=>{signal.removeEventListener('abort',onAbort);fn(v);};signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();pending.then(v=>finish(resolve,v),e=>finish(reject,e));});
      check();
      if(!(value instanceof Uint8Array)||value.length!==n)stop('SPARSE_READ_LENGTH');metrics.receivedBytes+=value.length;return value;
    };
    const header=async(p,bound)=>{
      if(++metrics.boxes>limits.boxes)stop('SPARSE_BOX_LIMIT');
      const b=await bytes(p,8,bound),raw=Number(uint(b.subarray(0,4))),type=String.fromCharCode(...b.subarray(4));let h=8n,n=BigInt(raw);
      if(raw===1){n=uint(await bytes(p+8n,8,bound));h=16n;}else if(raw===0)n=bound-p;
      if(type==='uuid')h+=16n;
      if(n<h||p+n>bound||p+n>size)stop('SPARSE_INVALID_BOX');
      return {type,start:p,body:p+h,end:p+n,size:n,head:h};
    };
    const fixed=async(b)=>{
      const prefix=await bytes(b.body,4,b.end),v=prefix[0];let n;
      if(b.type==='tkhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?96:84;}
      else if(b.type==='mdhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?36:24;}
      else {if(v!==0)stop('SPARSE_UNSUPPORTED_VERSION');n=12;}
      const rest=await bytes(b.body+4n,n-4,b.end);if(b.body+BigInt(n)<b.end)metrics.fixedLeafSuffixesSkipped++;
      return pack(b.type,[prefix,rest]);
    };
    const stsd=async(b)=>{
      const prefix=await bytes(b.body,8,b.end);if(prefix[0]!==0)stop('SPARSE_UNSUPPORTED_VERSION');const count=Number(uint(prefix.subarray(4)));
      if(count<1||count>limits.descriptions)stop('SPARSE_DESCRIPTION_LIMIT');let p=b.body+8n;const entries=[];
      for(let i=0;i<count;i++){
        const e=await header(p,b.end);metrics.descriptions++;const n=video.has(e.type)?78:audio.has(e.type)?28:0;
        if(!n)stop('SPARSE_UNSUPPORTED_ENTRY');
        const entry=await bytes(e.body,n,e.end);if(audio.has(e.type)&&uint(entry.subarray(8,10))!==0n)stop('SPARSE_UNSUPPORTED_AUDIO_VERSION');
        let c=e.body+BigInt(n);const leaves=[entry];
        while(c<e.end){
          const child=await header(c,e.end),length=child.end-child.body;
          if(configs.has(child.type)){
            if(length>BigInt(limits.configBytes))stop('SPARSE_CONFIG_LIMIT');
            leaves.push(pack(child.type,length?[await bytes(child.body,Number(length),child.end)]:[]));
          }else if(child.type==='sinf'||child.type==='colr'){
            metrics.unknownPayloadsSkipped++;leaves.push(pack(child.type));
          }else{metrics.unknownPayloadsSkipped++;leaves.push(pack('free'));}
          c=child.end;
        }
        entries.push(pack(e.type,leaves));p=e.end;
      }
      if(p!==b.end)stop('SPARSE_DESCRIPTION_COUNT');return pack('stsd',[prefix,...entries]);
    };
    const grammar={moov:new Set(['trak']),trak:new Set(['mdia']),mdia:new Set(['minf']),minf:new Set(['stbl']),stbl:new Set()};
    const allowedLeaves={moov:new Set(),trak:new Set(['tkhd']),mdia:new Set(['mdhd','hdlr']),minf:new Set(),stbl:new Set(['stsd'])};
    const walk=async(type,body,bound,depth)=>{
      check();if(depth>5)stop('SPARSE_DEPTH');let p=body;const output=[];
      while(p<bound){
        const child=await header(p,bound);
        if(grammar[type].has(child.type)){
          if(child.type==='trak'&&++metrics.tracks>limits.tracks)stop('SPARSE_TRACK_LIMIT');
          output.push(await walk(child.type,child.body,child.end,depth+1));
        }else if(allowedLeaves[type].has(child.type))output.push(child.type==='stsd'?await stsd(child):await fixed(child));
        else if((type==='moov'&&child.type==='mvex')||(type==='trak'&&child.type==='edts')){metrics.unknownPayloadsSkipped++;output.push(pack(child.type));}
        else if(type==='stbl'&&tableTypes.has(child.type))metrics.sampleTableBoxesSkipped++;
        else metrics.unknownPayloadsSkipped++;
        p=child.end;
      }
      return pack(type,output);
    };
    // Reuse the root scanner's identity-fenced validated header; do not reread it.
    const derived=await walk('moov',start+head,end,0);check();if(derived.length>limits.bytes)stop('SPARSE_DERIVED_LIMIT');
    metrics.originalBoundsValidated=true;metrics.derivedBytes=derived.length;
    return result('complete','SPARSE_STRUCTURAL_METADATA',derived);
  }catch(e){return result('incomplete',typeof e?.code==='string'&&e.code.startsWith('SPARSE_')?e.code:'SPARSE_READER_FAILURE');}
}

return {readSparseMoov};})();
const ebml=(()=>{
// Structural metadata only; RFC8794 VINTs and Matroska element schema.
// No packet, codec-private, attachment, string-name or media payload export.
const fail=code=>Object.assign(new Error(code),{code});
const safe=()=>({status:'incomplete',code:'EBML_TRACKS_INCOMPLETE',tracks:[],limitations:['structural-metadata-only','codec-private-unparsed','packets-cues-timing-unread','hdr-vfr-decoder-capability-unqualified']});
const codecs=new Map([['V_VP8','vp8'],['V_VP9','vp9'],['V_AV1','av1'],['V_MPEG4/ISO/AVC','avc'],['V_MPEGH/ISO/HEVC','hevc'],['V_MPEG4/ISO/SP','mpeg4-part2'],['V_MPEG4/ISO/ASP','mpeg4-part2'],['V_MPEG2','mpeg2'],['A_OPUS','opus'],['A_VORBIS','vorbis'],['A_AAC','aac'],['A_AC3','ac3'],['A_EAC3','eac3'],['A_FLAC','flac'],['A_PCM/INT/LIT','pcm'],['A_PCM/INT/BIG','pcm']]);
function vint(bytes,pos,isId){
  const first=bytes[pos];if(!first)throw fail('EBML_MALFORMED');let length=1,mask=128;while(!(first&mask)){length++;mask>>=1;}
  if(length>(isId?4:8)||pos+length>bytes.length)throw fail('EBML_MALFORMED');
  let value=BigInt(isId?first:first&(mask-1));for(let i=1;i<length;i++)value=value*256n+BigInt(bytes[pos+i]);
  if(isId){const data=value&((1n<<BigInt(7*length))-1n);if(data===0n||data===(1n<<BigInt(7*length))-1n)throw fail('EBML_MALFORMED');}
  return {length,value,unknown:!isId&&value===(1n<<BigInt(7*length))-1n};
}
function element(bytes,pos,end){const id=vint(bytes,pos,true),size=vint(bytes,pos+id.length,false),start=pos+id.length+size.length;
  if(size.unknown||size.value>BigInt(Number.MAX_SAFE_INTEGER))throw fail('EBML_UNKNOWN_NESTED_SIZE');const stop=start+Number(size.value);if(stop>end)throw fail('EBML_MALFORMED');return {id:Number(id.value),start,end:stop};}
function uint(bytes,a,b){if(b<=a||b-a>8)throw fail('EBML_MALFORMED');let n=0n;for(let i=a;i<b;i++)n=n*256n+BigInt(bytes[i]);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw fail('EBML_NUMBER_LIMIT');return Number(n);}
function float(bytes,a,b){if(b-a!==4&&b-a!==8)throw fail('EBML_MALFORMED');const v=new DataView(bytes.buffer,bytes.byteOffset+a,b-a),n=b-a===4?v.getFloat32(0):v.getFloat64(0);if(!Number.isFinite(n)||n<=0)throw fail('EBML_MALFORMED');return n;}
function parseEbmlTracks(bytes){
  const result=safe();try{
    if(!(bytes instanceof Uint8Array)||bytes.length>262144)throw fail('EBML_TRACKS_SIZE_LIMIT');let boxes=0;
    const walk=(a,b,visit)=>{for(let p=a;p<b;){if(++boxes>512)throw fail('EBML_ELEMENT_LIMIT');const e=element(bytes,p,b);visit(e);p=e.end;}};
    walk(0,bytes.length,e=>{if(e.id!==0xae)return;if(result.tracks.length>=32)throw fail('EBML_TRACK_LIMIT');
      const track={type:'other',codec:'unknown',width:null,height:null,displayWidth:null,displayHeight:null,sampleRate:null,channels:null,bitDepth:null,colorMetadataPresent:false,codecPrivatePresent:false,defaultDurationPresent:false};
      const seen=new Set();
      const scalar=(e,field,read=uint)=>{if(seen.has(field))throw fail('EBML_DUPLICATE_FIELD');seen.add(field);track[field]=read(bytes,e.start,e.end);};
      walk(e.start,e.end,x=>{
        if(x.id===0x83){if(seen.has('type'))throw fail('EBML_DUPLICATE_FIELD');seen.add('type');const n=uint(bytes,x.start,x.end);track.type=n===1?'video':n===2?'audio':n===17?'subtitle':'other';}
        else if(x.id===0x86){if(seen.has('codec'))throw fail('EBML_DUPLICATE_FIELD');seen.add('codec');if(x.end-x.start>64)throw fail('EBML_CODEC_SIZE_LIMIT');let text='';for(let i=x.start;i<x.end;i++){if(bytes[i]<32||bytes[i]>126)throw fail('EBML_MALFORMED');text+=String.fromCharCode(bytes[i]);}track.codec=codecs.get(text)??'unknown';}
        else if(x.id===0x63a2)track.codecPrivatePresent=true;
        else if(x.id===0x23e383)track.defaultDurationPresent=true;
        else if(x.id===0xe0)walk(x.start,x.end,v=>{if(v.id===0xb0)scalar(v,'width');else if(v.id===0xba)scalar(v,'height');else if(v.id===0x54b0)scalar(v,'displayWidth');else if(v.id===0x54ba)scalar(v,'displayHeight');else if(v.id===0x55b0)track.colorMetadataPresent=true;});
        else if(x.id===0xe1)walk(x.start,x.end,v=>{if(v.id===0xb5)scalar(v,'sampleRate',float);else if(v.id===0x9f)scalar(v,'channels');else if(v.id===0x6264)scalar(v,'bitDepth');});
      });
      if(!seen.has('type')||!seen.has('codec'))throw fail('EBML_TRACKS_INCOMPLETE');result.tracks.push(track);
    });
    if(!result.tracks.length)throw fail('EBML_TRACKS_INCOMPLETE');result.status='parsed';result.code='EBML_STRUCTURAL_METADATA';return result;
  }catch(e){result.tracks=[];result.code=/^EBML_[A-Z_]+$/.test(e?.code??'')?e.code:'EBML_MALFORMED';return result;}
}

async function readEbmlTracks({read,size,prefix,signal}){
  const result=safe();let headers=0,docType=null;
  const check=()=>{if(signal?.aborted)throw fail('EBML_ABORTED');};
  const bytes=async(a,b)=>{check();if(a<0||b<a||b>=size)throw fail('EBML_BOUNDS');if(b<prefix.length)return prefix.slice(a,b+1);
    if(a<prefix.length){const tail=await read({start:prefix.length,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(tail,prefix.length-a);check();return out;}const out=await read({start:a,end:b});check();return out;};
  const header=async(pos,end)=>{if(++headers>56)throw fail('EBML_HEADER_LIMIT');const data=await bytes(pos,Math.min(end-1,pos+11)),id=vint(data,0,true),n=vint(data,id.length,false),start=pos+id.length+n.length;
    if(n.value>BigInt(Number.MAX_SAFE_INTEGER)&&!n.unknown)throw fail('EBML_BOUNDS');const stop=n.unknown?end:start+Number(n.value);if(stop>end||stop<start)throw fail('EBML_BOUNDS');return {id:Number(id.value),start,end:stop,unknown:n.unknown};};
  try{
    const head=await header(0,size);if(head.id!==0x1a45dfa3||head.unknown||head.end-head.start>4096)throw fail('EBML_HEADER_INVALID');
    const hb=await bytes(head.start,head.end-1);let count=0;for(let p=0;p<hb.length;){if(++count>32)throw fail('EBML_HEADER_LIMIT');const e=element(hb,p,hb.length);if(e.id===0x4282){let text='';if(e.end-e.start>16)throw fail('EBML_HEADER_INVALID');for(let i=e.start;i<e.end;i++)text+=String.fromCharCode(hb[i]);if(docType!==null)throw fail('EBML_HEADER_INVALID');docType=text==='webm'?'webm':text==='matroska'?'matroska':'unknown';}p=e.end;}
    if(!['webm','matroska'].includes(docType))throw fail('EBML_DOCTYPE_UNSUPPORTED');
    let p=head.end,segment=null;while(p<size){const e=await header(p,size);if(e.id===0x18538067){segment=e;break;}if(e.unknown)throw fail('EBML_UNKNOWN_TOP_SIZE');p=e.end;}
    if(!segment)throw fail('EBML_SEGMENT_MISSING');
    p=segment.start;while(p<segment.end){const e=await header(p,segment.end);if(e.id===0x1654ae6b){if(e.unknown||e.end-e.start>262144)throw fail('EBML_TRACKS_SIZE_LIMIT');if(e.end===e.start)throw fail('EBML_TRACKS_INCOMPLETE');const payload=new Uint8Array(await bytes(e.start,e.end-1));const parsed=parseEbmlTracks(payload);payload.fill(0);return {...parsed,docType,headers};}
      if(e.unknown)throw fail('EBML_UNKNOWN_CHILD_SIZE');p=e.end;}
    throw fail('EBML_TRACKS_INCOMPLETE');
  }catch(e){return {...result,code:/^EBML_[A-Z_]+$/.test(e?.code??'')?e.code:'EBML_MALFORMED',docType:['webm','matroska'].includes(docType)?docType:null,headers};}
}

return {readEbmlTracks};})();
const comparison=(()=>{
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

return {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic};})();
const probe=(()=>{const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory,rootFence,stableItemRow}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic}=comparison;
const VERSION='1.22.0-rc.21';
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const CAPS=Object.freeze({isoFiles:5,webmFiles:1,unknownFiles:2,files:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
const fail=code=>Object.assign(new Error(code),{code});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fixed=e=>[...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT'].includes(e?.code)?e.code:'PROBE_FAILED';
const keys=['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
const same=(a,b)=>keys.every(k=>a[k]===b[k]);
const fieldNames='id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,parents,capabilities(canDownload)';
const imageMimes=new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp']);
const extension=x=>String(x.extension??'').toLowerCase().replace(/^\./,'');
const imageExts=new Set(['jpg','jpeg','png','gif','webp','bmp']);
const privateIdentity=(row,accountKey)=>normalizeProbeIdentity({accountKey,fileId:row.fileId,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});

// Pure plan. A metadata match cannot establish the old actual magic mapping.
function planTrackSamples(selection,context,prior=null){
  const m=selection?.privateManifest,r=selection?.report;
  if(m?.schema!=='drive-original.v2-07a-risk-selection-private/1'||!Array.isArray(m.selected)||m.selected.length<1||m.selected.length>38
    ||m.prioritySample?.fileId!==context.priorityFileId||m.prioritySample?.version!==context.priorityVersion
    ||r?.coverage?.uncoveredCategoryCount!==0||r.coverage.coveredCategoryCount!==r.coverage.requiredCategoryCount
    ||r.selection?.prioritySampleSelected!==true||r.selection.allRareMkvAviBmpSelected!==true||r.selection.allGe4GiBSelected!==true)throw fail('SELECTION_FAILED');
  const seen=new Set(),rows=m.selected.map(row=>{if(!validId(row.fileId)||seen.has(row.fileId)||!Array.isArray(row.visibleReferences)||!row.visibleReferences.length)throw fail('SELECTION_FAILED');seen.add(row.fileId);
    const refs=row.visibleReferences,resourceKeys=new Set();for(const ref of refs){if(!validId(ref.fileId)||(ref.resourceKey!==null&&!validId(ref.resourceKey)))throw fail('SELECTION_FAILED');if(ref.resourceKey)resourceKeys.add(ref.resourceKey);}if(resourceKeys.size>1)throw fail('SELECTION_FAILED');
    const expected=privateIdentity(row,context.authAccountKey);if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw fail('SELECTION_FAILED');return {row,expected,resourceKey:[...resourceKeys][0]??null};});
  const usablePrior=prior?.schema==='drive-original.corpus-tracks-private-continuity/1'&&prior.accountKey===context.authAccountKey&&prior.rootId===context.rootId&&Array.isArray(prior.rows);
  if(prior!==null&&(!usablePrior||prior.rows.length>38))throw fail('SELECTION_FAILED');
  const old=usablePrior?prior.rows:[];
  for(const p of old){if(!validId(p?.identity?.fileId)||!['iso-bmff','mpeg-ts','webm','matroska','ebml','unknown','jpeg','png','gif','webp','bmp'].includes(p.kind)||typeof p.tracksProven!=='boolean')throw fail('SELECTION_FAILED');privateIdentity({...p.identity,fileId:p.identity.fileId},context.authAccountKey);if(p.identity.accountKey!==context.authAccountKey)throw fail('SELECTION_FAILED');}
  const match=x=>old.find(p=>same(p.identity,x.expected));
  const candidates=rows.filter(x=>x.expected.fileId!==context.priorityFileId&&match(x)?.kind!=='mpeg-ts');
  const iso=candidates.filter(x=>match(x)?.kind==='iso-bmff'||(!match(x)&&['video/mp4','video/quicktime'].includes(x.expected.mimeType)&&!['mkv','avi'].includes(extension(x.row))));
  iso.sort((a,b)=>BigInt(a.expected.size)>BigInt(b.expected.size)?-1:BigInt(a.expected.size)<BigInt(b.expected.size)?1:a.expected.fileId.localeCompare(b.expected.fileId));
  const proven=iso.filter(x=>match(x)?.tracksProven===true),continuity=proven.length>0;
  const deferred=continuity?null:iso[0]??null; // Avoid presumed old largest-ISO replay when exact private version was released.
  const selectedIso=iso.filter(x=>!proven.includes(x)&&x!==deferred).slice(0,5);
  const selectedWebm=candidates.filter(x=>!selectedIso.includes(x)&&x!==deferred&&match(x)?.tracksProven!==true&&(match(x)?.kind==='webm'||(!match(x)&&x.expected.mimeType==='video/webm'&&extension(x.row)==='webm'))).sort((a,b)=>a.expected.fileId.localeCompare(b.expected.fileId)).slice(0,1);
  const selectedUnknown=candidates.filter(x=>!selectedIso.includes(x)&&!selectedWebm.includes(x)&&x!==deferred&&!proven.includes(x)&&(
    match(x)?.kind==='unknown'||(!match(x)&&(extension(x.row)==='bmp'||(imageExts.has(extension(x.row))&&!imageMimes.has(x.expected.mimeType))
      ||(x.expected.mimeType.startsWith('image/')&&!imageExts.has(extension(x.row))))))).sort((a,b)=>a.expected.fileId.localeCompare(b.expected.fileId)).slice(0,2);
  const plan=[...selectedIso.map(x=>({...x,group:'iso'})),...selectedWebm.map(x=>({...x,group:'webm'})),...selectedUnknown.map(x=>({...x,group:'unknown'}))];
  return {plan,summary:{representatives:m.selected.length,coverageComplete:true,priorPrivateMappingAvailable:usablePrior,continuity:continuity?'exact-version-proven-exclusion':'unknown',
    exactProvenIsoExcluded:proven.length,deferredLargestIsoIdentityUnproven:Boolean(deferred),isoPlanned:selectedIso.length,webmPlanned:selectedWebm.length,unknownPlanned:selectedUnknown.length,
    unknownSampleContinuity:usablePrior&&selectedUnknown.every(x=>match(x)?.kind==='unknown')?'exact-version-mapped':'unknown',all36PrefixesReplayed:false,knownTsContinuationReads:0}};
}

function safeIso(value){
  const n=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?x:null;
  const tags=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4v','mp4a','ac-3','ec-3','Opus','fLaC','lpcm','raw ','twos','sowt','unknown']);
  return {status:value?.status==='parsed'?'parsed':'incomplete',code:value?.status==='parsed'?'ISO_STRUCTURAL_METADATA':'ISO_PARSER_INCOMPLETE',
    fragmented:value?.fragmented===true,tracks:(value?.tracks??[]).slice(0,32).map(t=>({type:['vide','soun','subt','text'].includes(t.type)?t.type:'other',width:n(t.width),height:n(t.height),identityMatrix:t.identityMatrix===true,
      descriptions:(t.descriptions??[]).slice(0,16).map(d=>({codec:tags.has(d.codec)?d.codec:'unknown',width:n(d.width),height:n(d.height),channels:n(d.channels),sampleRate:n(d.sampleRate),sampleSize:n(d.sampleSize),encrypted:d.encrypted===true,
        avcProfile:n(d.config?.avcC?.profile),avcLevel:n(d.config?.avcC?.level),hevcProfile:n(d.config?.hvcC?.profileIdc),hevcLevel:n(d.config?.hvcC?.levelIdc),bitDepthLuma:n(d.config?.hvcC?.bitDepthLuma),bitDepthChroma:n(d.config?.hvcC?.bitDepthChroma),
        aacObjectType:n(d.config?.esds?.audioSpecificConfig?.objectType),aacFrequencyIndex:n(d.config?.esds?.audioSpecificConfig?.freqIndex),aacChannelConfig:n(d.config?.esds?.audioSpecificConfig?.channelConfig),
        colorMetadataPresent:d.config?.colr?.present===true,sampleAspectRatioPresent:d.config?.pasp?.present===true,configPresent:Boolean(d.config&&Object.keys(d.config).length)}))})),
    limitations:['structural-metadata-only','sample-tables-packets-unread','parameter-sets-color-hdr-vfr-subtitles-unqualified','edit-lists-data-references-unparsed','decoder-capability-unproven']};
}

function createCorpusTracksProbe(runtime,dependencies={}){
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory,select=dependencies.selector??selectRiskRepresentatives,compare=dependencies.compareInventory??summarizeRepeatedInventory;
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,prior=runtime?.priorEvidence??null,owner=null,promise=null,started=false,done=false,timer=null,activeFile=null;
  const metadataOnly=runtime?.mode==='metadata-only';runtime=null;
  const abort=new AbortController(),tasks=new Set();let cleanupFailure=null;
  const result={schema:'drive-original.rc16-corpus-tracks-summary/1',version:VERSION,scope:'canonical-risk-selected-bounded-structural-tracks',mode:metadataOnly?'metadata-only':'probe',complete:false,phase:'not-started',failure:null,
    inventoryRuns:0,catalogStable:false,catalogComparison:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,plan:null,files:[],decoded:0,playback:0,physicalDevice:0,writeRequests:0,genericUpstreamCleanup:'unknown',released:false};
  const safe=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!abort.signal.aborted)abort.abort(fail(code));};
  const onHide=()=>stop('CANCELLED');
  const onAccountAbort=()=>stop('OWNER_CHANGED');
  const inspect=()=>{const s=live?.readState?.(),sw=live?.getSWIdentity?.(),controller=live?.navigator?.serviceWorker?.controller;
    if(!s||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.top!==live.self||live.location?.origin!==ORIGIN||live.navigator?.onLine!==true
      ||live.document?.visibilityState!=='visible'||sw?.controller!==controller||sw?.version!==VERSION||controller?.state!=='activated'||new URL(controller.scriptURL).origin!==ORIGIN||new URL(controller.scriptURL).pathname!=='/sw.js'
      ||!validId(s.accountId)||!s.authAccountKey||s.authStatus!=='online'||s.demo!==false||s.accountIdentityPending||!live.hasUsableToken()||!s.token
      ||!s.accountStateAbortController?.signal||s.accountStateAbortController.signal.aborted||live.getQ1RetirementResult()?.settled!==true||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||s.selected!==null||s.mediaAttempt!=='idle'||s.mediaAbortController!==null||s.pendingOriginalBuffer!==null||s.pendingPlay!==false||s.mediaTransportStarted!==false
      ||['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(k=>!Number.isSafeInteger(s[k])||s[k]<0)||!Number.isSafeInteger(live.getMediaSourceGeneration())
      ||new URL(controller.scriptURL).search||new URL(controller.scriptURL).hash)throw fail('RUNTIME_REJECTED');
    return {state:s,controller,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration(),href:live.location.href};};
  function current(){if(abort.signal.aborted)throw abort.signal.reason;let now;try{now=inspect();}catch{throw fail('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.retirement!==owner.retirement||now.source!==owner.source||now.href!==owner.href
      ||Object.entries(owner.values).some(([k,v])=>now.state[k]!==v))throw fail('OWNER_CHANGED');return now.state;}
  const race=(value,signal)=>new Promise((resolve,reject)=>{let settled=false;const finish=(fn,v)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(v);},cancel=()=>finish(reject,signal.reason??fail('CANCELLED'));
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();Promise.resolve(value).then(v=>finish(resolve,v),e=>finish(reject,e));});
  async function drain(value){let t;try{await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{t=setTimeout(()=>reject(fail('CLEANUP_TIMEOUT')),2000);})]);}catch(e){cleanupFailure=e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailure);}finally{clearTimeout(t);}}
  function metadataFetch(urlValue,options={}){
    const task=metadata(urlValue,options);tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
  }
  async function metadata(urlValue,options={}){
    current();const url=new URL(urlValue),headers=new Headers(options.headers??{});
    if(url.origin!=='https://www.googleapis.com'||!/^\/drive\/v3\/(about|files(?:\/[A-Za-z0-9_-]+)?)$/.test(url.pathname)||url.searchParams.has('alt')||(options.method&&options.method!=='GET')||options.body!==undefined||[...headers.keys()].some(x=>x!=='x-goog-drive-resource-keys'))throw fail('METADATA_FAILED');
    if(result.metadataRequests>=CAPS.metadataRequests)throw fail('METADATA_LIMIT');result.metadataRequests++;headers.set('Authorization',`Bearer ${owner.values.token}`);
    const responseLimit=Math.min(CAPS.metadataResponseBytes,options.responseLimitBytes??CAPS.metadataResponseBytes),requestMs=Math.min(25000,options.requestMs??25000);
    if(!Number.isSafeInteger(responseLimit)||responseLimit<1||!Number.isSafeInteger(requestMs)||requestMs<1)throw fail('METADATA_LIMIT');
    const child=new AbortController(),links=[abort.signal,owner.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])].map(s=>{const f=()=>child.abort(s.reason);s.addEventListener('abort',f,{once:true});if(s.aborted)f();return [s,f];}),deadline=setTimeout(()=>child.abort(fail('METADATA_FAILED')),requestMs);
    let pending=null,response=null,reader=null,finished=false;const chunks=[];let bytes=0;
    try{
      pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,signal:child.signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}));response=await race(pending,child.signal);current();
      if(response?.status!==200||!response.body)throw fail('METADATA_FAILED');reader=response.body.getReader();
      while(true){const x=await race(reader.read(),child.signal);current();if(x.done){finished=true;break;}if(!(x.value instanceof Uint8Array))throw fail('METADATA_FAILED');bytes+=x.value.length;result.metadataBytes+=x.value.length;
        if(bytes>responseLimit||result.metadataBytes>CAPS.metadataBytes)throw fail('METADATA_LIMIT');chunks.push(x.value);}
      const body=new Uint8Array(bytes);let p=0;for(const x of chunks){body.set(x,p);p+=x.length;}const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));body.fill(0);current();return {ok:true,status:200,json:async()=>data};
    }finally{
      clearTimeout(deadline);for(const [s,f] of links)s.removeEventListener('abort',f);child.abort(fail('CANCELLED'));
      if(!finished)await drain(reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve());
      try{reader?.releaseLock();}catch{}chunks.length=0;
    }
  }
  async function readInventory(){current();const r=await inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey});current();
    if(r?.report?.completeness?.repeatedPrivateInventoryMatched!==true||r.report.completeness.shortcutClassificationComplete!==true||r.report.completeness.containmentComplete!==true||!r.privatePasses?.secondPass)throw fail('INVENTORY_FAILED');result.inventoryRuns++;return r;}
  async function probeFile(item,index){
    current();let resourceKey=item.resourceKey,observedKey,content=null;const budget=createBatchBudget(CAPS.mediaBytes);
    const identity=async({phase,signal})=>{current();const url=new URL(`https://www.googleapis.com/drive/v3/files/${item.expected.fileId}`);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
      const value=await(await metadataFetch(url.href,{signal,responseLimitBytes:32768,requestMs:10000,headers:resourceKey?{'X-Goog-Drive-Resource-Keys':`${item.expected.fileId}/${resourceKey}`}:{}})).json();current();
      const next=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
      const key=value.resourceKey??null,nextContent={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
      if(!same(next,item.expected)||value.trashed!==false||(key!==null&&!validId(key))||(resourceKey&&key!==resourceKey)||(phase==='postflight'&&key!==observedKey)
        ||(content&&Object.keys(content).some(k=>content[k]!==nextContent[k])))throw fail('IDENTITY_MISMATCH');
      if(phase==='preflight'){observedKey=key;resourceKey=key;content=nextContent;}return next;};
    const output={sample:`sample-${index+1}`,group:item.group,kind:'unknown',complete:false,failure:null,identityPreflight:false,identityPostflight:false,mediaRequests:0,mediaBytes:0,tracks:null};
    const job=runBoundedProbe({expectedIdentity:item.expected,generation:owner.values.driveSessionGeneration,signal:abort.signal,batchBudget:budget,
      isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:64,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},getIdentity:identity,
      readRange:({range,start,end,signal})=>{current();if(start===0&&end===Number(item.expected.size)-1)throw fail('INVALID_RANGE');const url=new URL(`/__drive_media/${item.expected.fileId}`,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',item.expected.size);if(resourceKey)url.searchParams.set('resourceKey',resourceKey);
        return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});},
      probe:async({read,sniffMagic,signal})=>{
        const size=Number(item.expected.size);if(size<=940)return {code:'SMALL_FILE_SKIPPED'};const prefix=await read({start:0,end:939});current();const kind=sniffMagic(prefix).kind;
        output.kind=['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','bmp','gif','webp','png','jpeg','unknown','error-payload'].includes(kind)?kind:'unknown';
        const part=async({start,end})=>{const a=Number(start),b=Number(end);if(b<940)return prefix.slice(a,b+1);if(a<940){const tail=await read({start:940,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(tail,940-a);return out;}return read({start:a,end:b});};
        if(kind==='iso-bmff'){
          const scan=await scanIsoBmffTopLevel({size:item.expected.size,signal,read:part,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();if(scan.status!=='complete'||scan.observations.moov.length!==1)return {code:'ISO_HEADER_INCOMPLETE'};
          const sparse=await readSparseMoov({box:scan.observations.moov[0],fileSize:item.expected.size,read:part,signal});current();if(sparse.status!=='complete')return {code:/^SPARSE_[A-Z_]+$/.test(sparse.code??'')?sparse.code:'ISO_SPARSE_INCOMPLETE'};
          try{output.tracks=safeIso(parseMoov(sparse.bytes));}finally{sparse.bytes.fill(0);}return {code:output.tracks.status==='parsed'?'STRUCTURAL_METADATA':'ISO_PARSER_INCOMPLETE'};
        }
        if(['webm','matroska','ebml'].includes(kind)){output.tracks=await readEbmlTracks({read:part,size,prefix,signal});current();return {code:output.tracks.status==='parsed'?'STRUCTURAL_METADATA':output.tracks.code};}
        // Metadata-directed unknowns get only one prefix; known TS is never parsed again.
        return {code:kind==='mpeg-ts'?'TS_DEFERRED_NO_CONTINUATION':kind==='unknown'?'UNKNOWN_SIGNATURE':'SIGNATURE_ONLY'};
      }});
    activeFile=job;const checked=await job;activeFile=null;output.identityPreflight=checked.identity.preflight;output.identityPostflight=checked.identity.postflight;output.mediaRequests=checked.metrics.requests;output.mediaBytes=budget.receivedBytes;result.mediaRequests+=output.mediaRequests;result.mediaBytes+=output.mediaBytes;
    output.failure=checked.ok?(checked.evidence.code==='STRUCTURAL_METADATA'||checked.evidence.code==='SIGNATURE_ONLY'?null:checked.evidence.code):checked.failure.code;output.complete=checked.ok&&output.failure===null;
    if(!checked.ok)throw Object.assign(fail(checked.failure.code),{safeFile:output});current();return output;
  }
  async function execute(){let first=null,last=null,plan=null;try{
    const before=inspect();owner={...before,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,before.state[k]]))};
    if(!context||!validId(context.rootId)||!validId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fail('RUNTIME_REJECTED');
    context.authAccountKey=owner.values.authAccountKey;current();timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
    result.phase='inventory-before';first=await readInventory();const priority=first.privatePasses.secondPass.items.find(x=>x.id===context.priorityFileId);if(!priority?.version)throw fail('SELECTION_FAILED');context.priorityVersion=String(priority.version);
    result.phase='selection';const selected=select({pass:first.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});plan=planTrackSamples(selected,context,prior);result.plan=plan.summary;current();
    result.phase='probe';if(!metadataOnly)for(let i=0;i<plan.plan.length;i++){try{result.files.push(await probeFile(plan.plan[i],i));}catch(e){if(e.safeFile)result.files.push(e.safeFile);throw e;}}
    result.phase='inventory-after';last=await readInventory();try{compare({firstPass:first.privatePasses.secondPass,secondPass:last.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}catch(cause){
      try{result.catalogComparison=sanitizeComparisonDiagnostic(diagnoseComparisonFailure(cause,first.privatePasses.secondPass,last.privatePasses.secondPass,dependencies.canonicalNormalizers),cause);}catch{result.catalogComparison=emptyComparisonDiagnostic(cause);}throw fail('CATALOG_DRIFT');}
    current();result.catalogStable=true;result.complete=metadataOnly||(result.files.length>0&&result.files.length===plan.plan.length&&result.files.every(f=>f.complete));result.phase='done';
  }catch(e){result.failure=fixed(abort.signal.aborted?abort.signal.reason:e);result.complete=false;result.phase='failed';}
  finally{
    stop(result.failure??'CANCELLED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
    owner?.values.accountStateAbortController.signal.removeEventListener('abort',onAccountAbort);
    if(tasks.size)try{await drain(Promise.allSettled([...tasks]));}catch{}if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;result.phase='failed';}
    first=null;last=null;plan=null;context=null;prior=null;owner=null;live=null;activeFile=null;result.released=true;done=true;
  }return safe();}
  return Object.freeze({run(){if(!started){started=true;promise=execute();}return promise;},cancel(){stop('CANCELLED');return {cancelled:true};},poll(){return {started,done,phase:result.phase,metadataRequests:result.metadataRequests,metadataBytes:result.metadataBytes,mediaRequests:result.mediaRequests,mediaBytes:result.mediaBytes,processed:result.files.length,summary:done?safe():null};}});
}

return {createCorpusTracksProbe};})();
return runtime=>probe.createCorpusTracksProbe(runtime,{canonicalNormalizers:{rootFence:root.rootFence,stableItemRow:root.stableItemRow}});
})();const facade=(function (privateContextText,swProof,privatePriorText,mode) {
  'use strict';
  if(privatePriorText===undefined)privatePriorText=null;
  if(mode===undefined)mode='probe';
  const rejected=()=>Object.freeze({poll:()=>({started:false,done:true,phase:'rejected',summary:{schema:'drive-original.rc16-corpus-tracks-summary/1',complete:false,failure:'FACADE_PREFLIGHT_REJECTED',mediaRequests:0,writeRequests:0}}),cancel:()=>({cancelled:true})});
  let context,prior,projection,owner,job,settled=false;
  try {
    if(!['probe','metadata-only'].includes(mode)||typeof privateContextText!=='string'||privateContextText.length>4096)return rejected();
    context=JSON.parse(privateContextText);
    if(!context||Array.isArray(context)||Object.keys(context).sort().join(',')!=='accountKey,generation,priorityFileId,rootId'
      ||!['accountKey','priorityFileId','rootId'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(context[k]))||!Number.isSafeInteger(context.generation)||context.generation<0)return rejected();
    if(privatePriorText!==null){if(typeof privatePriorText!=='string'||privatePriorText.length>65536)return rejected();prior=JSON.parse(privatePriorText);}
    privateContextText=null;privatePriorText=null;
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,
      abort:state.accountStateAbortController,controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      media:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.21'&&DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true
    &&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive
    &&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.expiresAt===owner.expiry&&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'&&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version==='1.22.0-rc.21'
    &&state.accountStateLoaded===true&&state.accountStateWriterId===owner.writer&&typeof owner.writer==='string'&&owner.writer.length>0
    &&Number.isSafeInteger(owner.revision)&&owner.revision>=0&&state.accountStateRevision===owner.revision
    &&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null
    &&accountMediaStatesEqual(state.accountMediaState,projection)
    &&state.mediaSession===owner.media&&state.playbackSession===owner.playback&&mediaSourceGeneration===owner.source&&q1RetirementResult===owner.retirement&&owner.retirement?.settled===true
    &&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null&&state.pendingPlay===false&&state.mediaTransportStarted===false
    &&q1Playback===null&&!playerMediaPriorityActive;
  try {
    if(!current()||context.accountKey!==owner.account||context.generation!==owner.drive)return rejected();
    const read=()=>{if(!current())throw Object.assign(new Error('OWNER_CHANGED'),{code:'OWNER_CHANGED'});return state;};
    job=this({appVersion:APP_VERSION,readState:read,getSWIdentity:()=>swProof?.get?.(),getMutationsEnabled:()=>DRIVE_MUTATIONS_ENABLED,
      hasUsableToken,getQ1Playback:()=>q1Playback,getQ1RetirementResult:()=>q1RetirementResult,getMediaSourceGeneration:()=>mediaSourceGeneration,
      getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,navigator,location,document,top,self,privateContext:context,priorEvidence:prior,mode,
      nativeFetch:(...args)=>{read();return fetch(...args);},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)});
    job.run().then(()=>{settled=true;context=null;prior=null;projection=null;owner=null;swProof=null;},()=>{settled=true;context=null;prior=null;projection=null;owner=null;swProof=null;});
  }catch{return rejected();}
  return Object.freeze({poll:()=>({...job.poll(),done:settled&&job.poll().done}),cancel:()=>job.cancel()});
});return (privateContextText,swProof,privatePriorText=null,mode='probe')=>facade.call(create,privateContextText,swProof,privatePriorText,mode);})()
