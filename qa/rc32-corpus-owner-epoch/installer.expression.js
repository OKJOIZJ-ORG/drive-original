(()=>{'use strict';const __BINDING__={"schema":"drive-original.corpus-header-source-binding/1","version":"1.22.0-rc.32","sourceCommit":"1d79897fd32c569137cab079bfd93107be2ee33f","sourceSHA256":{"app.js":"7a84c2f52a6ba15300a533eea7f5b49f6653fe540486f5907d30214e65327497","sw.js":"8f27c0aa6710b78353b87911702a7e4c6e66535c404d5a66869992fc861b242b","version.json":"f60e407e34b72be59084f504eec09d2e48ce658c3fdc63f6f397b7eb341cbbea"}};
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
const denominators=(()=>{
// Copy only the maintained redacted report's explicit scalar/counter contract.
const fail=()=>{throw Object.assign(new Error('INVENTORY_FAILED'),{code:'INVENTORY_FAILED'});};
const integer=n=>Number.isSafeInteger(n)&&n>=0?n:fail();
const bool=x=>typeof x==='boolean'?x:fail();
const bytes=x=>typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)&&x.length<=100?x:fail();
const countKeys=['totalUniqueItems','folders','shortcuts','folderShortcutsNotTraversed','physicalFiles','classifiedUniqueObjects','videoObjects','imageObjects','audioObjects','otherObjects','visibleMediaReferences','uniqueMediaObjects','uniqueShortcutTargets'];
const extensionKeys=['.jpg','.jpeg','.png','.gif','.webp','.bmp','.mp4','.mov','.webm','.mkv','.avi','<none>','<other>'];
const mimeKeys=['image/jpeg','image/png','image/gif','image/webp','image/bmp','video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/flac','audio/webm','<other>'];
const sizeKeys=['unknown','zero','>0-24MiB','>24-64MiB','>64-96MiB','>96-256MiB','>256MiB-<2GiB','>=2-<4GiB','>=4GiB'];
const copyFields=(source,keys)=>Object.fromEntries(keys.map(k=>[k,integer(source?.[k])]));
const counter=(source,keys)=>{if(!source||Array.isArray(source)||Object.keys(source).some(k=>!keys.includes(k)))fail();return Object.fromEntries(Object.entries(source).map(([k,v])=>[k,integer(v)]));};
function summarizeInventoryDenominators(report){
  if(report?.schema!=='drive-original.v2-07a-root-inventory-output-redacted/1')fail();
  const c=report.completeness;
  if(c?.repeatedPassCount!==2||c.repeatedPrivateInventoryMatched!==true||c.containmentComplete!==true||c.shortcutClassificationComplete!==true||c.recursiveFolderTraversal!==true||c.folderShortcutsTraversed!==false)fail();
  const counts=copyFields(report.counts,countKeys);
  if(counts.totalUniqueItems!==counts.folders+counts.shortcuts+counts.physicalFiles||counts.classifiedUniqueObjects!==counts.videoObjects+counts.imageObjects+counts.audioObjects+counts.otherObjects)fail();
  const extensions=counter(report.extensions,extensionKeys),mimeTypes=counter(report.mimeTypes,mimeKeys),bands=counter(report.sizes?.bands,sizeKeys);
  for(const values of [extensions,mimeTypes,bands])if(Object.values(values).reduce((n,v)=>n+v,0)!==counts.classifiedUniqueObjects)fail();
  const twoCounts=x=>{if(!Array.isArray(x)||x.length!==2)fail();return x.map(integer);};
  const capabilityKeys=['true','false','unknown'];
  const capabilities=Object.fromEntries(['canDownload','canReadRevisions','canListChildren'].map(k=>[k,counter(report.capabilities?.[k],capabilityKeys)]));
  const availability=Object.fromEntries(['size','modifiedTime','version'].map(k=>[k,copyFields(report.metadataAvailability?.[k],['present','absent'])]));
  return {
    schema:'drive-original.corpus-safe-inventory-denominators/1',counts,extensions,mimeTypes,
    completeness:{repeatedPassCount:2,repeatedPrivateInventoryMatched:true,containmentComplete:true,shortcutClassificationComplete:true,recursiveFolderTraversal:true,folderShortcutsTraversed:false,providerTransactionalSnapshotGuaranteed:bool(c.providerTransactionalSnapshotGuaranteed),
      traversedFolderCount:integer(c.traversedFolderCount),pageCountPerPass:twoCounts(c.pageCountPerPass),duplicateReferenceCountPerPass:twoCounts(c.duplicateReferenceCountPerPass),incompleteSearchCount:integer(c.incompleteSearchCount),paginationCycleCount:integer(c.paginationCycleCount),inventoryErrorCount:integer(c.inventoryErrorCount),shortcutResolutionErrorCount:integer(c.shortcutResolutionErrorCount)},
    sizes:{bands,...copyFields(report.sizes,['knownSizeFileCount','unknownSizeFileCount']),totalKnownSizeBytes:bytes(report.sizes.totalKnownSizeBytes),maximumKnownSizeBytes:bytes(report.sizes.maximumKnownSizeBytes)},
    capabilities,metadataAvailability:availability,
    risk:copyFields(report.risk,['prioritySampleCount','rareExtensionCount','animatedGifOrWebp','largeMp4OrMov','videosAtLeastOneHour','imagesWithRotation','extensionMimeMismatchCount','downloadBlocked','downloadCapabilityUnknown','missingVersion','missingSize','unresolvedShortcutTargetCount','staleShortcutTargetMimeCount']),
    candidateDenominators:{videoMimeObjects:counts.videoObjects,videoExtensionObjects:['.mp4','.mov','.webm','.mkv','.avi'].reduce((n,k)=>n+(extensions[k]??0),0),videoMimeOrExtensionUnion:null,unionRequiresPrivateUniqueObjectSet:true},
    coverage:{metadataInventoryCount:integer(report.coverage?.metadataInventoryCount),configuredContainerAnalysisCount:integer(report.coverage?.configuredContainerAnalysisCount),decodedInThisRunCount:integer(report.coverage?.decodedInThisRunCount),physicalDevicePlaybackCount:integer(report.coverage?.physicalDevicePlaybackCount)},
    limitations:{providerTransactionalSnapshotGuaranteed:false,folderShortcutsNotTraversed:counts.folderShortcutsNotTraversed,metadataInventoryIsPlaybackProof:false,wholeCorpusComplete:false}
  };
}
function summarizeProbeDenominators({inventory,representatives,candidateTracks}={}){
  const r=integer(representatives),t=integer(candidateTracks),c=inventory?.counts;
  if(!c||r>c.classifiedUniqueObjects||t>r)fail();
  return {classifiedObjects:c.classifiedUniqueObjects,metadataVideoObjects:c.videoObjects,metadataRepresentatives:r,diagnosticTrackCandidates:t,scheduledPrefixReads:0,scheduledTrackReads:0,probedClassifiedObjects:0,probedVideoObjects:0,probedRepresentatives:0,unprobedClassifiedObjects:c.classifiedUniqueObjects,unprobedVideoObjects:c.videoObjects,unprobedRepresentatives:r,wholeCorpusComplete:false,denominatorScope:'metadata-only-current-run-no-prior-body-evidence-admitted'};
}

return {summarizeInventoryDenominators};})();
const normalizers=(()=>{
// Exact function copies from maintained root-inventory.mjs; original source is hashed in build provenance.
function normalizeIntegerString(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^(0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}
function normalizeCapability(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
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

return {stableItemRow};})();
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
const readCache=(()=>{
// Only caller-proven metadata spans may be prefetched. Never infer a span from distance.
function createMetadataReadCache({read,start,endExclusive,signal,checkCurrent=()=>{},maxBytes=2*1024*1024,maxRequests=64}={}){
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const rootStart=BigInt(start),rootEnd=BigInt(endExclusive),cache=[];
  const metrics={requests:0,receivedBytes:0,logicalReads:0,cacheHits:0,released:false};
  if(typeof read!=='function'||rootStart<0n||rootEnd<=rootStart||rootEnd>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>64)fail('SPARSE_INVALID_ARGUMENT');
  const check=()=>{if(metrics.released)fail('SPARSE_CACHE_RELEASED');if(signal?.aborted)fail('SPARSE_ABORTED');checkCurrent();};
  return Object.freeze({
    async read({start:p,length,parentStart=rootStart,parentEndExclusive=rootEnd,prefetchEndExclusive}={}){
      check();p=BigInt(p);const lo=BigInt(parentStart),hi=BigInt(parentEndExclusive),wanted=p+BigInt(length);
      if(!Number.isSafeInteger(length)||length<1||lo<rootStart||hi>rootEnd||lo>p||wanted>hi)fail('SPARSE_INVALID_BOUNDS');
      metrics.logicalReads++;
      for(const item of cache)if(p>=item.start&&wanted<=item.end){metrics.cacheHits++;check();return item.bytes.slice(Number(p-item.start),Number(wanted-item.start));}
      // Prefetch is an explicit proof from the parser, clipped to its exact parent.
      let fetchEnd=prefetchEndExclusive===undefined?wanted:BigInt(prefetchEndExclusive);
      fetchEnd=fetchEnd>hi?hi:fetchEnd;
      if(fetchEnd<wanted)fail('SPARSE_INVALID_BOUNDS');
      const lengthToRead=Number(fetchEnd-p);
      if(!Number.isSafeInteger(lengthToRead)||lengthToRead<1||lengthToRead>1024*1024)fail('SPARSE_BYTE_LIMIT');
      if(metrics.requests>=maxRequests)fail('SPARSE_REQUEST_LIMIT');
      if(metrics.receivedBytes+lengthToRead>maxBytes)fail('SPARSE_BYTE_LIMIT');
      metrics.requests++;
      const pending=Promise.resolve().then(()=>{check();return read({start:p,end:fetchEnd-1n});});
      let value;
      if(!signal)value=await pending;
      else value=await new Promise((resolve,reject)=>{
        let settled=false;
        const finish=(fn,v)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(v);};
        const cancel=()=>finish(reject,Object.assign(new Error('SPARSE_ABORTED'),{code:'SPARSE_ABORTED'}));
        signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
        pending.then(v=>finish(resolve,v),e=>finish(reject,e));
      });
      check();if(!(value instanceof Uint8Array)||value.length!==lengthToRead)fail('SPARSE_READ_LENGTH');
      // Own a copy: parser consumers and upstream buffers cannot corrupt each other.
      const owned=new Uint8Array(value);metrics.receivedBytes+=owned.length;cache.push({start:p,end:fetchEnd,bytes:owned});
      return owned.slice(0,length);
    },
    metrics:()=>({...metrics}),
    release(){for(const item of cache)item.bytes.fill(0);cache.length=0;metrics.released=true;}
  });
}

return {createMetadataReadCache};})();
const sparse=(()=>{const {createMetadataReadCache}=readCache;
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

async function readSparseMoov({box,fileSize,read,signal,limits:overrides={},checkCurrent=()=>{}}={}){
  const metrics={requests:0,receivedBytes:0,boxes:0,tracks:0,descriptions:0,sampleTableBoxesSkipped:0,unknownPayloadsSkipped:0,fixedLeafSuffixesSkipped:0,originalBoundsValidated:false,derivedBytes:0};
  let limits=null,cache=null;
  const check=()=>{if(signal?.aborted)stop('SPARSE_ABORTED');checkCurrent();};
  const result=(status,code,bytes=null)=>{const cacheMetrics=cache?cache.metrics():{};delete cacheMetrics.released;return {status,code,bytes,metrics:{...metrics,...cacheMetrics},derivedStructuralMetadata:true,originalSampleTablesRead:false,containerValidityProven:false};};
  try{
    limits=Object.fromEntries(Object.entries(SPARSE_LIMITS).map(([k,v])=>{const n=overrides[k]??v;if(!Number.isSafeInteger(n)||n<1||n>v)stop('SPARSE_INVALID_LIMIT');return [k,n];}));
    if(typeof read!=='function')stop('SPARSE_INVALID_ARGUMENT');
    const size=BigInt(fileSize),start=BigInt(box.offset),end=BigInt(box.endExclusive),declared=BigInt(box.size),head=BigInt(box.headerBytes);
    if(size>BigInt(Number.MAX_SAFE_INTEGER)||start<0n||end>size||declared!==end-start||head<8n||head>16n||declared<head)stop('SPARSE_INVALID_BOUNDS');
    cache=createMetadataReadCache({read,start,endExclusive:end,signal,checkCurrent,maxBytes:limits.bytes,maxRequests:limits.requests});
    const bytes=async(p,n,bound,prefetchEndExclusive)=>{
      check();if(p<start||bound>end)stop('SPARSE_INVALID_BOUNDS');
      return cache.read({start:p,length:n,parentStart:start,parentEndExclusive:bound,prefetchEndExclusive});
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
      const minimum=b.type==='tkhd'?84:b.type==='mdhd'?24:12;
      const prefix=await bytes(b.body,4,b.end,b.body+BigInt(minimum)),v=prefix[0];let n;
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
        // The fixed sample entry and at most the next child header are structural metadata.
        const nextHeader=e.body+BigInt(n)+8n<=e.end?e.body+BigInt(n)+8n:e.body+BigInt(n);
        const entry=await bytes(e.body,n,e.end,nextHeader);if(audio.has(e.type)&&uint(entry.subarray(8,10))!==0n)stop('SPARSE_UNSUPPORTED_AUDIO_VERSION');
        let c=e.body+BigInt(n);const leaves=[entry];
        while(c<e.end){
          const child=await header(c,e.end),length=child.end-child.body;
          if(configs.has(child.type)){
            if(length>BigInt(limits.configBytes))stop('SPARSE_CONFIG_LIMIT');
            const nextHeader=child.end+8n<=e.end?child.end+8n:child.end;
            leaves.push(pack(child.type,length?[await bytes(child.body,Number(length),e.end,nextHeader)]:[]));
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
  finally{cache?.release();}
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
const windows=(()=>{
// Only scanner-validated moov metadata is admitted. No top-level/mdat prefetch.
// Windows may contain skipped sample-table or unknown metadata, never parsed.
function createMoovWindowCache({read,box,fileSize,signal,checkCurrent=()=>{},maxBytes=2*1024*1024,maxRequests=64}={}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 const start=Number(box?.offset),end=Number(box?.endExclusive),head=Number(box?.headerBytes),size=Number(fileSize),body=start+head,cache=new Map();
 const metrics={requests:0,receivedBytes:0,logicalReads:0,cacheHits:0,windowBytes:16384,released:false,sampleTableOrUnknownMetadataMayBePrefetched:true,sampleTablesParsed:false};
 if(typeof read!=='function'||![start,end,head,size].every(Number.isSafeInteger)||start<0||end>size||end<=body||Number(box?.size)!==end-start||![8,16].includes(head)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>64)fail('SPARSE_INVALID_BOUNDS');
 // A small moov is split too: never request its full body/container in one GET.
 const width=Math.min(16384,Math.max(1,Math.ceil((end-body)/2)));
 const check=()=>{if(metrics.released)fail('SPARSE_CACHE_RELEASED');if(signal?.aborted)fail('SPARSE_ABORTED');checkCurrent();};
 return Object.freeze({async read({start:a,end:b}){
  check();a=Number(a);b=Number(b);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<start||b<a||b>=end)fail('SPARSE_INVALID_BOUNDS');metrics.logicalReads++;
  if(a<body){if(b>=body)fail('SPARSE_INVALID_BOUNDS');return read({start:a,end:b});}
  const out=new Uint8Array(b-a+1);let p=a;
  while(p<=b){check();const lo=body+Math.floor((p-body)/width)*width,hi=Math.min(end,lo+width);let value=cache.get(lo);
   if(value){metrics.cacheHits++;}else{
    if(metrics.requests>=maxRequests)fail('SPARSE_REQUEST_LIMIT');if(metrics.receivedBytes+hi-lo>maxBytes)fail('SPARSE_BYTE_LIMIT');metrics.requests++;
    const bytes=await read({start:lo,end:hi-1});check();if(!(bytes instanceof Uint8Array)||bytes.length!==hi-lo)fail('SPARSE_READ_LENGTH');
    value=new Uint8Array(bytes);metrics.receivedBytes+=value.length;cache.set(lo,value);
   }
   const stop=Math.min(b+1,hi);out.set(value.subarray(p-lo,stop-lo),p-a);p=stop;
  }check();return out;
 },metrics:()=>({...metrics}),release(){for(const bytes of cache.values())bytes.fill(0);cache.clear();metrics.released=true;}});
}

return {createMoovWindowCache};})();
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

return {probeMpegTs};})();
const continuity=(()=>{
const capsules=new WeakMap();
const CONTINUITY_LIMIT=16384;
const RETRYABLE=new Set();
const EPOCH='rc32-bounded-container-config-image-owner-epoch-20261001-1';
const identitySame=(a,b)=>['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'].every(k=>a?.[k]===b?.[k]);
const contentSame=(a,b)=>['headRevisionId','sha256Checksum'].every(k=>a?.[k]===b?.[k]);
const evidenceEpoch=()=>EPOCH;
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=code=>{throw Object.assign(new Error(code),{code});};
function readHeaderState(handle,context,binding){if(handle==null)return {records:[],attempts:[]};const x=capsules.get(handle);if(!x||x.accountKey!==context.authAccountKey||x.rootId!==context.rootId||x.commit!==binding.sourceCommit||x.version!==binding.version||JSON.stringify(x.hashes)!==JSON.stringify(binding.sourceSHA256))fail('CONTINUITY_REJECTED');return copy({records:x.records,attempts:x.attempts});}
function createHeaderContinuity(context,binding,records,attempts){if(records.length>CONTINUITY_LIMIT||attempts.length>CONTINUITY_LIMIT||new Set(attempts.map(x=>x.identity.fileId)).size!==attempts.length||attempts.some(x=>x.count!==1))fail('CONTINUITY_LIMIT');const handle=Object.freeze({schema:'drive-original.private-owner-epoch-handle/1'});capsules.set(handle,{accountKey:context.authAccountKey,rootId:context.rootId,commit:binding.sourceCommit,version:binding.version,hashes:{...binding.sourceSHA256},records:copy(records),attempts:copy(attempts)});return handle;}
function clearHeaderContinuity(handle){return capsules.delete(handle);}

return {readHeaderState,createHeaderContinuity,clearHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE,EPOCH};})();
const selection=(()=>{const {stableItemRow}=normalizers;const {normalizeProbeIdentity}=bounded;const {identitySame,RETRYABLE}=continuity;
const FOLDER='application/vnd.google-apps.folder',SHORTCUT='application/vnd.google-apps.shortcut';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fail=()=>{throw Object.assign(new Error('SELECTION_FAILED'),{code:'SELECTION_FAILED'});};
const ext=row=>{const raw=String(row.fullFileExtension||row.fileExtension||'').trim().toLowerCase().replace(/^\./,'');const name=String(row.name??'');return raw||(name.lastIndexOf('.')>0?name.slice(name.lastIndexOf('.')+1).toLowerCase():'');};
const video=row=>String(row.mimeType??'').toLowerCase().startsWith('video/')||['mp4','mov','webm','mkv','avi','ts','mts','m2ts','m4v','mpg','mpeg','mpe','m2v','wmv','flv','f4v','3gp','3g2','ogv','vob','asf','mxf'].includes(ext(row));
const image=row=>String(row.mimeType??'').toLowerCase().startsWith('image/')||['jpg','jpeg','png','gif','webp','bmp','avif','heic','heif','tif','tiff','svg','ico','jxl'].includes(ext(row));
function collectHeaderCandidates(pass,selection,accountKey){
  if(!Array.isArray(pass?.items)||!Array.isArray(pass.shortcutTargets)||!Array.isArray(selection?.privateManifest?.selected))fail();
  const targets=new Map(pass.shortcutTargets),objects=new Map();
  const add=(row,reference)=>{if(!validId(row?.id)||!validId(reference?.fileId)||(reference.resourceKey!==null&&!validId(reference.resourceKey)))fail();const prior=objects.get(row.id);if(prior&&stableItemRow(prior.row)!==stableItemRow(row))fail();const value=prior??{row,references:[]};value.references.push(reference);objects.set(row.id,value);};
  for(const row of pass.items){if(row.mimeType===FOLDER)continue;if(row.mimeType===SHORTCUT){const target=targets.get(row.shortcutDetails?.targetId);if(!target)fail();if(target.mimeType!==FOLDER&&target.mimeType!==SHORTCUT)add(target,{fileId:target.id,resourceKey:row.shortcutDetails?.targetResourceKey??null});}else add(row,{fileId:row.id,resourceKey:row.resourceKey??null});}
  const representatives=new Map(selection.privateManifest.selected.map(row=>[row.fileId,row]));const representativeIds=new Set(representatives.keys());if(representativeIds.size!==selection.privateManifest.selected.length||[...representativeIds].some(id=>!objects.has(id)))fail();
  return [...objects.values()].map(item=>{
    const keys=new Set(item.references.map(x=>x.resourceKey).filter(Boolean));if(keys.size>1)fail();const row=item.row;
    let expected=null,ineligible=null;
    if(row.capabilities?.canDownload!==true)ineligible=row.capabilities?.canDownload===false?'DOWNLOAD_BLOCKED':'DOWNLOAD_CAPABILITY_UNKNOWN';
    else try{expected=normalizeProbeIdentity({accountKey,fileId:row.id,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});}catch{ineligible='METADATA_IDENTITY_INCOMPLETE';}
    if(expected&&BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))ineligible='UNSAFE_FILE_SIZE';
    if(expected&&BigInt(expected.size)<=1n)ineligible='SMALL_FILE_WHOLE_READ_EXCLUDED';
    const reasons=representatives.get(row.id)?.mandatoryReasons??[],priorityRank=reasons.includes('priority')?3:reasons.some(x=>x.startsWith('largest:'))?2:reasons.some(x=>x.startsWith('rare:'))?1:0;
    return {id:row.id,expected,ineligible,resourceKey:[...keys][0]??null,representative:representativeIds.has(row.id),videoCandidate:video(row),imageCandidate:image(row),priorityRank};
  }).sort((a,b)=>b.priorityRank-a.priorityRank||a.id.localeCompare(b.id));
}
function planHeaderCohort(candidates,{phase='representatives',maxFiles=8,covered=new Set(),attempts=new Map()}={}){
  if(!['representatives','videos','revalidate-representatives','revalidate-videos'].includes(phase)||!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>64||!(covered instanceof Set))fail();
  const pool=candidates.filter(x=>phase.endsWith('representatives')?x.representative:x.videoCandidate||x.imageCandidate),eligible=pool.filter(x=>!x.ineligible);
  const pending=eligible.filter(x=>!covered.has(x.id)&&!attempts.has(x.id));
  const exhausted=eligible.filter(x=>!covered.has(x.id)&&attempts.has(x.id));
  return {pool,plan:pending.slice(0,maxFiles),exhausted,summary:{phase,denominator:pool.length,eligible:eligible.length,ineligible:pool.length-eligible.length,previouslyValidated:eligible.filter(x=>covered.has(x.id)).length,planned:Math.min(maxFiles,pending.length),unplannedPending:Math.max(0,pending.length-maxFiles),maxFiles,batchFiles:8,batchesPlanned:Math.ceil(Math.min(maxFiles,pending.length)/8),exhausted:exhausted.length}};
}

return {collectHeaderCandidates,planHeaderCohort};})();
const classification=(()=>{const {scanIsoBmffTopLevel}=scanner;const {parseMoov}=parser;const {readSparseMoov}=sparse;const {readEbmlTracks}=ebml;const {createMoovWindowCache}=windows;const {probeMpegTs}=tsParser;
const n=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?x:null;
const tags=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4v','mp4a','ac-3','ec-3','Opus','fLaC','lpcm','raw ','twos','sowt']);
// Same bounded ISO projection as rc32-format-acceptance; no private byte/string export.
function safeIso(value){return {status:value?.status==='parsed'?'parsed':'incomplete',fragmented:value?.fragmented===true,tracks:(value?.tracks??[]).slice(0,32).map(t=>({type:['vide','soun','subt','text'].includes(t.type)?t.type:'other',width:n(t.width),height:n(t.height),identityMatrix:t.identityMatrix===true,descriptions:(t.descriptions??[]).slice(0,16).map(d=>({codec:tags.has(d.codec)?d.codec:'unknown',width:n(d.width),height:n(d.height),channels:n(d.channels),sampleRate:n(d.sampleRate),sampleSize:n(d.sampleSize),encrypted:d.encrypted===true,avcProfile:n(d.config?.avcC?.profile),avcLevel:n(d.config?.avcC?.level),hevcProfile:n(d.config?.hvcC?.profileIdc),hevcLevel:n(d.config?.hvcC?.levelIdc),bitDepthLuma:n(d.config?.hvcC?.bitDepthLuma),bitDepthChroma:n(d.config?.hvcC?.bitDepthChroma),aacObjectType:n(d.config?.esds?.audioSpecificConfig?.objectType),aacFrequencyIndex:n(d.config?.esds?.audioSpecificConfig?.freqIndex),aacChannelConfig:n(d.config?.esds?.audioSpecificConfig?.channelConfig),colorMetadataPresent:d.config?.colr?.present===true,sampleAspectRatioPresent:d.config?.pasp?.present===true,configPresent:Boolean(d.config&&Object.keys(d.config).length)}))}))};}
const text=(b,a,z)=>String.fromCharCode(...b.subarray(a,z));
const dim=(width,height,extra={})=>width>0&&height>0&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)?{status:'parsed',width,height,...extra}:{status:'incomplete'};
function imageHeader(kind,b){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),u24=p=>b[p]+b[p+1]*256+b[p+2]*65536;
 if(kind==='png'&&b.length>=33&&text(b,12,16)==='IHDR'&&v.getUint32(8)===13)return dim(v.getUint32(16),v.getUint32(20),{bitDepth:b[24],colorType:b[25],animationKnown:false,rotationKnown:false});
 if(kind==='gif'&&b.length>=13&&['GIF87a','GIF89a'].includes(text(b,0,6)))return dim(v.getUint16(6,true),v.getUint16(8,true),{animationKnown:false,rotationKnown:false});
 if(kind==='bmp'&&b.length>=30){const dib=v.getUint32(14,true);if(dib===12)return dim(v.getUint16(18,true),v.getUint16(20,true),{bitDepth:v.getUint16(24,true),animationKnown:true,animated:false,rotationKnown:false});if(dib>=40&&b.length>=54)return dim(Math.abs(v.getInt32(18,true)),Math.abs(v.getInt32(22,true)),{bitDepth:v.getUint16(28,true),animationKnown:true,animated:false,rotationKnown:false});}
 if(kind==='webp'&&b.length>=30&&text(b,0,4)==='RIFF'&&text(b,8,12)==='WEBP'){const tag=text(b,12,16);if(tag==='VP8X'&&v.getUint32(16,true)===10)return dim(1+u24(24),1+u24(27),{animationKnown:true,animated:Boolean(b[20]&2),alpha:Boolean(b[20]&16),rotationKnown:false});if(tag==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return dim(v.getUint16(26,true)&0x3fff,v.getUint16(28,true)&0x3fff,{animationKnown:false,rotationKnown:false});if(tag==='VP8L'&&b[20]===0x2f&&b.length>=25){const bits=v.getUint32(21,true);return dim(1+(bits&0x3fff),1+((bits>>>14)&0x3fff),{alpha:Boolean(bits&(1<<28)),animationKnown:false,rotationKnown:false});}}
 if(kind==='jpeg'){let p=2,segments=0;while(p+3<b.length&&++segments<=256){if(b[p++]!==255)return {status:'incomplete'};while(b[p]===255)p++;const marker=b[p++];if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;if(p+2>b.length)break;const length=v.getUint16(p);if(length<2||p+length>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return dim(v.getUint16(p+5),v.getUint16(p+3),{bitDepth:b[p+2],components:b[p+7],progressive:marker===0xc2,animationKnown:true,animated:false,rotationKnown:false});p+=length;}}
 return {status:'incomplete'};
}
function safeTs(value){return {status:value?.status==='complete'?'parsed':'incomplete',topologyComplete:value?.status==='complete',sampleScope:'bounded-head-only',codecConfigOutsideSample:'unknown',tracks:(value?.programs??[]).slice(0,16).flatMap(p=>(p.streams??[]).slice(0,16).map(t=>{const d=t.codecDetails??{};return {type:['video','audio'].includes(t.kind)?t.kind:'other',codec:['h264','aac','hevc','mpeg-1-video','mpeg-2-video','mpeg-1-audio','mpeg-2-audio','mpeg-4-part-2','aac-latm','mpeg-h-part-2'].includes(t.codec)?t.codec:'unknown',streamType:n(t.streamType),configStatus:d.status==='parsed'?'parsed':'incomplete',profileIdc:n(d.profileIdc),constraintFlags:n(d.constraintFlags),levelIdc:n(d.levelIdc),width:n(d.width),height:n(d.height),chromaFormatIdc:n(d.chromaFormatIdc),bitDepthLuma:n(d.bitDepthLuma),bitDepthChroma:n(d.bitDepthChroma),aacObjectType:n(d.objectType),sampleRate:n(d.sampleRate),channelConfiguration:n(d.channelConfiguration),channels:n(d.channels),vuiPresent:d.status==='parsed'?d.vuiPresent===true:null,color:d.color?{fullRange:typeof d.color.fullRange==='boolean'?d.color.fullRange:null,primariesCode:n(d.color.primariesCode),transferCode:n(d.color.transferCode),matrixCode:n(d.color.matrixCode)}:null,aspectRatio:d.aspectRatio?{present:d.aspectRatio.present===true,idc:n(d.aspectRatio.idc),width:n(d.aspectRatio.width),height:n(d.aspectRatio.height)}:null};}))};}
async function classifyBounded({read,sniffMagic,size,signal,current=()=>{}}){
 const prefix=await read({start:0,end:Math.min(939,size-2)});let sparse=null,windows=null;
 try{current();const kind=sniffMagic(prefix).kind;
  const out={kind,classification:'unknown',reason:'UNKNOWN_SIGNATURE',tracks:null,image:null,metadataWindows:null};
  const part=async({start,end})=>{const a=Number(start),b=Number(end);if(b<prefix.length)return prefix.slice(a,b+1);if(a<prefix.length){const tail=await read({start:prefix.length,end:b}),x=new Uint8Array(b-a+1);x.set(prefix.subarray(a));x.set(tail,prefix.length-a);return x;}return read({start:a,end:b});};
  if(kind==='iso-bmff'){
   const scan=await scanIsoBmffTopLevel({size:String(size),signal,read:part,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();out.reason='ISO_HEADER_INCOMPLETE';
   if(scan.status==='complete'&&scan.observations.moov.length===1){windows=createMoovWindowCache({box:scan.observations.moov[0],fileSize:String(size),read:part,signal,checkCurrent:current});sparse=await readSparseMoov({box:scan.observations.moov[0],fileSize:String(size),read:windows.read,signal,checkCurrent:current});current();out.reason='ISO_SPARSE_INCOMPLETE';
    if(sparse.status==='complete'){out.tracks=safeIso(parseMoov(sparse.bytes));out.reason='ISO_PARSER_INCOMPLETE';if(out.tracks.status==='parsed'){out.reason='CODEC_METADATA_UNQUALIFIED';const descriptions=out.tracks.tracks.flatMap(t=>t.descriptions);if(descriptions.length&&descriptions.every(d=>d.codec!=='unknown'&&!d.encrypted)){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}}}
  }else if(['webm','matroska','ebml'].includes(kind)){out.tracks=await readEbmlTracks({read:part,size,prefix,signal});current();out.reason='EBML_TRACKS_INCOMPLETE';if(out.tracks.status==='parsed'){out.reason='CODEC_METADATA_UNQUALIFIED';if(out.tracks.tracks.every(t=>t.codec!=='unknown')){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}}
  else if(['png','jpeg','gif','webp','bmp'].includes(kind)){out.image=imageHeader(kind,prefix);if(kind==='jpeg'&&out.image.status!=='parsed'&&size>prefix.length+1){const bytes=await part({start:0,end:Math.min(size-2,65535)});try{out.image=imageHeader(kind,bytes);}finally{bytes.fill(0);}}out.reason='IMAGE_HEADER_INCOMPLETE';if(out.image.status==='parsed'){out.classification='image-header';out.reason='IMAGE_HEADER_METADATA';}}
  else if(kind==='mpeg-ts'){
   const width=Math.floor(Math.min(1024*1024,size-1)/188)*188;out.reason='TS_TRACK_CONFIG_UNQUALIFIED';
   if(width>=564){const bytes=await part({start:0,end:width-1});try{const parsed=probeMpegTs(bytes,{maxBytes:1024*1024,maxPackets:5577,maxResyncBytes:6016,maxSectionBytes:1024,maxSections:128,maxPrograms:16,maxStreamsPerProgram:16,maxTotalStreams:64,maxElementaryBytesPerStream:65536,maxIssues:64});current();out.tracks=safeTs(parsed);if(out.tracks.status==='parsed'&&out.tracks.tracks.length&&out.tracks.tracks.every(t=>t.configStatus==='parsed'&&t.codec!=='unknown')){out.classification='video-structural';out.reason='STRUCTURAL_METADATA';}}finally{bytes.fill(0);}}
  }
  else if(kind==='avi')out.reason='UNSUPPORTED_STRUCTURAL_PARSER';
  else if(kind==='error-payload')out.reason='ERROR_PAYLOAD';
  return out;
 }finally{sparse?.bytes?.fill(0);if(windows)windows.release();prefix.fill(0);}
}
function configurationKey(record){
 if(record.classification==='image-header')return JSON.stringify([record.kind,record.image]);
 if(record.classification!=='video-structural')return null;
 // Canonical observable config only. Codec-private bytes, HDR, VFR, decoder support remain unknown.
 return JSON.stringify([record.kind,record.tracks?.tracks,record.tracks?.fragmented??null,record.tracks?.docType??null]);
}

return {classifyBounded,configurationKey,imageHeader,safeIso,safeTs};})();
const probe=(()=>{const {runAuthenticatedRootInventory}=inventory;const {summarizeRepeatedInventory}=root;const {selectRiskRepresentatives}=selector;const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {summarizeInventoryDenominators}=denominators;const {collectHeaderCandidates,planHeaderCohort}=selection;const {readHeaderState,createHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE,EPOCH}=continuity;const {classifyBounded,configurationKey}=classification;
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const CAPS=Object.freeze({files:64,batchFiles:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
const fail=code=>Object.assign(new Error(code),{code});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fixed=e=>[...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','CONTINUITY_REJECTED','CONTINUITY_LIMIT','SOURCE_BINDING_REJECTED','RECOVERY_UNSAFE','CONTINUITY_CONTENT_CHANGED'].includes(e?.code)?e.code:'PROBE_FAILED';
const same=identitySame;
const fieldNames='id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)';
function bindingPinned(x){return x?.schema==='drive-original.corpus-header-source-binding/1'&&x.version==='1.22.0-rc.32'&&x.sourceCommit==='1d79897fd32c569137cab079bfd93107be2ee33f'&&['app.js','sw.js','version.json'].every(k=>/^[a-f0-9]{64}$/.test(x.sourceSHA256?.[k]??''));}
const immutableContent=x=>(validId(x?.headRevisionId)||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''))&&(x?.headRevisionId===null||validId(x?.headRevisionId))&&(x?.sha256Checksum===null||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''));
function createCorpusOwnerJob(runtime,dependencies={}){
  const binding=dependencies.binding,VERSION=binding?.version;const options=Object.freeze({...runtime?.options});let priorCapsule=runtime?.priorCapsule??null,priorRecords=null;
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory,select=dependencies.selector??selectRiskRepresentatives,compare=dependencies.compareInventory??summarizeRepeatedInventory;
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,prior=null,owner=null,promise=null,started=false,done=false,timer=null,activeFile=null;
  runtime=null;let candidates=null,cohort=null,accepted=[],history=new Map(),attempts=new Map(),epoch=null,capsule=null,runStarted=0,reserve=null;const failedIds=new Set(),now=dependencies.now??(()=>performance.now());
  const abort=new AbortController(),tasks=new Set();let cleanupFailure=null,currentFileProgress=null;
  const result={schema:'drive-original.bounded-corpus-header-summary/1',version:VERSION,epoch:EPOCH,scope:'video-mime-or-extension-image-union-bounded-structural-metadata',mode:options.phase==='revalidate-videos'?'recovery-qualification':'corpus-metadata',completeMeaning:'cohort-finished-with-reconciled-dispositions-only',wholeCorpusComplete:false,inventoryDenominators:[],batches:[],coverage:null,ownerDiagnostic:null,recoveryQualified:false,reserve:null,complete:false,phase:'not-started',failure:null,
    inventoryRuns:0,catalogStable:false,catalogComparison:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,plan:null,files:[],decoded:0,playback:0,physicalDevice:0,writeRequests:0,genericUpstreamCleanup:'unknown',released:false,metadataDiagnostic:{completed:0,failed:0,maxResponseBytes:0,routeCounts:{about:0,list:0,file:0},lastFailure:null,lastCleanupFailure:null}};
  const safe=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!abort.signal.aborted)abort.abort(fail(code));};
  const onHide=()=>stop('CANCELLED');
  const onAccountAbort=()=>{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{abortChanged:true};stop('OWNER_CHANGED');};
  const inspect=()=>{const s=live?.readState?.(),sw=live?.getSWIdentity?.(),controller=live?.navigator?.serviceWorker?.controller;
    if(!s||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.top!==live.self||live.location?.origin!==ORIGIN||live.navigator?.onLine!==true
      ||live.document?.visibilityState!=='visible'||sw?.controller!==controller||sw?.version!==VERSION||!bindingPinned(binding)||sw?.sourceCommit!==binding.sourceCommit||['app.js','sw.js','version.json'].some(k=>sw?.sourceSHA256?.[k]!==binding.sourceSHA256[k])||controller?.state!=='activated'||new URL(controller.scriptURL).origin!==ORIGIN||new URL(controller.scriptURL).pathname!=='/sw.js'
      ||!validId(s.accountId)||!s.authAccountKey||s.authStatus!=='online'||s.demo!==false||s.accountIdentityPending||!live.hasUsableToken()||!s.token
      ||!s.accountStateAbortController?.signal||s.accountStateAbortController.signal.aborted||live.getQ1RetirementResult()?.settled!==true||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||s.selected!==null||s.mediaAttempt!=='idle'||s.mediaAbortController!==null||s.pendingOriginalBuffer!==null||s.pendingPlay!==false||s.mediaTransportStarted!==false
      ||['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(k=>!Number.isSafeInteger(s[k])||s[k]<0)||!Number.isSafeInteger(live.getMediaSourceGeneration())
      ||new URL(controller.scriptURL).search||new URL(controller.scriptURL).hash)throw fail('RUNTIME_REJECTED');
    return {state:s,controller,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration(),href:live.location.href};};
  function current(){if(abort.signal.aborted)throw abort.signal.reason;let now;try{now=inspect();}catch{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{runtimeChanged:true};throw fail('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.retirement!==owner.retirement||now.source!==owner.source||now.href!==owner.href
      ||Object.entries(owner.values).some(([k,v])=>now.state[k]!==v)){result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{runtimeChanged:true};throw fail('OWNER_CHANGED');}return now.state;}
  const race=(value,signal)=>new Promise((resolve,reject)=>{let settled=false;const finish=(fn,v)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(v);},cancel=()=>finish(reject,signal.reason??fail('CANCELLED'));
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();Promise.resolve(value).then(v=>finish(resolve,v),e=>finish(reject,e));});
  async function drain(value){let t;try{await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{t=setTimeout(()=>reject(fail('CLEANUP_TIMEOUT')),2000);})]);}catch(e){cleanupFailure=e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailure);}finally{clearTimeout(t);}}
  function metadataFetch(urlValue,options={}){
    const task=metadata(urlValue,options).catch(e=>{if(['METADATA_LIMIT','CLEANUP_FAILED','CLEANUP_TIMEOUT'].includes(e?.code))stop(e.code);throw e;});tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
  }
  async function metadata(urlValue,options={}){
    current();const url=new URL(urlValue),headers=new Headers(options.headers??{});
    if(url.origin!=='https://www.googleapis.com'||!/^\/drive\/v3\/(about|files(?:\/[A-Za-z0-9_-]+)?)$/.test(url.pathname)||url.searchParams.has('alt')||(options.method&&options.method!=='GET')||options.body!==undefined||[...headers.keys()].some(x=>x!=='x-goog-drive-resource-keys'))throw fail('METADATA_FAILED');
    if(result.metadataRequests>=CAPS.metadataRequests)throw fail('METADATA_LIMIT');result.metadataRequests++;headers.set('Authorization',`Bearer ${owner.values.token}`);
    const responseLimit=Math.min(CAPS.metadataResponseBytes,options.responseLimitBytes??CAPS.metadataResponseBytes),requestMs=Math.min(25000,options.requestMs??25000);
    if(!Number.isSafeInteger(responseLimit)||responseLimit<1||!Number.isSafeInteger(requestMs)||requestMs<1)throw fail('METADATA_LIMIT');
    let abortSource=null,stage='dispatch',status=null;const diag={ordinal:result.metadataRequests,phase:result.phase,route:url.pathname.endsWith('/about')?'about':url.pathname.endsWith('/files')?'list':'file',responseLimitBytes:responseLimit,requestMs};result.metadataDiagnostic.routeCounts[diag.route]++;
    const errorKind=e=>['AbortError','TimeoutError','TypeError','SyntaxError','Error'].includes(e?.name)?e.name:'unknown';
    const child=new AbortController(),links=[abort.signal,owner.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])].map((s,index)=>{const f=()=>{if(abortSource===null)abortSource=['run','account','caller'][index];child.abort(s.reason);};s.addEventListener('abort',f,{once:true});if(s.aborted)f();return [s,f];}),deadline=setTimeout(()=>{abortSource='request-deadline';child.abort(fail('METADATA_FAILED'));},requestMs);
    let pending=null,response=null,reader=null,finished=false;const chunks=[];let bytes=0;
    try{
      pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,signal:child.signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}));stage='headers';response=await race(pending,child.signal);current();status=Number.isInteger(response?.status)?response.status:null;
      if(response?.status!==200||!response.body)throw fail('METADATA_FAILED');reader=response.body.getReader();stage='body';
      while(true){const x=await race(reader.read(),child.signal);current();if(x.done){finished=true;break;}if(!(x.value instanceof Uint8Array))throw fail('METADATA_FAILED');bytes+=x.value.length;result.metadataBytes+=x.value.length;
        if(bytes>responseLimit||result.metadataBytes>CAPS.metadataBytes)throw fail('METADATA_LIMIT');chunks.push(x.value);}
      const body=new Uint8Array(bytes);let p=0;for(const x of chunks){body.set(x,p);p+=x.length;}stage='decode-json';let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}finally{body.fill(0);}current();result.metadataDiagnostic.completed++;result.metadataDiagnostic.maxResponseBytes=Math.max(result.metadataDiagnostic.maxResponseBytes,bytes);return {ok:true,status:200,json:async()=>data};
    }catch(e){result.metadataDiagnostic.failed++;result.metadataDiagnostic.lastFailure={...diag,stage,status,receivedBytes:bytes,runReceivedBytes:result.metadataBytes,code:fixed(e),errorKind:errorKind(e),abortSource,childAborted:child.signal.aborted,bodyFinished:finished};throw e;}finally{
      clearTimeout(deadline);for(const [s,f] of links)s.removeEventListener('abort',f);child.abort(fail('CANCELLED'));
      try{
      if(!finished){const cleanupStage=reader?'reader-cancel':response?'response-body-cancel':pending?'late-response-cancel':'no-body';let nativeCleanupError='unknown';try{const cancellation=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();await drain(cancellation.catch(e=>{nativeCleanupError=errorKind(e);throw e;}));}catch(e){result.metadataDiagnostic.lastCleanupFailure={...diag,cleanupStage,nativeErrorKind:nativeCleanupError,code:e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED',originalTrigger:result.metadataDiagnostic.lastFailure?.ordinal===diag.ordinal?result.metadataDiagnostic.lastFailure.code:null,childAborted:child.signal.aborted};stop(cleanupFailure??'CLEANUP_FAILED');throw e;}}
      }finally{try{reader?.releaseLock();}catch{}for(const x of chunks)x.fill(0);chunks.length=0;}
    }
  }
  async function readInventory(){current();const r=await inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey});current();
    if(r?.report?.completeness?.repeatedPrivateInventoryMatched!==true||r.report.completeness.shortcutClassificationComplete!==true||r.report.completeness.containmentComplete!==true||!r.privatePasses?.secondPass)throw fail('INVENTORY_FAILED');result.inventoryRuns++;result.inventoryDenominators.push(summarizeInventoryDenominators(r.report));return r;}
  function canStart(extra=2){return reserve&&result.metadataRequests+extra+reserve.requests<=CAPS.metadataRequests&&result.metadataBytes+65536+reserve.bytes<=CAPS.metadataBytes&&now()-runStarted+CAPS.fileMs+reserve.ms<CAPS.runMs;}
  async function fresh(item,baseline=null,signal){
    current();const url=new URL('https://www.googleapis.com/drive/v3/files/'+item.id);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
    const value=await(await metadataFetch(url.href,{signal,responseLimitBytes:32768,requestMs:10000,headers:item.resourceKey?{'X-Goog-Drive-Resource-Keys':item.id+'/'+item.resourceKey}:{}})).json();current();
    const identity=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload}),content={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
    if(!same(identity,item.expected)||!immutableContent(content)||value.trashed!==false||(value.resourceKey!=null&&!validId(value.resourceKey))||(item.resourceKey&&value.resourceKey!==item.resourceKey)||(baseline&&(!same(identity,baseline.identity)||!contentSame(content,baseline.content))))throw fail('IDENTITY_MISMATCH');
    return {identity,content,key:value.resourceKey??null};
  }
  async function probeFile(item,index){
    current();if(attempts.has(item.id)||attempts.size>=CONTINUITY_LIMIT)throw fail('CONTINUITY_LIMIT');
    // Consume BEFORE asynchronous preflight/Range. Fatal owner changes cannot erase this entry.
    const attempt={identity:{...item.expected},content:null,count:1,failure:'UNSETTLED_ATTEMPT',ownerQualified:false};attempts.set(item.id,attempt);
    let baseline=null,resourceKey=item.resourceKey;const budget=createBatchBudget(CAPS.mediaBytes);currentFileProgress={requests:0,budget};
    const output={sample:'sample-'+(index+1),kind:'unknown',classification:'unknown',reason:'UNSETTLED_ATTEMPT',complete:false,failure:null,identityPreflight:false,identityPostflight:false,mediaRequests:0,mediaBytes:0,tracks:null,image:null};
    const job=runBoundedProbe({expectedIdentity:item.expected,generation:owner.values.driveSessionGeneration,signal:abort.signal,batchBudget:budget,
      isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:64,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},
      getIdentity:async({phase,signal})=>{const value=await fresh(item,baseline,signal);if(phase==='preflight'){baseline=value;resourceKey=value.key;attempt.content={...value.content};}else if(value.key!==resourceKey)throw fail('IDENTITY_MISMATCH');return value.identity;},
      readRange:({range,start,end,signal})=>{current();if(start===0&&end===Number(item.expected.size)-1)throw fail('INVALID_RANGE');const url=new URL('/__drive_media/'+item.id,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',item.expected.size);if(resourceKey)url.searchParams.set('resourceKey',resourceKey);currentFileProgress.requests++;return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});},
      probe:async(args)=>{const value=await classifyBounded({...args,size:Number(item.expected.size),current});Object.assign(output,value);return {code:value.reason==='ERROR_PAYLOAD'?'ERROR_PAYLOAD':'METADATA_OBSERVATION'};}});
    activeFile=job;let checked;
    try{checked=await job;}finally{activeFile=null;currentFileProgress=null;attempt.failure='UNSETTLED_ATTEMPT';}
    Object.assign(output,{identityPreflight:checked.identity.preflight,identityPostflight:checked.identity.postflight,mediaRequests:checked.metrics.requests,mediaBytes:budget.receivedBytes});result.mediaRequests+=output.mediaRequests;result.mediaBytes+=output.mediaBytes;
    output.failure=checked.ok?(checked.evidence.code==='ERROR_PAYLOAD'?'ERROR_PAYLOAD':null):checked.failure.code;output.complete=checked.ok&&output.failure===null;attempt.failure=output.failure;
    // Retained outcome is provisional until the complete post-catalog fence passes.
    const parserDeferred=['FILE_BYTE_LIMIT','FILE_REQUEST_LIMIT','BATCH_BYTE_LIMIT','REQUEST_BYTE_LIMIT','FILE_TIMEOUT','HEADER_TIMEOUT','BODY_TIMEOUT'].includes(output.failure)&&output.identityPreflight&&output.identityPostflight;
    if(parserDeferred){output.classification='unknown';output.reason='PARSER_BUDGET_OR_DEADLINE_DEFERRED';output.deferred=true;}
    if(output.complete||parserDeferred)history.set(item.id,{identity:{...item.expected},content:{...baseline.content},kind:output.kind,classification:output.classification,reason:output.reason,tracks:output.tracks,image:output.image,deferred:parserDeferred,evidenceEpoch:epoch,catalogValidated:false});
    result.files.push(output);
    current();if(cleanupFailure)throw fail(cleanupFailure);
    const terminal=new Set(['GENERATION_STALE','IDENTITY_MISMATCH','POSTFLIGHT_DRIFT','CLEANUP_FAILED','CLEANUP_TIMEOUT','METADATA_LIMIT','OWNER_CHANGED']);
    if(terminal.has(output.failure))throw fail(output.failure);return output;
  }
  function coverage(){
    const pool=cohort?.pool??candidates?.filter(x=>x.videoCandidate||x.imageCandidate)??[],ids=new Set(history.keys());
    const records=pool.map(x=>history.get(x.id)).filter(Boolean),validated=records.filter(x=>x.catalogValidated);
    const classified=validated.filter(x=>x.classification!=='unknown').length,unknown=validated.filter(x=>x.classification==='unknown').length;
    const failed=pool.filter(x=>!x.ineligible&&attempts.has(x.id)&&!ids.has(x.id)).length,quarantined=records.filter(x=>!x.catalogValidated).length;
    const ineligible=pool.filter(x=>x.ineligible).length,unattempted=pool.filter(x=>!x.ineligible&&!ids.has(x.id)&&!attempts.has(x.id)).length;
    const config=new Map();for(const row of validated){const key=configurationKey(row);if(key&&!config.has(key))config.set(key,{sample:'configuration-'+(config.size+1),kind:row.kind,classification:row.classification,tracks:row.tracks,image:row.image});}
    return {denominator:pool.length,denominatorQualified:candidates!==null,videoMimeOrExtensionUnion:pool.filter(x=>x.videoCandidate).length,imageMimeOrExtensionUnion:pool.filter(x=>x.imageCandidate).length,classified,unknown,failed,quarantined,quarantinedConsumedAttempts:[...attempts.values()].filter(a=>!a.ownerQualified).length,ineligible,unattempted,deferred:validated.filter(x=>x.deferred).length,queuedFresh:unattempted,queuedRetries:0,maxFreshAttemptsPerFile:1,ledgerEntries:attempts.size,ledgerLimit:CONTINUITY_LIMIT,historicalCrossEpochAttempts:'UNKNOWN',historicalResultsImported:false,deeperMetadataProbed:validated.filter(x=>x.classification==='video-structural').length,imageHeadersProbed:validated.filter(x=>x.classification==='image-header').length,configurationRepresentatives:[...config.values()],dispositionsComplete:unattempted===0,wholeCorpusComplete:false,structuralClassificationComplete:unattempted===0&&failed===0&&unknown===0&&quarantined===0&&ineligible===0};
  }
  async function execute(){let first=null,last=null;try{
    if(!bindingPinned(binding))throw fail('SOURCE_BINDING_REJECTED');
    if(!['videos','revalidate-videos'].includes(options.phase)||!Number.isSafeInteger(options.maxFiles)||options.maxFiles<1||options.maxFiles>64)throw fail('RUNTIME_REJECTED');
    const before=inspect();owner={...before,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,before.state[k]]))};
    if(!context||!validId(context.rootId)||!validId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fail('RUNTIME_REJECTED');
    context.authAccountKey=owner.values.authAccountKey;epoch=EPOCH;current();const saved=readHeaderState(priorCapsule,context,binding);attempts=new Map(saved.attempts.map(a=>[a.identity.fileId,a]));history=new Map(saved.records.map(r=>[r.identity.fileId,r]));priorCapsule=null;
    runStarted=now();timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
    result.phase='inventory-before';first=await readInventory();const priority=first.privatePasses.secondPass.items.find(x=>x.id===context.priorityFileId);if(!priority?.version)throw fail('SELECTION_FAILED');context.priorityVersion=String(priority.version);
    reserve={requests:Math.min(CAPS.metadataRequests,Math.ceil(result.metadataRequests*1.25)+4),bytes:Math.min(CAPS.metadataBytes,Math.ceil(result.metadataBytes*1.25)+65536),ms:Math.max(30000,Math.ceil((now()-runStarted)*1.25))};result.reserve={...reserve,guaranteed:false};
    result.phase='selection';const selected=select({pass:first.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});candidates=collectHeaderCandidates(first.privatePasses.secondPass,selected,context.authAccountKey);const byId=new Map(candidates.map(x=>[x.id,x]));
    for(const a of attempts.values()){const item=byId.get(a.identity.fileId);if(!item||item.ineligible||!same(a.identity,item.expected))throw fail('CONTINUITY_CONTENT_CHANGED');}
    const recovery=options.phase==='revalidate-videos';cohort=planHeaderCohort(candidates,{phase:'videos',maxFiles:options.maxFiles,covered:new Set(history.keys()),attempts});result.plan=cohort.summary;
    if(recovery){
      // A recovery requalifies EVERY consumed attempt, including failed ones. A missing immutable baseline is unsafe.
      if(!Number.isSafeInteger(options.recoveryCycle)||options.recoveryCycle<1||[...attempts.values()].some(a=>!immutableContent(a.content)))throw fail('RECOVERY_UNSAFE');
      for(const row of history.values())row.catalogValidated=false;
      const checkRows=[...attempts.values()].filter(a=>a.recoveryStamp!==options.recoveryCycle).slice(0,options.maxFiles);
      result.phase='recovery-strong-metadata';for(const a of checkRows){if(!canStart(1))throw fail('RECOVERY_UNSAFE');await fresh(byId.get(a.identity.fileId),a);a.recoveryStamp=options.recoveryCycle;}
    }else{
      if([...history.values()].some(r=>!r.catalogValidated))throw fail('RECOVERY_UNSAFE');
      result.phase='structural-and-image-headers';let slot=0;
      for(let offset=0;offset<cohort.plan.length;offset+=8){const batch={ordinal:result.batches.length+1,planned:Math.min(8,cohort.plan.length-offset),attempted:0};result.batches.push(batch);for(const item of cohort.plan.slice(offset,offset+8)){if(!canStart())break;await probeFile(item,slot++);batch.attempted++;}if(batch.attempted<batch.planned)break;}
    }
    result.phase='inventory-after';last=await readInventory();try{compare({firstPass:first.privatePasses.secondPass,secondPass:last.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}catch{throw fail('CATALOG_DRIFT');}
    current();result.catalogStable=true;for(const a of attempts.values())a.ownerQualified=!recovery||a.recoveryStamp===options.recoveryCycle;for(const row of history.values())row.catalogValidated=!recovery||attempts.get(row.identity.fileId)?.recoveryStamp===options.recoveryCycle;result.recoveryQualified=recovery&&[...attempts.values()].every(a=>a.recoveryStamp===options.recoveryCycle);result.recoveryRemaining=recovery?[...attempts.values()].filter(a=>a.recoveryStamp!==options.recoveryCycle).length:0;result.complete=true;result.phase='done';
  }catch(e){result.failure=fixed(abort.signal.aborted?abort.signal.reason:e);result.complete=false;result.phase='failed';}
  finally{
    stop(result.failure??'CANCELLED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);owner?.values.accountStateAbortController.signal.removeEventListener('abort',onAccountAbort);
    if(tasks.size)try{await drain(Promise.allSettled([...tasks]));}catch{}if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;}
    if(!result.complete){for(const row of history.values())row.catalogValidated=false;for(const a of attempts.values())a.ownerQualified=false;}
    result.coverage=coverage();
    // Fatal summaries retain the SAME opaque state, never a safe JSON reconstruction.
    if(context?.authAccountKey)try{capsule=createHeaderContinuity(context,binding,[...history.values()],[...attempts.values()]);}catch{result.failure='CONTINUITY_LIMIT';result.complete=false;}
    first=null;last=null;candidates=null;cohort=null;accepted=[];history.clear();attempts.clear();context=null;owner=null;live=null;activeFile=null;result.released=true;done=true;
  }return safe();}
  return Object.freeze({run(){if(!started){started=true;promise=execute();}return promise;},cancel(){
    // Runner cancellation can win before current() inspects the drift. Capture the owned Boolean witness first.
    try{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??result.ownerDiagnostic;}catch{}
    stop('CANCELLED');return {cancelled:true};
  },continuity(){return done?capsule:null;},poll(){return {started,done,phase:result.phase,metadataRequests:result.metadataRequests,metadataBytes:result.metadataBytes,mediaRequests:result.mediaRequests+(currentFileProgress?.requests??0),mediaBytes:result.mediaBytes+(currentFileProgress?.budget.receivedBytes??0),processed:result.files.length,summary:done?safe():null};}});
}

return {createCorpusOwnerJob,bindingPinned};})();
const create=runtime=>probe.createCorpusOwnerJob(runtime,{binding:__BINDING__});create.clearContinuity=continuity.clearHeaderContinuity;return (function (createJob, facade, binding) {
 'use strict';
 let allocated=false;
 return function installCorpusOwnerEpoch(privateContextText, proof, epochName) {
  const expectedEpoch='rc32-bounded-container-config-image-owner-epoch-20261001-1';
  if(allocated)throw Error('EPOCH_ALREADY_ALLOCATED_NO_RESET');
  if(epochName!==expectedEpoch||binding.sourceCommit!=='1d79897fd32c569137cab079bfd93107be2ee33f'||binding.version!=='1.22.0-rc.32'||typeof privateContextText!=='string')throw Error('EXPLICIT_NEW_EPOCH_REQUIRED');
  const parsed=JSON.parse(privateContextText);if(Object.keys(parsed).sort().join(',')!=='accountKey,generation,priorityFileId,rootId')throw Error('EPOCH_CONTEXT');
  const capture=()=>({controller:navigator.serviceWorker.controller,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,abort:state.accountStateAbortController,writer:state.accountStateWriterId,revision:state.accountStateRevision,source:mediaSourceGeneration,media:state.mediaSession,playback:state.playbackSession,retirement:q1RetirementResult,href:location.href,projection:JSON.parse(JSON.stringify(state.accountMediaState))});
  const fields=['controller','account','key','auth','drive','token','tokenRevision','expiry','abort','writer','revision','source','media','playback','retirement','href'];
  const stableFields=['controller','account','key','drive','writer','source','href'];
  const same=(a,b,keys=fields)=>a&&b&&keys.every(k=>a[k]===b[k]);
  const fullSame=(a,b)=>same(a,b)&&accountMediaStatesEqual(a.projection,b.projection)&&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null;
  const sourceOK=()=>{const p=proof?.get?.();return APP_VERSION===binding.version&&p?.version===binding.version&&p.sourceCommit===binding.sourceCommit&&p.controller===navigator.serviceWorker.controller&&p.controller?.state==='activated'&&['app.js','sw.js','version.json'].every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256[k]);};
  let anchor=capture(),capsule=null,active=null,timer=null,burst=null,stopped=null,disposed=false,needsRecovery=false,recoveryCycle=0;
  if(!sourceOK()||parsed.accountKey!==anchor.account||parsed.generation!==anchor.drive)throw Error('EPOCH_SOURCE_OWNER_REJECTED');
  allocated=true;
  const jobs=[];
  const progress=()=>{
   if(!active)return null;const p=active.poll();
   const phases=new Set(['not-started','rejected','inventory-before','selection','recovery-strong-metadata','structural-and-image-headers','inventory-after','done','failed']);
   return {started:p.started===true,done:p.done===true,phase:phases.has(p.phase)?p.phase:'unknown',...Object.fromEntries(['metadataRequests','metadataBytes','mediaRequests','mediaBytes','processed'].map(k=>[k,Number.isSafeInteger(p[k])&&p[k]>=0?p[k]:null]))};
  };
  const read=()=>JSON.parse(JSON.stringify({schema:'drive-original.rc32-corpus-owner-epoch/1',epoch:expectedEpoch,sourceCommit:binding.sourceCommit,version:binding.version,active:Boolean(active),progress:progress(),disposed,stopped,needsRecovery,maxFreshAttemptsPerFile:1,historicalCrossEpochAttempts:'UNKNOWN',historicalResultsImported:false,privateRegistryExported:false,actualPlaybackCount:0,wholeCorpusComplete:false,burst,jobs}));
  function stop(code){if(!stopped)stopped=code;active?.cancel();if(burst)burst.done=!active;}
  function wake(){if(timer!==null)clearTimeout(timer);timer=setTimeout(tick,100);}
  function launch(){
   if(!burst||burst.done||active||stopped)return;
   if(Date.now()>=burst.deadline){stop('BURST_DEADLINE');return;}
   if(!sourceOK()){stop('SOURCE_CHANGED_TERMINAL');return;}
   if(!fullSame(anchor,capture())){needsRecovery=true;stop('OWNER_CHANGED');return;}
   if(burst.started>=burst.maxJobs){burst.done=true;return;}
   const options={phase:burst.recovery?'revalidate-videos':'videos',maxFiles:64,...(burst.recovery?{recoveryCycle}:{})};
   try{active=facade.call(runtime=>createJob(runtime),privateContextText,proof,capsule,options);}catch{stop('FACTORY_THROW_TERMINAL');return;}
   burst.started++;wake();
  }
  function tick(){
   timer=null;if(!active)return;
   if(!sourceOK())stop('SOURCE_CHANGED_TERMINAL');else if(!fullSame(anchor,capture())){needsRecovery=true;stop('OWNER_CHANGED');}
   if(Date.now()>=burst.deadline)stop('BURST_DEADLINE');
   let p;try{p=active.poll();}catch{stop('POLL_FAILED_TERMINAL');wake();return;}
   if(!p.done){wake();return;}
   const s=p.summary;jobs.push({ordinal:jobs.length+1,recovery:burst.recovery,summary:s});
   const next=active.continuity?.();if(next){if(capsule)createJob.clearContinuity(capsule);capsule=next;}active=null;
   const valid=s?.released===true&&s.writeRequests===0&&s.metadataRequests<=512&&s.metadataBytes<=67108864&&s.mediaRequests<=4096&&s.mediaBytes<=64*(2*1024*1024+8192)&&s.files?.length<=64&&s.coverage?.maxFreshAttemptsPerFile===1&&s.coverage?.ledgerEntries<=16384;
   if(!valid||!next){stop('JOB_CONTRACT_TERMINAL');return;}
   if(!s.complete||!s.catalogStable||s.failure){needsRecovery=true;if(['OWNER_CHANGED','GENERATION_STALE'].includes(s.failure))stop('OWNER_CHANGED');else stop('JOB_FAILURE_TERMINAL');return;}
   if(burst.recovery){needsRecovery=!s.recoveryQualified;if(s.recoveryQualified){stopped=null;burst.done=true;return;}}
   else if(s.coverage.queuedFresh===0){burst.done=true;return;}
   if(stopped||burst.started>=burst.maxJobs){burst.done=true;return;}launch();
  }
  function options(value,recovery){
   if(disposed||active||burst&&!burst.done)throw Error('EPOCH_ACTIVE_OR_DISPOSED');
   if(!value||Object.keys(value).some(k=>!['maxJobs','deadlineMs','stopBeforeAt'].includes(k))||!Number.isSafeInteger(value.maxJobs)||value.maxJobs<1||value.maxJobs>8||!Number.isSafeInteger(value.deadlineMs)||value.deadlineMs<1||value.deadlineMs>4800000||!Number.isSafeInteger(value.stopBeforeAt)||value.stopBeforeAt<=Date.now())throw Error('BURST_OPTIONS');
   burst={started:0,maxJobs:value.maxJobs,deadline:Math.min(Date.now()+value.deadlineMs,value.stopBeforeAt),done:false,recovery};
  }
  return Object.freeze({
   start(value){if(stopped||needsRecovery)throw Error('EXPLICIT_RECOVERY_REQUIRED');options(value,false);launch();return read();},
   recover(value){
    if(!needsRecovery||!capsule||stopped&&!['OWNER_CHANGED'].includes(stopped))throw Error('RECOVERY_UNSAFE_TERMINAL');
    const fresh=capture();if(!sourceOK()||!same(anchor,fresh,stableFields)||fresh.abort?.signal.aborted)throw Error('RECOVERY_STABLE_IDENTITY_REJECTED');
    // Each new failed owner transition starts fresh strong qualification. An unfinished stable recovery burst continues its stamp.
    if(stopped){recoveryCycle++;anchor=fresh;}else if(!fullSame(anchor,fresh))throw Error('RECOVERY_OWNER_CHANGED');
    stopped=null;options(value,true);launch();return read();
   },
   read,
   pause(){stop('ROOT_PAUSE_CANCEL');return read();},
   cancel(){stop('ROOT_PAUSE_CANCEL');return read();},
   cleanup(){if(active){stop('ROOT_CLEANUP');return read();}if(timer!==null)clearTimeout(timer);if(capsule)createJob.clearContinuity(capsule);capsule=null;privateContextText=null;proof=null;anchor=null;disposed=true;return read();}
  });
 };
})(create,(function (privateContextText,swProof,priorCapsule,options) {
  'use strict';
  if(priorCapsule===undefined)priorCapsule=null;
  if(options===undefined)options={phase:'representatives',maxFiles:8};
  const rejected=()=>Object.freeze({poll:()=>({started:false,done:true,phase:'rejected',summary:{schema:'drive-original.rc16-corpus-tracks-summary/1',complete:false,failure:'FACADE_PREFLIGHT_REJECTED',mediaRequests:0,writeRequests:0}}),cancel:()=>({cancelled:true})});
  let context,prior,projection,owner,job,settled=false;
  try {
    if(!options||Object.keys(options).some(k=>!['phase','maxFiles','recoveryCycle'].includes(k))||!['representatives','videos','revalidate-representatives','revalidate-videos'].includes(options.phase)||!Number.isSafeInteger(options.maxFiles)||options.maxFiles<1||options.maxFiles>64||typeof privateContextText!=='string'||privateContextText.length>4096)return rejected();
    context=JSON.parse(privateContextText);
    if(!context||Array.isArray(context)||Object.keys(context).sort().join(',')!=='accountKey,generation,priorityFileId,rootId'
      ||!['accountKey','priorityFileId','rootId'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(context[k]))||!Number.isSafeInteger(context.generation)||context.generation<0)return rejected();
    privateContextText=null;
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,
      abort:state.accountStateAbortController,controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      media:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION===__BINDING__.version&&DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true
    &&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive
    &&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.expiresAt===owner.expiry&&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'&&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version===__BINDING__.version
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
      getOwnerDiagnostics:()=>({accountChanged:state.accountId!==owner.account,accountKeyChanged:state.authAccountKey!==owner.key,authGenerationChanged:state.authGeneration!==owner.auth,driveGenerationChanged:state.driveSessionGeneration!==owner.drive,tokenChanged:state.token!==owner.token,tokenRevisionChanged:state.tokenRevision!==owner.tokenRevision,expiryChanged:state.expiresAt!==owner.expiry,abortChanged:state.accountStateAbortController!==owner.abort||Boolean(owner.abort?.signal.aborted),controllerChanged:navigator.serviceWorker.controller!==owner.controller,writerChanged:state.accountStateWriterId!==owner.writer,revisionChanged:state.accountStateRevision!==owner.revision,projectionChanged:!accountMediaStatesEqual(state.accountMediaState,projection),syncPromiseActive:state.accountStateSyncPromise!==null,syncTimerActive:state.accountStateSyncTimer!==null,syncRetryActive:state.accountStateSyncRetryTimer!==null,syncErrorPresent:state.accountStateSyncError!==null,sourceChanged:mediaSourceGeneration!==owner.source,mediaChanged:state.mediaSession!==owner.media,playbackChanged:state.playbackSession!==owner.playback,retirementChanged:q1RetirementResult!==owner.retirement,visibilityChanged:document.visibilityState!=='visible',onlineChanged:navigator.onLine!==true}),getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,navigator,location,document,top,self,privateContext:context,priorCapsule,options,
      nativeFetch:(...args)=>{read();return fetch(...args);},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)});
    job.run().then(()=>{settled=true;context=null;prior=null;priorCapsule=null;options=null;projection=null;owner=null;swProof=null;},()=>{settled=true;context=null;prior=null;projection=null;owner=null;swProof=null;});
  }catch{return rejected();}
  return Object.freeze({poll:()=>({...job.poll(),done:settled&&job.poll().done}),cancel:()=>job.cancel(),continuity:()=>settled?job.continuity():null});
}),__BINDING__);})()
