'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');let source=app;
function replace(a,b){if(!source.includes(a))throw Error('missing proposal anchor');source=source.replace(a,b);}
replace('function invalidateDriveSessionData() {', 'function invalidateDriveSessionData() {\n  completedMediaSeekPresentation = null;');
replace('let mediaSeekWatchdog = null;', 'let mediaSeekWatchdog = null;\nlet completedMediaSeekPresentation = null;');
replace("function clearMediaSeekWatchdog(_reason = '') {\n", "function clearMediaSeekWatchdog(_reason = '') {\n  completedMediaSeekPresentation = null;\n");
replace('      playbackSession: state.playbackSession,\n      sourceAttempt: state.mediaAttempt,', '      playbackSession: state.playbackSession,\n      accountId: state.accountId,\n      authAccountKey: state.authAccountKey,\n      accountGeneration: state.driveSessionGeneration,\n      sourceAttempt: state.mediaAttempt,');
replace('    && state.playbackSession === owner.playbackSession\n    && state.mediaAttempt', '    && state.playbackSession === owner.playbackSession\n    && state.accountId === owner.accountId\n    && state.authAccountKey === owner.authAccountKey\n    && state.driveSessionGeneration === owner.accountGeneration\n    && state.mediaAttempt');
replace("  mediaSeekWatchdog = null;\n  emitMediaDiagnosticStage('seek-frame', {", "  mediaSeekWatchdog = null;\n  completedMediaSeekPresentation = owner;\n  completeVideoFramePresentation(owner, 'decoded-frame');\n  emitMediaDiagnosticStage('seek-frame', {");
const helper=`function completeVideoFramePresentation(owner, confidence = 'decoded-frame') {
  const video = owner?.video;
  if (!video || video.hidden || !el.mediaLoading || !isCurrentMediaEvent(video)
    || state.selected?.id !== owner.fileId || state.mediaSession !== owner.session
    || state.playbackSession !== owner.playbackSession
    || state.accountId !== owner.accountId || state.authAccountKey !== owner.authAccountKey
    || state.driveSessionGeneration !== owner.accountGeneration
    || state.mediaAttempt !== owner.sourceAttempt || mediaSourceGeneration !== owner.sourceGeneration
    || mediaSeekGeneration !== owner.seekGeneration) {
    if (owner === completedMediaSeekPresentation) completedMediaSeekPresentation = null;
    return false;
  }
  delete video.dataset.presentationSession;
  if (mediaDiagnosticTrace && !mediaDiagnosticTrace.firstFrameSeen) {
    mediaDiagnosticTrace.firstFrameSeen = true;
    emitMediaDiagnosticStage(
      confidence === 'decoded-frame' ? 'first-decoded-frame' : 'presentation-fallback',
      { currentTime: Number(video.currentTime) || 0, confidence }, owner.session);
  }
  video.classList.add('is-ready');
  video.classList.remove('has-poster');
  video.removeAttribute('poster');
  tryCaptureAmbientFrame();
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  updateQualityDisplay();
  hideSwipeNeighbor({ immediate: false });
  return true;
}

`;
replace('function scheduleVideoFramePresentation(video = el.videoPlayer, session = state.mediaSession) {', helper+'function scheduleVideoFramePresentation(video = el.videoPlayer, session = state.mediaSession) {');
replace('  if (!video || video.hidden || !isCurrentMediaEvent(video)) return;\n  const sourceAttempt = state.mediaAttempt;', `  if (!video || video.hidden || !isCurrentMediaEvent(video)) return;
  const completed = completedMediaSeekPresentation;
  if (completed?.video === video && completed.frameConfidence === 'decoded-frame'
    && mediaSeekTimesMatch(video.currentTime, completed.effectiveTarget ?? completed.targetTime, completed.tolerance)
    && completeVideoFramePresentation(completed, 'decoded-frame')) return;
  const sourceAttempt = state.mediaAttempt;`);
replace('  let presented = false;\n  const reveal', `  const presentationOwner = { video, fileId: state.selected?.id, session,
    playbackSession: state.playbackSession, accountId: state.accountId,
    authAccountKey: state.authAccountKey, accountGeneration: state.driveSessionGeneration,
    sourceAttempt, sourceGeneration, seekGeneration };
  let presented = false;
  const reveal`);
const start=source.indexOf("    delete video.dataset.presentationSession;",source.indexOf('function scheduleVideoFramePresentation(')),end=source.indexOf('\n  };',start);if(start<0||end<0)throw Error('reveal body anchor');source=source.slice(0,start)+"    completeVideoFramePresentation(presentationOwner, confidence);"+source.slice(end);
fs.writeFileSync(path.join(__dirname,'proposed-app.js'),source);
console.log('Proposal prepared; public app unchanged');
