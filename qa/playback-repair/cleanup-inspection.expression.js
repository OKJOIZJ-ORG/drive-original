(async () => {
  const playerClosed = !!el.playerSheet.hidden;
  const temporaryKeys = Object.getOwnPropertyNames(globalThis).filter(k => k.startsWith('__iosLocal'));
  return {
    playerClosed,
    temporaryKeys,
    plannerRestored: !String(planPinnedOriginalAudio).includes('__iosLocalProbeModule'),
    localCssAbsent: ![...document.querySelectorAll('style')].some(n => n.textContent.includes('COMPACT HEADER & INSET GROUPED VAULT')),
    nativeControls: el.videoPlayer.controls,
    scale: visualViewport?.scale ?? 1,
    cleanupVerified: playerClosed && !temporaryKeys.length && !String(planPinnedOriginalAudio).includes('__iosLocalProbeModule') && ![...document.querySelectorAll('style')].some(n => n.textContent.includes('COMPACT HEADER & INSET GROUPED VAULT'))
  };
})()
