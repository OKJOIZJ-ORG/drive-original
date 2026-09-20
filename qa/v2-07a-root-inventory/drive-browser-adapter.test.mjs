import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthenticatedDriveReaders,
  runAuthenticatedRootInventory
} from './drive-browser-adapter.mjs';
import { FOLDER_MIME } from './root-inventory.mjs';

const ROOT_ID = 'root_adapter_fixture';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return structuredClone(body); }
  };
}

function root(overrides = {}) {
  return {
    id: ROOT_ID,
    mimeType: FOLDER_MIME,
    version: '1',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    trashed: false,
    capabilities: { canListChildren: true },
    ...overrides
  };
}

test('builds metadata-only account, root, list and shortcut-target requests', async () => {
  const calls = [];
  const driveFetch = async (url, options = {}) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/about')) return response({ user: { permissionId: 'account' } });
    if (parsed.pathname.endsWith(`/files/${ROOT_ID}`)) return response(root());
    if (parsed.pathname.endsWith('/files')) return response({ files: [], nextPageToken: null });
    return response({
      id: 'target_fixture',
      mimeType: 'video/mp4',
      trashed: false,
      parents: ['outside']
    });
  };
  const readers = createAuthenticatedDriveReaders({ driveFetch });
  assert.equal(await readers.readAccountKey(), 'account');
  await readers.readRootMetadata(ROOT_ID);
  await readers.listFolderPage({ folderId: ROOT_ID, pageToken: 'PAGE_TOKEN_SENTINEL' });
  await readers.readFileMetadata({
    fileId: 'target_fixture',
    resourceKey: 'RESOURCE_KEY_SENTINEL'
  });

  const urls = calls.map(({ url }) => new URL(url));
  assert.equal(urls[0].searchParams.get('fields'), 'user(permissionId)');
  assert.equal(urls[1].searchParams.get('supportsAllDrives'), 'true');
  assert.equal(urls[2].searchParams.get('pageSize'), '1000');
  assert.equal(urls[2].searchParams.get('pageToken'), 'PAGE_TOKEN_SENTINEL');
  assert.equal(urls[2].searchParams.get('corpora'), 'user');
  assert.equal(urls[2].searchParams.get('q'), `'${ROOT_ID}' in parents and trashed=false`);
  assert.match(urls[2].searchParams.get('fields'), /^nextPageToken,incompleteSearch,files\(/);
  assert.equal(
    calls[3].options.headers['X-Goog-Drive-Resource-Keys'],
    'target_fixture/RESOURCE_KEY_SENTINEL'
  );
  const serializedRequests = JSON.stringify(calls);
  assert.doesNotMatch(serializedRequests, /alt=media|thumbnailLink|webContentLink|\/download|\/export|md5Checksum|sha1Checksum|sha256Checksum/i);
  assert.equal(calls.every(({ options }) => options.body === undefined), true);
});

test('uses shared-drive corpus only after the canonical root establishes driveId', async () => {
  const calls = [];
  const driveFetch = async (url, options = {}) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(`/files/${ROOT_ID}`)) {
      return response(root({ driveId: 'shared_drive_fixture' }));
    }
    return response({ files: [] });
  };
  const readers = createAuthenticatedDriveReaders({ driveFetch });
  await readers.readRootMetadata(ROOT_ID);
  await readers.listFolderPage({ folderId: ROOT_ID, pageToken: null });
  const listUrl = new URL(calls[1].url);
  assert.equal(listUrl.searchParams.get('corpora'), 'drive');
  assert.equal(listUrl.searchParams.get('driveId'), 'shared_drive_fixture');
});

test('maps a rejected non-initial page token to the full-pass restart signal', async () => {
  const driveFetch = async () => response({}, 400);
  const readers = createAuthenticatedDriveReaders({ driveFetch });
  await assert.rejects(
    readers.listFolderPage({ folderId: ROOT_ID, pageToken: 'expired' }),
    (error) => error.code === 'PAGE_TOKEN_REJECTED'
  );
  await assert.rejects(
    readers.listFolderPage({ folderId: ROOT_ID, pageToken: null }),
    (error) => error.code !== 'PAGE_TOKEN_REJECTED'
  );
});

test('runs two fenced passes and returns private rows separately from the redacted report', async () => {
  let now = 100;
  const priorityFileId = 'priority_fixture';
  const driveFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/about')) return response({ user: { permissionId: 'account' } });
    if (parsed.pathname.endsWith(`/files/${ROOT_ID}`)) return response(root());
    if (parsed.pathname.endsWith(`/files/${priorityFileId}`)) {
      return response({
        id: priorityFileId,
        name: 'private-priority.mp4',
        mimeType: 'video/mp4',
        size: '1',
        version: '1',
        modifiedTime: '2026-09-20T00:00:00.000Z',
        parents: [ROOT_ID],
        trashed: false,
        capabilities: { canDownload: true, canReadRevisions: true }
      });
    }
    if (parsed.pathname.endsWith('/files')) {
      return response({
        files: [{
          id: priorityFileId,
          name: 'private-priority.mp4',
          mimeType: 'video/mp4',
          fullFileExtension: 'mp4',
          size: '1',
          version: '1',
          modifiedTime: '2026-09-20T00:00:00.000Z',
          parents: [ROOT_ID],
          trashed: false,
          capabilities: { canDownload: true, canReadRevisions: true }
        }],
        nextPageToken: null
      });
    }
    throw new Error('unexpected request');
  };
  const result = await runAuthenticatedRootInventory({
    driveFetch,
    rootId: ROOT_ID,
    priorityFileId,
    expectedAccountKey: 'account',
    now: () => (now += 25)
  });
  assert.equal(result.report.completeness.repeatedPassCount, 2);
  assert.equal(result.report.completeness.repeatedPrivateInventoryMatched, true);
  assert.equal(result.report.limitations.fileBodiesRead, false);
  assert.equal(result.report.risk.prioritySampleCount, 1);
  assert.equal(result.report.completeness.containmentComplete, true);
  assert.equal(result.privatePasses.firstPass.accountAfter, 'account');
  assert.equal(JSON.stringify(result.report).includes('account'), true);
  assert.equal(JSON.stringify(result.report).includes('permissionId'), false);
});

test('fails when priority preflight succeeds but both containment passes omit the anchor', async () => {
  const priorityFileId = 'priority_fixture';
  const driveFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/about')) return response({ user: { permissionId: 'account' } });
    if (parsed.pathname.endsWith(`/files/${ROOT_ID}`)) return response(root());
    if (parsed.pathname.endsWith(`/files/${priorityFileId}`)) {
      return response({
        id: priorityFileId,
        mimeType: 'video/mp4',
        parents: [ROOT_ID],
        trashed: false
      });
    }
    if (parsed.pathname.endsWith('/files')) return response({ files: [], nextPageToken: null });
    throw new Error('unexpected request');
  };
  await assert.rejects(
    runAuthenticatedRootInventory({
      driveFetch,
      rootId: ROOT_ID,
      priorityFileId,
      expectedAccountKey: 'account'
    }),
    (error) => error.code === 'PRIORITY_ANCHOR_MISSING'
  );
});

test('fails provenance before listing for a missing priority ID or another account', async () => {
  const calls = [];
  const driveFetch = async (url) => {
    calls.push(url);
    return response({ user: { permissionId: 'current_account' } });
  };
  await assert.rejects(
    runAuthenticatedRootInventory({
      driveFetch,
      rootId: ROOT_ID,
      priorityFileId: '',
      expectedAccountKey: 'current_account'
    }),
    /provenance is required/
  );
  assert.equal(calls.length, 0);

  await assert.rejects(
    runAuthenticatedRootInventory({
      driveFetch,
      rootId: ROOT_ID,
      priorityFileId: 'priority_fixture',
      expectedAccountKey: 'captured_other_account'
    }),
    /does not match the private priority capture/
  );
  assert.equal(calls.some((url) => new URL(url).pathname.endsWith('/files')), false);
});

test('fails provenance before listing when the supplied root is not a priority parent', async () => {
  const calls = [];
  const priorityFileId = 'priority_fixture';
  const driveFetch = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/about')) return response({ user: { permissionId: 'account' } });
    if (parsed.pathname.endsWith(`/files/${priorityFileId}`)) {
      return response({
        id: priorityFileId,
        mimeType: 'video/mp4',
        parents: ['different_parent'],
        trashed: false
      });
    }
    return response({ files: [] });
  };
  await assert.rejects(
    runAuthenticatedRootInventory({
      driveFetch,
      rootId: ROOT_ID,
      priorityFileId,
      expectedAccountKey: 'account'
    }),
    /not a current parent/
  );
  assert.equal(calls.some((url) => new URL(url).pathname.endsWith('/files')), false);
});
