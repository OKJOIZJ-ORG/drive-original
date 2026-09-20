import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  collectInventoryPass,
  collectInventoryPassWithRestart,
  FOLDER_MIME,
  RootInventoryError,
  SHORTCUT_MIME,
  summarizeRepeatedInventory
} from './root-inventory.mjs';

const ROOT_ID = 'root_fixture';
const ACCOUNT_KEY = 'account_fixture';

function rootMetadata(overrides = {}) {
  return {
    id: ROOT_ID,
    mimeType: FOLDER_MIME,
    version: '7',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    trashed: false,
    capabilities: { canListChildren: true },
    ...overrides
  };
}

function file(id, parent = ROOT_ID, overrides = {}) {
  return {
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    fullFileExtension: 'mp4',
    size: '1024',
    version: '3',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    parents: [parent],
    trashed: false,
    capabilities: {
      canDownload: true,
      canReadRevisions: true,
      canCopy: true
    },
    videoMediaMetadata: { durationMillis: '60000', width: 1920, height: 1080 },
    ...overrides
  };
}

function folder(id, parent = ROOT_ID, overrides = {}) {
  return file(id, parent, {
    name: id,
    mimeType: FOLDER_MIME,
    fullFileExtension: undefined,
    size: undefined,
    videoMediaMetadata: undefined,
    capabilities: { canListChildren: true },
    ...overrides
  });
}

function shortcut(id, targetId, parent = ROOT_ID, overrides = {}) {
  return file(id, parent, {
    name: `${id}.shortcut`,
    mimeType: SHORTCUT_MIME,
    fullFileExtension: undefined,
    size: undefined,
    videoMediaMetadata: undefined,
    shortcutDetails: {
      targetId,
      targetMimeType: 'video/mp4',
      targetResourceKey: 'RESOURCE_KEY_SENTINEL'
    },
    ...overrides
  });
}

function readers({
  pages = new Map([[`${ROOT_ID}|`, { files: [], nextPageToken: null }]]),
  root = rootMetadata(),
  accounts = [ACCOUNT_KEY, ACCOUNT_KEY],
  targets = new Map()
} = {}) {
  let accountIndex = 0;
  const calls = { pages: [], targets: [], roots: [] };
  return {
    calls,
    rootId: ROOT_ID,
    expectedAccountKey: ACCOUNT_KEY,
    readAccountKey: async () => accounts[Math.min(accountIndex++, accounts.length - 1)],
    readRootMetadata: async (rootId) => {
      calls.roots.push(rootId);
      return structuredClone(root);
    },
    listFolderPage: async ({ folderId, pageToken }) => {
      calls.pages.push({ folderId, pageToken });
      const key = `${folderId}|${pageToken || ''}`;
      if (!pages.has(key)) throw new Error(`unexpected page fixture: ${key}`);
      return structuredClone(pages.get(key));
    },
    readFileMetadata: async ({ fileId, resourceKey }) => {
      calls.targets.push({ fileId, resourceKey });
      if (!targets.has(fileId)) throw Object.assign(new Error('not found'), { code: 404 });
      return structuredClone(targets.get(fileId));
    }
  };
}

function privatePass(items, shortcutTargets = [], overrides = {}) {
  return {
    accountBefore: ACCOUNT_KEY,
    accountAfter: ACCOUNT_KEY,
    rootBefore: rootMetadata(),
    rootAfter: rootMetadata(),
    items,
    shortcutTargets,
    pageCount: 1,
    traversedFolderCount: 1,
    duplicateReferenceCount: 0,
    unresolvedShortcutTargetCount: 0,
    staleShortcutTargetMimeCount: 0,
    incompleteSearchCount: 0,
    paginationCycleCount: 0,
    ...overrides
  };
}

function assertCode(expectedCode) {
  return (error) => error instanceof RootInventoryError && error.code === expectedCode;
}

function summarize(options) {
  return summarizeRepeatedInventory({
    canonicalRootResolvedFromPriorityParent: true,
    ...options
  });
}

test('exhausts every page, including an empty intermediate page, for more than 1000 children', async () => {
  const firstThousand = Array.from({ length: 1000 }, (_, index) => file(`f_${index}`));
  const adapter = readers({
    pages: new Map([
      [`${ROOT_ID}|`, { files: firstThousand, nextPageToken: 'page_2' }],
      [`${ROOT_ID}|page_2`, { files: [], nextPageToken: 'page_3' }],
      [`${ROOT_ID}|page_3`, { files: [file('f_1000')], nextPageToken: null }]
    ])
  });
  const pass = await collectInventoryPass(adapter);
  assert.equal(pass.items.length, 1001);
  assert.equal(pass.pageCount, 3);
  assert.deepEqual(adapter.calls.pages.map(({ pageToken }) => pageToken), [null, 'page_2', 'page_3']);
});

test('rejects token cycles and incomplete-search pages', async () => {
  const cycle = readers({
    pages: new Map([
      [`${ROOT_ID}|`, { files: [], nextPageToken: 'again' }],
      [`${ROOT_ID}|again`, { files: [], nextPageToken: 'again' }]
    ])
  });
  await assert.rejects(collectInventoryPass(cycle), assertCode('PAGINATION_CYCLE'));

  const incomplete = readers({
    pages: new Map([[`${ROOT_ID}|`, { files: [], incompleteSearch: true }]])
  });
  await assert.rejects(collectInventoryPass(incomplete), assertCode('INCOMPLETE_SEARCH'));
});

test('validates the canonical root before listing and validates every returned parent edge', async () => {
  for (const root of [
    rootMetadata({ id: 'another_root' }),
    rootMetadata({ mimeType: 'video/mp4' }),
    rootMetadata({ trashed: true }),
    rootMetadata({ capabilities: { canListChildren: false } }),
    rootMetadata({ capabilities: {} })
  ]) {
    const adapter = readers({ root });
    await assert.rejects(collectInventoryPass(adapter));
    assert.equal(adapter.calls.pages.length, 0);
  }
  await assert.rejects(
    collectInventoryPass(readers({
      pages: new Map([[`${ROOT_ID}|`, { files: [file('outside', 'other_parent')] }]])
    })),
    assertCode('PARENT_EDGE_MISMATCH')
  );
  await assert.rejects(
    collectInventoryPass({ ...readers(), rootId: "invalid'id" }),
    assertCode('INVALID_ROOT')
  );
});

test('walks a three-level real-parent tree while preserving same-name different-ID files', async () => {
  const adapter = readers({
    pages: new Map([
      [`${ROOT_ID}|`, { files: [folder('folder_a'), file('one', ROOT_ID, { name: 'same.mp4' })] }],
      ['folder_a|', { files: [folder('folder_b', 'folder_a'), file('two', 'folder_a', { name: 'same.mp4' })] }],
      ['folder_b|', { files: [file('deep', 'folder_b')] }]
    ])
  });
  const pass = await collectInventoryPass(adapter);
  assert.equal(pass.traversedFolderCount, 3);
  assert.deepEqual(new Set(pass.items.map(({ id }) => id)), new Set(['folder_a', 'folder_b', 'one', 'two', 'deep']));
});

test('fails closed on duplicate IDs and list-blocked nested folders', async () => {
  const duplicate = readers({
    pages: new Map([
      [`${ROOT_ID}|`, { files: [file('dup')], nextPageToken: 'next' }],
      [`${ROOT_ID}|next`, { files: [file('dup')], nextPageToken: null }]
    ])
  });
  await assert.rejects(collectInventoryPass(duplicate), assertCode('DUPLICATE_REFERENCE'));

  const blocked = readers({
    pages: new Map([[`${ROOT_ID}|`, {
      files: [folder('blocked', ROOT_ID, { capabilities: { canListChildren: false } })]
    }]])
  });
  await assert.rejects(collectInventoryPass(blocked), assertCode('FOLDER_LIST_BLOCKED'));
});

test('classifies unique shortcut targets without traversing folder shortcuts', async () => {
  const folderTarget = folder('target_folder', 'outside');
  const videoTarget = file('target_video', 'outside');
  const adapter = readers({
    pages: new Map([[`${ROOT_ID}|`, {
      files: [
        shortcut('shortcut_1', 'target_video'),
        shortcut('shortcut_2', 'target_video'),
        shortcut('shortcut_folder', 'target_folder', ROOT_ID, {
          shortcutDetails: {
            targetId: 'target_folder',
            targetMimeType: FOLDER_MIME,
            targetResourceKey: null
          }
        })
      ]
    }]]),
    targets: new Map([
      ['target_video', videoTarget],
      ['target_folder', folderTarget]
    ])
  });
  const pass = await collectInventoryPass(adapter);
  assert.equal(adapter.calls.targets.length, 2);
  assert.equal(adapter.calls.pages.length, 1);
  const report = summarize({ firstPass: pass, secondPass: pass, elapsedMs: 1 });
  assert.equal(report.counts.shortcuts, 3);
  assert.equal(report.counts.visibleMediaReferences, 2);
  assert.equal(report.counts.uniqueMediaObjects, 1);
  assert.equal(report.counts.uniqueShortcutTargets, 2);
  assert.equal(report.counts.folderShortcutsNotTraversed, 1);
});

test('uses current shortcut target metadata and leaves unresolved targets explicit', async () => {
  const stale = readers({
    pages: new Map([[`${ROOT_ID}|`, {
      files: [shortcut('shortcut_stale', 'target_stale', ROOT_ID, {
        shortcutDetails: {
          targetId: 'target_stale',
          targetMimeType: 'image/jpeg',
          targetResourceKey: null
        }
      })]
    }]]),
    targets: new Map([['target_stale', file('target_stale', 'outside')]])
  });
  const stalePass = await collectInventoryPass(stale);
  assert.equal(stalePass.staleShortcutTargetMimeCount, 1);

  const unresolved = readers({
    pages: new Map([[`${ROOT_ID}|`, {
      files: [file('priority_anchor'), shortcut('shortcut_missing', 'target_missing')]
    }]])
  });
  const unresolvedPass = await collectInventoryPass(unresolved);
  assert.equal(unresolvedPass.unresolvedShortcutTargetCount, 1);
  const report = summarize({
    firstPass: unresolvedPass,
    secondPass: unresolvedPass,
    elapsedMs: 1,
    priorityFileId: 'priority_anchor'
  });
  assert.equal(report.completeness.containmentComplete, true);
  assert.equal(report.completeness.shortcutClassificationComplete, false);
  assert.equal(report.completeness.inventoryErrorCount, 1);
});

test('tries distinct resource keys for one shortcut target and counts target risks once', async () => {
  const target = file('target_large', 'outside', {
    name: 'target_large.mkv',
    mimeType: 'video/x-matroska',
    fullFileExtension: 'mkv',
    size: '9007199254740993'
  });
  const adapter = readers({
    pages: new Map([[`${ROOT_ID}|`, {
      files: [
        shortcut('shortcut_old_key', target.id, ROOT_ID, {
          shortcutDetails: {
            targetId: target.id,
            targetMimeType: 'image/jpeg',
            targetResourceKey: 'old_key'
          }
        }),
        shortcut('shortcut_good_key', target.id, ROOT_ID, {
          shortcutDetails: {
            targetId: target.id,
            targetMimeType: target.mimeType,
            targetResourceKey: 'good_key'
          }
        })
      ]
    }]])
  });
  adapter.readFileMetadata = async ({ resourceKey }) => {
    adapter.calls.targets.push({ resourceKey });
    if (resourceKey === 'old_key') throw new Error('stale resource key');
    return structuredClone(target);
  };
  const pass = await collectInventoryPass(adapter);
  assert.deepEqual(adapter.calls.targets.map(({ resourceKey }) => resourceKey), ['old_key', 'good_key']);
  assert.equal(pass.unresolvedShortcutTargetCount, 0);
  assert.equal(pass.staleShortcutTargetMimeCount, 1);
  const report = summarize({ firstPass: pass, secondPass: pass, elapsedMs: 1 });
  assert.equal(report.counts.visibleMediaReferences, 2);
  assert.equal(report.counts.uniqueMediaObjects, 1);
  assert.equal(report.counts.classifiedUniqueObjects, 1);
  assert.equal(report.extensions['.mkv'], 1);
  assert.equal(report.sizes.bands['>=4GiB'], 1);
  assert.equal(report.risk.rareExtensionCount, 1);
  assert.equal(report.coverage.metadataInventoryCount, 1);
});

test('rejects trashed or wrong-ID shortcut target metadata instead of classifying it', async () => {
  for (const target of [
    file('another_target', 'outside'),
    file('target_bad', 'outside', { trashed: true })
  ]) {
    const adapter = readers({
      pages: new Map([[`${ROOT_ID}|`, { files: [shortcut('shortcut_bad', 'target_bad')] }]]),
      targets: new Map([['target_bad', target]])
    });
    const pass = await collectInventoryPass(adapter);
    assert.equal(pass.shortcutTargets.length, 0);
    assert.equal(pass.unresolvedShortcutTargetCount, 1);
  }
});

test('discards a token-rejected pass and restarts once from the canonical root', async () => {
  let attempt = 0;
  const adapter = readers();
  adapter.listFolderPage = async ({ pageToken }) => {
    if (!pageToken) {
      attempt += 1;
      return { files: [], nextPageToken: 'token' };
    }
    if (attempt === 1) throw Object.assign(new Error('rejected'), { code: 'PAGE_TOKEN_REJECTED' });
    return { files: [file('after_restart')], nextPageToken: null };
  };
  const pass = await collectInventoryPassWithRestart(adapter);
  assert.equal(attempt, 2);
  assert.deepEqual(pass.items.map(({ id }) => id), ['after_restart']);
  assert.equal(adapter.calls.roots.length, 3);

  let repeatedAttempt = 0;
  const twice = readers();
  twice.listFolderPage = async ({ pageToken }) => {
    if (!pageToken) {
      repeatedAttempt += 1;
      return { files: [], nextPageToken: 'token' };
    }
    throw Object.assign(new Error('rejected'), { code: 'PAGE_TOKEN_REJECTED' });
  };
  await assert.rejects(collectInventoryPassWithRestart(twice), assertCode('PAGE_TOKEN_REJECTED'));
  assert.equal(repeatedAttempt, 2);
});

test('fences the account within and between repeated passes', async () => {
  await assert.rejects(
    collectInventoryPass(readers({ accounts: ['another_account', 'another_account'] })),
    assertCode('ACCOUNT_CHANGED')
  );
  await assert.rejects(
    collectInventoryPass(readers({ accounts: ['account_a', 'account_b'] })),
    assertCode('ACCOUNT_CHANGED')
  );
  const first = privatePass([]);
  const second = privatePass([], [], { accountBefore: 'another_account', accountAfter: 'another_account' });
  assert.throws(
    () => summarize({ firstPass: first, secondPass: second, elapsedMs: 1 }),
    assertCode('ACCOUNT_CHANGED')
  );
});

test('keeps the preflight account fence across a page-token restart', async () => {
  let accountCall = 0;
  let attempt = 0;
  const adapter = readers();
  adapter.readAccountKey = async () => (accountCall++ === 0 ? ACCOUNT_KEY : 'switched_account');
  adapter.listFolderPage = async ({ pageToken }) => {
    if (!pageToken) {
      attempt += 1;
      return { files: [], nextPageToken: 'expired' };
    }
    throw Object.assign(new Error('expired'), { code: 'PAGE_TOKEN_REJECTED' });
  };
  await assert.rejects(collectInventoryPassWithRestart(adapter), assertCode('ACCOUNT_CHANGED'));
  assert.equal(attempt, 1);
});

test('requires priority-parent provenance and rechecks internal pass fences', () => {
  const stable = privatePass([]);
  assert.throws(
    () => summarizeRepeatedInventory({ firstPass: stable, secondPass: stable, elapsedMs: 1 }),
    assertCode('ROOT_PROVENANCE_UNCONFIRMED')
  );
  assert.throws(
    () => summarize({
      firstPass: privatePass([], [], { accountAfter: 'changed' }),
      secondPass: privatePass([], [], { accountBefore: 'changed', accountAfter: 'changed' }),
      elapsedMs: 1
    }),
    assertCode('ACCOUNT_CHANGED')
  );
  assert.throws(
    () => summarize({
      firstPass: privatePass([], [], { rootAfter: rootMetadata({ version: '8' }) }),
      secondPass: stable,
      elapsedMs: 1
    }),
    assertCode('ROOT_CHANGED')
  );
});

test('known priority anchor must appear as one direct child in both repeated passes', () => {
  const missing = privatePass([]);
  assert.throws(
    () => summarize({
      firstPass: missing,
      secondPass: missing,
      elapsedMs: 1,
      priorityFileId: 'priority_anchor'
    }),
    assertCode('PRIORITY_ANCHOR_MISSING')
  );
});

test('rejects add, version, parent and capability drift between repeated passes', () => {
  const baselineItem = file('stable');
  const first = privatePass([baselineItem]);
  const variants = [
    [baselineItem, file('added')],
    [file('stable', ROOT_ID, { version: '4' })],
    [file('stable', 'another_parent')],
    [file('stable', ROOT_ID, { capabilities: { ...baselineItem.capabilities, canDownload: false } })]
  ];
  for (const items of variants) {
    assert.throws(
      () => summarize({
        firstPass: first,
        secondPass: privatePass(items),
        elapsedMs: 1
      }),
      assertCode('REPEAT_MISMATCH')
    );
  }
});

test('rejects conflicting direct and shortcut-target metadata regardless of provider order', () => {
  const direct = file('same_object', ROOT_ID, {
    name: 'same_object.mp4',
    mimeType: 'video/mp4',
    fullFileExtension: 'mp4',
    size: '1'
  });
  const target = file('same_object', ROOT_ID, {
    name: 'same_object.mkv',
    mimeType: 'video/x-matroska',
    fullFileExtension: 'mkv',
    size: '5368709120'
  });
  const link = shortcut('same_object_link', direct.id);
  for (const items of [[direct, link], [link, direct]]) {
    const pass = privatePass(items, [[target.id, target]]);
    assert.throws(
      () => summarize({ firstPass: pass, secondPass: pass, elapsedMs: 1 }),
      assertCode('CLASSIFIED_METADATA_CONFLICT')
    );
  }
});

test('treats a shortcut resource-key change as repeated-inventory drift', () => {
  const firstShortcut = shortcut('resource_key_link', 'resource_key_target', ROOT_ID, {
    shortcutDetails: {
      targetId: 'resource_key_target',
      targetMimeType: 'video/mp4',
      targetResourceKey: 'resource_key_a'
    }
  });
  const secondShortcut = structuredClone(firstShortcut);
  secondShortcut.shortcutDetails.targetResourceKey = 'resource_key_b';
  const target = file('resource_key_target', 'outside');
  assert.throws(
    () => summarize({
      firstPass: privatePass([firstShortcut], [[target.id, target]]),
      secondPass: privatePass([secondShortcut], [[target.id, target]]),
      elapsedMs: 1
    }),
    assertCode('REPEAT_MISMATCH')
  );
});

test('uses BigInt size bands, raw MIME families and keeps unknown metadata unknown', () => {
  const huge = file('huge_private', ROOT_ID, {
    name: 'huge_private.mkv',
    mimeType: 'video/x-private-codec',
    fullFileExtension: 'mkv',
    size: '9007199254740993',
    version: undefined
  });
  const missing = file('missing_private', ROOT_ID, {
    name: 'missing_private',
    mimeType: 'application/octet-stream',
    fullFileExtension: undefined,
    size: undefined,
    version: undefined,
    capabilities: {}
  });
  const unsafeNumber = file('unsafe_number_private', ROOT_ID, {
    name: 'unsafe_number_private.mp4',
    mimeType: 'application/octet-stream',
    fullFileExtension: undefined,
    size: Number.MAX_SAFE_INTEGER + 1
  });
  const pass = privatePass([huge, missing, unsafeNumber]);
  const report = summarize({ firstPass: pass, secondPass: pass, elapsedMs: 1 });
  assert.equal(report.sizes.bands['>=4GiB'], 1);
  assert.equal(report.sizes.bands.unknown, 2);
  assert.equal(report.sizes.totalKnownSizeBytes, '9007199254740993');
  assert.equal(report.counts.videoObjects, 1);
  assert.equal(report.mimeTypes['<other>'], 3);
  assert.equal(report.risk.missingVersion, 2);
  assert.equal(report.capabilities.canDownload.unknown, 1);
  assert.equal(report.risk.extensionMimeMismatchCount, 1);
});

test('redacted output omits private IDs, names, paths, tokens, keys and account values', () => {
  const privateId = 'PRIVATE_ID_SENTINEL';
  const privateName = 'PRIVATE_NAME_SENTINEL.mp4';
  const target = file('PRIVATE_TARGET_SENTINEL', 'PRIVATE_PARENT_SENTINEL');
  const item = file(privateId, ROOT_ID, { name: privateName, size: '4294967297' });
  const shortcutItem = shortcut('PRIVATE_SHORTCUT_SENTINEL', target.id, ROOT_ID, {
    shortcutDetails: {
      targetId: target.id,
      targetMimeType: target.mimeType,
      targetResourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL'
    }
  });
  const pass = privatePass([item, shortcutItem], [[target.id, target]], {
    accountBefore: 'PRIVATE_ACCOUNT_SENTINEL',
    accountAfter: 'PRIVATE_ACCOUNT_SENTINEL'
  });
  const report = summarize({
    firstPass: pass,
    secondPass: pass,
    elapsedMs: 10,
    priorityFileId: privateId
  });
  assert.equal(report.risk.prioritySampleCount, 1);
  assert.equal(report.coverage.configuredContainerAnalysisCount, 0);
  assert.equal(report.coverage.decodedInThisRunCount, 0);
  assert.equal(report.coverage.physicalDevicePlaybackCount, 0);
  const serialized = JSON.stringify(report);
  for (const sentinel of [
    privateId,
    privateName,
    target.id,
    'PRIVATE_PARENT_SENTINEL',
    'PRIVATE_RESOURCE_KEY_SENTINEL',
    'PRIVATE_ACCOUNT_SENTINEL',
    'PAGE_TOKEN_SENTINEL',
    'C:\\private\\path',
    'https://www.googleapis.com/drive/v3/files/private'
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
  assert.equal(report.limitations.fileBodiesRead, false);
  assert.equal(report.limitations.metadataInventoryIsPlaybackProof, false);
});

test('stable output is independent of provider item ordering', () => {
  const items = [file('a'), file('b'), file('c')];
  const first = privatePass(items);
  const second = privatePass([...items].reverse());
  const report = summarize({ firstPass: first, secondPass: second, elapsedMs: 1 });
  assert.equal(report.counts.totalUniqueItems, 3);
  assert.equal(report.completeness.repeatedPrivateInventoryMatched, true);
});

test('committed evidence binds the reviewed tool and stays aggregate-only', async () => {
  const evidence = JSON.parse(await readFile(
    new URL('./results.redacted.json', import.meta.url),
    'utf8'
  ));
  assert.equal(evidence.schema, 'drive-original.v2-07a-root-inventory-evidence-redacted/1');
  assert.equal(evidence.inventoryToolCommit, 'e928f7b9b6c64ce91fe6aa5278b18b0c82c97c8b');
  assert.equal(evidence.productBaselineCommit, '14c501ad80a3950f4b6886dd3a5ae31b031c5af6');
  assert.equal(evidence.execution.mediaBodiesRead, 0);
  assert.equal(evidence.execution.driveMutations, 0);
  assert.equal(evidence.inventoryOutput.completeness.repeatedPrivateInventoryMatched, true);
  assert.equal(evidence.inventoryOutput.completeness.containmentComplete, true);
  assert.equal(evidence.inventoryOutput.completeness.shortcutClassificationComplete, true);
  assert.equal(evidence.inventoryOutput.completeness.inventoryErrorCount, 0);
  assert.equal(evidence.inventoryOutput.risk.prioritySampleCount, 1);
  assert.equal(evidence.inventoryOutput.counts.totalUniqueItems, 8471);
  assert.equal(
    evidence.inventoryOutput.counts.totalUniqueItems,
    evidence.inventoryOutput.counts.folders
      + evidence.inventoryOutput.counts.shortcuts
      + evidence.inventoryOutput.counts.physicalFiles
  );
  assert.equal(evidence.inventoryOutput.coverage.configuredContainerAnalysisCount, 0);
  assert.equal(evidence.inventoryOutput.coverage.decodedInThisRunCount, 0);
  assert.equal(evidence.inventoryOutput.coverage.physicalDevicePlaybackCount, 0);

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(
    serialized,
    /[A-Z]:\\|\/Users\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|Bearer\s|ya29\.|refresh_token|access_token/i
  );
  assert.doesNotMatch(serialized, /"(?:file|folder|root|parent|resourceKey)Id"\s*:/i);
});
