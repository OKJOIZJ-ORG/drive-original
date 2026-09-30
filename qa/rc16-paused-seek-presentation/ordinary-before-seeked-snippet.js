
test('ordinary and sampler paused target callbacks keep loading until owned seeked settlement', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const context = loadAppContext(); installFakeClock(context); installPausedPresentationFixture(context);
    run(context, 'scheduleVideoFramePresentation(el.videoPlayer,state.mediaSession);');
    const pendingKey = run(context, 'el.videoPlayer.dataset.presentationSession');
    for (const index of order) run(context, `seekPresentationFrames[${index}](0,{mediaTime:50});`);
    assert.equal(run(context, 'mediaSeekWatchdog.frameSeen'), true);
    assert.equal(run(context, 'mediaSeekWatchdog.seekedSeen'), false);
    assert.equal(run(context, 'state.isSeeking && el.videoPlayer.seeking'), true);
    assert.equal(run(context, 'el.mediaLoading.hidden'), false, 'ordinary callback cannot reveal before seeked');
    assert.equal(run(context, 'el.videoPlayer.dataset.presentationSession'), pendingKey, 'waiting seek retains current presentation key');
    const count = run(context, 'seekPresentationFrames.length');
    run(context, 'el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
    assert.equal(run(context, 'mediaSeekWatchdog'), null);
    assert.equal(run(context, 'el.mediaLoading.hidden'), true, 'seeked joins the existing decoded proof without another frame');
    assert.equal(run(context, 'el.videoPlayer.dataset.presentationSession'), undefined);
    assert.equal(run(context, 'seekPresentationFrames.length'), count);
  }
});
