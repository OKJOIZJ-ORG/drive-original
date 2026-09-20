import {
  collectInventoryPassWithRestart,
  summarizeRepeatedInventory
} from './root-inventory.mjs';

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

export function createAuthenticatedDriveReaders({ driveFetch }) {
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

export async function runAuthenticatedRootInventory({
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
