(()=>{
'use strict';
const rootCore=(()=>{

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

return Object.freeze({collectInventoryPassWithRestart, summarizeRepeatedInventory});
})();
const rootAdapter=(()=>{
const {collectInventoryPassWithRestart,summarizeRepeatedInventory}=rootCore;
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

return Object.freeze({runAuthenticatedRootInventory});
})();
const selection=(()=>{

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

return Object.freeze({selectRiskRepresentatives});
})();
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

return Object.freeze({runBoundedProbe, createBatchBudget, normalizeProbeIdentity, FAILURE_CODES});
})();
const tsParser=(()=>{

const TS_PACKET_BYTES = 188;
const ABSOLUTE_LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxPackets: 65_536,
  maxResyncBytes: TS_PACKET_BYTES * 128,
  maxSectionBytes: 1_024,
  maxSections: 1_024,
  maxPrograms: 256,
  maxStreamsPerProgram: 256,
  maxTotalStreams: 1_024,
  maxElementaryBytesPerStream: 256 * 1024,
  maxIssues: 512,
});

const DEFAULT_MPEG_TS_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxPackets: 16_384,
  maxResyncBytes: TS_PACKET_BYTES * 32,
  maxSectionBytes: 1_024,
  maxSections: 256,
  maxPrograms: 64,
  maxStreamsPerProgram: 64,
  maxTotalStreams: 256,
  maxElementaryBytesPerStream: 64 * 1024,
  maxIssues: 128,
});

const STREAM_TYPES = Object.freeze({
  0x01: ['video', 'mpeg-1-video'],
  0x02: ['video', 'mpeg-2-video'],
  0x03: ['audio', 'mpeg-1-audio'],
  0x04: ['audio', 'mpeg-2-audio'],
  0x0f: ['audio', 'aac'],
  0x10: ['video', 'mpeg-4-part-2'],
  0x11: ['audio', 'aac-latm'],
  0x1b: ['video', 'h264'],
  0x24: ['video', 'hevc'],
  0x2d: ['video', 'mpeg-h-part-2'],
});

const H264_PROFILES = Object.freeze({
  44: 'CAVLC 4:4:4 Intra',
  66: 'Baseline',
  77: 'Main',
  83: 'Scalable Baseline',
  86: 'Scalable High',
  88: 'Extended',
  100: 'High',
  110: 'High 10',
  118: 'Multiview High',
  122: 'High 4:2:2',
  128: 'Stereo High',
  134: 'MFC High',
  135: 'MFC Depth High',
  138: 'Multiview Depth High',
  139: 'Enhanced Multiview Depth High',
  244: 'High 4:4:4 Predictive',
});

const H264_HIGH_PROFILE_IDS = new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]);
const SAMPLE_RATES = Object.freeze([96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350]);
const AAC_OBJECT_TYPES = Object.freeze({ 1: 'AAC Main', 2: 'AAC LC', 3: 'AAC SSR', 4: 'AAC LTP' });
const CHANNEL_CONFIGS = Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 8 });

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

function resolveLimits(options) {
  const requested = options?.limits ?? {};
  const limits = {};
  for (const [name, fallback] of Object.entries(DEFAULT_MPEG_TS_LIMITS)) {
    const value = requested[name] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > ABSOLUTE_LIMITS[name]) {
      throw new RangeError(`${name} must be a positive safe integer no greater than ${ABSOLUTE_LIMITS[name]}`);
    }
    limits[name] = value;
  }
  return Object.freeze(limits);
}

function baseResult(bytes, limits) {
  return {
    schemaVersion: 1,
    probe: 'bounded-mpeg-ts-container',
    container: 'mpeg-ts',
    status: 'incomplete',
    outcome: { code: 'UNCLASSIFIED', message: 'No outcome was assigned.' },
    limits: { ...limits },
    bytes: {
      supplied: bytes?.byteLength ?? 0,
      inspected: 0,
      packetSize: TS_PACKET_BYTES,
      syncOffset: null,
      packetsParsed: 0,
      resyncBytes: 0,
      trailingBytes: 0,
    },
    psi: { sectionsExamined: 0, sectionsValid: 0, patSections: 0, pmtSections: 0, patVersion: null, patComplete: false, crcChecked: true },
    transportStreamIds: [],
    networkPids: [],
    programs: [],
    trackSummary: { total: 0, video: 0, audio: 0, other: 0, elementaryHeadersParsed: 0 },
    issues: [],
  };
}

function issueSink(result, limits) {
  let omitted = 0;
  const add = (severity, code, message, context = {}) => {
    if (result.issues.length < limits.maxIssues) result.issues.push({ severity, code, message, ...context });
    else omitted += 1;
  };
  add.finish = () => {
    if (omitted > 0) {
      const summary = { severity: 'limit', code: 'ISSUE_LIMIT_REACHED', message: 'Additional issues were omitted.', omitted };
      if (result.issues.length >= limits.maxIssues) result.issues[result.issues.length - 1] = summary;
      else result.issues.push(summary);
    }
  };
  return add;
}

function findSync(bytes, start, maxDistance) {
  const finalCandidate = Math.min(bytes.length - TS_PACKET_BYTES * 3, start + maxDistance);
  for (let offset = start; offset <= finalCandidate; offset += 1) {
    if (bytes[offset] !== 0x47) continue;
    const packetsAvailable = Math.floor((bytes.length - offset) / TS_PACKET_BYTES);
    const checks = Math.min(4, packetsAvailable);
    if (checks < 3) continue;
    let valid = true;
    for (let index = 1; index < checks; index += 1) {
      if (bytes[offset + index * TS_PACKET_BYTES] !== 0x47) {
        valid = false;
        break;
      }
    }
    if (valid) return offset;
  }
  return -1;
}

function crc32Mpeg2(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000_0000) !== 0 ? ((crc << 1) ^ 0x04c1_1db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function codecMapping(streamType) {
  const mapping = STREAM_TYPES[streamType];
  return mapping
    ? { kind: mapping[0], codec: mapping[1], codecFamily: mapping[1], mappingConfidence: 'stream-type-family' }
    : { kind: 'other', codec: null, codecFamily: null, mappingConfidence: 'unknown' };
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
  const desired = new Map();
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
      limitHit: false,
    });
  }
}

function parsePat(section, state, add, packetIndex) {
  if (section.length < 12 || (section[1] & 0x80) === 0) {
    add('malformed', 'PAT_STRUCTURE_INVALID', 'PAT section is shorter than its mandatory syntax.', { packetIndex, pid: 0 });
    return;
  }
  const entriesEnd = section.length - 4;
  if ((entriesEnd - 8) % 4 !== 0) {
    add('malformed', 'PAT_PROGRAM_LOOP_INVALID', 'PAT program loop is not a whole number of entries.', { packetIndex, pid: 0 });
    return;
  }
  const transportStreamId = (section[3] << 8) | section[4];
  const version = (section[5] >> 1) & 0x1f;
  const sectionNumber = section[6];
  const lastSectionNumber = section[7];
  if (sectionNumber > lastSectionNumber) {
    add('malformed', 'PAT_SECTION_NUMBER_INVALID', 'PAT section_number exceeds last_section_number.', { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
    return;
  }
  const identityChanged = state.patSet && (state.patSet.transportStreamId !== transportStreamId || state.patSet.version !== version);
  if (identityChanged) {
    add('warning', state.patSet.transportStreamId === transportStreamId ? 'PAT_VERSION_REPLACED' : 'PAT_IDENTITY_REPLACED', 'A distinct current PAT identity replaced the previously observed topology.', {
      packetIndex, pid: 0, previousTransportStreamId: state.patSet.transportStreamId, transportStreamId,
      previousVersion: state.patSet.version, version,
    });
    resetPatTopology(state);
    state.patSet = null;
  }
  if (!state.patSet) {
    state.patSet = { transportStreamId, version, lastSectionNumber, sections: new Map() };
    state.transportStreamIds.clear();
    state.transportStreamIds.add(transportStreamId);
  } else if (state.patSet.lastSectionNumber !== lastSectionNumber) {
    add('malformed', 'PAT_LAST_SECTION_CHANGED', 'PAT sections with one identity disagree on last_section_number.', { packetIndex, pid: 0, sectionNumber, lastSectionNumber });
    return;
  }
  const priorSection = state.patSet.sections.get(sectionNumber);
  if (priorSection) {
    if (equalBytes(priorSection, section)) add('warning', 'PAT_SECTION_DUPLICATE', 'Byte-identical PAT section was ignored.', { packetIndex, pid: 0, sectionNumber });
    else add('malformed', 'PAT_SECTION_CONFLICT', 'PAT section number repeated with different bytes.', { packetIndex, pid: 0, sectionNumber });
    return;
  }
  state.patSet.sections.set(sectionNumber, Uint8Array.from(section));
  state.patVersion = version;
  for (let offset = 8; offset < entriesEnd; offset += 4) {
    const programNumber = (section[offset] << 8) | section[offset + 1];
    const pid = ((section[offset + 2] & 0x1f) << 8) | section[offset + 3];
    if (programNumber === 0) {
      state.networkPids.add(pid);
      continue;
    }
    if (!state.programs.has(programNumber) && state.programs.size >= state.limits.maxPrograms) {
      state.limitHit = true;
      add('limit', 'PROGRAM_LIMIT_REACHED', 'PAT declared more programs than the configured limit.', { packetIndex, pid: 0 });
      continue;
    }
    const prior = state.programs.get(programNumber);
    if (prior && prior.pmtPid !== pid) {
      add('malformed', 'PAT_PROGRAM_PID_CHANGED', 'A program maps to conflicting PMT PIDs in one PAT identity.', { packetIndex, pid: 0, programNumber });
      continue;
    }
    if (!prior) state.programs.set(programNumber, { programNumber, pmtPid: pid, pmt: null, pmtSet: null });
    state.pmtPids.add(pid);
  }
}

function parsePmt(section, state, add, packetIndex, packetPid) {
  if (section.length < 16 || (section[1] & 0x80) === 0) {
    add('malformed', 'PMT_STRUCTURE_INVALID', 'PMT section is shorter than its mandatory syntax.', { packetIndex, pid: packetPid });
    return;
  }
  const programNumber = (section[3] << 8) | section[4];
  const version = (section[5] >> 1) & 0x1f;
  const sectionNumber = section[6];
  const lastSectionNumber = section[7];
  const program = state.programs.get(programNumber);
  if (!program || program.pmtPid !== packetPid) {
    add('malformed', 'PMT_PROGRAM_MISMATCH', 'PMT table-id-extension does not match the current PAT mapping.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  if (sectionNumber > lastSectionNumber) {
    add('malformed', 'PMT_SECTION_NUMBER_INVALID', 'PMT section_number exceeds last_section_number.', { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
    return;
  }
  if (program.pmtSet && program.pmtSet.version !== version) {
    add('warning', 'PMT_VERSION_REPLACED', 'A distinct current PMT version replaced the previous stream topology.', { packetIndex, pid: packetPid, programNumber, previousVersion: program.pmtSet.version, version });
    program.pmtSet = null;
    program.pmt = null;
    state.totalStreams = [...state.programs.values()].reduce((sum, entry) => sum + (entry.pmt?.streams.length ?? 0), 0);
    syncElementaryStates(state);
  }
  if (!program.pmtSet) program.pmtSet = { version, lastSectionNumber, sections: new Map(), parts: new Map() };
  else if (program.pmtSet.lastSectionNumber !== lastSectionNumber) {
    add('malformed', 'PMT_LAST_SECTION_CHANGED', 'PMT sections with one identity disagree on last_section_number.', { packetIndex, pid: packetPid, programNumber, sectionNumber, lastSectionNumber });
    return;
  }
  const priorSection = program.pmtSet.sections.get(sectionNumber);
  if (priorSection) {
    if (equalBytes(priorSection, section)) add('warning', 'PMT_SECTION_DUPLICATE', 'Byte-identical PMT section was ignored.', { packetIndex, pid: packetPid, programNumber, sectionNumber });
    else add('malformed', 'PMT_SECTION_CONFLICT', 'PMT section number repeated with different bytes.', { packetIndex, pid: packetPid, programNumber, sectionNumber });
    return;
  }
  const pcrPid = ((section[8] & 0x1f) << 8) | section[9];
  const programInfoLength = ((section[10] & 0x0f) << 8) | section[11];
  const crcStart = section.length - 4;
  let offset = 12;
  if (offset + programInfoLength > crcStart) {
    add('malformed', 'PMT_PROGRAM_INFO_TRUNCATED', 'PMT program descriptor loop exceeds the section.', { packetIndex, pid: packetPid });
    return;
  }
  const programDescriptors = parseDescriptorLoop(section, offset, programInfoLength);
  if (!programDescriptors.ok) {
    add('malformed', 'PMT_PROGRAM_DESCRIPTOR_INVALID', 'PMT program descriptor loop is malformed.', { packetIndex, pid: packetPid });
    return;
  }
  offset += programInfoLength;
  const streams = [];
  while (offset < crcStart) {
    if (offset + 5 > crcStart) {
      add('malformed', 'PMT_STREAM_ENTRY_TRUNCATED', 'PMT stream entry is truncated.', { packetIndex, pid: packetPid });
      return;
    }
    const streamType = section[offset];
    const elementaryPid = ((section[offset + 1] & 0x1f) << 8) | section[offset + 2];
    const esInfoLength = ((section[offset + 3] & 0x0f) << 8) | section[offset + 4];
    if (offset + 5 + esInfoLength > crcStart) {
      add('malformed', 'PMT_ES_INFO_TRUNCATED', 'PMT elementary descriptor loop exceeds the section.', { packetIndex, pid: packetPid, programNumber });
      return;
    }
    const descriptors = parseDescriptorLoop(section, offset + 5, esInfoLength);
    if (!descriptors.ok) {
      add('malformed', 'PMT_ES_DESCRIPTOR_INVALID', 'PMT elementary descriptor loop is malformed.', { packetIndex, pid: packetPid, programNumber, elementaryPid });
      return;
    }
    streams.push({ streamType, streamTypeHex: `0x${streamType.toString(16).padStart(2, '0')}`, elementaryPid, descriptorTags: descriptors.tags, ...codecMapping(streamType) });
    offset += 5 + esInfoLength;
  }
  program.pmtSet.sections.set(sectionNumber, Uint8Array.from(section));
  program.pmtSet.parts.set(sectionNumber, { pcrPid, programDescriptorTags: programDescriptors.tags, streams });
  if (!psiSetComplete(program.pmtSet)) return;
  const orderedParts = [...program.pmtSet.parts.entries()].sort(([left], [right]) => left - right).map(([, part]) => part);
  if (orderedParts.some((part) => part.pcrPid !== orderedParts[0].pcrPid)) {
    add('malformed', 'PMT_PCR_PID_CONFLICT', 'PMT sections with one identity disagree on PCR PID.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  const aggregateStreams = orderedParts.flatMap((part) => part.streams);
  const uniquePids = new Set();
  for (const stream of aggregateStreams) {
    if (uniquePids.has(stream.elementaryPid)) {
      add('malformed', 'PMT_ELEMENTARY_PID_DUPLICATE', 'PMT repeats an elementary PID across its current section set.', { packetIndex, pid: packetPid, programNumber, elementaryPid: stream.elementaryPid });
      return;
    }
    uniquePids.add(stream.elementaryPid);
  }
  const otherStreamCount = [...state.programs.values()].reduce((sum, entry) => sum + (entry === program ? 0 : (entry.pmt?.streams.length ?? 0)), 0);
  if (aggregateStreams.length > state.limits.maxStreamsPerProgram || otherStreamCount + aggregateStreams.length > state.limits.maxTotalStreams) {
    state.limitHit = true;
    add('limit', 'STREAM_LIMIT_REACHED', 'Complete PMT section set declared more streams than the configured limit.', { packetIndex, pid: packetPid, programNumber });
    return;
  }
  program.pmt = { version, pcrPid: orderedParts[0].pcrPid, programDescriptorTags: orderedParts[0].programDescriptorTags, streams: aggregateStreams };
  state.totalStreams = otherStreamCount + aggregateStreams.length;
  syncElementaryStates(state);
}

function acceptSection(section, state, add, packetIndex, pid) {
  if (state.sectionsExamined >= state.limits.maxSections) {
    state.limitHit = true;
    add('limit', 'SECTION_LIMIT_REACHED', 'PSI section count exceeded the configured limit.', { packetIndex, pid });
    return;
  }
  state.sectionsExamined += 1;
  if (crc32Mpeg2(section) !== 0) {
    add('malformed', 'PSI_CRC_MISMATCH', 'PSI section failed the MPEG-2 CRC check.', { packetIndex, pid, tableId: section[0] });
    return;
  }
  if ((section[5] & 0x01) === 0) {
    add('warning', 'PSI_NOT_CURRENT', 'A complete PSI section is marked not-current and was ignored.', { packetIndex, pid, tableId: section[0] });
    return;
  }
  state.sectionsValid += 1;
  if (pid === 0 && section[0] === 0x00) parsePat(section, state, add, packetIndex);
  else if (state.pmtPids.has(pid) && section[0] === 0x02) parsePmt(section, state, add, packetIndex, pid);
  else add('warning', 'PSI_TABLE_UNEXPECTED', 'A complete PSI section has an unexpected table id for its PID.', { packetIndex, pid, tableId: section[0] });
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
    if (assembler.pending.length === 0 && chunk[offset] === 0xff) return;
    if (assembler.expectedLength === null) {
      const needed = 3 - assembler.pending.length;
      const take = Math.min(needed, chunk.length - offset);
      for (let index = 0; index < take; index += 1) assembler.pending.push(chunk[offset + index]);
      offset += take;
      if (assembler.pending.length < 3) return;
      const sectionLength = ((assembler.pending[1] & 0x0f) << 8) | assembler.pending[2];
      assembler.expectedLength = 3 + sectionLength;
      if (sectionLength < 4 || assembler.expectedLength > state.limits.maxSectionBytes) {
        add('malformed', 'PSI_SECTION_LENGTH_INVALID', 'PSI section length is outside the configured or structural bounds.', { packetIndex, pid, sectionLength });
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
    if (assembler.pending.length > 0) add('warning', 'PSI_DISCONTINUITY_RESET', 'An adaptation-field discontinuity discarded an incomplete PSI section.', { packetIndex, pid });
    assembler.pending = [];
    assembler.expectedLength = null;
    assembler.incomplete = false;
    assembler.lastPayloadCc = null;
    assembler.lastPayload = null;
  }
  if (assembler.lastPayloadCc !== null) {
    const expected = (assembler.lastPayloadCc + 1) & 0x0f;
    if (continuityCounter === assembler.lastPayloadCc) {
      if (equalBytes(assembler.lastPayload, payload)) {
        add('warning', 'PSI_DUPLICATE_PAYLOAD', 'Byte-identical duplicate PSI payload was ignored conservatively.', { packetIndex, pid, continuityCounter });
      } else {
        add('malformed', 'PSI_CONFLICTING_DUPLICATE', 'A repeated PSI continuity counter carried different payload bytes; partial state was discarded.', { packetIndex, pid, continuityCounter });
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.incomplete = false;
        assembler.lastPayload = Uint8Array.from(payload);
      }
      return;
    }
    if (continuityCounter !== expected) {
      add('malformed', 'PSI_CONTINUITY_GAP', 'PSI payload continuity counter skipped without a discontinuity indicator.', { packetIndex, pid, expected, actual: continuityCounter });
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
    add('malformed', 'PSI_POINTER_MISSING', 'Payload-unit-start packet has no pointer field.', { packetIndex, pid });
    return;
  }
  const pointer = payload[0];
  if (1 + pointer > payload.length) {
    add('malformed', 'PSI_POINTER_OUT_OF_RANGE', 'PSI pointer field exceeds the packet payload.', { packetIndex, pid, pointer });
    assembler.pending = [];
    assembler.expectedLength = null;
    return;
  }
  if (assembler.pending.length > 0) {
    appendPsiBytes(assembler, payload.subarray(1, 1 + pointer), state, add, packetIndex, pid);
    if (assembler.pending.length > 0) {
      add('malformed', 'PSI_POINTER_LEFT_SECTION_INCOMPLETE', 'Pointer field starts a new section before the previous section completed.', { packetIndex, pid, pointer });
      assembler.pending = [];
      assembler.expectedLength = null;
    }
  }
  appendPsiBytes(assembler, payload.subarray(1 + pointer), state, add, packetIndex, pid);
}

// Shared PSI state/assembly primitives; the bounded file probe and stricter
// streaming QA owner apply their own lifecycle and acceptance policies.
const feedPsi = feedMpegTsPsi;
const isMpegTsPsiSetComplete = psiSetComplete;
function createMpegTsPsiState(limits) {
  return {
    limits, assemblers: new Map(), pmtPids: new Set(), programs: new Map(), esStates: new Map(),
    transportStreamIds: new Set(), networkPids: new Set(), sectionsExamined: 0, sectionsValid: 0,
    patSet: null, patVersion: null, totalStreams: 0, limitHit: false, unsupported: false,
  };
}

function appendElementary(state, bytes, limits) {
  const room = limits.maxElementaryBytesPerStream - state.bytes.length;
  if (room <= 0) {
    state.limitHit = true;
    return;
  }
  const take = Math.min(room, bytes.length);
  for (let index = 0; index < take; index += 1) state.bytes.push(bytes[index]);
  if (take < bytes.length) state.limitHit = true;
}

function resetElementarySegment(esState) {
  esState.currentPes = null;
  esState.lastPayloadCc = null;
  esState.lastPayload = null;
  // A signalled discontinuity permits a new segment, never stitching across it.
  // Unexpected loss remains sticky for this bounded probe.
  esState.bytes = [];
  esState.truncated = false;
}

function appendPesPayload(esState, payload, limits) {
  const pes = esState.currentPes;
  const take = pes.remaining === null ? payload.length : Math.min(pes.remaining, payload.length);
  appendElementary(esState, payload.slice(0, take), limits);
  if (pes.remaining !== null) pes.remaining -= take;
}

function feedElementary(esState, payload, payloadUnitStart, continuityCounter, discontinuity, limits, add, packetIndex, pid) {
  if (discontinuity) resetElementarySegment(esState);
  if (esState.lastPayloadCc !== null) {
    const expected = (esState.lastPayloadCc + 1) & 0x0f;
    if (continuityCounter === esState.lastPayloadCc) {
      if (!equalBytes(esState.lastPayload, payload)) {
        esState.currentPes = null;
        esState.truncated = true;
        esState.continuityLost = true;
        esState.lastPayload = Uint8Array.from(payload);
        add('malformed', 'ELEMENTARY_CONFLICTING_DUPLICATE', 'A repeated elementary continuity counter carried different payload bytes; PES state was discarded.', { packetIndex, pid, continuityCounter });
      }
      return;
    }
    if (continuityCounter !== expected) {
      esState.currentPes = null;
      esState.truncated = true;
      esState.continuityLost = true;
      add('warning', 'ELEMENTARY_CONTINUITY_GAP', 'Elementary payload continuity was lost; later headers in this probe remain inconclusive.', { packetIndex, pid, expected, actual: continuityCounter });
      if (!payloadUnitStart) {
        esState.lastPayloadCc = continuityCounter;
        esState.lastPayload = Uint8Array.from(payload);
        return;
      }
    }
  }
  esState.lastPayloadCc = continuityCounter;
  esState.lastPayload = Uint8Array.from(payload);
  if (payloadUnitStart) {
    if (esState.currentPes?.remaining > 0) {
      esState.continuityLost = true;
      add('warning', 'PES_PREMATURE_RESTART', 'A new PES began before the declared previous payload completed.', { packetIndex, pid });
    }
    esState.currentPes = { header: [], payloadOffset: null, remaining: null, invalid: false };
  }
  const pes = esState.currentPes;
  if (!pes || pes.invalid) return;
  if (pes.payloadOffset !== null) {
    appendPesPayload(esState, payload, limits);
    return;
  }
  for (const byte of payload) pes.header.push(byte);
  if (pes.header.length < 9) {
    esState.truncated = true;
    return;
  }
  if (pes.header[0] !== 0 || pes.header[1] !== 0 || pes.header[2] !== 1) {
    pes.invalid = true;
    add('malformed', 'PES_START_CODE_INVALID', 'Elementary PID payload-unit-start lacks a PES start code.', { packetIndex, pid });
    return;
  }
  const payloadOffset = 9 + pes.header[8];
  const packetLength = (pes.header[4] << 8) | pes.header[5];
  if (packetLength !== 0 && packetLength < payloadOffset - 6) {
    pes.invalid = true;
    esState.continuityLost = true;
    add('malformed', 'PES_PACKET_LENGTH_INVALID', 'Declared PES length ends inside its optional header.', { packetIndex, pid });
    return;
  }
  if (payloadOffset > 264) {
    pes.invalid = true;
    add('malformed', 'PES_HEADER_LENGTH_INVALID', 'PES optional header exceeds its structural maximum.', { packetIndex, pid });
    return;
  }
  if (pes.header.length < payloadOffset) {
    esState.truncated = true;
    return;
  }
  pes.remaining = packetLength === 0 ? null : packetLength - (payloadOffset - 6);
  appendPesPayload(esState, pes.header.slice(payloadOffset), limits);
  pes.header = [];
  pes.payloadOffset = payloadOffset;
  esState.truncated = false;
}

class BitReader {
  constructor(bytes) { this.bytes = bytes; this.bit = 0; }
  readBit() {
    if (this.bit >= this.bytes.length * 8) throw new RangeError('bitstream truncated');
    const value = (this.bytes[this.bit >> 3] >> (7 - (this.bit & 7))) & 1;
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
      if (zeros > 31) throw new RangeError('exp-golomb value exceeds bounded integer range');
    }
    return (2 ** zeros - 1) + (zeros === 0 ? 0 : this.readBits(zeros));
  }
  readSE() {
    const codeNum = this.readUE();
    return (codeNum & 1) === 1 ? (codeNum + 1) / 2 : -(codeNum / 2);
  }
}

function removeEmulationPrevention(bytes) {
  const output = [];
  let zeros = 0;
  for (const byte of bytes) {
    if (zeros >= 2 && byte === 0x03) {
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
  let aspectRatio = { status: 'unspecified', present: false, idc: null, width: null, height: null };
  if (reader.readBit()) {
    const aspectRatioIdc = reader.readBits(8);
    // H.264 VUI Table E-1. Zero dimensions/IDC0 mean unspecified, not square.
    const table = [null,[1,1],[12,11],[10,11],[16,11],[40,33],[24,11],[20,11],
      [32,11],[80,33],[18,11],[15,11],[64,33],[160,99],[4,3],[3,2],[2,1]];
    const ratio = aspectRatioIdc === 255 ? [reader.readBits(16),reader.readBits(16)] : table[aspectRatioIdc];
    aspectRatio = { status: aspectRatioIdc === 0 || (ratio && (!ratio[0] || !ratio[1])) ? 'unspecified'
      : ratio ? 'explicit' : 'reserved', present: true, idc: aspectRatioIdc,
      width: ratio?.[0] ?? null, height: ratio?.[1] ?? null };
  }
  if (reader.readBit()) reader.readBit();
  if (reader.readBit()) {
    reader.readBits(3);
    color.fullRange = reader.readBit() === 1;
    if (reader.readBit()) {
      color.primariesCode = reader.readBits(8);
      color.transferCode = reader.readBits(8);
      color.matrixCode = reader.readBits(8);
      color.primaries = color.primariesCode === 1 ? 'BT.709' : null;
      color.transfer = color.transferCode === 1 ? 'BT.709' : null;
      color.matrix = color.matrixCode === 1 ? 'BT.709' : null;
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
  if (cpbCount > 32) throw new RangeError('HRD CPB count exceeds the bounded syntax limit');
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
  if (!(nal instanceof Uint8Array)) return { status: 'malformed', code: 'H264_SPS_INPUT_INVALID' };
  if (nal.length > 64 * 1024) return { status: 'incomplete', code: 'H264_SPS_BYTE_LIMIT' };
  try {
    if (nal.length < 5) return { status: 'incomplete', code: 'H264_SPS_TRUNCATED' };
    if ((nal[0] & 0x1f) !== 7) return { status: 'malformed', code: 'H264_SPS_INVALID' };
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
      if (chromaFormatIdc > 3) return { status: 'malformed', code: 'H264_CHROMA_FORMAT_INVALID' };
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
      if (cycle > 256) return { status: 'malformed', code: 'H264_POC_CYCLE_LIMIT' };
      for (let index = 0; index < cycle; index += 1) reader.readSE();
    } else if (picOrderCntType !== 2) return { status: 'malformed', code: 'H264_POC_TYPE_INVALID' };
    reader.readUE();
    reader.readBit();
    const picWidthInMbsMinus1 = reader.readUE();
    const picHeightInMapUnitsMinus1 = reader.readUE();
    const frameMbsOnlyFlag = reader.readBit();
    if (!frameMbsOnlyFlag) reader.readBit();
    reader.readBit();
    let cropLeft = 0; let cropRight = 0; let cropTop = 0; let cropBottom = 0;
    if (reader.readBit()) {
      cropLeft = reader.readUE(); cropRight = reader.readUE(); cropTop = reader.readUE(); cropBottom = reader.readUE();
    }
    let color = { fullRange: null, primariesCode: null, transferCode: null, matrixCode: null, primaries: null, transfer: null, matrix: null };
    let aspectRatio = { status: 'unspecified', present: false, idc: null, width: null, height: null };
    const vuiPresent = reader.readBit() === 1;
    if (vuiPresent) ({ color, aspectRatio } = parseH264Vui(reader));
    if (!hasValidRbspTrailingBits(reader)) return { status: 'incomplete', code: 'H264_RBSP_TRAILING_BITS_INVALID' };
    const chromaArrayType = separateColourPlaneFlag ? 0 : chromaFormatIdc;
    const subWidthC = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1;
    const subHeightC = chromaArrayType === 1 ? 2 : 1;
    const cropUnitX = chromaArrayType === 0 ? 1 : subWidthC;
    const cropUnitY = chromaArrayType === 0 ? 2 - frameMbsOnlyFlag : subHeightC * (2 - frameMbsOnlyFlag);
    const width = (picWidthInMbsMinus1 + 1) * 16 - cropUnitX * (cropLeft + cropRight);
    const height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16 - cropUnitY * (cropTop + cropBottom);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 131_072 || height > 131_072) {
      return { status: 'malformed', code: 'H264_DIMENSIONS_INVALID' };
    }
    return {
      status: 'parsed',
      source: 'annex-b-sps',
      codec: 'h264',
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
      aspectRatio,
    };
  } catch (error) {
    return { status: 'incomplete', code: 'H264_SPS_TRUNCATED', message: error instanceof Error ? error.message : 'SPS bitstream is incomplete.' };
  }
}

function findAnnexBSps(bytes) {
  let index = 0;
  while (index + 4 <= bytes.length) {
    let prefix = 0;
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) prefix = 3;
    else if (index + 4 <= bytes.length && bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 0 && bytes[index + 3] === 1) prefix = 4;
    if (!prefix) { index += 1; continue; }
    const nalStart = index + prefix;
    let next = nalStart + 1;
    let foundNextStartCode = false;
    while (next + 3 <= bytes.length) {
      if (bytes[next] === 0 && bytes[next + 1] === 0 && (bytes[next + 2] === 1 || (bytes[next + 2] === 0 && bytes[next + 3] === 1))) {
        foundNextStartCode = true;
        break;
      }
      next += 1;
    }
    if (!foundNextStartCode) next = bytes.length;
    if ((bytes[nalStart] & 0x1f) === 7) return parseH264Sps(bytes.subarray(nalStart, Math.min(next, bytes.length)));
    index = next;
  }
  return null;
}

function parseAdts(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0xff) continue;
    if (index + 1 >= bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    if ((bytes[index + 1] & 0xf6) !== 0xf0) continue;
    if (index + 7 > bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    const protectionAbsent = bytes[index + 1] & 1;
    const headerBytes = protectionAbsent ? 7 : 9;
    if (index + headerBytes > bytes.length) return { status: 'incomplete', code: 'ADTS_HEADER_TRUNCATED' };
    const objectType = ((bytes[index + 2] >> 6) & 0x03) + 1;
    const sampleRateIndex = (bytes[index + 2] >> 2) & 0x0f;
    const sampleRate = SAMPLE_RATES[sampleRateIndex] ?? null;
    const channelConfiguration = ((bytes[index + 2] & 1) << 2) | ((bytes[index + 3] >> 6) & 0x03);
    const frameLength = ((bytes[index + 3] & 0x03) << 11) | (bytes[index + 4] << 3) | ((bytes[index + 5] >> 5) & 0x07);
    if (!sampleRate || channelConfiguration === 0 || frameLength < headerBytes) return { status: 'malformed', code: 'ADTS_HEADER_INVALID' };
    if (index + frameLength > bytes.length) return { status: 'incomplete', code: 'ADTS_FRAME_TRUNCATED', declaredFrameLength: frameLength, availableFrameBytes: bytes.length - index };
    return {
      status: 'parsed', source: 'adts-header', codec: 'aac', objectType,
      profile: AAC_OBJECT_TYPES[objectType] ?? null, sampleRate, channelConfiguration,
      channels: CHANNEL_CONFIGS[channelConfiguration] ?? null, protectionAbsent: protectionAbsent === 1,
    };
  }
  return null;
}

function elementaryDetails(stream, esState) {
  if (!esState) return { status: 'not-observed', code: 'ELEMENTARY_PID_NOT_OBSERVED' };
  const bytes = Uint8Array.from(esState.bytes);
  let parsed = null;
  if (stream.streamType === 0x1b) parsed = findAnnexBSps(bytes);
  else if (stream.streamType === 0x0f) parsed = parseAdts(bytes);
  else return { status: 'not-applicable', code: 'ELEMENTARY_HEADER_PARSER_NOT_IMPLEMENTED' };
  if (esState.continuityLost) return { status: 'incomplete', code: 'ELEMENTARY_CONTINUITY_LOSS' };
  if (parsed?.status === 'parsed' || parsed?.status === 'malformed') return parsed;
  if (esState.limitHit) return { status: 'limit-exceeded', code: 'ELEMENTARY_SAMPLE_LIMIT_REACHED' };
  if (parsed) return parsed;
  if (esState.truncated) return { status: 'incomplete', code: 'ELEMENTARY_PES_TRUNCATED' };
  return { status: 'not-observed', code: 'ELEMENTARY_HEADER_NOT_OBSERVED' };
}

function finalize(result, state, add) {
  result.psi.sectionsExamined = state.sectionsExamined;
  result.psi.sectionsValid = state.sectionsValid;
  result.psi.patSections = state.patSet?.sections.size ?? 0;
  result.psi.pmtSections = [...state.programs.values()].reduce((sum, program) => sum + (program.pmtSet?.sections.size ?? 0), 0);
  result.psi.patVersion = state.patVersion;
  result.psi.patComplete = psiSetComplete(state.patSet);
  result.transportStreamIds = [...state.transportStreamIds].sort((a, b) => a - b);
  result.networkPids = [...state.networkPids].sort((a, b) => a - b);
  result.programs = [...state.programs.values()].sort((a, b) => a.programNumber - b.programNumber).map((program) => ({
    programNumber: program.programNumber,
    pmtPid: program.pmtPid,
    pmtVersion: program.pmt?.version ?? null,
    pcrPid: program.pmt?.pcrPid ?? null,
    programDescriptorTags: program.pmt?.programDescriptorTags ?? [],
    pmtStatus: program.pmt ? 'complete' : (program.pmtSet ? 'incomplete' : 'not-observed'),
    streams: (program.pmt?.streams ?? []).map((stream) => ({
      ...stream,
      codecDetails: elementaryDetails(stream, state.esStates.get(stream.elementaryPid)),
    })),
  }));
  for (const program of result.programs) {
    for (const stream of program.streams) {
      result.trackSummary.total += 1;
      if (stream.kind === 'video') result.trackSummary.video += 1;
      else if (stream.kind === 'audio') result.trackSummary.audio += 1;
      else result.trackSummary.other += 1;
      if (stream.codecDetails.status === 'parsed') result.trackSummary.elementaryHeadersParsed += 1;
    }
  }
  const severities = new Set(result.issues.map((entry) => entry.severity));
  const incompletePsi = [...state.assemblers.values()].some((assembler) => assembler.pending.length > 0);
  const missingPmt = state.programs.size > 0 && [...state.programs.values()].some((program) => !program.pmt);
  if (state.limitHit || severities.has('limit')) {
    result.status = 'limit-exceeded';
    result.outcome = { code: 'PROBE_LIMIT_REACHED', message: 'A hard parser limit stopped or constrained the probe.' };
  } else if (state.unsupported) {
    result.status = 'unsupported';
    result.outcome = { code: 'UNSUPPORTED_TS_FEATURE', message: 'Encrypted or otherwise unsupported PSI prevented a complete result.' };
  } else if (severities.has('malformed')) {
    result.status = 'malformed';
    result.outcome = { code: 'MALFORMED_MPEG_TS', message: 'The inspected transport stream violates a structural, continuity, or CRC contract.' };
  } else if (incompletePsi) {
    result.status = 'truncated';
    result.outcome = { code: 'TRUNCATED_MPEG_TS', message: 'The supplied bytes end inside a packet or PSI section.' };
  } else if (!result.psi.patComplete || state.programs.size === 0 || missingPmt) {
    result.status = 'incomplete';
    result.outcome = { code: 'PSI_NOT_COMPLETE', message: 'The bounded bytes do not contain a complete PAT and every referenced PMT.' };
  } else {
    result.status = 'complete';
    result.outcome = { code: 'MPEG_TS_STRUCTURE_COMPLETE', message: 'Complete PAT/PMT topology was parsed within the supplied bounded bytes.' };
  }
  add.finish();
  return result;
}

function probeMpegTs(input, options = {}) {
  const bytes = asBytes(input);
  const limits = resolveLimits(options);
  const result = baseResult(bytes, limits);
  const add = issueSink(result, limits);
  if (!bytes) {
    result.status = 'malformed';
    result.outcome = { code: 'INPUT_TYPE_INVALID', message: 'Input must be an ArrayBuffer or ArrayBuffer view.' };
    return result;
  }
  if (bytes.length > limits.maxBytes) {
    result.status = 'limit-exceeded';
    result.outcome = { code: 'BYTE_LIMIT_EXCEEDED', message: 'Supplied bytes exceed the configured hard byte limit; no bytes were scanned.' };
    add('limit', 'BYTE_LIMIT_EXCEEDED', result.outcome.message, { supplied: bytes.length, allowed: limits.maxBytes });
    add.finish();
    return result;
  }
  const initialSync = findSync(bytes, 0, limits.maxResyncBytes);
  if (initialSync < 0) {
    result.bytes.inspected = Math.min(bytes.length, limits.maxResyncBytes + TS_PACKET_BYTES * 3);
    result.status = 'not-mpeg-ts';
    result.outcome = { code: 'TS_SYNC_NOT_FOUND', message: 'No robust 188-byte transport-stream sync sequence was found within the resynchronization bound.' };
    return result;
  }
  result.bytes.syncOffset = initialSync;
  result.bytes.resyncBytes = initialSync;
  if (initialSync > 0) add('warning', 'LEADING_BYTES_SKIPPED', 'Bytes before the first robust TS sync sequence were skipped.', { skipped: initialSync });
  const state = {
    limits, assemblers: new Map(), pmtPids: new Set(), programs: new Map(), esStates: new Map(),
    transportStreamIds: new Set(), networkPids: new Set(), sectionsExamined: 0, sectionsValid: 0,
    patSet: null, patVersion: null, totalStreams: 0, limitHit: false, unsupported: false,
  };
  let position = initialSync;
  let packetsParsed = 0;
  while (position + TS_PACKET_BYTES <= bytes.length) {
    if (packetsParsed >= limits.maxPackets) {
      state.limitHit = true;
      add('limit', 'PACKET_LIMIT_REACHED', 'Packet count exceeded the configured hard limit.', { packetIndex: packetsParsed });
      break;
    }
    if (bytes[position] !== 0x47) {
      const remaining = limits.maxResyncBytes - result.bytes.resyncBytes;
      const next = remaining > 0 ? findSync(bytes, position + 1, remaining) : -1;
      if (next < 0) {
        add('malformed', 'TS_SYNC_LOST', 'Transport-stream sync was lost and could not be recovered inside the resynchronization bound.', { packetIndex: packetsParsed });
        break;
      }
      const skipped = next - position;
      result.bytes.resyncBytes += skipped;
      add('malformed', 'TS_RESYNCHRONIZED', 'Transport-stream sync was recovered after skipping bounded bytes.', { packetIndex: packetsParsed, skipped });
      for (const assembler of state.assemblers.values()) {
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.lastPayloadCc = null;
        assembler.lastPayload = null;
      }
      for (const esState of state.esStates.values()) {
        esState.currentPes = null;
        esState.lastPayloadCc = null;
        esState.lastPayload = null;
        esState.continuityLost = true;
        esState.truncated = true;
      }
      position = next;
      continue;
    }
    const packetIndex = packetsParsed;
    const b1 = bytes[position + 1];
    const b2 = bytes[position + 2];
    const b3 = bytes[position + 3];
    const transportError = (b1 & 0x80) !== 0;
    const payloadUnitStart = (b1 & 0x40) !== 0;
    const pid = ((b1 & 0x1f) << 8) | b2;
    const scrambling = (b3 >> 6) & 0x03;
    const adaptationControl = (b3 >> 4) & 0x03;
    const continuityCounter = b3 & 0x0f;
    if (transportError) add('malformed', 'TRANSPORT_ERROR_INDICATOR', 'Packet is marked with a transport error.', { packetIndex, pid });
    if (adaptationControl === 0) {
      add('malformed', 'ADAPTATION_CONTROL_INVALID', 'Packet has reserved adaptation_field_control value 0.', { packetIndex, pid });
    }
    if (transportError || adaptationControl === 0) {
      const assembler = state.assemblers.get(pid);
      if (assembler) {
        assembler.pending = [];
        assembler.expectedLength = null;
        assembler.incomplete = false;
        assembler.lastPayloadCc = null;
        assembler.lastPayload = null;
      }
      const esState = state.esStates.get(pid);
      if (esState) {
        esState.currentPes = null;
        esState.lastPayloadCc = null;
        esState.lastPayload = null;
        esState.continuityLost = true;
        esState.truncated = true;
      }
      position += TS_PACKET_BYTES; packetsParsed += 1; continue;
    }
    let payloadOffset = position + 4;
    let discontinuity = false;
    if ((adaptationControl & 0x02) !== 0) {
      const adaptationLength = bytes[payloadOffset];
      const maximum = adaptationControl === 2 ? 183 : 182;
      if (adaptationLength > maximum || payloadOffset + 1 + adaptationLength > position + TS_PACKET_BYTES) {
        add('malformed', 'ADAPTATION_FIELD_TRUNCATED', 'Adaptation field exceeds its TS packet.', { packetIndex, pid, adaptationLength });
        position += TS_PACKET_BYTES; packetsParsed += 1; continue;
      }
      if (adaptationLength > 0) discontinuity = (bytes[payloadOffset + 1] & 0x80) !== 0;
      payloadOffset += 1 + adaptationLength;
    }
    const hasPayload = (adaptationControl & 0x01) !== 0 && payloadOffset < position + TS_PACKET_BYTES;
    if (discontinuity && !hasPayload) {
      const assembler = state.assemblers.get(pid);
      if (assembler) {
        assembler.pending = []; assembler.expectedLength = null; assembler.lastPayloadCc = null; assembler.lastPayload = null;
      }
      const esState = state.esStates.get(pid);
      if (esState) resetElementarySegment(esState);
    }
    if (hasPayload) {
      const payload = bytes.subarray(payloadOffset, position + TS_PACKET_BYTES);
      const isPsi = pid === 0 || state.pmtPids.has(pid);
      if (isPsi) {
        if (scrambling !== 0) {
          state.unsupported = true;
          add('unsupported', 'SCRAMBLED_PSI_UNSUPPORTED', 'Scrambled PAT/PMT payload is not parsed.', { packetIndex, pid, scrambling });
        } else feedPsi(pid, payload, payloadUnitStart, continuityCounter, discontinuity, state, add, packetIndex);
      }
      const esState = state.esStates.get(pid);
      if (esState) {
        if (scrambling !== 0) add('warning', 'SCRAMBLED_ELEMENTARY_UNINSPECTED', 'Scrambled elementary payload was not inspected.', { packetIndex, pid, scrambling });
        else feedElementary(esState, payload, payloadUnitStart, continuityCounter, discontinuity, limits, add, packetIndex, pid);
      }
    }
    position += TS_PACKET_BYTES;
    packetsParsed += 1;
  }
  result.bytes.packetsParsed = packetsParsed;
  result.bytes.inspected = Math.min(bytes.length, position);
  result.bytes.trailingBytes = Math.max(0, bytes.length - position);
  if (result.bytes.trailingBytes > 0 && !state.limitHit) {
    add('warning', 'TRAILING_PARTIAL_PACKET_IGNORED', 'Bytes after the last complete 188-byte packet were not parsed.', { trailingBytes: result.bytes.trailingBytes });
  }
  return finalize(result, state, add);
}

return Object.freeze({probeMpegTs});
})();
const tsSummary=(()=>{

// Maintained semantic summary copied from historical MPEG-TS adapter; no runtime adapter dependency.
const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const TS_OUTCOMES = Object.freeze(['MPEG_TS_STRUCTURE_COMPLETE','PROBE_LIMIT_REACHED','UNSUPPORTED_TS_FEATURE','MALFORMED_MPEG_TS','TRUNCATED_MPEG_TS','PSI_NOT_COMPLETE','TS_SYNC_NOT_FOUND','INPUT_TYPE_INVALID','BYTE_LIMIT_EXCEEDED','PARSER_RESULT_INVALID']);
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

function summarizeMpegTs(result) {
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


return Object.freeze({summarizeMpegTs, TS_OUTCOMES});
})();
const current=(()=>{
const {runAuthenticatedRootInventory}=rootAdapter; const {summarizeRepeatedInventory}=rootCore; const {selectRiskRepresentatives}=selection; const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded; const {probeMpegTs}=tsParser; const {summarizeMpegTs,TS_OUTCOMES}=tsSummary;
const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const VERSION = '1.22.0-rc.10';
const CAPS = Object.freeze({ files: 38, mediaRequests: 76, mediaBytes: 2490368, dispatches: 512, runMs: 600000, metadataResponseBytes:2097152, metadataBytes:67108864 });
const ROUTES = ['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','webp','bmp','jpeg','png','gif','error-payload','unknown'];
const OUTCOMES = TS_OUTCOMES;
const CODES = new Set([...FAILURE_CODES, 'RUNTIME_REJECTED','OWNER_CHANGED','INVENTORY_FAILED','SELECTION_FAILED','METADATA_FAILED','CATALOG_DRIFT','REQUEST_LIMIT','RUN_TIMEOUT','CANCELLED','PARSER_FAILED']);
const TS_LIMITS = Object.freeze({ maxBytes:65536, maxPackets:348, maxResyncBytes:1504, maxSectionBytes:1024, maxSections:128, maxPrograms:64, maxStreamsPerProgram:64, maxTotalStreams:128, maxElementaryBytesPerStream:32768, maxIssues:64 });
const LIMITS = Object.freeze({requestBytes:65536,fileBytes:65536,fileRequests:2,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:15000,fileMs:60000});
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
const count = keys => Object.fromEntries(keys.map(key => [key,0]));
const error = code => Object.assign(new Error(code), {code});
const fixedCode = value => CODES.has(value?.code) ? value.code : 'METADATA_FAILED';
const identityKeys = ['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
function tsEvidenceCounts() {
  return {videoSignalling:count(['none','target-only','other-only','mixed']),audioSignalling:count(['none','target-only','other-only','mixed']),
    videoProfileEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive']),
    videoFormatEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive']),
    audioProfileEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive'])};
}
function emptySelectionPreflight() {
  return {selectorSucceeded:false,selectedCount:0,schemaMatch:false,priorityMatch:false,duplicateFree:false,
    resourceKeyReferencesValid:false,identityComplete:false,coverageComplete:false,historicalCountMatch:false,selectedCountWithinLimit:false,bodyEligible:false};
}

// All exported data comes from this fixed aggregate, never parser/metadata rows.
function emptySummary() {
  return {schema:'drive-original.v2-07a-current-corpus-aggregate/1',version:VERSION,mode:'bounded-corpus',complete:false,
    selectionPreflightComplete:false,selectionPreflight:emptySelectionPreflight(),
    failure:null,selected:0,processed:0,skippedSmall:0,tsPrefixOnly:0,routes:count(ROUTES),
    tsOutcomes:count(OUTCOMES),tsPrograms:0,tsStreams:0,tsEvidence:tsEvidenceCounts(),priorityTsEvidence:tsEvidenceCounts(),videoSignalling:count(['h264','hevc','other']),
    audioSignalling:count(['aac','other']),dispatches:0,mediaRequests:0,receivedBytes:0,metadataReceivedBytes:0,
    catalogStable:false,released:false,nativeQ1RetirementProven:false,
    genericUpstreamCleanup:'unknown',decoded:0,physicalDevicePlayback:0};
}

function createCurrentCorpusProbe(runtime, dependencies = {}) {
  const inventoryRunner = dependencies.inventoryRunner ?? runAuthenticatedRootInventory;
  const selector = dependencies.selector ?? selectRiskRepresentatives;
  const compare = dependencies.compareInventory ?? summarizeRepeatedInventory;
  const parser = dependencies.parser ?? probeMpegTs;
  const metadataTimeoutMs = Math.min(25000,Math.max(1,dependencies.metadataTimeoutMs ?? 25000));
  const setMetadataTimeout = dependencies.setMetadataTimeoutFn ?? globalThis.setTimeout;
  const clearMetadataTimeout = dependencies.clearMetadataTimeoutFn ?? globalThis.clearTimeout;
  let live = runtime, context = runtime?.privateContext ? {...runtime.privateContext} : null;
  let claimed = false, released = false, promise = null, done = false;
  let timer = null, summary = emptySummary(), baseline = null;
  const lifetime = new AbortController();
  const stop = code => { if (!lifetime.signal.aborted) lifetime.abort(error(code)); };
  const onHide = () => stop('CANCELLED');
  const onAccountAbort = () => stop('OWNER_CHANGED');
  const safeSummary = () => JSON.parse(JSON.stringify(summary));
  function inspect() {
    const state = live?.readState?.(), sw = live?.getSWIdentity?.();
    const controller = live?.navigator?.serviceWorker?.controller;
    const href = new URL(live?.location?.href), script = new URL(controller?.scriptURL);
    if (live.appVersion !== VERSION || live.getMutationsEnabled() !== false || live.top !== live.self
      || href.origin !== ORIGIN || href.protocol !== 'https:' || live.navigator.onLine !== true
      || !controller || controller.state !== 'activated' || script.origin !== ORIGIN
      || script.pathname !== '/sw.js' || script.search || script.hash
      || sw?.controller !== controller || sw?.version !== VERSION
      || !state || !id(state.accountId) || !state.authAccountKey || !state.token
      || live.hasUsableToken() !== true || state.accountIdentityPending === true
      || state.authStatus !== 'online' || state.demo !== false || live.getPlayerMediaPriorityActive() !== false
      || !state.accountStateAbortController?.signal || state.accountStateAbortController.signal.aborted
      || state.selected !== null || state.mediaAttempt !== 'idle' || state.mediaAbortController !== null
      || state.pendingOriginalBuffer !== null || state.pendingPlay !== false || state.mediaTransportStarted !== false
      || live.getQ1Playback() !== null || live.getQ1RetirementResult()?.settled !== true
      || ['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(key => !Number.isSafeInteger(state[key]) || state[key]<0)
      || !Number.isSafeInteger(live.getMediaSourceGeneration()) || typeof live.nativeFetch !== 'function') throw error('RUNTIME_REJECTED');
    return {state,controller,href:href.href,script:script.href,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration()};
  }
  function assertOwner() {
    if (lifetime.signal.aborted) throw lifetime.signal.reason;
    let now;
    try { now = inspect(); } catch { stop('OWNER_CHANGED'); throw error('OWNER_CHANGED'); }
    if (!baseline || now.state !== baseline.state || now.controller !== baseline.controller || now.href !== baseline.href
      || now.script !== baseline.script || now.retirement !== baseline.retirement || now.source !== baseline.source
      || Object.keys(baseline.values).some(key => now.state[key] !== baseline.values[key])) {
      stop('OWNER_CHANGED'); throw error('OWNER_CHANGED');
    }
  }
  function claim(media = false) {
    assertOwner();
    if (summary.dispatches >= CAPS.dispatches || (media && summary.mediaRequests >= CAPS.mediaRequests)) {
      stop('REQUEST_LIMIT'); throw error('REQUEST_LIMIT');
    }
    summary.dispatches++;
    if (media) summary.mediaRequests++;
  }
  async function raced(value, signal = lifetime.signal) {
    if (signal.aborted) throw signal.reason;
    let listener;
    const aborted = new Promise((_,reject) => { listener = () => reject(signal.reason); signal.addEventListener('abort',listener,{once:true}); });
    try { return await Promise.race([value,aborted]); } finally { signal.removeEventListener('abort',listener); }
  }
  async function metadataFetch(value, options = {}) {
    const url = new URL(value);
    const supplied = new Headers(options.headers || {});
    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith('/drive/v3/')
      || url.searchParams.has('alt') || (options.method && options.method !== 'GET') || options.body !== undefined
      || [...supplied.keys()].some(key => key !== 'x-goog-drive-resource-keys')) throw error('METADATA_FAILED');
    claim();
    supplied.set('Authorization',`Bearer ${baseline.values.token}`);
    const controller = new AbortController();
    const signals=[lifetime.signal,baseline.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])];
    const links=signals.map(signal=>{const listener=()=>controller.abort(signal.reason);if(signal.aborted)listener();else signal.addEventListener('abort',listener,{once:true});return {signal,listener};});
    const deadline=setMetadataTimeout(()=>controller.abort(error('METADATA_FAILED')),metadataTimeoutMs);
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;clearMetadataTimeout(deadline);for(const {signal,listener} of links)signal.removeEventListener('abort',listener);};
    const signal = controller.signal;
    let pending;
    try { pending = live.nativeFetch(url.href,{method:'GET',headers:supplied,signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}); }
    catch(cause){cleanup();throw cause;}
    Promise.resolve(pending).then(response=>{if(signal.aborted) void Promise.resolve(response?.body?.cancel?.()).catch(()=>{});},()=>{});
    let response;
    try {response = await raced(pending,signal);assertOwner();if (!response?.ok) {await raced(Promise.resolve(response?.body?.cancel?.()),signal);throw error('METADATA_FAILED');}}
    catch(cause){cleanup();controller.abort(cause);throw cause;}
    let jsonClaimed = false;
    return {ok:true, json:async () => {
      if (jsonClaimed) throw error('METADATA_FAILED');
      jsonClaimed = true;
      try{assertOwner();}catch(cause){cleanup();controller.abort(cause);throw cause;}
      let reader;
      try {
        reader=response.body?.getReader?.();
        if(!reader)throw error('METADATA_FAILED');
      } catch(cause) {
        controller.abort(cause);
        try {
          const cancelled=Promise.resolve().then(()=>response.body?.cancel?.());
          cancelled.catch(()=>{});
          await raced(cancelled,signal).catch(()=>{});
        } finally {cleanup();}
        throw cause;
      }
      const chunks=[];let bytes=0,finished=false;
      try {
        while(true) {
          assertOwner();
          const chunk=await raced(reader.read(),signal);assertOwner();
          if(chunk.done){finished=true;break;}
          if(!(chunk.value instanceof Uint8Array))throw error('METADATA_FAILED');
          bytes+=chunk.value.byteLength;summary.metadataReceivedBytes+=chunk.value.byteLength;
          if(bytes>CAPS.metadataResponseBytes || summary.metadataReceivedBytes>CAPS.metadataBytes)throw error('METADATA_FAILED');
          chunks.push(chunk.value);
        }
        const body=new Uint8Array(bytes);let offset=0;
        for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
        const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));assertOwner();return result;
      } finally {
        if(!finished){const cancelled=Promise.resolve(reader.cancel());cancelled.catch(()=>{});await raced(cancelled,signal).catch(()=>{});}
        try{reader.releaseLock();}catch{}
        chunks.length=0;cleanup();controller.abort(error('CANCELLED'));
      }
    }};
  }
  async function readInventory() {
    assertOwner();
    try {
      const result = await raced(inventoryRunner({driveFetch:metadataFetch,rootId:context.rootId,
        priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey}));
      assertOwner();
      if (!result?.privatePasses?.secondPass || result.report?.completeness?.repeatedPrivateInventoryMatched !== true
        || result.report?.completeness?.shortcutClassificationComplete !== true) throw error('INVENTORY_FAILED');
      return result;
    } catch (cause) { if (lifetime.signal.aborted) throw lifetime.signal.reason; throw error(CODES.has(cause.code) ? cause.code : 'INVENTORY_FAILED'); }
  }
  function selectionRows(manifest) {
    if (manifest?.schema !== 'drive-original.v2-07a-risk-selection-private/1' || !Array.isArray(manifest.selected)
      || manifest.selected.length < 1 || manifest.selected.length > CAPS.files
      || manifest.prioritySample?.fileId !== context.priorityFileId || manifest.prioritySample?.version !== context.priorityVersion) throw error('SELECTION_FAILED');
    const seen = new Set();
    const rows = manifest.selected.map(row => {
      if (!id(row.fileId) || seen.has(row.fileId) || !Array.isArray(row.visibleReferences) || !row.visibleReferences.length) throw error('SELECTION_FAILED');
      seen.add(row.fileId);
      const keys = new Set();
      for (const ref of row.visibleReferences) {
        if (!id(ref.fileId) || (ref.resourceKey !== null && !id(ref.resourceKey))) throw error('SELECTION_FAILED');
        if (ref.resourceKey) keys.add(ref.resourceKey);
      }
      if (keys.size > 1) throw error('SELECTION_FAILED');
      const expected = normalizeProbeIdentity({accountKey:context.accountKey,fileId:row.fileId,version:row.version,
        size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
      if (BigInt(expected.size) > BigInt(Number.MAX_SAFE_INTEGER)) throw error('SELECTION_FAILED');
      return {expected,resourceKey:[...keys][0] ?? null,observedResourceKey:undefined};
    });
    if (!rows.some(row => row.expected.fileId === context.priorityFileId && row.expected.version === context.priorityVersion)) throw error('SELECTION_FAILED');
    return rows;
  }
  function diagnoseSelection(selection) {
    const diagnostic=emptySelectionPreflight(),manifest=selection?.privateManifest;
    diagnostic.selectorSucceeded=true;
    diagnostic.schemaMatch=manifest?.schema==='drive-original.v2-07a-risk-selection-private/1';
    const rows=Array.isArray(manifest?.selected)?manifest.selected:null;
    diagnostic.selectedCount=rows?.length ?? 0;
    diagnostic.historicalCountMatch=diagnostic.selectedCount===CAPS.files;
    diagnostic.selectedCountWithinLimit=diagnostic.selectedCount>=1&&diagnostic.selectedCount<=CAPS.files;
    diagnostic.priorityMatch=manifest?.prioritySample?.fileId===context.priorityFileId
      && manifest?.prioritySample?.version===context.priorityVersion
      && Boolean(rows?.some(row=>row?.fileId===context.priorityFileId && row?.version===context.priorityVersion));
    if(rows) {
      diagnostic.duplicateFree=new Set(rows.map(row=>row?.fileId)).size===rows.length;
      diagnostic.resourceKeyReferencesValid=rows.every(row=>{
        if(!id(row?.fileId)||!Array.isArray(row.visibleReferences)||!row.visibleReferences.length)return false;
        const keys=new Set();
        for(const ref of row.visibleReferences){if(!id(ref?.fileId)||(ref.resourceKey!==null&&!id(ref.resourceKey)))return false;if(ref.resourceKey)keys.add(ref.resourceKey);}
        return keys.size<=1;
      });
      diagnostic.identityComplete=rows.every(row=>{
        try {
          const normalized=normalizeProbeIdentity({accountKey:context.accountKey,fileId:row?.fileId,version:row?.version,
            size:row?.size,modifiedTime:row?.modifiedTime,mimeType:row?.mimeType,canDownload:true});
          return id(normalized.fileId)&&BigInt(normalized.size)<=BigInt(Number.MAX_SAFE_INTEGER);
        }catch{return false;}
      });
    }
    const coverage=selection?.report?.coverage,mandatory=selection?.report?.selection;
    diagnostic.coverageComplete=Number.isSafeInteger(coverage?.requiredCategoryCount)&&coverage.requiredCategoryCount>=0
      && coverage.coveredCategoryCount===coverage.requiredCategoryCount&&coverage.uncoveredCategoryCount===0
      && mandatory?.prioritySampleSelected===true&&mandatory?.allRareMkvAviBmpSelected===true&&mandatory?.allGe4GiBSelected===true;
    diagnostic.bodyEligible=diagnostic.schemaMatch&&diagnostic.priorityMatch&&diagnostic.duplicateFree
      && diagnostic.resourceKeyReferencesValid&&diagnostic.identityComplete&&diagnostic.coverageComplete&&diagnostic.selectedCountWithinLimit;
    summary.selected=diagnostic.selectedCount;summary.selectionPreflight=diagnostic;summary.selectionPreflightComplete=true;
  }
  async function identity(row, phase, signal) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.expected.fileId)}`);
    url.searchParams.set('supportsAllDrives','true');
    url.searchParams.set('fields','id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey');
    const key = row.observedResourceKey ?? row.resourceKey;
    const response = await metadataFetch(url.href,{signal,headers:key ? {'X-Goog-Drive-Resource-Keys':`${row.expected.fileId}/${key}`} : {}});
    const value = await response.json();
    assertOwner();
    const observed = normalizeProbeIdentity({accountKey:context.accountKey,fileId:value.id,version:value.version,size:value.size,
      modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
    const resourceKey = value.resourceKey ?? null;
    if (value.trashed !== false || (resourceKey!==null && !id(resourceKey))
      || identityKeys.some(field => observed[field] !== row.expected[field])
      || (row.resourceKey && resourceKey !== row.resourceKey)
      || (phase==='postflight' && resourceKey !== row.observedResourceKey)) throw error('IDENTITY_MISMATCH');
    if (phase==='preflight') row.observedResourceKey = resourceKey;
    return observed;
  }
  function mediaUrl(row) {
    const url = new URL(`/__drive_media/${encodeURIComponent(row.expected.fileId)}`,ORIGIN);
    url.searchParams.set('accountGeneration',String(baseline.values.driveSessionGeneration));
    url.searchParams.set('mediaSession',String(baseline.values.mediaSession));
    url.searchParams.set('size',row.expected.size);
    if (row.observedResourceKey) url.searchParams.set('resourceKey',row.observedResourceKey);
    return url.href;
  }
  function aggregate(evidence,priority) {
    if (evidence.kind === 'skipped-small') { summary.skippedSmall++; return; }
    if (!ROUTES.includes(evidence.kind)) throw error('PARSER_FAILED');
    summary.routes[evidence.kind]++;
    if (evidence.kind !== 'mpeg-ts') return;
    if (evidence.prefixOnly) summary.tsPrefixOnly++;
    const parsed = evidence.parsed;
    if (!OUTCOMES.includes(parsed?.outcome?.code) || !Array.isArray(parsed.programs)) throw error('PARSER_FAILED');
    summary.tsOutcomes[parsed.outcome.code]++;
    const semantic=summarizeMpegTs(parsed);
    for(const key of Object.keys(summary.tsEvidence)){summary.tsEvidence[key][semantic[key]]++;if(priority)summary.priorityTsEvidence[key][semantic[key]]++;}
    summary.tsPrograms += parsed.programs.length;
    for (const program of parsed.programs) for (const stream of program.streams ?? []) {
      summary.tsStreams++;
      if (stream.kind==='video') summary.videoSignalling[['h264','hevc'].includes(stream.codec) ? stream.codec : 'other']++;
      if (stream.kind==='audio') summary.audioSignalling[stream.codec==='aac' ? 'aac' : 'other']++;
    }
  }
  async function execute(metadataOnly = false) {
    let initial = null, final = null, rows = null;
    const budget = createBatchBudget(CAPS.mediaBytes);
    if(metadataOnly)summary.mode='metadata-only-selection';
    try {
      let current;
      try {current=inspect();}catch{throw error('RUNTIME_REJECTED');}
      baseline = {...current,values:Object.fromEntries(['accountId','authAccountKey','driveSessionGeneration','authGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(key=>[key,current.state[key]]))};
      if (!context || !id(context.rootId) || !id(context.priorityFileId) || context.accountKey!==current.state.accountId
        || context.generation!==current.state.driveSessionGeneration) throw error('RUNTIME_REJECTED');
      assertOwner();
      timer = setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);
      live.addEventListener?.('pagehide',onHide,{once:true}); live.addEventListener?.('beforeunload',onHide,{once:true});
      baseline.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
      initial = await readInventory();
      let selected;
      try {selected=selector({pass:initial.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});}
      catch{throw error('SELECTION_FAILED');}
      diagnoseSelection(selected);assertOwner();
      if(!metadataOnly) {
      if(!summary.selectionPreflight.bodyEligible)throw error('SELECTION_FAILED');
      rows = selectionRows(selected.privateManifest); summary.selected=rows.length;
      for (const row of rows) {
        assertOwner();
        const result = await runBoundedProbe({expectedIdentity:row.expected,generation:context.generation,
          isGenerationCurrent:()=>{try {assertOwner();return true;}catch{return false;}},signal:lifetime.signal,batchBudget:budget,limits:LIMITS,
          getIdentity:({phase,signal})=>identity(row,phase,signal),
          readRange:({range,signal,start,end})=>{
            if (end >= Number(row.expected.size)-1 || !((start===0 && end===939) || (start===940 && end===65535))) throw error('INVALID_RANGE');
            claim(true);
            return live.nativeFetch(mediaUrl(row),{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
          },
          probe:async ({read,sniffMagic})=>{
            const size=BigInt(row.expected.size);
            if (size<=940n) return {kind:'skipped-small'};
            const prefix=await read({start:0,end:939});
            let kind=sniffMagic(prefix).kind;
            if (kind==='mpeg-ts' && ![0,188,376,564,752].every(offset=>prefix[offset]===0x47)) kind='unknown';
            if (kind!=='mpeg-ts') return {kind};
            let bytes=prefix;
            if (size>65536n) {
              const continuation=await read({start:940,end:65535});
              bytes=new Uint8Array(65536);bytes.set(prefix);bytes.set(continuation,940);
            }
            return {kind,prefixOnly:size<=65536n,parsed:parser(bytes,{limits:TS_LIMITS})};
          }});
        summary.receivedBytes=budget.receivedBytes;
        if (!result.ok) { summary.failure=fixedCode(lifetime.signal.aborted ? lifetime.signal.reason : result.failure); stop(summary.failure); break; }
        assertOwner(); aggregate(result.evidence,row.expected.fileId===context.priorityFileId); summary.processed++;
      }
      if (!summary.failure) {
        final=await readInventory();
        try { compare({firstPass:initial.privatePasses.secondPass,secondPass:final.privatePasses.secondPass,
          canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId}); } catch { throw error('CATALOG_DRIFT'); }
        assertOwner();summary.catalogStable=true;summary.complete=rows.length>0&&summary.processed===rows.length;
      }
      }
    } catch (cause) { summary.failure=fixedCode(lifetime.signal.aborted ? lifetime.signal.reason : cause); }
    finally {
      summary.receivedBytes=budget.receivedBytes;
      if (!released) {
        released=true;stop(summary.failure ?? 'CANCELLED');clearTimeout(timer);
        live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
        baseline?.values.accountStateAbortController?.signal.removeEventListener('abort',onAccountAbort);
        baseline=null;context=null;live=null;initial=null;final=null;rows=null;summary.released=true;
      }
      done=true;
    }
    return safeSummary();
  }
  return Object.freeze({
    run(){if (!claimed) {claimed=true;promise=execute();}return promise;},
    runMetadataOnlySelection(){if(!claimed){claimed=true;promise=execute(true);}return promise;},
    cancel(){stop('CANCELLED');if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){return {claimed,done,processed:summary.processed,dispatches:summary.dispatches,mediaRequests:summary.mediaRequests,receivedBytes:summary.receivedBytes};},
    done(){return {done,summary:done?safeSummary():null};}
  });
}

return Object.freeze({createCurrentCorpusProbe});
})();
return current.createCurrentCorpusProbe;
})()
