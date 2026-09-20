import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RepresentativeSelectionError,
  selectRiskRepresentatives
} from './representative-selector.mjs';

const ROOT = 'root_fixture';

function file(id, overrides = {}) {
  return {
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    fullFileExtension: 'mp4',
    size: '1024',
    version: '1',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    parents: [ROOT],
    trashed: false,
    capabilities: { canDownload: true, canReadRevisions: true },
    videoMediaMetadata: { durationMillis: '60000', width: 1920, height: 1080 },
    ...overrides
  };
}

function pass(items, shortcutTargets = [], overrides = {}) {
  return {
    items,
    shortcutTargets,
    unresolvedShortcutTargetCount: 0,
    ...overrides
  };
}

function select(items, overrides = {}) {
  return selectRiskRepresentatives({
    pass: pass(items),
    priorityFileId: 'priority',
    expectedPriorityVersion: '7',
    ...overrides
  });
}

function fixture() {
  return [
    file('priority', { version: '7', size: '208001508' }),
    file('huge_a', { name: 'huge_a.raw', fullFileExtension: 'raw', size: '4294967297' }),
    file('huge_b', { name: 'huge_b.raw', fullFileExtension: 'raw', size: '9007199254740993' }),
    file('mkv_a', { name: 'mkv_a.mkv', fullFileExtension: 'mkv', mimeType: 'video/x-matroska' }),
    file('mkv_b', { name: 'mkv_b.mkv', fullFileExtension: 'mkv', mimeType: 'video/x-matroska' }),
    file('avi_a', { name: 'avi_a.avi', fullFileExtension: 'avi', mimeType: 'video/x-msvideo' }),
    file('bmp_a', {
      name: 'bmp_a.bmp', fullFileExtension: 'bmp', mimeType: 'image/bmp',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30 }
    }),
    file('largest_mp4', { size: '536870912', videoMediaMetadata: { durationMillis: '7200000' } }),
    file('mov_a', {
      name: 'mov_a.mov', fullFileExtension: 'mov', mimeType: 'video/quicktime', size: '300000000'
    }),
    file('webm_a', { name: 'webm_a.webm', fullFileExtension: 'webm', mimeType: 'video/webm' }),
    file('jpg_a', {
      name: 'jpg_a.jpg', fullFileExtension: 'jpg', mimeType: 'image/jpeg',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30, rotation: 1 }
    }),
    file('jpeg_a', {
      name: 'jpeg_a.jpeg', fullFileExtension: 'jpeg', mimeType: 'image/jpeg',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30, rotation: 2 }
    }),
    file('png_a', {
      name: 'png_a.png', fullFileExtension: 'png', mimeType: 'image/png',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30, rotation: 3 }
    }),
    file('gif_a', {
      name: 'gif_a.gif', fullFileExtension: 'gif', mimeType: 'image/gif', size: '30000000',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30 }
    }),
    file('webp_a', {
      name: 'webp_a.webp', fullFileExtension: 'webp', mimeType: 'image/webp', size: '70000000',
      videoMediaMetadata: undefined, imageMediaMetadata: { width: 40, height: 30 }
    }),
    file('mismatch_a', {
      name: 'mismatch_a.mp4', fullFileExtension: 'mp4', mimeType: 'application/x-private-sentinel',
      videoMediaMetadata: undefined
    }),
    file('missing_metadata', {
      name: 'missing_metadata.raw', fullFileExtension: 'raw', mimeType: 'video/private-sentinel',
      size: undefined, version: undefined, videoMediaMetadata: undefined,
      capabilities: {}
    })
  ];
}

function assertCode(code) {
  return (error) => error instanceof RepresentativeSelectionError && error.code === code;
}

test('keeps priority, every rare object, every >=4GiB object and the extremes mandatory', () => {
  const result = select(fixture());
  const ids = new Set(result.privateManifest.selected.map(({ fileId }) => fileId));
  for (const id of ['priority', 'huge_a', 'huge_b', 'mkv_a', 'mkv_b', 'avi_a', 'bmp_a', 'largest_mp4', 'mov_a']) {
    assert.equal(ids.has(id), true, id);
  }
  assert.equal(result.report.selection.prioritySampleSelected, true);
  assert.equal(result.report.selection.rareMkvAviBmpObjectCount, 4);
  assert.equal(result.report.selection.allRareMkvAviBmpSelected, true);
  assert.equal(result.report.selection.ge4GiBObjectCount, 2);
  assert.equal(result.report.selection.allGe4GiBSelected, true);
  assert.equal(result.report.selection.largestMp4Selected, true);
  assert.equal(result.report.selection.largestMovSelected, true);
  assert.equal(result.report.selection.longestKnownVideoSelected, true);
});

test('covers every requested extension and observed metadata-risk category', () => {
  const result = select(fixture());
  assert.equal(result.report.input.requestedExtensionCount, 11);
  assert.equal(result.report.input.requestedExtensionsPresentCount, 11);
  assert.equal(result.report.input.allRequestedExtensionsPresent, true);
  assert.equal(result.report.coverage.uncoveredCategoryCount, 0);
  assert.equal(
    result.report.coverage.requiredCategoryCount,
    result.report.coverage.coveredCategoryCount
  );
  assert.equal(result.report.selection.subsetMinimalAfterMandatory, true);
  assert.equal(result.report.selection.globalMinimumClaimed, false);
});

test('selection and redacted report are byte-stable across provider ordering', () => {
  const items = fixture();
  const forward = select(items);
  const reversed = select([...items].reverse());
  assert.deepEqual(
    forward.privateManifest.selected.map(({ fileId }) => fileId),
    reversed.privateManifest.selected.map(({ fileId }) => fileId)
  );
  assert.equal(JSON.stringify(forward.report), JSON.stringify(reversed.report));
});

test('priority is never substituted when its ID or version fence is missing', () => {
  assert.throws(
    () => select(fixture().filter(({ id }) => id !== 'priority')),
    assertCode('PRIORITY_FENCE_MISMATCH')
  );
  assert.throws(
    () => select(fixture(), { expectedPriorityVersion: '8' }),
    assertCode('PRIORITY_FENCE_MISMATCH')
  );
});

test('same content object through direct and shortcut references is selected once', () => {
  const items = fixture();
  const target = items.find(({ id }) => id === 'mkv_a');
  const shortcut = file('shortcut_ref', {
    name: 'shortcut_ref',
    mimeType: 'application/vnd.google-apps.shortcut',
    fullFileExtension: undefined,
    size: undefined,
    videoMediaMetadata: undefined,
    shortcutDetails: {
      targetId: target.id,
      targetMimeType: target.mimeType,
      targetResourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL'
    }
  });
  const result = selectRiskRepresentatives({
    pass: pass([...items, shortcut], [[target.id, structuredClone(target)]]),
    priorityFileId: 'priority',
    expectedPriorityVersion: '7'
  });
  assert.equal(
    result.privateManifest.selected.filter(({ fileId }) => fileId === target.id).length,
    1
  );
  assert.deepEqual(
    result.privateManifest.selected.find(({ fileId }) => fileId === target.id).visibleReferences,
    [
      { fileId: target.id, resourceKey: null },
      { fileId: shortcut.id, resourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL' }
    ]
  );
  assert.doesNotMatch(JSON.stringify(result.report), /PRIVATE_RESOURCE_KEY_SENTINEL/);
});

test('unresolved shortcut and conflicting object metadata fail closed', () => {
  assert.throws(
    () => selectRiskRepresentatives({
      pass: pass(fixture(), [], { unresolvedShortcutTargetCount: 1 }),
      priorityFileId: 'priority',
      expectedPriorityVersion: '7'
    }),
    assertCode('INVENTORY_INCOMPLETE')
  );
  const missingTarget = file('shortcut_missing', {
    name: 'shortcut_missing',
    mimeType: 'application/vnd.google-apps.shortcut',
    fullFileExtension: undefined,
    size: undefined,
    videoMediaMetadata: undefined,
    shortcutDetails: { targetId: 'missing_target', targetMimeType: 'video/mp4' }
  });
  assert.throws(
    () => selectRiskRepresentatives({
      pass: pass([...fixture(), missingTarget]),
      priorityFileId: 'priority',
      expectedPriorityVersion: '7'
    }),
    assertCode('INVENTORY_INCOMPLETE')
  );
  const items = fixture();
  const target = items.find(({ id }) => id === 'mkv_a');
  const conflicting = { ...target, size: '999999' };
  const conflictingShortcut = file('shortcut_conflict', {
    name: 'shortcut_conflict',
    mimeType: 'application/vnd.google-apps.shortcut',
    fullFileExtension: undefined,
    size: undefined,
    videoMediaMetadata: undefined,
    shortcutDetails: { targetId: target.id, targetMimeType: target.mimeType }
  });
  assert.throws(
    () => selectRiskRepresentatives({
      pass: pass([...items, conflictingShortcut], [[target.id, conflicting]]),
      priorityFileId: 'priority',
      expectedPriorityVersion: '7'
    }),
    assertCode('OBJECT_METADATA_CONFLICT')
  );
});

test('exactly 256 MiB starts the large MP4/MOV category', () => {
  const items = fixture();
  const largestIndex = items.findIndex(({ id }) => id === 'largest_mp4');
  items[largestIndex] = {
    ...items[largestIndex],
    size: String(256 * 1024 * 1024)
  };
  const result = select(items);
  const selected = result.privateManifest.selected.find(({ fileId }) => fileId === 'largest_mp4');
  assert.equal(selected.coveredCategories.includes('videoSize:.mp4:ge256MiB_lt2GiB'), true);
});

test('BigInt boundaries remain exact and unsafe numeric metadata stays missing', () => {
  const items = fixture();
  const priorityIndex = items.findIndex(({ id }) => id === 'priority');
  items[priorityIndex] = {
    ...items[priorityIndex],
    size: Number.MAX_SAFE_INTEGER + 1
  };
  const result = select(items);
  const huge = result.privateManifest.selected.filter(({ fileId }) => fileId.startsWith('huge_'));
  assert.equal(huge.length, 2);
  assert.equal(result.report.selection.ge4GiBObjectCount, 2);
  assert.equal(
    result.privateManifest.selected.find(({ fileId }) => fileId === 'priority')?.size,
    null
  );
});

test('redacted report omits every private row and unknown raw metadata sentinel', () => {
  const result = select(fixture().map((item) => (
    item.id === 'mismatch_a'
      ? {
        ...item,
        id: 'PRIVATE_ID_SENTINEL',
        name: 'C:\\private\\PRIVATE_NAME_SENTINEL.mp4',
        resourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL'
      }
      : item
  )), { priorityFileId: 'priority' });
  const serialized = JSON.stringify(result.report);
  assert.doesNotMatch(
    serialized,
    /PRIVATE_ID_SENTINEL|PRIVATE_NAME_SENTINEL|PRIVATE_RESOURCE_KEY_SENTINEL|private-sentinel|C:\\private|\/Users\//i
  );
  assert.equal(result.report.evidenceLevels.boundedProbeCount, 0);
  assert.equal(result.report.evidenceLevels.decodeCount, 0);
  assert.equal(result.report.evidenceLevels.currentProductPlaybackCount, 0);
  assert.equal(result.report.evidenceLevels.physicalDevicePlaybackCount, 0);
  assert.equal(result.report.limitations.animationCandidatesNotConfirmedAnimated, true);
});
