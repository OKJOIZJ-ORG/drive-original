function resolveRc30NativeFolderTarget(expected) {
  'use strict';
  const matches = state.folders.filter(f => f.id === expected.id && f.name === expected.name);
  const metadataPairUnique = matches.length === 1;
  const metadataNameUnique = state.folders.filter(f => f.name === expected.name).length === 1;
  const metadataUnique = metadataPairUnique && metadataNameUnique;
  const rows = [...document.querySelectorAll('button.folder-row')].filter(row =>
    row.querySelector('.folder-name')?.textContent === expected.name);
  const rowUnique = rows.length === 1;
  const more = el.folderMoreButton;
  const moreVisible = !!more && !more.hidden && more.getBoundingClientRect().height > 0;
  if (!metadataUnique || !rowUnique) return { available: false, metadataUnique, metadataPairUnique, metadataNameUnique, rowUnique, moreVisible,
    currentFolderSame: state.currentFolderId === expected.id, noIdentifiersExported: true };
  const node = rows[0];
  node.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { available: !node.hidden && r.width > 0 && r.height > 0 && r.y >= 0 && r.bottom <= innerHeight + .1
      && !!hit && (hit === node || node.contains(hit)),
    metadataUnique, metadataPairUnique, metadataNameUnique, rowUnique, moreVisible, currentFolderSame: state.currentFolderId === expected.id,
    x, y, left: r.left, width: r.width, height: r.height, dpr: devicePixelRatio,
    viewportHeight: innerHeight, screenHeight: screen.height, noIdentifiersExported: true };
}
