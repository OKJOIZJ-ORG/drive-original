function createFileCard(file, index = 0, absoluteIndex = index) {
  const isVideo = file.mimeType?.startsWith('video/');
  const isGif = isGifFile(file);
  const isWebp = String(file.mimeType || '').toLowerCase() === 'image/webp'
    || /\.webp$/i.test(String(file.name || ''));
  const useStaticImageThumbnail = isGif || isWebp;
  const canDownload = file.capabilities?.canDownload !== false;
  const card = document.createElement('article');
  card.className = 'file-card';
  card.setAttribute('data-file-id', file.id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-card-open';
  const isSelected = state.selectedFileIds.has(file.id);
  button.setAttribute('aria-pressed', String(isSelected));
  if (isSelected) card.classList.add('selected');
  if (index >= (isMobileDevice() ? 16 : 24)) card.classList.add('defer-render');
  button.title = canDownload
    ? `${isVideo ? '영상' : '이미지'} 원본 열기`
    : `${isVideo ? '영상' : '이미지'} Google 호환 재생기로 열기`;

  const visual = document.createElement('div');
  visual.className = `file-card-visual ${isVideo ? 'video' : 'image'}`;
  
  if (useStaticImageThumbnail) {
    const placeholder = document.createElement('div');
    placeholder.className = 'file-card-gif-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML = `<svg viewBox="0 0 64 64" fill="none"><rect x="12" y="14" width="40" height="36" rx="8" stroke="currentColor" stroke-width="2"/><path d="m18 43 10-10 7 7 6-6 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="41" cy="25" r="4" fill="currentColor"/></svg><span>${isGif ? 'GIF' : 'WEBP'}</span>`;
    visual.appendChild(placeholder);
    if (file.thumbnailLink) {
      const canvas = document.createElement('canvas');
      canvas.className = 'file-card-thumb file-card-gif-canvas';
      canvas.width = 1;
      canvas.height = 1;
      canvas.setAttribute('aria-hidden', 'true');
      visual.appendChild(canvas);
      const eagerLimit = isMobileDevice() ? 16 : 24;
      registerStaticGifThumbnail(file, canvas, visual, placeholder, index < eagerLimit);
    }
  } else {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'file-card-thumb';
    thumbnail.alt = '';
    const eagerLimit = isMobileDevice() ? 16 : 24;
    const priorityLimit = isMobileDevice() ? 8 : 12;
    thumbnail.loading = index < eagerLimit ? 'eager' : 'lazy';
    if (index < priorityLimit) thumbnail.fetchPriority = 'high';
    thumbnail.decoding = 'async';
    thumbnail.referrerPolicy = 'no-referrer';
    thumbnail.addEventListener('load', () => {
      thumbnail.classList.add('loaded');
      visual.classList.add('has-thumbnail');
    });

    if (file.thumbnailLink) {
      thumbnail.addEventListener('error', () => {
        if (isVideo) extractVideoFrameThumbnail(file, thumbnail, visual);
        else thumbnail.remove();
      }, { once: true });
      if (playerMediaPriorityActive) thumbnail.dataset.playerDeferredSrc = file.thumbnailLink;
      else thumbnail.src = file.thumbnailLink;
      visual.appendChild(thumbnail);
    } else if (isVideo) {
      visual.appendChild(thumbnail);
      extractVideoFrameThumbnail(file, thumbnail, visual);
    }
  }

  // Format Badge (e.g., 4K UHD, FHD, HEVC, PNG)
  const res = resolutionText(file);
  let badgeLabel = isVideo ? 'VIDEO' : 'IMAGE';
  if (res) {
    badgeLabel = res;
  } else if (file.videoMediaMetadata?.width >= 3840) {
    badgeLabel = '4K UHD';
  } else if (file.videoMediaMetadata?.width >= 1920) {
    badgeLabel = 'FHD';
  } else if (file.mimeType) {
    badgeLabel = friendlyMime(file.mimeType);
  }

  const badge = document.createElement('span');
  badge.className = 'file-card-badge';
  badge.textContent = badgeLabel;
  visual.appendChild(badge);

  const selectionCheck = document.createElement('span');
  selectionCheck.className = 'file-card-select-check';
  selectionCheck.setAttribute('aria-hidden', String(!state.selectionMode));
  selectionCheck.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
  visual.appendChild(selectionCheck);

  // Video Duration Badge (e.g., 03:42)
  if (isVideo && file.videoMediaMetadata?.durationMillis) {
    const durationSec = Number(file.videoMediaMetadata.durationMillis) / 1000;
    if (durationSec > 0) {
      const durBadge = document.createElement('span');
      durBadge.className = 'file-card-duration-badge';
      durBadge.textContent = formatPlayerTime(durationSec);
      visual.appendChild(durBadge);
    }
  }

  // Play overlay on hover for video
  if (isVideo) {
    const overlay = document.createElement('div');
    overlay.className = 'file-card-play-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('div');
    glyph.className = 'play-glyph-circle';
    glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    overlay.appendChild(glyph);
    visual.appendChild(overlay);
  }

  const body = document.createElement('div');
  body.className = 'file-card-body';
  const name = document.createElement('span');
  name.className = 'file-card-title';
  name.textContent = file.name || '이름 없는 파일';
  
  const meta = document.createElement('div');
  meta.className = 'file-card-meta';
  if (file.__origin) {
    const origin = document.createElement('span');
    origin.className = 'file-card-origin';
    origin.textContent = file.__origin;
    meta.appendChild(origin);
  }
  const details = document.createElement('span');
  details.textContent = formatBytes(file.size);
  const status = document.createElement('span');
  status.className = 'file-card-status';
  status.textContent = canDownload ? '원본 파일 재생' : '다운로드 제한';
  meta.append(details, status);

  body.append(name, meta);
  button.append(visual, body);
  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = 'file-card-favorite';
  favoriteButton.dataset.fileId = file.id;
  favoriteButton.setAttribute('aria-pressed', String(isFavoriteFileId(file.id)));
  favoriteButton.setAttribute('aria-label', isFavoriteFileId(file.id) ? '좋아요 취소' : '좋아요 추가');
  favoriteButton.title = isFavoriteFileId(file.id) ? '좋아요 취소' : '좋아요';
  favoriteButton.classList.toggle('is-favorite', isFavoriteFileId(file.id));
  favoriteButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  favoriteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const liked = setFavoriteFile(file.id, !isFavoriteFileId(file.id));
    flashPressed(favoriteButton);
    showToast(liked ? '좋아요에 추가했습니다.' : '좋아요를 취소했습니다.');
  });
  card.append(button, favoriteButton);
  installCardSelectionGestures(button, file);
  button.addEventListener('click', () => {
    if (state.selectionMode) return;
    openPlayer(file);
  });
  return card;
}
