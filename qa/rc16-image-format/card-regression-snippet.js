
test('WebP cards freeze thumbnails without widening GIF semantics or changing native still-image cards', () => {
  const context = loadAppContext();
  const { findNodes } = installMiniDom(context);
  context.cardFiles = [
    { id: 'webp-mime', name: 'animation.bin', mimeType: 'image/webp' },
    { id: 'webp-extension', name: 'ANIMATION.WebP', mimeType: 'image/jpeg' },
    { id: 'gif-control', name: 'animation.gif', mimeType: 'image/gif' },
    { id: 'png-control', name: 'still.png', mimeType: 'image/png' },
    { id: 'bmp-control', name: 'still.bmp', mimeType: 'image/bmp' }
  ].map(file => ({ ...file, size: '100', thumbnailLink: 'https://example.test/' + file.id, capabilities: { canDownload: true } }));
  context.cardResults = run(context, 'cardFiles.map(file => createFileCard(file, 0))');
  for (let index = 0; index < context.cardFiles.length; index++) {
    const file = context.cardFiles[index], card = context.cardResults[index];
    const canvases = findNodes(card, 'canvas'), images = findNodes(card, 'img');
    const frozen = index < 3;
    assert.equal(canvases.length, frozen ? 1 : 0, file.id + ' static thumbnail choice');
    assert.equal(images.length, frozen ? 0 : 1, file.id + ' native animated image must not mount for frozen cards');
    if (frozen) {
      assert.equal(canvases[0].width, 1, 'idle canvas keeps bounded placeholder backing store');
      context.cardCanvas = canvases[0];
      assert.equal(run(context, 'gifThumbnailEntries.get(cardCanvas)?.file.id'), file.id, 'existing static loader owns the card');
      const label = findNodes(card, '.file-card-gif-placeholder')[0];
      assert.match(label.innerHTML, new RegExp('<span>' + (index === 2 ? 'GIF' : 'WEBP') + '</span>'));
    } else assert.equal(images[0].src, file.thumbnailLink);
  }
  assert.equal(run(context, 'isGifFile(cardFiles[0])'), false, 'WebP remains separate from global GIF behavior');
  assert.equal(run(context, 'isGifFile(cardFiles[1])'), false);
  assert.equal(run(context, 'isGifFile(cardFiles[2])'), true);
});
