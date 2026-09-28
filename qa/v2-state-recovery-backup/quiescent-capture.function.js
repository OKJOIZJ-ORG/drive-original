async function (factory, legacyLocal, swProof, runtimeFacade, quiescentWindow) {
  return quiescentWindow(async remaining => {
    if (remaining <= 1000) return { passed: false, failure: 'time_limit' };
    const limitedFactory = dependencies => factory({ ...dependencies, limits: { milliseconds: remaining - 1000 } });
    const job = runtimeFacade.call(limitedFactory, legacyLocal, swProof);
    try {
      await job.settled();
      const poll = job.poll();
      return { poll, privateText: poll.summary.passed === true ? job.privateText() : null };
    } finally {
      job.clear();
    }
  });
}
